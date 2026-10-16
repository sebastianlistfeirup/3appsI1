import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import {
  artifactBytes,
  latestBrief,
  assertProject,
  projectSchema,
  sha256,
  type Project,
} from "./model";

const MAX_ARCHIVE = 10_000_000;
const MAX_CONTENT = 50_000_000;
export async function exportProject(project: Project): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const artifacts = [];
  for (const artifact of project.artifacts) {
    const bytes = artifactBytes(artifact);
    const hash = await sha256(bytes);
    if (hash !== artifact.sha256 || bytes.length !== artifact.bytes)
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
  files["project.json"] = strToU8(JSON.stringify(project));
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
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
  return zipSync(files, { level: 6 });
}
export async function importProject(input: Uint8Array): Promise<Project> {
  if (input.length > MAX_ARCHIVE)
    throw new Error("Projektpakken må højst fylde 10 MB.");
  let expanded = 0;
  let count = 0;
  const seen = new Set<string>();
  const files = unzipSync(input, {
    filter(file) {
      count++;
      expanded += file.originalSize;
      if (count > 1000 || expanded > MAX_CONTENT)
        throw new Error("Projektpakken er for stor efter udpakning.");
      if (
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.split("/").some((x) => x === ".." || x === ".") ||
        seen.has(file.name)
      )
        throw new Error(
          "Projektpakken indeholder en usikker eller dubleret filsti.",
        );
      seen.add(file.name);
      return true;
    },
  });
  if (!files["manifest.json"] || !files["project.json"])
    throw new Error("Manifest eller projekt mangler.");
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.app !== "studio" ||
    !Array.isArray(manifest.artifacts)
  )
    throw new Error("Projektpakkens format understøttes ikke.");
  if ((await sha256(files["project.json"])) !== manifest.projectSha256)
    throw new Error("Projektets kontrolsum matcher ikke.");
  const project = assertProject(
    projectSchema.parse(JSON.parse(strFromU8(files["project.json"]))),
  );
  if (
    manifest.projectId !== project.id ||
    manifest.artifacts.length !== project.artifacts.length
  )
    throw new Error("Manifestet matcher ikke projektet.");
  for (const artifact of project.artifacts) {
    const entry = manifest.artifacts.find(
      (x: { id?: string }) => x.id === artifact.id,
    );
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
      (await sha256(artifactBytes(artifact))) !== artifact.sha256
    )
      throw new Error(`Filintegritet fejlede: ${artifact.name}`);
  }
  return project;
}
