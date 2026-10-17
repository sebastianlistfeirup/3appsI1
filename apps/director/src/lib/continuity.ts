import {
  sceneForShot,
  type Project,
  type Shot,
  type SceneVersion,
} from "@tre/scene-format";
export type ContinuityChange = { id: string; title: string; detail: string };
const different = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);
const position = (values: number[]) =>
  values
    .map((value) => value.toLocaleString("da-DK", { maximumFractionDigits: 3 }))
    .join(" / ");
/** Human-readable changes without copying model payloads or mutating either version. */
export function continuityChanges(
  project: Project,
  shot: Shot,
): ContinuityChange[] {
  const before = sceneForShot(project, shot),
    after = project.draft,
    changes: ContinuityChange[] = [];
  if (before.name !== after.name)
    changes.push({
      id: "name",
      title: "Scenenavn",
      detail: `${before.name} → ${after.name}`,
    });
  if (different(before.environment, after.environment))
    changes.push({
      id: "environment",
      title: "Location og farver",
      detail: "Set eller dets gulv-/baggrundsfarve er ændret.",
    });
  if (different(before.light, after.light))
    changes.push({
      id: "light",
      title: "Lys og stemning",
      detail: "Lysets retning, farve eller styrke er ændret.",
    });
  const ids = new Set([
    ...before.objects.map((object) => object.id),
    ...after.objects.map((object) => object.id),
  ]);
  for (const id of ids) {
    const old = before.objects.find((object) => object.id === id),
      current = after.objects.find((object) => object.id === id);
    if (!old && current) {
      changes.push({
        id,
        title: current.name,
        detail: "Tilføjet til arbejdsscenen.",
      });
      continue;
    }
    if (old && !current) {
      changes.push({
        id,
        title: old.name,
        detail: "Fjernet fra arbejdsscenen. Findes stadig i det låste shot.",
      });
      continue;
    }
    if (!old || !current || !different(old, current)) continue;
    const detail: string[] = [];
    if (old.name !== current.name)
      detail.push(`navn: ${old.name} → ${current.name}`);
    if (different(old.transform.position, current.transform.position))
      detail.push(
        `X / Y / Z: ${position(old.transform.position)} → ${position(current.transform.position)} m`,
      );
    if (different(old.transform.quaternion, current.transform.quaternion))
      detail.push("drejning ændret");
    if (different(old.transform.scale, current.transform.scale))
      detail.push(
        `størrelse: ${position(old.transform.scale)} → ${position(current.transform.scale)}`,
      );
    if (old.color !== current.color)
      detail.push(`farve: ${old.color} → ${current.color}`);
    if (old.kind !== current.kind || old.assetId !== current.assetId)
      detail.push("figur eller model udskiftet");
    if (old.source !== current.source || old.rights !== current.rights)
      detail.push("rettigheder eller kildeoplysninger ændret");
    if (!detail.length)
      detail.push(
        `objektversion: v${old.assetVersion} → v${current.assetVersion}`,
      );
    changes.push({ id, title: current.name, detail: detail.join(" · ") });
  }
  const oldCamera = before.cameras.find(
      (camera) => camera.id === shot.cameraId,
    ),
    camera = after.cameras.find((camera) => camera.id === shot.cameraId);
  if (!camera)
    changes.push({
      id: "camera",
      title: "Kamera mangler",
      detail:
        "Dette shots kamera findes kun i den låste scene. Vælg et eksisterende kamera i editoren for at optage et nyt shot.",
    });
  else if (different(oldCamera, camera)) {
    const detail: string[] = [];
    if (oldCamera && different(oldCamera.position, camera.position))
      detail.push(
        `position: ${position(oldCamera.position)} → ${position(camera.position)} m`,
      );
    if (oldCamera && different(oldCamera.target, camera.target))
      detail.push(
        `sigtepunkt: ${position(oldCamera.target)} → ${position(camera.target)} m`,
      );
    if (oldCamera?.verticalFov !== camera.verticalFov)
      detail.push(`linse: ${oldCamera?.verticalFov}° → ${camera.verticalFov}°`);
    changes.push({
      id: "camera",
      title: camera.name,
      detail:
        detail.join(" · ") || "Kameraets navn eller indstilling er ændret.",
    });
  }
  const assets = (scene: SceneVersion) =>
    scene.assets.map(({ dataUrl, ...metadata }) => metadata);
  if (different(assets(before), assets(after)))
    changes.push({
      id: "assets",
      title: "Modelbibliotek",
      detail:
        "Indlejrede modelfiler, hashes eller deres kildeoplysninger er ændret.",
    });
  return changes;
}
