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
import { compareModels } from "@tre/flow-engine";
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
    const csv = strFromU8(files["metrics.csv"]).split("\n");
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
      2,
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
