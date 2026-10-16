import { z } from "zod";
import { comparisonSchema, datasetSchema, holdoutSchema } from "./validation";
import {
  ENGINE_VERSION,
  inputDiff,
  membershipTemplate,
  modelSchema,
  seedList,
  type FlowModel,
  type Comparison,
  type CsvImport,
  type HoldoutAssessment,
} from "@tre/flow-engine";
export interface ExperimentContext {
  scenarioName: string;
  hypothesis: string;
  baseSeed: number;
}
export interface RunContext extends ExperimentContext {
  startedAt: string;
  trainingDataHashes: string[];
}
export interface ModelSnapshot {
  id: string;
  label: string;
  savedAt: string;
  baseline: FlowModel;
  scenario: FlowModel;
  context?: ExperimentContext;
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
  baseSeed: number;
  versions: ModelSnapshot[];
  dataset: Dataset | null;
  datasetHistory: Dataset[];
  comparison: Comparison | null;
  comparisonContext: RunContext | null;
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
    baseSeed: 2026,
    versions: [],
    dataset: null,
    datasetHistory: [],
    comparison: null,
    comparisonContext: null,
    holdout: null,
    trainingDataHashes: [],
  };
}
const experimentSchema = z.object({
  scenarioName: z.string().max(200),
  hypothesis: z.string().max(4000),
  baseSeed: z.number().int().min(0).max(4294967295),
});
const documentSchema = z.object({
  schemaVersion: z.literal(1),
  baseline: modelSchema,
  scenario: modelSchema,
  scenarioName: z.string().max(200),
  hypothesis: z.string().max(4000),
  decision: z.string().max(10000),
  baseSeed: experimentSchema.shape.baseSeed.default(2026),
  versions: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(200),
        savedAt: z.iso.datetime(),
        baseline: modelSchema,
        scenario: modelSchema,
        context: experimentSchema.optional(),
      }),
    )
    .max(30),
  dataset: datasetSchema.nullable(),
  datasetHistory: z.array(datasetSchema).max(3).default([]),
  comparison: comparisonSchema.nullable(),
  comparisonContext: experimentSchema
    .extend({
      startedAt: z.iso.datetime(),
      trainingDataHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(100),
    })
    .nullable()
    .default(null),
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
          ? Math.abs(n) >= 1_000_000_000
            ? `${formatNumber(n / 1_000_000_000, 1)} mia. kr.`
            : `${formatNumber(n)} kr.`
          : formatNumber(n, n % 1 ? 1 : 0);
export const sameModel = (left: FlowModel, right: FlowModel) =>
  inputDiff(left, right).length === 0;
export function comparisonMatches(doc: FlowDocument) {
  return (
    !!doc.comparison &&
    doc.comparison.engineVersion === ENGINE_VERSION &&
    (!doc.comparisonContext ||
      doc.comparisonContext.baseSeed === doc.baseSeed) &&
    seedList(doc.baseSeed, doc.comparison.requestedSeeds.length).every(
      (seed, index) => seed === doc.comparison!.requestedSeeds[index],
    ) &&
    sameModel(doc.baseline, doc.comparison.baseline) &&
    sameModel(doc.scenario, doc.comparison.scenario)
  );
}
export function experimentContext(doc: FlowDocument): ExperimentContext {
  return {
    scenarioName: doc.scenarioName,
    hypothesis: doc.hypothesis,
    baseSeed: doc.baseSeed,
  };
}
export function narrativeChanged(doc: FlowDocument): boolean {
  return (
    !!doc.comparisonContext &&
    (doc.scenarioName !== doc.comparisonContext.scenarioName ||
      doc.hypothesis !== doc.comparisonContext.hypothesis)
  );
}

export const formatDifference = (key: string, value: number | null) =>
  value !== null && (key === "utilization" || key === "slaCompleted")
    ? `${formatNumber(value * 100, 1)} procentpoint`
    : formatMetric(key, value);
