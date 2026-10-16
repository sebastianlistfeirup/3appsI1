import { strToU8, zipSync, unzipSync } from "fflate";
import { z } from "zod";
import {
  artifactBytes,
  artifactSchema,
  latestBrief,
  assertProject,
  projectSchema,
  sha256,
  type Project,
} from "./model";
import {
  assertProjectBudget,
  MAX_ARCHIVE_BYTES,
  MAX_EXPANDED_BYTES,
  projectMetadata,
  bytesToBase64,
  decodeUtf8,
} from "./limits";

export type ArchiveProgress = {
  phase: "validating" | "packing" | "unpacking";
  completed: number;
  total: number;
};
type Progress = (progress: ArchiveProgress) => void;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z
  .object({
    id: z.string().min(1).max(120),
    path: z.string().max(200),
    sha256: hashSchema,
    bytes: z.number().int().nonnegative().max(10_000_000),
    rights: artifactSchema.shape.rights,
    provenance: artifactSchema.shape.provenance,
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    app: z.literal("studio"),
    exportedAt: z.string().datetime(),
    projectId: z.string().min(1).max(120),
    projectSha256: hashSchema,
    artifacts: z.array(entrySchema).max(500),
  })
  .strict();
const packedProjectSchema = projectSchema
  .extend({
    artifacts: z
      .array(artifactSchema.omit({ content: true }).strict())
      .max(500),
  })
  .strict();
export async function exportProject(
  input: Project,
  progress?: Progress,
): Promise<Uint8Array> {
  const project = assertProject(projectSchema.parse(input));
  assertProjectBudget(project);
  const files: Record<string, Uint8Array> = {};
  const artifacts: z.infer<typeof entrySchema>[] = [];
  for (const [index, artifact] of project.artifacts.entries()) {
    progress?.({
      phase: "validating",
      completed: index,
      total: project.artifacts.length,
    });
    const bytes = artifactBytes(artifact),
      hash = await sha256(bytes);
    if (
      hash !== artifact.sha256 ||
      bytes.length !== artifact.bytes ||
      (artifact.encoding === "utf8" && decodeUtf8(bytes) !== artifact.content)
    )
      throw new Error(`Filintegritet fejlede: ${artifact.name}`);
    const path = `versions/${artifact.id}.bin`;
    files[path] = bytes;
    artifacts.push({
      id: artifact.id,
      path,
      sha256: hash,
      bytes: bytes.length,
      rights: artifact.rights,
      provenance: artifact.provenance,
    });
  }
  const brief = latestBrief(project);
  files["brief.md"] = strToU8(
    `# ${project.name}\n\n${brief.goal}\n\n## Acceptkrav\n${brief.acceptance.map((a) => `- ${a}`).join("\n")}\n\n## Begrænsninger\n${brief.constraints}\n`,
  );
  files["tasks.json"] = strToU8(
    JSON.stringify({ tasks: project.tasks, edges: project.edges }, null, 2),
  );
  files["project.json"] = strToU8(JSON.stringify(projectMetadata(project)));
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 2,
        app: "studio",
        exportedAt: new Date().toISOString(),
        projectId: project.id,
        projectSha256: await sha256(files["project.json"]!),
        artifacts,
      },
      null,
      2,
    ),
  );
  if (
    Object.values(files).reduce((total, bytes) => total + bytes.length, 0) >
    MAX_EXPANDED_BYTES
  )
    throw new Error(
      "Projektpakken er for stor efter udpakning. Hent de enkelte filer under Filer & versioner.",
    );
  progress?.({
    phase: "packing",
    completed: artifacts.length,
    total: artifacts.length,
  });
  const zip = zipSync(files, { level: 6 });
  if (zip.length > MAX_ARCHIVE_BYTES)
    throw new Error("Projektpakken må højst fylde 64 MB.");
  return zip;
}
export async function importProject(
  input: Uint8Array,
  progress?: Progress,
): Promise<Project> {
  if (input.length > MAX_ARCHIVE_BYTES)
    throw new Error("Projektpakken må højst fylde 64 MB.");
  let expanded = 0,
    count = 0;
  const seen = new Set<string>();
  progress?.({ phase: "unpacking", completed: 0, total: 0 });
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(input, {
      filter(file) {
        count++;
        expanded += file.originalSize;
        if (count > 510 || expanded > MAX_EXPANDED_BYTES)
          throw new Error("Projektpakken er for stor efter udpakning.");
        if (
          file.name.length > 220 ||
          file.name.startsWith("/") ||
          file.name.includes("\\") ||
          file.name.includes("\0") ||
          file.name
            .split("/")
            .some((x) => x === ".." || x === "." || x === "") ||
          seen.has(file.name)
        )
          throw new Error(
            "Projektpakken indeholder en usikker eller dubleret filsti.",
          );
        seen.add(file.name);
        return true;
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.startsWith("Projektpakken")
        ? error.message
        : "Projektpakken er beskadiget eller er ikke en ZIP-fil.",
    );
  }
  if (!files["manifest.json"] || !files["project.json"])
    throw new Error("Manifest eller projekt mangler.");
  let manifest: z.infer<typeof manifestSchema>;
  let raw: unknown;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(decodeUtf8(files["manifest.json"])),
    );
    raw = JSON.parse(decodeUtf8(files["project.json"]));
  } catch {
    throw new Error(
      "Projektpakkens format understøttes ikke, eller metadata er beskadiget.",
    );
  }
  if (
    new Set(manifest.artifacts.map((a) => a.id)).size !==
    manifest.artifacts.length
  )
    throw new Error("Manifestet indeholder dublerede filversioner.");
  if ((await sha256(files["project.json"])) !== manifest.projectSha256)
    throw new Error("Projektets kontrolsum matcher ikke.");
  const stored =
    manifest.schemaVersion === 2
      ? packedProjectSchema.parse(raw)
      : projectSchema.parse(raw);
  if (
    manifest.projectId !== stored.id ||
    manifest.artifacts.length !== stored.artifacts.length
  )
    throw new Error("Manifestet matcher ikke projektet.");
  const artifacts: Project["artifacts"] = [];
  for (const [index, artifact] of stored.artifacts.entries()) {
    progress?.({
      phase: "validating",
      completed: index,
      total: stored.artifacts.length,
    });
    const entry = manifest.artifacts.find((a) => a.id === artifact.id);
    if (
      !entry ||
      entry.path !== `versions/${artifact.id}.bin` ||
      !files[entry.path]
    )
      throw new Error("En filversion mangler i pakken.");
    const bytes = files[entry.path]!;
    if (
      bytes.length !== artifact.bytes ||
      bytes.length !== entry.bytes ||
      (await sha256(bytes)) !== artifact.sha256 ||
      artifact.sha256 !== entry.sha256 ||
      artifact.rights !== entry.rights ||
      artifact.provenance !== entry.provenance
    )
      throw new Error(`Filintegritet fejlede: ${artifact.name}`);
    const content =
      artifact.encoding === "utf8" ? decodeUtf8(bytes) : bytesToBase64(bytes);
    if ("content" in artifact && artifact.content !== content)
      throw new Error(`Filintegritet fejlede: ${artifact.name}`);
    artifacts.push({ ...artifact, content });
  }
  const project = assertProject(projectSchema.parse({ ...stored, artifacts }));
  assertProjectBudget(project);
  return project;
}
