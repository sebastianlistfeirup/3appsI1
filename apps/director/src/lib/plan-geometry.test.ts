import { describe, it, expect } from "vitest";
import { createSampleProject, type Vector } from "@tre/scene-format";
import {
  fitPlan,
  moveInPlan,
  planPoint,
  planPosition,
  samePlanPosition,
} from "./plan-geometry";
describe("metric plan manipulation", () => {
  it("roundtrips equal metre distances at desktop and phone sizes without changing height", () => {
    const scene = createSampleProject().draft,
      camera = scene.cameras[0];
    for (const size of [
      { width: 800, height: 450 },
      { width: 358, height: 230 },
    ]) {
      const view = fitPlan(scene, camera, size),
        position: Vector = [2.25, 1.7, -4.5];
      const point = planPoint(position, view, size),
        restored = planPosition(point, position[1], view, size);
      expect(restored[0]).toBeCloseTo(position[0], 12);
      expect(restored[1]).toBe(position[1]);
      expect(restored[2]).toBeCloseTo(position[2], 12);
      expect(
        planPoint([position[0] + 1, position[1], position[2]], view, size)[0] -
          point[0],
      ).toBeCloseTo(view.scale, 12);
      expect(
        planPoint([position[0], position[1], position[2] + 1], view, size)[1] -
          point[1],
      ).toBeCloseTo(view.scale, 12);
    }
  });
  it("fits every valid far-away object and camera within a readable border", () => {
    const scene = createSampleProject().draft;
    scene.objects[0].transform.position = [-100, 7, 100];
    scene.cameras[0].position = [100, 10, -100];
    const size = { width: 800, height: 450 },
      view = fitPlan(scene, scene.cameras[0], size);
    for (const position of [
      ...scene.objects.map((object) => object.transform.position),
      scene.cameras[0].position,
      scene.cameras[0].target,
    ]) {
      const [x, y] = planPoint(position, view, size);
      expect(x).toBeGreaterThan(30);
      expect(x).toBeLessThan(770);
      expect(y).toBeGreaterThan(30);
      expect(y).toBeLessThan(420);
    }
  });
  it("bounds pointer and keyboard movement without changing the Y axis or accumulating float drift", () => {
    expect(moveInPlan([99.9, 3, -99.9], 100, -100, true)).toEqual([
      100, 3, -100,
    ]);
    expect(moveInPlan([0.2, 3, 0.2], 0.1, -0.1, true)).toEqual([0.3, 3, 0.1]);
    expect(moveInPlan([1, 3, 1], 0.0376, 0, false)).toEqual([1.038, 3, 1]);
    expect(samePlanPosition([1, 3, 1], [1.000001, 3, 1])).toBe(true);
  });
});
