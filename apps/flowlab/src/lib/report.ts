import {
  assertReportReady,
  metricDefinitions,
  type Comparison,
  type MetricKey,
} from "@tre/flow-engine";
import { strToU8, zipSync } from "fflate";
import { formatMetric, formatDifference, type FlowDocument } from "./document";
export interface DecisionReport {
  reportVersion: 1;
  generatedAt: string;
  title: string;
  scenarioName: string;
  hypothesis: string;
  decision: string;
  dataBasis: string;
  limitations: string[];
  comparison: Comparison;
}
export function createReport(doc: FlowDocument): DecisionReport {
  if (!doc.comparison) throw new Error("Kør en sammenligning først.");
  assertReportReady(doc.comparison);
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    title: doc.comparison.baseline.name,
    scenarioName: doc.scenarioName,
    hypothesis: doc.hypothesis,
    decision: doc.decision,
    dataBasis: doc.comparison.baseline.evidence,
    limitations: [
      "Resultaterne er simulerede og er ikke dokumentation for realiserede gevinster.",
      "10.–90.-percentilen er simulationsspredning for parrede forskelle, ikke et konfidensinterval for virkeligheden.",
      "Gennemløbs- og ventetider omfatter kun afsluttede sager. Restkøen vises særskilt.",
      "Modellen er ikke automatisk kalibreret mod faktisk drift. Ingen kundedata eller cloudintegration er tilkoblet.",
    ],
    comparison: doc.comparison,
  };
}
import type { ReportFonts } from "./pdf";
export async function reportPdf(
  report: DecisionReport,
  fonts?: ReportFonts,
): Promise<Uint8Array> {
  const { renderReportPdf } = await import("./pdf");
  return renderReportPdf(report, fonts);
}
export async function reportZip(
  report: DecisionReport,
  fonts?: ReportFonts,
): Promise<Uint8Array> {
  const metrics = [
    "metric,baseline,scenario,delta_mean,delta_p10,delta_p90,pairs",
    ...report.comparison.metrics.map((m) =>
      [
        m.key,
        m.baseline,
        m.scenario,
        m.deltaMean,
        m.deltaP10,
        m.deltaP90,
        m.pairs,
      ].join(","),
    ),
  ].join("\n");
  return zipSync(
    {
      "rapport.pdf": await reportPdf(report, fonts),
      "report.json": strToU8(JSON.stringify(report, null, 2)),
      "metrics.csv": strToU8(metrics),
      "models.json": strToU8(
        JSON.stringify(
          {
            baseline: report.comparison.baseline,
            scenario: report.comparison.scenario,
          },
          null,
          2,
        ),
      ),
      "LAES_MIG.txt": strToU8(
        "FlowLab lokal beslutningsrapport\nPDF og CSV er afledt af de samme metrics i report.json.\nFor at reproducere: brug motorversionen, de to model-snapshots og den fælles seedliste i report.json.\nAlle tider i JSON er millisekunder; rapporten viser minutter.\nSimulerede gevinster er ikke realiserede gevinster.\n",
      ),
    },
    { level: 6 },
  );
}
