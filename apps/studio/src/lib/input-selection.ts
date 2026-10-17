import type { Artifact, Project } from "./model";

export const MAX_RUN_INPUTS = 100;
export function latestInputVersionIds(
  project: Pick<Project, "artifacts">,
): string[] {
  const latest = new Map<string, Artifact>();
  for (const file of project.artifacts) {
    const previous = latest.get(file.artifactId);
    if (!previous || previous.version < file.version)
      latest.set(file.artifactId, file);
  }
  return project.artifacts
    .filter((file) => latest.get(file.artifactId)?.id === file.id)
    .map((file) => file.id);
}
export function inputSelectionIssue(
  project: Pick<Project, "artifacts">,
  ids: string[],
  limit = MAX_RUN_INPUTS,
): string | undefined {
  if (ids.length > limit)
    return `Vælg højst ${limit} filversioner. Ingen filer bliver fravalgt automatisk.`;
  if (new Set(ids).size !== ids.length)
    return "Den samme filversion kan ikke vælges flere gange.";
  const families = new Set<string>();
  for (const id of ids) {
    const file = project.artifacts.find((candidate) => candidate.id === id);
    if (!file) return "En valgt filversion findes ikke i projektet.";
    if (families.has(file.artifactId))
      return "Vælg kun én version af hver fil til dette arbejde.";
    families.add(file.artifactId);
  }
}
export function resolveInputVersions(
  project: Pick<Project, "artifacts">,
  ids: string[],
): Artifact[] {
  const issue = inputSelectionIssue(project, ids);
  if (issue) throw new Error(issue);
  return ids.map((id) => project.artifacts.find((file) => file.id === id)!);
}
/** Rejected outputs replace only their own input family; other known inputs stay locked. */
export function correctionInputVersionIds(
  project: Pick<Project, "artifacts">,
  inputIds: string[],
  outputIds: string[],
): string[] {
  const byFamily = new Map<string, Artifact>();
  for (const id of [...inputIds, ...outputIds]) {
    const file = project.artifacts.find((candidate) => candidate.id === id);
    if (!file) throw new Error("Rettelsen mangler en kendt filversion.");
    const previous = byFamily.get(file.artifactId);
    // Deliveries may list several historical versions. Select their highest
    // version, never a later unrelated version from the current project.
    if (
      !previous ||
      (outputIds.includes(id) &&
        (!outputIds.includes(previous.id) || previous.version < file.version))
    )
      byFamily.set(file.artifactId, file);
  }
  return [...byFamily.values()].map((file) => file.id);
}
