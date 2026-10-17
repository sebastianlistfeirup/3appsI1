import { describe, expect, it } from "vitest";
import { createSampleProject } from "@tre/scene-format";
import {
  renderDownloadName,
  renderStateSchema,
  compareRenderSnapshot,
} from "./render-state";
const project = createSampleProject();
const job = renderStateSchema.parse({
  id: "423659f0-90ed-458c-9fd3-f99a720837f0",
  state: "queued",
  phase: "Klar",
  createdAt: "2026-10-16T12:00:00.000Z",
  updatedAt: "2026-10-16T12:00:00.000Z",
  expectedFrames: 24,
  manifestHash: "a".repeat(64),
  source: {
    projectId: project.id,
    title: project.title,
    revision: project.revision,
  },
});
describe("immutable render identity", () => {
  it("requires a full input hash to claim an exact match, including same-revision imports", () => {
    expect(compareRenderSnapshot(job, project)).toBe("unknown");
    expect(compareRenderSnapshot(job, project, "a".repeat(64))).toBe("same");
    expect(compareRenderSnapshot(job, project, "b".repeat(64))).toBe(
      "different",
    );
    expect(compareRenderSnapshot(job, { ...project, id: "different" })).toBe(
      "different",
    );
  });
  it("keeps old source-free statuses readable without inventing a project link", () => {
    const legacy = renderStateSchema.parse({ ...job, source: undefined });
    expect(legacy.source).toBeUndefined();
    expect(compareRenderSnapshot(legacy, project)).toBe("unknown");
    expect(compareRenderSnapshot(legacy, project, "b".repeat(64))).toBe(
      "different",
    );
  });
  it("creates revisioned header-safe filenames from arbitrary project titles", () => {
    const name = renderDownloadName({
      ...job,
      source: {
        ...job.source!,
        title: 'Ærlig film / "Ø"\r\nInjected: Å',
        revision: 17,
      },
    });
    expect(name).toBe("director-aerlig-film-oe-injected-aa-r17-423659f0.mp4");
    expect(renderDownloadName(job, "captions.srt")).toMatch(
      /-r\d+-423659f0-captions\.srt$/,
    );
    expect(() => renderDownloadName(job, "../manifest.json")).toThrow();
  });
  it("rejects forged paths, malformed hashes and unbounded status fields", () => {
    expect(
      renderStateSchema.safeParse({ ...job, id: "../secret" }).success,
    ).toBe(false);
    expect(
      renderStateSchema.safeParse({ ...job, manifestHash: "bad" }).success,
    ).toBe(false);
    expect(
      renderStateSchema.safeParse({ ...job, error: "x".repeat(10001) }).success,
    ).toBe(false);
    expect(
      renderStateSchema.safeParse({
        ...job,
        artifacts: { "../secret": { sha256: job.manifestHash, bytes: 1 } },
      }).success,
    ).toBe(false);
  });
});
