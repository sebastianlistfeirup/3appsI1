import { describe, expect, it } from "vitest";
import {
  createSampleProject,
  clone,
  lookAtQuaternion,
  parseProject,
} from "@tre/scene-format";
import { continuityChanges } from "./continuity";
describe("continuity review", () => {
  it("compares the locked scene with the current draft without editing either", () => {
    const project = createSampleProject(),
      shot = project.shots[0],
      old = clone(project.scenes);
    expect(continuityChanges(project, shot)).toEqual([]);
    project.draft.objects[0].transform.position = [2, 1.5, -3];
    project.draft.objects[0].color = "#123456";
    project.draft.objects[0].assetVersion++;
    project.draft.cameras[0].position = [6, 4, 9];
    project.draft.cameras[0].quaternion = lookAtQuaternion(
      project.draft.cameras[0].position,
      project.draft.cameras[0].target,
    );
    const after = clone(project),
      changes = continuityChanges(project, shot);
    expect(changes).toHaveLength(2);
    expect(changes[0].detail).toContain("2 / 1,5 / -3 m");
    expect(changes[0].detail).toContain("#123456");
    expect(changes[1].id).toBe("camera");
    expect(project.scenes).toEqual(old);
    expect(project).toEqual(after);
    expect(() => parseProject(project)).not.toThrow();
  });
  it("reports added/removed objects and a missing shot camera, not changes to unrelated cameras", () => {
    const project = createSampleProject(),
      shot = project.shots[0];
    project.draft.cameras[1].name = "Et andet kamera";
    expect(continuityChanges(project, shot)).toEqual([]);
    const removed = project.draft.objects.shift()!;
    project.draft.objects.push({
      ...clone(project.draft.objects[0]),
      id: "object_new",
      name: "En ny figur",
    });
    project.draft.cameras.shift();
    const changes = continuityChanges(project, shot);
    expect(
      changes.find((change) => change.id === removed.id)?.detail,
    ).toContain("Fjernet");
    expect(
      changes.find((change) => change.id === "object_new")?.detail,
    ).toContain("Tilføjet");
    expect(changes.find((change) => change.id === "camera")?.title).toBe(
      "Kamera mangler",
    );
    expect(() => parseProject(project)).not.toThrow();
  });
});
