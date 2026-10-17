import {
  assertReportReady,
  cleanedCsv,
  describeEngineCode,
  metricDefinitions,
  type Comparison,
  type MetricKey,
  type HoldoutAssessment,
} from "@tre/flow-engine";
import { strToU8, zipSync } from "fflate";
import { holdoutDataset } from "./datasets";
import { slaProfilesCsv } from "./sla-profile";
import { timeProfilesCsv } from "./time-profile";
import { costProfilesCsv, resourceProfilesCsv } from "./cost-profile";
import {
  comparisonMatches,
  narrativeChanged,
  sameModel,
  formatMetric,
  formatDifference,
  type FlowDocument,
  type Dataset,
  type RunContext,
} from "./document";
export interface DecisionReport {
  reportVersion: 1;
  generatedAt: string;
  title: string;
  scenarioName: string;
  hypothesis: string;
  decision: string;
  baseSeed: number;
  runContext: RunContext | null;
  narrativeChanged: boolean;
  dataBasis: string;
  limitations: string[];
  diagnostics: { code: string; message: string }[];
  comparison: Comparison;
  holdout: HoldoutAssessment | null;
  holdoutMatchesBaseline: boolean;
  holdoutDataset: Dataset | null;
}
export function createReport(doc: FlowDocument): DecisionReport {
  if (!doc.comparison) throw new Error("Kør en sammenligning først.");
  if (!comparisonMatches(doc))
    throw new Error(
      "Modellen eller det fælles seed er ændret siden den seneste sammenligning. Kør igen, før du eksporterer en rapport for de aktuelle input.",
    );
  assertReportReady(doc.comparison);
  const sourceDataset = holdoutDataset(doc);
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    title: doc.comparison.baseline.name,
    scenarioName: doc.scenarioName,
    hypothesis: doc.hypothesis,
    decision: doc.decision,
    baseSeed: doc.baseSeed,
    runContext: doc.comparisonContext,
    narrativeChanged: narrativeChanged(doc),
    dataBasis: doc.comparison.baseline.evidence,
    limitations: [
      "Resultaterne er simulerede og er ikke dokumentation for realiserede gevinster.",
      "10.–90.-percentilen er simulationsspredning for parrede forskelle, ikke et konfidensinterval for virkeligheden.",
      "Gennemløbs- og ventetider omfatter kun afsluttede sager. Restkøen vises særskilt.",
      "Modellen er ikke automatisk kalibreret mod faktisk drift. Ingen kundedata eller cloudintegration er tilkoblet.",
    ],
    diagnostics: [
      ...(narrativeChanged(doc)
        ? [
            {
              code: "report_narrative_changed",
              message:
                "Rapportens navn eller hypotese er redigeret efter kørslens start. Det oprindelige navn, den oprindelige hypotese og starttidspunktet er bevaret under kørslens grundlag i PDF og JSON.",
            },
          ]
        : []),
      ...[
        ...new Set(
          [
            ...doc.comparison.baselineRuns,
            ...doc.comparison.scenarioRuns,
          ].flatMap((run) => run.warningCodes),
        ),
      ].map((code) => ({ code, message: describeEngineCode(code) })),
      ...(doc.holdout && !sourceDataset
        ? [
            {
              code: "holdout_source_missing",
              message:
                "Det rensede holdout-grundlag er ikke længere i arbejdsrummet. Vurderingens tal og kildehenvisning er bevaret, men dens rå rækker kan ikke reproduceres fra denne rapportpakke alene.",
            },
          ]
        : []),
    ],
    comparison: doc.comparison,
    holdout: doc.holdout,
    holdoutDataset: sourceDataset,
    holdoutMatchesBaseline:
      !!doc.holdout &&
      doc.holdout.engineVersion === doc.comparison.engineVersion &&
      sameModel(doc.holdout.model, doc.comparison.baseline),
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
      ...(report.holdoutDataset
        ? {
            "holdout-renset.csv": strToU8(
              cleanedCsv(report.holdoutDataset.result),
            ),
          }
        : {}),
      "report.json": strToU8(JSON.stringify(report, null, 2)),
      "metrics.csv": strToU8(metrics),
      "sla.csv": strToU8(slaProfilesCsv(report.comparison)),
      "time-summaries.csv": strToU8(timeProfilesCsv(report.comparison)),
      "costs.csv": strToU8(costProfilesCsv(report.comparison)),
      "resources.csv": strToU8(resourceProfilesCsv(report.comparison)),
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
        "FlowLab lokal beslutningsrapport\nPDF og CSV er afledt af de samme metrics i report.json.\nFor at reproducere: brug motorversionen, de to model-snapshots og den fælles seedliste i report.json.\nAlle tider i JSON og time-summaries.csv er millisekunder. PDF viser enheden ved hvert tal.\nSla.csv indeholder grænse, afsluttede inden/efter SLA og kendte/ukendte SLA-udfald i restkøen for alle seeds. completed_share er en andel fra 0 til 1; tomt felt betyder ukendt.\nCosts.csv indeholder løn, variable aktivitetspriser, fast automation og total for hvert seed og hvert scenarie. Alle beløb er DKK. Resources.csv indeholder reserveret, optaget og ledig medarbejdertid i millisekunder samt løn for alle puljer og seeds. Tid summeres på tværs af medarbejdere. Løn betales for reserveret tid i målevinduet; fast automation tæller fuldt én gang pr. kørsel. Formellignende pulje-id og navne beskyttes med en apostrof i CSV; JSON bevarer originalen.\nTime-summaries.csv indeholder gennemsnit, median, p90 og antal afsluttede sager for hver tidsart og hvert seed. Middel af run-percentiler er ikke en samlet percentil for alle sager.\nSimulerede gevinster er ikke realiserede gevinster.\nHvis holdoutDataset findes i report.json, indeholder den det præcise rensede grundlag til holdout-vurderingen. CSV beskytter formellignende tekst med en apostrof; JSON bevarer den oprindelige værdi.\n",
      ),
    },
    { level: 6 },
  );
}
