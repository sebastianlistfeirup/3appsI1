import { describe, it, expect } from "vitest";
import { createSampleProject, parseProject } from "@tre/scene-format";
import {
  freshProduction,
  summarizeProduction,
  isProductionKey,
} from "./productions";
describe("Independent local film documents", () => {
  it("creates an empty valid set with reusable cameras and no inherited cast or clips", () => {
    const p = freshProduction("  Min første film  ", "empty");
    expect(p.title).toBe("Min første film");
    expect(p.id).not.toBe("station_07");
    expect(p.draft.cameras).toHaveLength(5);
    expect(p.draft.objects).toEqual([]);
    expect(p.draft.environment.preset).toBe("studio");
    expect(p.draft.name).toBe("Mit første set");
    expect(p.shots).toEqual([]);
    expect(p.sequence).toEqual([]);
    expect(p.scenes).toEqual([p.draft]);
    expect(parseProject(p)).toEqual(p);
  });
  it("copies a whole production under a new project identity without changing its immutable scene/shot references", () => {
    const source = createSampleProject(),
      original = structuredClone(source),
      copy = freshProduction("Kopi", "sample", source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.sequence).toEqual(source.sequence);
    expect(copy.shots).toEqual(source.shots);
    copy.draft.objects[0].transform.position[0] = 9;
    expect(source).toEqual(original);
    expect(copy.scenes[0].objects[0].transform.position[0]).toBe(-1.2);
  });
  it("keeps future/corrupted documents discoverable for raw backup rather than dropping them from the library", () => {
    const summary = summarizeProduction("production", {
      schemaVersion: 1,
      key: "production",
      revision: 2,
      updatedAt: "not-a-date",
      data: { schemaVersion: 2, title: "Bevar min fil" },
    });
    expect(summary.valid).toBe(false);
    expect(summary.title).toBe("Bevar min fil");
    expect(summary.updatedAt).toBeNull();
    expect(summary.thumbnail).toBeNull();
    expect(summary.error).toBeTruthy();
  });
  it("does not show an old camera frame as the thumbnail of an imported movie clip", () => {
    const p = createSampleProject();
    const id = p.sequence[0];
    p.shots.find((s) => s.id === id)!.frame = "data:image/jpeg;base64,AA==";
    p.shots.find((s) => s.id === id)!.mediaId = "clip";
    p.media.push({
      id: "clip",
      name: "Eget klip.mp4",
      kind: "video",
      mime: "video/mp4",
      dataUrl: "data:video/mp4;base64,AA==",
      sha256: "0".repeat(64),
      bytes: 1,
      durationFrames: 288,
      source: "Own clip",
      rights: "owned",
    });
    const result = summarizeProduction("production", {
      schemaVersion: 1,
      key: "production",
      revision: 1,
      updatedAt: new Date().toISOString(),
      data: p,
    });
    expect(result.valid).toBe(true);
    expect(result.thumbnail).toBeNull();
    expect(result.frames).toBe(1440);
  });
  it("uses a bounded known key format for the last-opened pointer", () => {
    expect(isProductionKey("production")).toBe(true);
    expect(isProductionKey("production_" + "a".repeat(32))).toBe(true);
    expect(isProductionKey("director-last-render")).toBe(false);
    expect(isProductionKey("__proto__")).toBe(false);
  });
  it("does not retain full-resolution frames in the summary collection", () => {
    const project = createSampleProject();
    project.shots[0].frame = "data:image/jpeg;base64," + "A".repeat(4_000_000);
    const summary = summarizeProduction("production", {
      schemaVersion: 1,
      key: "production",
      revision: 1,
      updatedAt: new Date().toISOString(),
      data: project,
    });
    expect(summary.valid).toBe(true);
    expect(summary.thumbnail).toBeNull();
    expect(JSON.stringify(summary).length).toBeLessThan(500);
    expect(project.shots[0].frame.length).toBeGreaterThan(4_000_000);
  });
});
