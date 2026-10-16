import { z } from "zod";
import { comparisonSchema, datasetSchema, holdoutSchema } from "./validation";
import {
  ENGINE_VERSION,
  inputDiff,
  membershipTemplate,
  modelSchema,
  type FlowModel,
  type Comparison,
  type CsvImport,
  type HoldoutAssessment,
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
  datasetHistory: Dataset[];
  comparison: Comparison | null;
  holdout: HoldoutAssessment | null;
  trainingDataHashes: string[];
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
    datasetHistory: [],
    comparison: null,
    holdout: null,
    trainingDataHashes: [],
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
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(200),
        savedAt: z.iso.datetime(),
        baseline: modelSchema,
        scenario: modelSchema,
      }),
    )
    .max(30),
  dataset: datasetSchema.nullable(),
  datasetHistory: z.array(datasetSchema).max(3).default([]),
  comparison: comparisonSchema.nullable(),
  holdout: holdoutSchema.nullable().default(null),
  trainingDataHashes: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .max(100)
    .default([]),
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
export const sameModel = (left: FlowModel, right: FlowModel) =>
  inputDiff(left, right).length === 0;
export function comparisonMatches(doc: FlowDocument) {
  return (
    !!doc.comparison &&
    doc.comparison.engineVersion === ENGINE_VERSION &&
    sameModel(doc.baseline, doc.comparison.baseline) &&
    sameModel(doc.scenario, doc.comparison.scenario)
  );
}

export const formatDifference = (key: string, value: number | null) =>
  value !== null && (key === "utilization" || key === "slaCompleted")
    ? `${formatNumber(value * 100, 1)} procentpoint`
    : formatMetric(key, value);
