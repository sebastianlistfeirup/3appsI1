import {
  clone,
  newId,
  parseProject,
  reviseShot,
  type Project,
  type SequenceVersion,
  type Shot,
} from "./index";

const sequenceState = (
  value: Pick<Project, "sequence" | "voice" | "music" | "captions">,
) => ({
  sequence: value.sequence,
  voice: value.voice,
  music: value.music,
  captions: value.captions,
});
export function matchingSequenceVersion(
  project: Project,
): SequenceVersion | undefined {
  const state = JSON.stringify(sequenceState(project));
  return [...project.sequenceVersions]
    .reverse()
    .find((version) => JSON.stringify(sequenceState(version)) === state);
}
export function saveSequenceVersion(project: Project, name: string): Project {
  if (!project.sequence.length)
    throw Error("Tilføj et shot, før du gemmer en sekvensversion");
  if (project.sequenceVersions.length >= 40)
    throw Error(
      "Der er allerede 40 gemte sekvensversioner. Den aktuelle sekvens er bevaret og kan eksporteres som projektpakke.",
    );
  const next = clone(project),
    version: SequenceVersion = {
      id: newId("sequence"),
      version:
        Math.max(0, ...project.sequenceVersions.map((v) => v.version)) + 1,
      name: name.trim().slice(0, 100) || "Gemt sekvens",
      createdAt: new Date().toISOString(),
      ...clone(sequenceState(project)),
    };
  next.sequenceVersions.push(version);
  next.revision++;
  return parseProject(next);
}
/** Restore references only; keep every old shot/scene and automatically preserve an unsaved cut first. */
export function restoreSequenceVersion(project: Project, id: string): Project {
  const target = project.sequenceVersions.find((version) => version.id === id);
  if (!target) throw Error("Sekvensversionen findes ikke");
  if (matchingSequenceVersion(project)?.id === id) return project;
  let next = clone(project);
  if (project.sequence.length && !matchingSequenceVersion(project))
    next = saveSequenceVersion(next, "Før gendannelse · seneste klipning");
  Object.assign(next, clone(sequenceState(target)));
  next.revision++;
  return parseProject(next);
}
export function shotVersionHistory(project: Project, id: string): Shot[] {
  const byId = new Map(project.shots.map((shot) => [shot.id, shot])),
    versions: Shot[] = [],
    visited = new Set<string>();
  let shot = byId.get(id);
  while (shot && !visited.has(shot.id)) {
    visited.add(shot.id);
    versions.push(shot);
    shot = shot.previousShotId ? byId.get(shot.previousShotId) : undefined;
  }
  return versions;
}
/** Reuse a prior result as a new version in the current lineage; no historical record is overwritten. */
export function restoreShotVersion(
  project: Project,
  currentId: string,
  previousId: string,
): Project {
  const previous = shotVersionHistory(project, currentId).find(
    (shot) => shot.id === previousId,
  );
  if (!previous) throw Error("Shotversionen tilhører ikke denne indstilling");
  if (!project.sequence.includes(currentId))
    throw Error("Vælg et shot i den aktuelle sekvens");
  if (currentId === previousId) return project;
  const {
    id: _,
    version: _version,
    previousShotId: _previous,
    ...content
  } = previous;
  return reviseShot(project, currentId, content);
}
export function duplicateShot(project: Project, id: string): Project {
  const index = project.sequence.indexOf(id),
    original = project.shots.find((shot) => shot.id === id);
  if (index < 0 || !original) throw Error("Vælg et shot i sekvensen");
  const next = clone(project),
    shot: Shot = {
      ...clone(original),
      id: newId("shot"),
      version: 1,
      previousShotId: null,
      name: (original.name + " · kopi").slice(0, 100),
      transitionFrames: 0,
    };
  next.shots.push(shot);
  next.sequence.splice(index + 1, 0, shot.id);
  next.revision++;
  return parseProject(next);
}
