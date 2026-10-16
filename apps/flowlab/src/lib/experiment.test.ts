import { describe, expect, it } from "vitest";
import { compareModels, goldenModel, seedList } from "@tre/flow-engine";
import {
  initialDocument,
  validateDocument,
  comparisonMatches,
  experimentContext,
} from "./document";
import {
  appendVersion,
  restoreVersion,
  serializeWorkspace,
  importWorkspace,
} from "./workspace";
import { createReport } from "./report";

describe("Experiment context and reproducibility", () => {
  it("migrates older workspaces and restores immutable hypothesis and seed without overwriting the decision", () => {
    const older = initialDocument();
    delete (older as Partial<typeof older>).baseSeed;
    delete (older as Partial<typeof older>).comparisonContext;
    const doc = validateDocument(older);
    expect(doc.baseSeed).toBe(2026);
    expect(doc.comparisonContext).toBeNull();
    doc.scenarioName = "Bevar konteksten";
    doc.hypothesis = "Den oprindelige forventning";
    doc.baseSeed = 4294967295;
    const snapshot = appendVersion(
      doc,
      "first",
      new Date(0).toISOString(),
    ).snapshot;
    doc.scenarioName = "Ny idé";
    doc.hypothesis = "En anden forventning";
    doc.baseSeed = 0;
    doc.decision = "Min senere beslutning";
    const restored = restoreVersion(doc, snapshot);
    expect(experimentContext(restored)).toEqual(snapshot.context);
    expect(restored.decision).toBe(doc.decision);
    restored.scenario.resources[0].capacity = 100;
    expect(snapshot.scenario.resources[0].capacity).toBe(4);
    expect(importWorkspace(serializeWorkspace(restored)).baseSeed).toBe(
      4294967295,
    );
    const legacySnapshot = { ...snapshot, context: undefined };
    expect(restoreVersion(doc, legacySnapshot).baseSeed).toBe(0);
  });
  it("ties current reports to the persisted seed list and keeps the original hypothesis when the report text changes", async () => {
    const doc = initialDocument();
    doc.baseline = goldenModel();
    doc.scenario = goldenModel();
    doc.baseSeed = 12345;
    doc.comparison = await compareModels(doc.baseline, doc.scenario, {
      seeds: seedList(doc.baseSeed),
    });
    doc.comparisonContext = {
      ...experimentContext(doc),
      startedAt: new Date(0).toISOString(),
      trainingDataHashes: ["a".repeat(64)],
    };
    const original = structuredClone(doc.comparisonContext);
    expect(comparisonMatches(doc)).toBe(true);
    doc.hypothesis = "Ny fortolkning efter resultatet";
    doc.scenarioName = "Et nyt rapportnavn";
    const report = createReport(doc);
    expect(report.narrativeChanged).toBe(true);
    expect(report.hypothesis).toBe(doc.hypothesis);
    expect(report.runContext).toEqual(original);
    expect(
      report.diagnostics.some(
        (item) => item.code === "report_narrative_changed",
      ),
    ).toBe(true);
    expect(
      importWorkspace(serializeWorkspace(doc)).comparisonContext,
    ).toBeNull();
    doc.baseSeed = 54321;
    expect(comparisonMatches(doc)).toBe(false);
    expect(() => createReport(doc)).toThrow("fælles seed");
    doc.baseSeed = 12345;
    expect(comparisonMatches(doc)).toBe(true);
    doc.comparisonContext.baseSeed = 0;
    expect(() => createReport(doc)).toThrow("fælles seed");
  });
});
