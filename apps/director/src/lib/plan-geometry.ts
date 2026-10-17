import type { Camera, SceneVersion, Vector } from "@tre/scene-format";
export type PlanView = { x: number; z: number; scale: number };
export type PlanSize = { width: number; height: number };
export const PLAN_RENDERER_VERSION = "director-plan-2.0";
export function planPoint(
  position: Vector,
  view: PlanView,
  size: PlanSize,
): [number, number] {
  return [
    size.width / 2 + (position[0] - view.x) * view.scale,
    size.height / 2 + (position[2] - view.z) * view.scale,
  ];
}
export function planPosition(
  point: [number, number],
  height: number,
  view: PlanView,
  size: PlanSize,
): Vector {
  return [
    view.x + (point[0] - size.width / 2) / view.scale,
    height,
    view.z + (point[1] - size.height / 2) / view.scale,
  ];
}
export function fitPlan(
  scene: SceneVersion,
  camera: Camera,
  size: PlanSize,
): PlanView {
  const points = [
    ...scene.objects.map((object) => object.transform.position),
    camera.position,
    camera.target,
  ];
  const xs = points.map((point) => point[0]),
    zs = points.map((point) => point[2]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    scale: Math.max(
      0.1,
      Math.min(
        32,
        Math.max(1, size.width - 90) / (maxX - minX + 2),
        Math.max(1, size.height - 80) / (maxZ - minZ + 2),
      ),
    ),
  };
}
export function moveInPlan(
  position: Vector,
  dx: number,
  dz: number,
  snap: boolean,
): Vector {
  const bound = (value: number) =>
    Math.max(
      -100,
      Math.min(
        100,
        snap ? Math.round(value * 10) / 10 : Math.round(value * 1000) / 1000,
      ),
    );
  return [bound(position[0] + dx), position[1], bound(position[2] + dz)];
}
export function samePlanPosition(a: Vector, b: Vector) {
  return a.every((value, index) => Math.abs(value - b[index]) < 0.0001);
}

/** Flat floor extents of the three bundled procedural locations (X, Z, width, depth). */
export function planFloor(
  scene: SceneVersion,
): [number, number, number, number] {
  if (scene.environment.preset === "studio") return [-30, -6, 60, 26];
  if (scene.environment.preset === "courtyard") return [-11, -11, 22, 22];
  return [-7.5, -7.5, 15, 15];
}
