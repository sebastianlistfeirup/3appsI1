import { describe, expect, it } from "vitest";
import {
  parseCsv,
  assessHoldout,
  goldenModel,
  compareModels,
} from "@tre/flow-engine";
import { initialDocument, type Dataset } from "./document";
import {
  holdoutDataset,
  planDatasetChange,
  replaceDataset,
  MAX_DATASET_BYTES,
} from "./datasets";
import { importWorkspace, serializeWorkspace } from "./workspace";
import { createReport } from "./report";
const dataset = (id: string, finish = 60): Dataset => ({
  id,
  name: `${id}.csv`,
  importedAt: "2026-10-16T00:00:00.000Z",
  sha256: "a".repeat(64),
  unit: "seconds",
  result: parseCsv(
    `case_id,activity,arrived_at,started_at,finished_at\na,Aktivitet,0,0,${finish}`,
    { unit: "seconds" },
  ),
});
describe("Cleaned data version contract", () => {
  it("archives prior rows and restores their explicit interpretation without changing model assumptions", () => {
    const first = dataset("first"),
      second = dataset("second", 120);
    let doc = replaceDataset(initialDocument(), first);
    doc = replaceDataset(doc, second);
    expect(doc.datasetHistory[0]).toEqual(first);
    const restored = replaceDataset(doc, doc.datasetHistory[0]);
    expect(restored.dataset?.result.durationMs).toEqual([60000]);
    expect(restored.datasetHistory[0]).toEqual(second);
    expect(restored.scenario).toEqual(doc.scenario);
    expect(
      importWorkspace(serializeWorkspace(restored)).datasetHistory,
    ).toEqual(restored.datasetHistory);
  });
  it("requires explicit removal consent before a fifth data version replaces the oldest", () => {
    let doc = initialDocument();
    for (let i = 1; i <= 4; i++) doc = replaceDataset(doc, dataset(`v${i}`));
    const plan = planDatasetChange(doc, dataset("v5"));
    expect(plan.removed.map((item) => item.id)).toEqual(["v1"]);
    expect(() => replaceDataset(doc, dataset("v5"))).toThrow(
      "godkend fjernelse",
    );
    expect(doc.dataset?.id).toBe("v4");
    expect(doc.datasetHistory.map((item) => item.id)).toEqual([
      "v3",
      "v2",
      "v1",
    ]);
    expect(
      replaceDataset(doc, dataset("v5"), true).datasetHistory.map(
        (item) => item.id,
      ),
    ).toEqual(["v4", "v3", "v2"]);
  });
  it("enforces the real byte budget before the count limit using valid, large cleaned CSV data", () => {
    const csv =
      "case_id,case_type,activity,resource_group,event_id,started_at,finished_at\n" +
      Array.from({ length: 14000 }, (_, i) =>
        [
          `case-${i}-${"a".repeat(85)}`,
          "t".repeat(100),
          "a".repeat(100),
          "r".repeat(100),
          `event-${i}-${"e".repeat(85)}`,
          "0",
          "60",
        ].join(","),
      ).join("\n");
    const source = dataset("source");
    source.result = parseCsv(csv, { unit: "seconds" });
    expect(source.result.rows).toHaveLength(14000);
    let doc = initialDocument();
    for (let i = 1; i <= 3; i++)
      doc = replaceDataset(doc, { ...source, id: `source-${i}` });
    const plan = planDatasetChange(doc, { ...source, id: "source-4" });
    expect(plan.removed.map((item) => item.id)).toEqual(["source-1"]);
    expect(plan.bytes).toBeLessThanOrEqual(MAX_DATASET_BYTES);
    expect(plan.history).toHaveLength(2);
  }, 20000);
  it("resolves a holdout to its exact archived dataset ID even when later interpretations share the source hash", async () => {
    let doc = initialDocument();
    doc.baseline = goldenModel();
    doc.scenario = goldenModel();
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    const source = dataset("validated-source", 90);
    doc = replaceDataset(doc, source);
    doc.holdout = assessHoldout({
      model: doc.baseline,
      runs: doc.comparison!.baselineRuns,
      dataset: source.result,
      sourceId: source.id,
      sourceName: source.name,
      sourceHash: source.sha256,
      unit: source.unit,
      periodStart: 0,
      periodEnd: 300000,
      completionActivity: "Aktivitet",
      independent: true,
      completeWindow: true,
    });
    doc = replaceDataset(doc, dataset("different-interpretation", 120));
    expect(holdoutDataset(doc)?.id).toBe(source.id);
    expect(createReport(doc).holdoutDataset?.result.durationMs).toEqual([
      90000,
    ]);
    doc.datasetHistory = [];
    expect(createReport(doc).holdoutDataset).toBeNull();
    expect(
      createReport(doc).diagnostics.some(
        (diagnostic) => diagnostic.code === "holdout_source_missing",
      ),
    ).toBe(true);
  });
});
