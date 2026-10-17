import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
const fonts = {
  regular: new Uint8Array(
    readFileSync("apps/flowlab/public/fonts/dm-sans-regular.ttf"),
  ),
  bold: new Uint8Array(
    readFileSync("apps/flowlab/public/fonts/manrope-bold.ttf"),
  ),
};
import {
  compareModels,
  goldenModel,
  assessHoldout,
  parseCsv,
} from "@tre/flow-engine";
import { initialDocument, validateDocument } from "./document";
import { createReport, reportPdf, reportZip } from "./report";
import { unzipSync, strFromU8 } from "fflate";
describe("Decision report integrity", () => {
  it("exports matching model snapshots, paired seeds and raw metrics in a real PDF/JSON/CSV ZIP", async () => {
    const doc = initialDocument();
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    doc.decision = "Undersøg antagelserne i et afgrænset pilotforløb.";
    const report = createReport(doc),
      files = unzipSync(await reportZip(report, fonts));
    const json = JSON.parse(strFromU8(files["report.json"]));
    expect(json.comparison.seeds).toEqual(doc.comparison.seeds);
    expect(json.comparison.metrics).toEqual(doc.comparison.metrics);
    expect(json.comparison.differences).toEqual(doc.comparison.differences);
    const slaRows = strFromU8(files["sla.csv"]).split("\n");
    expect(slaRows).toHaveLength(61);
    for (const side of ["baseline", "scenario"] as const)
      for (const run of doc.comparison[
        side === "baseline" ? "baselineRuns" : "scenarioRuns"
      ])
        expect(slaRows).toContain(
          [
            run.seed,
            side,
            run.status,
            doc.comparison[side].sla,
            run.observationStart,
            run.measuredUntil,
            run.metrics.throughput,
            run.metrics.slaMet,
            run.metrics.throughput - run.metrics.slaMet,
            run.metrics.slaCompleted,
            run.metrics.backlog,
            run.metrics.slaKnownBacklogBreaches,
            run.metrics.slaUnknownBacklog,
            run.metrics.aborted,
          ].join(","),
        );
    const csv = strFromU8(files["metrics.csv"]).split("\n");
    const timeRows = strFromU8(files["time-summaries.csv"]).split("\n");
    expect(timeRows).toHaveLength(181);
    const costRows = strFromU8(files["costs.csv"]).split("\n"),
      resourceRows = strFromU8(files["resources.csv"]).split("\n");
    expect(costRows).toHaveLength(61);
    expect(resourceRows).toHaveLength(
      1 +
        30 *
          (doc.comparison.baseline.resources.length +
            doc.comparison.scenario.resources.length),
    );
    for (const side of ["baseline", "scenario"] as const)
      for (const run of doc.comparison[
        side === "baseline" ? "baselineRuns" : "scenarioRuns"
      ])
        expect(costRows).toContain(
          [
            run.seed,
            `"${side}"`,
            `"${run.status}"`,
            run.observationStart,
            run.measuredUntil,
            run.metrics.salaryCost,
            run.metrics.variableCost,
            doc.comparison[side].fixedAutomationCost,
            run.metrics.cost,
          ].join(","),
        );
    for (const seed of doc.comparison.seeds)
      for (const side of ["baseline", "scenario"] as const)
        for (const metric of [
          "leadTime",
          "queueTime",
          "plannedWaitTime",
        ] as const) {
          const summary = doc.comparison[
            side === "baseline" ? "baselineRuns" : "scenarioRuns"
          ].find((run) => run.seed === seed)!.metrics[metric];
          expect(timeRows).toContain(
            [
              seed,
              side,
              metric,
              "ms",
              summary.count,
              summary.mean,
              summary.median,
              summary.p90,
            ].join(","),
          );
        }
    for (const metric of doc.comparison.metrics)
      expect(
        csv
          .find((line) => line.startsWith(`${metric.key},`))
          ?.split(",")
          .slice(1)
          .map(Number),
      ).toEqual([
        metric.baseline,
        metric.scenario,
        metric.deltaMean,
        metric.deltaP10,
        metric.deltaP90,
        metric.pairs,
      ]);
    const pdf = new TextDecoder("windows-1252").decode(files["rapport.pdf"]);
    expect(pdf.startsWith("%PDF-1.")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect((await PDFDocument.load(files["rapport.pdf"])).getPageCount()).toBe(
      5,
    );
    expect((await PDFDocument.load(files["rapport.pdf"])).getTitle()).toBe(
      "FlowLab · Medlemsservice",
    );
  });
  it("preserves long decision and hypothesis text in a paginated appendix", async () => {
    const doc = initialDocument();
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    doc.hypothesis = "Vigtige antagelser. ".repeat(100);
    doc.decision =
      "Denne begrundelse skal bevares. ".repeat(200) + "SIDSTE-BESLUTNING";
    const pdf = await PDFDocument.load(
      await reportPdf(createReport(doc), fonts),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });
  it("preserves an explicit holdout and distinguishes a historical assessment from the report baseline", async () => {
    const doc = initialDocument();
    doc.baseline = goldenModel();
    doc.scenario = goldenModel();
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    doc.holdout = assessHoldout({
      model: doc.baseline,
      runs: doc.comparison.baselineRuns,
      dataset: parseCsv(
        "case_id,arrived_at,activity,started_at,finished_at\na,0,Aktivitet,0,90\nb,60,Aktivitet,90,180\nc,120,Aktivitet,180,270",
        { unit: "seconds" },
      ),
      sourceName: "holdout.csv",
      sourceHash: "a".repeat(64),
      unit: "seconds",
      periodStart: 0,
      periodEnd: 300000,
      completionActivity: "Aktivitet",
      independent: true,
      completeWindow: true,
    });
    doc.dataset = {
      id: "holdout",
      name: "holdout.csv",
      sha256: "a".repeat(64),
      importedAt: "2026-10-16T00:00:00.000Z",
      unit: "seconds",
      result: parseCsv(
        "case_id,arrived_at,activity,started_at,finished_at\na,0,Aktivitet,0,90\nb,60,Aktivitet,90,180\nc,120,Aktivitet,180,270",
        { unit: "seconds" },
      ),
    };
    const report = createReport(doc);
    const files = unzipSync(await reportZip(report, fonts));
    expect(
      parseCsv(strFromU8(files["holdout-renset.csv"]), { unit: "seconds" })
        .rows,
    ).toEqual(doc.dataset.result.rows);
    expect(report.holdoutDataset?.sha256).toBe(doc.holdout.source.sha256);
    expect(report.holdoutMatchesBaseline).toBe(true);
    expect(report.holdout?.status).toBe("target_met");
    expect(
      (await PDFDocument.load(await reportPdf(report, fonts))).getPageCount(),
    ).toBe(6);
    doc.holdout.model.revision++;
    expect(createReport(doc).holdoutMatchesBaseline).toBe(false);
    const old = { ...initialDocument() } as Record<string, unknown>;
    delete old.holdout;
    delete old.trainingDataHashes;
    expect(validateDocument(old).trainingDataHashes).toEqual([]);
  });
  it("exports unavailable scenario metrics as blank CSV values while preserving known baseline values", async () => {
    const doc = initialDocument();
    doc.baseline = goldenModel();
    doc.scenario = goldenModel();
    doc.scenario.resources[0].capacity = 0;
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    const files = unzipSync(await reportZip(createReport(doc), fonts));
    const line = strFromU8(files["metrics.csv"])
      .split("\n")
      .find((row) => row.startsWith("leadTime,"));
    expect(line?.split(",")).toEqual([
      "leadTime",
      "120000",
      "",
      "",
      "",
      "",
      "0",
    ]);
  });
  it("requires a new run after model input changes while preserving the last complete result", async () => {
    const doc = initialDocument();
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    const prior = doc.comparison;
    doc.scenario.resources[0].capacity++;
    expect(() => createReport(doc)).toThrow(
      "Modellen, det fælles seed eller motor-/PRNG-versionen er ændret",
    );
    expect(doc.comparison).toBe(prior);
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    expect(createReport(doc).comparison.scenario.resources[0].capacity).toBe(5);
  });
  it("validates persisted and imported structure before trusting metrics or datasets", () => {
    const doc = initialDocument();
    expect(validateDocument(doc)).toEqual(doc);
    expect(() =>
      validateDocument({
        ...doc,
        comparison: {
          schemaVersion: 1,
          seeds: [],
          metrics: [{ key: "fabricated" }],
        },
      }),
    ).toThrow();
    expect(() =>
      validateDocument({
        ...doc,
        dataset: { name: "broken", result: { rows: [] } },
      }),
    ).toThrow();
  });
});
