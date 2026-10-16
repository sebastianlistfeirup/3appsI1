import { describe, expect, it } from "vitest";
import {
  goldenModel,
  simulate,
  assembleComparison,
  ENGINE_VERSION,
  parseCsv,
} from "@tre/flow-engine";
import { initialDocument } from "./document";
import {
  appendVersion,
  importWorkspace,
  serializeWorkspace,
  workspaceError,
} from "./workspace";
describe("Workspace recovery contract", () => {
  it("round-trips models, data, decisions and immutable versions without importing computed claims", () => {
    const doc = initialDocument();
    doc.decision = "Bevar denne begrundelse og æ/ø/å.";
    doc.dataset = {
      id: "data-1",
      name: "source.csv",
      unit: "seconds",
      importedAt: "2026-10-16T00:00:00.000Z",
      sha256: "a".repeat(64),
      result: parseCsv("case_id,started_at,finished_at\na,0,60", {
        unit: "seconds",
      }),
    };
    doc.versions = appendVersion(
      doc,
      "snapshot",
      "2026-10-16T00:00:00.000Z",
    ).versions;
    const copy = importWorkspace(serializeWorkspace(doc));
    expect(copy).toEqual(doc);
    const oldFormat = {
      ...doc,
      comparison: { fabricated: "result" },
      holdout: { fabricated: "calibrated" },
    };
    expect(importWorkspace(JSON.stringify(oldFormat))).toEqual(doc);
    expect(doc.versions[0].scenario.resources[0].capacity).toBe(4);
    doc.scenario.resources[0].capacity = 7;
    expect(doc.versions[0].scenario.resources[0].capacity).toBe(4);
  });
  it("a real 20-node, 10,000-case result over the old import limit exports as a compact, valid model package", () => {
    const model = goldenModel();
    model.horizon = 300000;
    model.maxEvents = 5000000;
    model.arrivals = {
      type: "explicit",
      cases: Array.from({ length: 10000 }, (_, i) => ({
        id: `case-${i}`,
        time: 0,
        caseType: "standard",
      })),
    };
    const activity = model.nodes.find((node) => node.kind === "activity")!;
    model.nodes = [
      model.nodes[0],
      ...Array.from({ length: 18 }, (_, i) => ({
        ...activity,
        id: `activity-${i}`,
        duration: { type: "fixed" as const, value: 1 },
        position: { x: 200 * (i + 1), y: 0 },
      })),
      model.nodes.at(-1)!,
    ];
    model.edges = model.nodes.slice(0, -1).map((node, i) => ({
      id: `edge-${i}`,
      source: node.id,
      target: model.nodes[i + 1].id,
    }));
    model.resources[0].capacity = 100;
    const result = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 2026,
    });
    expect(result.metrics.throughput).toBe(10000);
    const doc = initialDocument();
    doc.baseline = model;
    doc.scenario = structuredClone(model);
    doc.comparison = assembleComparison(
      doc.baseline,
      doc.scenario,
      [2026],
      [result],
      [result],
    );
    expect(
      new TextEncoder().encode(JSON.stringify(doc, null, 2)).byteLength,
    ).toBeGreaterThan(20 * 1024 * 1024);
    const exported = serializeWorkspace(doc);
    expect(new TextEncoder().encode(exported).byteLength).toBeLessThan(
      2 * 1024 * 1024,
    );
    const restored = importWorkspace(exported);
    expect(restored.baseline).toEqual(doc.baseline);
    expect(restored.scenario).toEqual(doc.scenario);
    expect(restored.comparison).toBeNull();
  }, 20000);
  it("rechecks imported CSV rows and derives actual summaries instead of accepting forged aggregates", () => {
    const doc = initialDocument();
    doc.dataset = {
      id: "source",
      name: "source.csv",
      unit: "seconds",
      sha256: "a".repeat(64),
      importedAt: new Date(0).toISOString(),
      result: parseCsv("case_id,started_at,finished_at\na,0,60", {
        unit: "seconds",
      }),
    };
    doc.dataset.result.durationMs = [1];
    expect(
      importWorkspace(JSON.stringify(doc)).dataset?.result.durationMs,
    ).toEqual([60000]);
    doc.dataset.result.rows[0].finished_at = "-1";
    expect(() => importWorkspace(JSON.stringify(doc))).toThrow(
      "ugyldige rækker",
    );
    doc.dataset.result.rows[0].finished_at = "60";
    doc.dataset.result.rows[0].unnecessary_name = "unneeded";
    expect(() => importWorkspace(JSON.stringify(doc))).toThrow(
      "ukendte felter",
    );
  });
  it("keeps snapshot labels increasing after the 30-version retention boundary", () => {
    const doc = initialDocument();
    for (let i = 1; i <= 35; i++)
      doc.versions = appendVersion(
        doc,
        String(i),
        new Date(0).toISOString(),
      ).versions;
    expect(doc.versions).toHaveLength(30);
    expect(doc.versions[0].label).toBe("Version 35");
    expect(doc.versions.at(-1)?.label).toBe("Version 6");
    expect(new Set(doc.versions.map((version) => version.label)).size).toBe(30);
  });
  it("refuses a snapshot that exceeds the visible byte budget without removing saved history", () => {
    const doc = initialDocument();
    doc.baseline.arrivals = {
      type: "explicit",
      cases: Array.from({ length: 100000 }, (_, i) => ({
        id: `case-${i}-${"x".repeat(80)}`,
        time: 0,
        caseType: "standard",
      })),
    };
    doc.scenario = structuredClone(doc.baseline);
    const first = initialDocument();
    doc.versions = appendVersion(
      first,
      "one",
      new Date(0).toISOString(),
    ).versions;
    expect(() => appendVersion(doc, "two", new Date(0).toISOString())).toThrow(
      "16 MB",
    );
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0].id).toBe("one");
  });
  it("rejects malformed input with a compact Danish recovery message", () => {
    expect(() => importWorkspace("[]")).toThrow("arbejdsrum");
    expect(workspaceError(new SyntaxError("Unexpected token"))).toContain(
      "gyldig JSON",
    );
    try {
      importWorkspace('{"schemaVersion":999}');
    } catch (error) {
      const message = workspaceError(error);
      expect(message).toContain("dit nuværende arbejde er bevaret");
      expect(message.length).toBeLessThan(400);
    }
  });
});
