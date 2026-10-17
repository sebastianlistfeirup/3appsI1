import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import {
  artifactBytes,
  artifactSchema,
  briefSchema,
  idSchema,
  runAcceptance,
  runSchema,
  sha256,
  type Project,
} from "./model";
import {
  decodeUtf8,
  MAX_ARCHIVE_BYTES,
  MAX_EXPANDED_BYTES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_METADATA_BYTES,
} from "./limits";
import type { ArchiveProgress } from "./archive";

export const runPackageInputSchema = z
  .object({
    projectId: idSchema,
    projectName: z.string().min(1).max(100),
    run: runSchema,
    brief: briefSchema,
    acceptance: z.array(z.string().min(1).max(1000)).max(30),
    artifacts: z.array(artifactSchema).max(100),
  })
  .strict();
export type RunPackageInput = z.infer<typeof runPackageInputSchema>;

export function runPackageInput(
  project: Project,
  runId: string,
): RunPackageInput {
  const run = project.runs.find((item) => item.id === runId);
  if (!run) throw new Error("Leveringsforløbet findes ikke.");
  return runPackageInputSchema.parse({
    projectId: project.id,
    projectName: project.name,
    run,
    brief: project.briefVersions.find(
      (item) => item.version === run.briefVersion,
    ),
    acceptance: runAcceptance(project, run),
    artifacts: run.inputVersionIds.map((id) =>
      project.artifacts.find((file) => file.id === id),
    ),
  });
}

function filename(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}._-]/gu, "_")
      .replace(/^\.+/, "")
      .slice(0, 100) || "input.bin"
  );
}
export async function exportRunPackage(
  value: RunPackageInput,
  progress?: (value: ArchiveProgress) => void,
): Promise<Uint8Array> {
  const input = runPackageInputSchema.parse(value);
  if (
    input.brief.version !== input.run.briefVersion ||
    input.artifacts.length !== input.run.inputVersionIds.length ||
    new Set(input.run.inputVersionIds).size !==
      input.run.inputVersionIds.length ||
    input.artifacts.some((file, i) => file.id !== input.run.inputVersionIds[i])
  )
    throw new Error("Arbejdspakken stemmer ikke med forløbets låste input.");
  const expected = input.run.taskSnapshot?.acceptance ?? input.brief.acceptance;
  if (JSON.stringify(expected) !== JSON.stringify(input.acceptance))
    throw new Error("Arbejdspakkens krav stemmer ikke med den låste aftale.");
  if (
    input.artifacts.reduce((sum, file) => sum + file.bytes, 0) >
    MAX_PROJECT_FILE_BYTES
  )
    throw new Error("Arbejdspakkens inputfiler må højst fylde 48 MB.");
  const files: Record<string, Uint8Array> = {};
  const entries: Array<{
    path: string;
    sha256: string;
    bytes: number;
    artifactVersionId?: string;
  }> = [];
  const inputs: Array<
    Omit<RunPackageInput["artifacts"][number], "content"> & { path: string }
  > = [];
  for (const [i, file] of input.artifacts.entries()) {
    progress?.({
      phase: "validating",
      completed: i,
      total: input.artifacts.length,
    });
    const bytes = artifactBytes(file);
    if (
      bytes.byteLength !== file.bytes ||
      (await sha256(bytes)) !== file.sha256 ||
      (file.encoding === "utf8" && decodeUtf8(bytes) !== file.content)
    )
      throw new Error(`Filintegritet fejlede: ${file.name}`);
    const path = `inputs/${String(i + 1).padStart(3, "0")}-${filename(file.name)}`;
    files[path] = bytes;
    entries.push({
      path,
      sha256: file.sha256,
      bytes: file.bytes,
      artifactVersionId: file.id,
    });
    const { content: _content, ...metadata } = file;
    inputs.push({ ...metadata, path });
  }
  const context = {
    schemaVersion: 1,
    app: "studio-work-package",
    projectId: input.projectId,
    projectNameAtExport: input.projectName,
    run: input.run,
    brief: input.brief,
    taskDefinition: input.run.taskSnapshot ?? null,
    acceptance: input.acceptance,
    inputs,
  };
  files["context.json"] = strToU8(JSON.stringify(context, null, 2));
  files["aftale.md"] = strToU8(
    `# ${input.run.taskSnapshot?.title ?? "Historisk levering"}\n\nProjekt: ${input.projectName}\nForløb: ${input.run.id}\nBriefversion: ${input.run.briefVersion}\n\n${input.run.taskSnapshot ? `Ansvarlig: ${input.run.taskSnapshot.owner}\nOpgaverevision ved start: ${input.run.taskSnapshot.revision}\n\n${input.run.taskSnapshot.description}` : "Dette ældre forløb har ikke et særskilt opgavesnapshot. Kravene kommer fra det oprindelige låste brief."}\n\n## Færdig betyder\n${input.acceptance.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\n## Bestillingens mål\n${input.brief.goal}\n\n## Målgruppe\n${input.brief.audience}\n\n## Rammer\n${input.brief.constraints}\n`,
  );
  files["LAES-MIG.md"] = strToU8(
    `# Arbejd videre i dine egne værktøjer\n\n1. Læs aftale.md. Den beskriver præcis det arbejde, som blev låst i Studio.\n2. Åbn de valgte originaler i inputs/. context.json forbinder hvert filnavn med den oprindelige filversion, ophav og rettigheder.\n3. Udfør arbejdet i dit foretrukne værktøj. Pakken starter ikke kode, installationer eller eksterne tjenester.\n4. Aflevér resultatet og dine konkrete testbeviser i det samme Studio-forløb. En ny outputfil er en ny version.\n5. Gennemgå leverancen i Studio, før du accepterer den. Pakken giver ikke automatisk godkendelse.\n\nDette er en arbejdspakke med udvalgte låste input, ikke en backup af hele projektet. Behold også din projekt-ZIP. Forløbets status ved eksport: ${input.run.state}. Et afsluttet forløb kan ikke modtage en ny aflevering; opret eller brug en rettelsesopgave.\n\nmanifest.json indeholder SHA-256 og størrelse for hver fil i pakken. Ingen betalings- eller cloudforbindelse er tilkoblet.\n`,
  );
  const metadataBytes = ["context.json", "aftale.md", "LAES-MIG.md"].reduce(
    (total, path) => total + files[path]!.length,
    0,
  );
  if (metadataBytes > MAX_PROJECT_METADATA_BYTES)
    throw new Error("Arbejdspakkens aftale og metadata må højst fylde 4 MB.");
  for (const path of ["context.json", "aftale.md", "LAES-MIG.md"])
    entries.push({
      path,
      bytes: files[path]!.length,
      sha256: await sha256(files[path]!),
    });
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        app: "studio-work-package",
        projectId: input.projectId,
        runId: input.run.id,
        exportedAt: new Date().toISOString(),
        entries,
      },
      null,
      2,
    ),
  );
  if (
    Object.values(files).reduce((total, file) => total + file.length, 0) >
    MAX_EXPANDED_BYTES
  )
    throw new Error("Arbejdspakken fylder over 60 MB efter udpakning.");
  progress?.({
    phase: "packing",
    completed: inputs.length,
    total: inputs.length,
  });
  const zip = zipSync(files, { level: 6 });
  if (zip.length > MAX_ARCHIVE_BYTES)
    throw new Error("Arbejdspakken fylder over 64 MB.");
  return zip;
}
