import { z } from "zod";
import { modelSchema } from "@tre/flow-engine";
const number = z.number().finite(),
  count = z.number().int().nonnegative();
const summary = z.object({
  mean: number.nullable(),
  median: number.nullable(),
  p90: number.nullable(),
  count,
});
const metricKey = z.enum([
  "throughput",
  "leadTime",
  "queueTime",
  "backlog",
  "utilization",
  "cost",
  "slaCompleted",
]);
const result = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.string(),
  prngVersion: z.string(),
  seed: count.max(0xffffffff),
  modelId: z.string(),
  modelRevision: count,
  status: z.enum(["completed", "partial", "failed"]),
  horizon: count.positive(),
  observationStart: count,
  measuredUntil: count,
  eventCount: count,
  metrics: z.object({
    throughput: count,
    completedBeforeWindow: count.default(0),
    throughputPerHour: number,
    backlog: count,
    arrived: count,
    active: count,
    waiting: count,
    plannedWait: count,
    aborted: count,
    leadTime: summary,
    queueTime: summary,
    plannedWaitTime: summary,
    utilization: number.nullable(),
    cost: number,
    salaryCost: number,
    variableCost: number,
    slaMet: count,
    slaCompleted: number.nullable(),
    slaKnownBacklogBreaches: count,
    slaUnknownBacklog: count,
  }),
  resources: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        capacity: count,
        availableTime: number,
        busyTime: number,
        utilization: number.nullable(),
        salaryCost: number,
      }),
    )
    .max(50),
  resourceTimelines: z
    .array(
      z.object({
        resourceId: z.string(),
        caseId: z.string(),
        nodeId: z.string(),
        start: count,
        end: count,
      }),
    )
    .max(1_000_000),
  queueSamples: z
    .array(
      z.object({
        time: count,
        waiting: count,
        active: count,
        plannedWait: count,
        completed: count,
        arrived: count,
        byNode: z.record(z.string(), count),
      }),
    )
    .max(1000),
  cases: z
    .array(
      z.object({
        id: z.string(),
        caseType: z.string(),
        arrival: count,
        completedAt: count.nullable(),
        status: z.enum([
          "waiting",
          "active",
          "planned_wait",
          "completed",
          "aborted",
        ]),
        queueTime: count,
        plannedWait: count,
        visitCount: count,
        cohort: z.enum(["warmup", "observation"]),
      }),
    )
    .max(100000),
  trace: z
    .array(
      z.object({
        time: count,
        type: z.string(),
        caseId: z.string(),
        nodeId: z.string(),
        visitId: z.string(),
        duration: count.optional(),
      }),
    )
    .max(100000),
  warningCodes: z.array(z.string()).max(100),
});
export const comparisonSchema = z
  .object({
    schemaVersion: z.literal(1),
    engineVersion: z.string(),
    status: z.enum(["completed", "partial", "failed"]),
    requestedSeeds: z.array(count.max(0xffffffff)).max(100),
    seeds: z.array(count.max(0xffffffff)).max(100),
    baseline: modelSchema,
    scenario: modelSchema,
    differences: z
      .array(
        z.object({ path: z.string(), before: z.unknown(), after: z.unknown() }),
      )
      .max(10000),
    baselineRuns: z.array(result).max(100),
    scenarioRuns: z.array(result).max(100),
    metrics: z
      .array(
        z.object({
          key: metricKey,
          baseline: number.nullable(),
          scenario: number.nullable(),
          deltaMean: number.nullable(),
          deltaMedian: number.nullable(),
          deltaP10: number.nullable(),
          deltaP90: number.nullable(),
          pairs: count,
        }),
      )
      .length(7),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.metrics.map((m) => m.key)).size !== 7)
      ctx.addIssue({ code: "custom", message: "Metrics må ikke gentages." });
    if (
      c.baselineRuns.length !== c.scenarioRuns.length ||
      c.seeds.length !== c.baselineRuns.length ||
      c.baselineRuns.some(
        (r, i) => r.seed !== c.scenarioRuns[i]?.seed || r.seed !== c.seeds[i],
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Seedlister og kørsler stemmer ikke overens.",
      });
    if (
      c.baseline.horizon !== c.scenario.horizon ||
      c.baseline.observationStart !== c.scenario.observationStart
    )
      ctx.addIssue({
        code: "custom",
        message: "Måleperioderne er ikke kompatible.",
      });
  });
const csvRow = z.record(
  z
    .enum([
      "case_id",
      "case_type",
      "arrived_at",
      "activity",
      "started_at",
      "finished_at",
      "resource_group",
      "event_id",
    ])
    .or(z.string()),
  z.string().max(100000),
);
export const datasetSchema = z.object({
  id: z.string(),
  name: z.string().max(255),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  importedAt: z.string(),
  unit: z.enum(["iso", "seconds", "minutes"]),
  result: z.object({
    headers: z.array(z.string()).max(1000),
    preview: z.array(csvRow).max(6),
    rows: z.array(csvRow).max(100000),
    rowCount: count.max(100000),
    excludedRows: count.max(100000),
    issues: z
      .array(z.object({ row: count, field: z.string(), message: z.string() }))
      .max(1000),
    issueCount: count,
    warnings: z.array(z.string()).max(100),
    durationMs: z.array(count).max(100000),
    observedStart: number.nullable(),
    observedEnd: number.nullable(),
  }),
});

const holdoutMetric = z.object({
  observed: number.nullable(),
  simulated: number.nullable(),
  relativeError: number.nonnegative().nullable(),
  withinTarget: z.boolean().nullable(),
  sampleCount: count,
});
export const holdoutSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.string(),
  assessedAt: z.string(),
  status: z.enum(["target_met", "outside_target", "insufficient_data"]),
  threshold: number.min(0).max(1),
  model: modelSchema,
  seeds: z.array(count.max(0xffffffff)).min(30).max(100),
  source: z.object({
    id: z.string().min(1).max(100).optional(),
    name: z.string().max(255),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    unit: z.enum(["iso", "seconds", "minutes"]),
    rows: count.max(100000),
    excludedRows: count.max(100000),
    periodStart: number,
    periodEnd: number,
    completionActivity: z.string().max(100000),
  }),
  independent: z.boolean(),
  completeWindow: z.boolean(),
  metrics: z.object({
    throughput: holdoutMetric,
    leadTime: holdoutMetric,
    backlog: holdoutMetric,
    queueTime: holdoutMetric,
  }),
  dataGaps: z.array(z.string()).max(100),
  notes: z.array(z.string()).max(100),
});
