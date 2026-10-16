import { describe, it, expect } from "vitest";
import {
  createSampleProject,
  createEnvironment,
  parseProject,
  affectedShots,
  publishScene,
  reviseShot,
  sceneForShot,
} from "./index";
describe("Immutable procedural locations", () => {
  it("opens older projects as the same station instead of inventing a new set", () => {
    const source = createSampleProject(),
      legacy = JSON.parse(JSON.stringify(source));
    delete legacy.draft.environment;
    for (const scene of legacy.scenes) delete scene.environment;
    expect(parseProject(legacy)).toEqual(source);
  });
  it("marks location/palette changes for review while retaining previous scenes and frames", () => {
    const source = createSampleProject(),
      previous = structuredClone(source.scenes[0]);
    source.draft.environment = createEnvironment("courtyard");
    source.draft.name = "Hjemkomsten";
    expect(affectedShots(source)).toHaveLength(5);
    let next = publishScene(source);
    next = reviseShot(next, next.sequence[1], {
      sceneVersionId: next.draft.id,
    });
    expect(affectedShots(next)).toHaveLength(4);
    expect(
      sceneForShot(
        next,
        next.shots.find((shot) => shot.id === next.sequence[0])!,
      ),
    ).toEqual(previous);
    expect(next.scenes[0]).toEqual(previous);
    const chosen = next.shots.find((shot) => shot.id === next.sequence[1])!;
    expect(sceneForShot(next, chosen).environment.preset).toBe("courtyard");
    next.draft.environment.groundColor = "#596855";
    expect(affectedShots(next)).toHaveLength(5);
    expect(sceneForShot(next, chosen).environment.groundColor).toBe("#b7a38b");
  });
  it("rejects unsupported environments or unbounded color values before replacing a project", () => {
    const source = createSampleProject(),
      before = structuredClone(source);
    const bad = JSON.parse(JSON.stringify(source));
    bad.draft.environment.preset = "remote-url";
    expect(() => parseProject(bad)).toThrow();
    bad.draft.environment = {
      ...createEnvironment("studio"),
      skyColor: "url(https://example.com)",
    };
    expect(() => parseProject(bad)).toThrow();
    expect(source).toEqual(before);
  });
});
