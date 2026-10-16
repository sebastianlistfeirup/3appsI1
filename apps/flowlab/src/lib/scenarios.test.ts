import { describe, it, expect } from "vitest";
import { initialDocument } from "./document";
import {
  appendVersion,
  importWorkspace,
  serializeWorkspace,
} from "./workspace";
import {
  openSavedScenario,
  openTemplateInWorkspace,
  alternativeFromBaseline,
  preserveDraft,
  snapshotMatchesDraft,
} from "./scenarios";
import { parseCsv } from "@tre/flow-engine";
const date = new Date(0).toISOString();
describe("Daily scenario switching protects unsaved work", () => {
  it("archives a changed draft before opening a saved scenario and retains it through workspace export/reload", () => {
    const doc = initialDocument();
    doc.versions = appendVersion(doc, "original", date).versions;
    doc.scenario.resources[0].capacity = 9;
    doc.scenarioName = "Min nye idé";
    doc.hypothesis = "En ændring, der ikke må gå tabt.";
    doc.baseSeed = 42;
    doc.decision = "En senere beslutning";
    const opened = openSavedScenario(doc, "original", "safety", date);
    expect(opened.archived?.context).toMatchObject({
      scenarioName: "Min nye idé",
      hypothesis: doc.hypothesis,
      baseSeed: 42,
    });
    expect(opened.document.scenario.resources[0].capacity).toBe(4);
    expect(opened.document.baseSeed).toBe(2026);
    expect(opened.document.decision).toBe(doc.decision);
    expect(doc.versions).toHaveLength(1);
    const restored = importWorkspace(serializeWorkspace(opened.document));
    expect(restored.versions).toHaveLength(2);
    const back = openSavedScenario(restored, "safety", "unused", date);
    expect(back.archived).toBeNull();
    expect(back.document.scenario.resources[0].capacity).toBe(9);
    expect(back.document.baseSeed).toBe(42);
  });
  it("opens a fresh template without erasing data versions, hypotheses, custom seed or decision draft", () => {
    const doc = initialDocument();
    doc.scenarioName = "Et vigtigt eksperiment";
    doc.scenario.resources[0].capacity = 8;
    doc.baseSeed = 71;
    doc.decision = "Bevar min begrundelse";
    const dataset = {
      id: "latest",
      name: "source.csv",
      sha256: "a".repeat(64),
      importedAt: date,
      unit: "seconds" as const,
      result: parseCsv("case_id,started_at,finished_at\na,0,60", {
        unit: "seconds",
      }),
    };
    doc.dataset = dataset;
    doc.datasetHistory = [{ ...dataset, id: "older" }];
    doc.trainingDataHashes = [dataset.sha256];
    const opened = openTemplateInWorkspace(
      doc,
      initialDocument(),
      "safety",
      date,
    );
    expect(opened.document.scenario.resources[0].capacity).toBe(4);
    expect(opened.document.dataset).toEqual(dataset);
    expect(opened.document.datasetHistory).toEqual(doc.datasetHistory);
    expect(opened.document.trainingDataHashes).toEqual(doc.trainingDataHashes);
    expect(opened.document.baseSeed).toBe(71);
    expect(opened.document.decision).toBe(doc.decision);
    expect(opened.document.versions[0].scenario.resources[0].capacity).toBe(8);
    expect(opened.document.versions[0].context?.scenarioName).toBe(
      "Et vigtigt eksperiment",
    );
    expect(opened.document.comparison).toBeNull();
    expect(opened.document.comparisonContext).toBeNull();
    expect(
      importWorkspace(serializeWorkspace(opened.document)).datasetHistory,
    ).toHaveLength(1);
  });
  it("does not create duplicate copies and refuses to evict history automatically at capacity", () => {
    const doc = initialDocument();
    for (let i = 0; i < 30; i++) {
      doc.scenarioName = `Idé ${i}`;
      doc.versions = appendVersion(doc, String(i), date).versions;
    }
    expect(snapshotMatchesDraft(doc.versions[0], doc)).toBe(true);
    expect(preserveDraft(doc, "unnecessary", date).archived).toBeNull();
    doc.scenarioName = "Ugemt idé";
    expect(() => openSavedScenario(doc, "0", "safety", date)).toThrow(
      "Alle 30 versionspladser",
    );
    expect(() =>
      openTemplateInWorkspace(doc, initialDocument(), "safety", date),
    ).toThrow("udkast er bevaret");
    expect(doc.versions).toHaveLength(30);
    expect(doc.versions.at(-1)?.id).toBe("0");
  });
  it("starts a new idea from baseline while keeping the previous alternative and common seed", () => {
    const doc = initialDocument();
    doc.baseSeed = 9876;
    const result = alternativeFromBaseline(doc, "copy", date);
    expect(result.document.scenario).toEqual(doc.baseline);
    expect(result.document.scenarioName).toBe("Nyt alternativ");
    expect(result.document.hypothesis).toBe("");
    expect(result.document.baseSeed).toBe(9876);
    expect(result.archived?.scenario.resources[0].capacity).toBe(4);
    result.document.scenario.resources[0].capacity = 8;
    expect(doc.baseline.resources[0].capacity).toBe(3);
    expect(result.archived?.scenario.resources[0].capacity).toBe(4);
  });
  it("rejects duplicate snapshot IDs before they can make restore or removal ambiguous", () => {
    const doc = initialDocument(),
      snapshot = appendVersion(doc, "same-id", date).snapshot;
    doc.versions = [snapshot, { ...snapshot, label: "Another version" }];
    expect(() => importWorkspace(serializeWorkspace(doc))).toThrow(
      "Modelversionernes id’er må ikke gentages",
    );
  });
});
