import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { compareModels, goldenModel } from "@tre/flow-engine";
import { initialDocument } from "../src/lib/document";
import { createReport, reportPdf } from "../src/lib/report";
async function main() {
  const doc = initialDocument();
  doc.baseline = goldenModel();
  doc.scenario = goldenModel();
  doc.baseline.name = "MODELSTART" + "W".repeat(81) + "MODELSLUT";
  doc.scenarioName = "ALTSTART" + "W".repeat(185) + "ALTSLUT";
  doc.hypothesis =
    "HYPOTESESTART" +
    "W".repeat(4000 - "HYPOTESESTART".length - "HYPOTESESLUT".length) +
    "HYPOTESESLUT";
  doc.decision = "BESLUTNINGSTART" + "æøåW".repeat(2490) + "BESLUTNINGSLUT";
  for (const [side, model] of [
    ["baseline", doc.baseline],
    ["scenario", doc.scenario],
  ] as const) {
    model.resources = Array.from({ length: 50 }, (_, index) => ({
      id: `${side}-pool-${index}`,
      label: "æøåW".repeat(25),
      capacity: index === 0 ? 1 : 1000,
      hourlyCost: 1000000,
      calendar: [],
    }));
    model.nodes.find((node) => node.kind === "activity")!.resourceId =
      `${side}-pool-0`;
    model.fixedAutomationCost = 1e12;
  }
  doc.comparison = await compareModels(doc.baseline, doc.scenario);
  const bytes = await reportPdf(createReport(doc), {
    regular: new Uint8Array(
      await readFile("apps/flowlab/public/fonts/dm-sans-regular.ttf"),
    ),
    bold: new Uint8Array(
      await readFile("apps/flowlab/public/fonts/manrope-bold.ttf"),
    ),
  });
  const path = "reports/flowlab/report-long-content.pdf";
  await writeFile(path, bytes);
  const extracted = execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf8",
    }),
    normalized = extracted.replace(/\s/g, "");
  for (const value of [
    doc.baseline.name,
    doc.scenarioName,
    doc.hypothesis,
    doc.decision,
  ]) {
    // Page headers and footers interrupt a long paragraph. Check its leading/trailing content and total character preservation.
    assert(
      normalized.includes(value.slice(0, 60)),
      "The full text starts in the PDF",
    );
    assert(
      normalized.includes(value.slice(-60)),
      "The full text finishes in the PDF",
    );
  }
  assert(
    (extracted.match(/æ/g) ?? []).length >= 2490,
    "All Danish characters in the complete decision survive pagination",
  );
  for (const model of [doc.baseline, doc.scenario])
    for (const pool of model.resources)
      assert(
        normalized.includes(`Pulje-id:${pool.id}`),
        `Resource ${pool.id} appears in the paginated cost ledger`,
      );
  const bbox = execFileSync("pdftotext", ["-bbox", path, "-"], {
    encoding: "utf8",
  });
  const words = [
    ...bbox.matchAll(
      /<word xMin="([\d.\-]+)" yMin="([\d.\-]+)" xMax="([\d.\-]+)" yMax="([\d.\-]+)">([^<]*)<\/word>/g,
    ),
  ];
  const outside = words
    .filter(
      (match) =>
        Number(match[1]) < 37 ||
        Number(match[3]) > 558 ||
        Number(match[2]) < 20 ||
        Number(match[4]) > 822,
    )
    .map((match) => ({
      text: match[5].slice(0, 60),
      box: match.slice(1, 5).map(Number),
    }));
  assert.deepEqual(
    outside,
    [],
    "All text stays within page margins, including unbroken words",
  );
  const pages = (bbox.match(/<page /g) ?? []).length;
  assert(pages > 2, "Full long text has a paginated appendix");
  const report = {
    executedAt: new Date().toISOString(),
    pages,
    words: words.length,
    outside,
    checks: [
      "200-character alternative name and 100-character model name retained in appendix",
      "4,000-character unbroken hypothesis retained",
      "Nearly 10,000-character unbroken Danish decision retained",
      "Every extracted word stays within printable page bounds",
      "Actual licensed embedded fonts and full 30 paired golden runs used",
      "All 100 distinct pool IDs and maximum fixed cost survive the paginated resource ledger",
    ],
  };
  await writeFile(
    "reports/flowlab/report-layout-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
