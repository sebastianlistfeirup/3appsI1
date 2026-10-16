import { strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { exportProject, importProject } from "./archive";
import {
  copyProject,
  sha256,
  studioSchema,
  validateStudio,
  type Project,
  type Studio,
} from "./model";
import { decodeUtf8, MAX_ARCHIVE_BYTES, projectMetadata } from "./limits";

export const MAX_WORKSPACE_ARCHIVE_BYTES = 128_000_000;
export const MAX_WORKSPACE_FILE_BYTES = 96_000_000;
export const MAX_WORKSPACE_METADATA_BYTES = 8_000_000;
const MAX_OUTER_EXPANDED_BYTES = 120_000_000;
const MANIFEST_LIMIT = 100_000;
const manifestSchema = z
  .object({
    format: z.literal("studio-workspace"),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    workspace: studioSchema.shape.workspace.strict(),
    projects: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            name: z.string().min(1).max(100),
            revision: z.number().int().positive(),
            path: z.string().max(60),
            bytes: z.number().int().positive().max(MAX_ARCHIVE_BYTES),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type WorkspaceArchive = {
  exportedAt: string;
  workspace: Studio["workspace"];
  projects: Project[];
};
export type WorkspaceArchiveProgress = {
  phase: "reading" | "checking" | "packing";
  completed: number;
  total: number;
  name?: string;
};
type Progress = (value: WorkspaceArchiveProgress) => void;

/** Count logical historic file bytes, including independent metadata-only versions. */
export function workspaceFileBytes(projects: Project[]) {
  return projects.reduce(
    (total, project) =>
      total + project.artifacts.reduce((sum, file) => sum + file.bytes, 0),
    0,
  );
}
function assertTotals(files: number, metadata: number) {
  if (files > MAX_WORKSPACE_FILE_BYTES)
    throw new Error(
      "Den valgte backup indeholder over 96 MB filversioner. Vælg færre projekter, og hent flere pakker.",
    );
  if (metadata > MAX_WORKSPACE_METADATA_BYTES)
    throw new Error(
      "Den valgte backup indeholder over 8 MB bestillinger og historik. Vælg færre projekter.",
    );
}
/** Cheap lower bounds before structured clone; exact UTF-8 metadata is checked in the worker. */
export function assertWorkspaceTransferBudget(projects: Project[]) {
  assertTotals(workspaceFileBytes(projects), 0);
  let contentUnits = 0,
    metadataUnits = 0;
  function visit(value: unknown) {
    if (typeof value === "string") metadataUnits += value.length;
    else if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object")
      for (const item of Object.values(value)) visit(item);
    assertTotals(0, metadataUnits);
  }
  for (const project of projects) {
    for (const file of project.artifacts) contentUnits += file.content.length;
    if (contentUnits > (MAX_WORKSPACE_FILE_BYTES * 4) / 3 + 200_000)
      throw new Error(
        "Den valgte backups filindhold er for stort. Vælg færre projekter.",
      );
    visit(projectMetadata(project));
  }
}
function assertAggregateBudget(projects: Project[]) {
  let metadata = 0;
  assertTotals(workspaceFileBytes(projects), 0);
  for (const project of projects) {
    metadata += strToU8(JSON.stringify(projectMetadata(project))).length;
    assertTotals(0, metadata);
  }
}
export async function exportWorkspace(
  input: Studio,
  projectIds: string[],
  progress?: Progress,
) {
  if (
    !projectIds.length ||
    projectIds.length > 100 ||
    new Set(projectIds).size !== projectIds.length
  )
    throw new Error("Vælg mellem 1 og 100 forskellige projekter.");
  const selected = projectIds.map((id) => {
    const project = input.projects.find((item) => item.id === id);
    if (!project)
      throw new Error(
        "Et valgt projekt findes ikke længere. Vælg projekterne igen.",
      );
    return project;
  });
  // Bound the whole selection before making copies or compressing its first project.
  assertAggregateBudget(selected);
  const studio = validateStudio({ ...input, projects: selected });
  const files: Record<string, Uint8Array> = {};
  const entries: z.infer<typeof manifestSchema>["projects"] = [];
  let expanded = 0;
  for (const [index, project] of studio.projects.entries()) {
    progress?.({
      phase: "checking",
      completed: index,
      total: studio.projects.length,
      name: project.name,
    });
    const bytes = await exportProject(project);
    expanded += bytes.length;
    if (expanded > MAX_OUTER_EXPANDED_BYTES - MANIFEST_LIMIT)
      throw new Error(
        "Backupfilen er for stor. Vælg færre projekter, og hent flere pakker.",
      );
    // Paths do not derive from user-controlled names or project IDs.
    const path = `projects/${String(index + 1).padStart(3, "0")}.zip`;
    files[path] = bytes;
    entries.push({
      id: project.id,
      name: project.name,
      revision: project.revision,
      path,
      bytes: bytes.length,
      sha256: await sha256(bytes),
    });
  }
  const manifest = manifestSchema.parse({
    format: "studio-workspace",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    workspace: studio.workspace,
    projects: entries,
  });
  files["workspace.json"] = strToU8(JSON.stringify(manifest, null, 2));
  if (files["workspace.json"].length > MANIFEST_LIMIT)
    throw new Error("Backupfilens oversigt er for stor.");
  progress?.({
    phase: "packing",
    completed: entries.length,
    total: entries.length,
  });
  // Each nested project is already compressed and can be imported on its own.
  const result = zipSync(files, { level: 0 });
  if (result.length > MAX_WORKSPACE_ARCHIVE_BYTES)
    throw new Error("Backupfilen må højst fylde 128 MB.");
  return result;
}
export async function importWorkspace(
  input: Uint8Array,
  progress?: Progress,
): Promise<WorkspaceArchive> {
  if (input.length > MAX_WORKSPACE_ARCHIVE_BYTES)
    throw new Error("Backupfilen må højst fylde 128 MB.");
  progress?.({ phase: "reading", completed: 0, total: 0 });
  let expanded = 0,
    count = 0;
  const seen = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(input, {
      filter(file) {
        count++;
        expanded += file.originalSize;
        if (
          count > 101 ||
          expanded > MAX_OUTER_EXPANDED_BYTES ||
          file.originalSize >
            (file.name === "workspace.json"
              ? MANIFEST_LIMIT
              : MAX_ARCHIVE_BYTES)
        )
          throw new Error("Backupfilen er for stor efter udpakning.");
        if (
          !(
            file.name === "workspace.json" ||
            /^projects\/\d{3}\.zip$/.test(file.name)
          ) ||
          seen.has(file.name)
        )
          throw new Error(
            "Backupfilen indeholder en ukendt eller dubleret filsti.",
          );
        seen.add(file.name);
        return true;
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.startsWith("Backupfilen")
        ? error.message
        : "Backupfilen er beskadiget eller er ikke en ZIP-fil.",
    );
  }
  if (!files["workspace.json"])
    throw new Error(
      "Dette er ikke en samlet Studio-backup. Brug Importér projektpakke til en enkelt projekt-ZIP.",
    );
  let manifest: z.infer<typeof manifestSchema>;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(decodeUtf8(files["workspace.json"])),
    );
  } catch {
    throw new Error(
      "Backupfilens format understøttes ikke, eller dens oversigt er beskadiget.",
    );
  }
  if (
    new Set(manifest.projects.map((p) => p.id)).size !==
      manifest.projects.length ||
    new Set(manifest.projects.map((p) => p.path)).size !==
      manifest.projects.length ||
    Object.keys(files).length !== manifest.projects.length + 1
  )
    throw new Error(
      "Backupfilens projektoversigt indeholder dubletter eller matcher ikke filerne.",
    );
  const projects: Project[] = [];
  let fileBytes = 0,
    metadataBytes = 0,
    innerExpandedBytes = 0;
  for (const [index, entry] of manifest.projects.entries()) {
    const bytes = files[entry.path];
    if (
      !/^projects\/\d{3}\.zip$/.test(entry.path) ||
      !bytes ||
      bytes.length !== entry.bytes ||
      (await sha256(bytes)) !== entry.sha256
    )
      throw new Error(`Backupfilens kontrolsum matcher ikke: ${entry.name}`);
    progress?.({
      phase: "checking",
      completed: index,
      total: manifest.projects.length,
      name: entry.name,
    });
    // Count every inner entry before decompression, including unreferenced legacy extras.
    // The aggregate budget must also bound highly compressed nested ZIPs.
    let innerEntries = 0;
    try {
      unzipSync(bytes, {
        filter(file) {
          innerEntries++;
          innerExpandedBytes += file.originalSize;
          if (
            innerEntries > 510 ||
            innerExpandedBytes > MAX_OUTER_EXPANDED_BYTES
          )
            throw new Error(
              "Backupfilens projektpakker fylder over 120 MB efter udpakning. Vælg færre projekter.",
            );
          return false;
        },
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message.startsWith("Backupfilens")
          ? error.message
          : `Projektpakken er beskadiget: ${entry.name}`,
      );
    }
    const project = await importProject(bytes);
    if (
      project.id !== entry.id ||
      project.name !== entry.name ||
      project.revision !== entry.revision
    )
      throw new Error(
        "Backupfilens oversigt matcher ikke det indeholdte projekt.",
      );
    projects.push(project);
    fileBytes += workspaceFileBytes([project]);
    metadataBytes += strToU8(JSON.stringify(projectMetadata(project))).length;
    assertTotals(fileBytes, metadataBytes);
  }
  return {
    exportedAt: manifest.exportedAt,
    workspace: manifest.workspace,
    projects,
  };
}

/** Adds selected projects in one validated mutation. Existing identities are never replaced. */
export function mergeWorkspaceProjects(
  current: Studio,
  imported: WorkspaceArchive,
  projectIds: string[],
): Studio {
  if (!projectIds.length || new Set(projectIds).size !== projectIds.length)
    throw new Error("Vælg mindst ét projekt uden dubletter.");
  if (current.projects.length + projectIds.length > 100)
    throw new Error(
      "Der er plads til højst 100 lokale projekter. Vælg færre projekter til indlæsning.",
    );
  const ids = new Set(current.projects.map((project) => project.id));
  const additions = projectIds.map((id) => {
    const project = imported.projects.find((item) => item.id === id);
    if (!project)
      throw new Error("Et valgt projekt findes ikke i backupfilen.");
    const next = ids.has(id)
      ? { ...copyProject(project), archivedAt: project.archivedAt }
      : project;
    ids.add(next.id);
    return next;
  });
  return validateStudio({
    ...current,
    projects: [...current.projects, ...additions],
  });
}
