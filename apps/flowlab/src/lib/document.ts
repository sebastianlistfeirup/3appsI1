import { z } from "zod";
import { comparisonSchema, datasetSchema } from "./validation";
import {
  ENGINE_VERSION,
  membershipTemplate,
  modelSchema,
  type FlowModel,
  type Comparison,
  type CsvImport,
} from "@tre/flow-engine";
export interface ModelSnapshot {
  id: string;
  label: string;
  savedAt: string;
  baseline: FlowModel;
  scenario: FlowModel;
}
export interface Dataset {
  id: string;
  name: string;
  sha256: string;
  importedAt: string;
  unit: "iso" | "seconds" | "minutes";
  result: CsvImport;
}
export interface FlowDocument {
  schemaVersion: 1;
  baseline: FlowModel;
  scenario: FlowModel;
  scenarioName: string;
  hypothesis: string;
  decision: string;
  versions: ModelSnapshot[];
  dataset: Dataset | null;
  comparison: Comparison | null;
}
export function initialDocument(): FlowDocument {
  const baseline = membershipTemplate(),
    scenario = structuredClone(baseline);
  scenario.resources[0].capacity = 4;
  return {
    schemaVersion: 1,
    baseline,
    scenario,
    scenarioName: "En ekstra sagsbehandler",
    hypothesis:
      "En ekstra sagsbehandler reducerer ventetid og restkø. Den simulerede effekt skal vurderes op imod den ekstra lønkapacitet.",
    decision: "",
    versions: [],
    dataset: null,
    comparison: null,
  };
}
const documentSchema = z.object({
  schemaVersion: z.literal(1),
  baseline: modelSchema,
  scenario: modelSchema,
  scenarioName: z.string().max(200),
  hypothesis: z.string().max(4000),
  decision: z.string().max(10000),
  versions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        savedAt: z.string(),
        baseline: modelSchema,
        scenario: modelSchema,
      }),
    )
    .max(30),
  dataset: datasetSchema.nullable(),
  comparison: comparisonSchema.nullable(),
});
export function validateDocument(value: unknown): FlowDocument {
  return documentSchema.parse(value) as FlowDocument;
}
export const formatNumber = (n: number | null, digits = 0) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("da-DK", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(n);
export const formatMetric = (key: string, n: number | null) =>
  n === null
    ? "—"
    : key === "leadTime" || key === "queueTime"
      ? `${formatNumber(n / 60000, 1)} min`
      : key === "utilization" || key === "slaCompleted"
        ? `${formatNumber(n * 100, 1)} %`
        : key === "cost"
          ? `${formatNumber(n)} kr.`
          : formatNumber(n, n % 1 ? 1 : 0);
export function comparisonMatches(doc: FlowDocument) {
  return (
    !!doc.comparison &&
    doc.comparison.engineVersion === ENGINE_VERSION &&
    JSON.stringify(doc.baseline) === JSON.stringify(doc.comparison.baseline) &&
    JSON.stringify(doc.scenario) === JSON.stringify(doc.comparison.scenario)
  );
}

export const formatDifference = (key: string, value: number | null) =>
  value !== null && (key === "utilization" || key === "slaCompleted")
    ? `${formatNumber(value * 100, 1)} procentpoint`
    : formatMetric(key, value);
