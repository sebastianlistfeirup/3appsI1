import {
  ENGINE_VERSION,
  PRNG_VERSION,
  parseModel,
  type FlowModel,
} from "./model";
import {
  percentile,
  simulate,
  summarize,
  type SimulationResult,
} from "./engine";
import { seedList } from "./random";
export interface InputDifference {
  path: string;
  before: unknown;
  after: unknown;
}
export function inputDiff(
  before: unknown,
  after: unknown,
  path = "",
): InputDifference[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .sort()
      .flatMap((key) =>
        inputDiff(a[key], b[key], path ? `${path}.${key}` : key),
      );
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}
export const metricDefinitions = {
  throughput: {
    label: "Afsluttede sager",
    unit: "sager",
    definition:
      "Unikke sager afsluttet i målevinduet. Uafsluttede sager tælles i restkøen.",
  },
  leadTime: {
    label: "Gennemløbstid",
    unit: "ms",
    definition:
      "Tid fra ankomst til afslutning. Medianen beregnes kun på afsluttede sager.",
  },
  queueTime: {
    label: "Ventetid",
    unit: "ms",
    definition:
      "Gennemsnit af tid i aktivitetskøer for afsluttede sager. Planlagt vent vises separat.",
  },
  backlog: {
    label: "Restkø",
    unit: "sager",
    definition:
      "Unikke ankomne sager, som stadig venter, behandles eller er i planlagt vent ved vinduets slutning.",
  },
  utilization: {
    label: "Udnyttelse",
    unit: "ratio",
    definition:
      "Optaget ressourcetid divideret med faktisk planlagt kapacitetstid. Ingen kapacitet giver ikke tilgængelig.",
  },
  cost: {
    label: "Omkostning",
    unit: "DKK",
    definition:
      "Planlagt lønkapacitet plus variable aktivitetsomkostninger og eksplicit automationsomkostning.",
  },
  slaCompleted: {
    label: "SLA overholdt",
    unit: "ratio",
    definition:
      "Andel afsluttede sager inden for modellens SLA. Kendte og ukendte brud blandt restkøen vises særskilt.",
  },
} as const;
export type MetricKey = keyof typeof metricDefinitions;
export const metricValue = (
  r: SimulationResult,
  key: MetricKey,
): number | null =>
  key === "leadTime"
    ? r.metrics.leadTime.median
    : key === "queueTime"
      ? r.metrics.queueTime.mean
      : r.metrics[key];
export interface PairedMetric {
  key: MetricKey;
  baseline: number | null;
  scenario: number | null;
  deltaMean: number | null;
  deltaMedian: number | null;
  deltaP10: number | null;
  deltaP90: number | null;
  pairs: number;
}
export interface Comparison {
  schemaVersion: 1;
  engineVersion: string;
  status: "completed" | "partial" | "failed";
  requestedSeeds: number[];
  seeds: number[];
  baseline: FlowModel;
  scenario: FlowModel;
  differences: InputDifference[];
  baselineRuns: SimulationResult[];
  scenarioRuns: SimulationResult[];
  metrics: PairedMetric[];
}
export function assembleComparison(
  baseline: FlowModel,
  scenario: FlowModel,
  requestedSeeds: number[],
  baselineRuns: SimulationResult[],
  scenarioRuns: SimulationResult[],
): Comparison {
  if (
    !requestedSeeds.length ||
    requestedSeeds.length > 100 ||
    new Set(requestedSeeds).size !== requestedSeeds.length ||
    requestedSeeds.some(
      (seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff,
    )
  )
    throw new Error(
      "Seedlisten skal indeholde 1–100 forskellige, gyldige seeds.",
    );
  for (const [model, runs] of [
    [baseline, baselineRuns],
    [scenario, scenarioRuns],
  ] as const)
    if (
      runs.some(
        (r) =>
          r.engineVersion !== ENGINE_VERSION ||
          r.prngVersion !== PRNG_VERSION ||
          r.modelId !== model.id ||
          r.modelRevision !== model.revision ||
          r.horizon !== model.horizon ||
          r.observationStart !== model.observationStart,
      )
    )
      throw new Error(
        "Kørslernes motorversion, PRNG-version, modelversion og måleperiode skal passe til deres snapshot.",
      );
  if (
    baseline.horizon !== scenario.horizon ||
    baseline.observationStart !== scenario.observationStart
  )
    throw new Error("Sammenligning kræver samme måleperiode og warm-up.");
  if (
    baselineRuns.length !== scenarioRuns.length ||
    baselineRuns.some(
      (r, i) => r.seed !== scenarioRuns[i].seed || r.seed !== requestedSeeds[i],
    )
  )
    throw new Error(
      "Kørslerne skal bruge præcis samme seedliste og rækkefølge.",
    );
  const complete =
    baselineRuns.every((r) => r.status === "completed") &&
    scenarioRuns.every((r) => r.status === "completed");
  const metrics = (Object.keys(metricDefinitions) as MetricKey[]).map((key) => {
    const values = baselineRuns
      .map((b, i) => ({
        a: metricValue(b, key),
        b: metricValue(scenarioRuns[i], key),
      }))
      .filter(
        (v): v is { a: number; b: number } => v.a !== null && v.b !== null,
      );
    const deltas = values.map((v) => v.b - v.a);
    return {
      key,
      baseline: summarize(
        baselineRuns
          .map((r) => metricValue(r, key))
          .filter((value): value is number => value !== null),
      ).mean,
      scenario: summarize(
        scenarioRuns
          .map((r) => metricValue(r, key))
          .filter((value): value is number => value !== null),
      ).mean,
      deltaMean: summarize(deltas).mean,
      deltaMedian: percentile(deltas, 0.5),
      deltaP10: percentile(deltas, 0.1),
      deltaP90: percentile(deltas, 0.9),
      pairs: values.length,
    };
  });
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    status: [...baselineRuns, ...scenarioRuns].some(
      (r) => r.status === "failed",
    )
      ? "failed"
      : complete && baselineRuns.length === requestedSeeds.length
        ? "completed"
        : "partial",
    requestedSeeds,
    seeds: baselineRuns.map((r) => r.seed),
    baseline,
    scenario,
    differences: inputDiff(baseline, scenario),
    baselineRuns,
    scenarioRuns,
    metrics,
  };
}
export async function compareModels(
  baselineInput: FlowModel,
  scenarioInput: FlowModel,
  options: {
    seeds?: number[];
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    onPair?: (baseline: SimulationResult, scenario: SimulationResult) => void;
  } = {},
): Promise<Comparison> {
  const baseline = parseModel(baselineInput),
    scenario = parseModel(scenarioInput),
    seeds = options.seeds ?? seedList();
  if (
    !seeds.length ||
    seeds.length > 100 ||
    new Set(seeds).size !== seeds.length
  )
    throw new Error("Vælg 1–100 forskellige seeds.");
  if (
    baseline.horizon !== scenario.horizon ||
    baseline.observationStart !== scenario.observationStart
  )
    throw new Error("Sammenligning kræver samme måleperiode og warm-up.");
  const baselineRuns: SimulationResult[] = [],
    scenarioRuns: SimulationResult[] = [];
  for (const seed of seeds) {
    if (options.signal?.aborted) break;
    const a = simulate(
      {
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
        model: baseline,
        seed,
      },
      options.signal,
    );
    const b = simulate(
      {
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
        model: scenario,
        seed,
      },
      options.signal,
    );
    // Per-case traces are optional debug evidence. Batch reports retain aggregates and the first pair's case evidence.
    const retain = (run: SimulationResult) =>
      baselineRuns.length === 0
        ? run
        : { ...run, cases: [], resourceTimelines: [], trace: [] };
    const retainedA = retain(a),
      retainedB = retain(b);
    baselineRuns.push(retainedA);
    scenarioRuns.push(retainedB);
    options.onPair?.(retainedA, retainedB);
    options.onProgress?.(baselineRuns.length, seeds.length);
    if (a.status !== "completed" || b.status !== "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return assembleComparison(
    baseline,
    scenario,
    seeds,
    baselineRuns,
    scenarioRuns,
  );
}
export function assertReportReady(comparison: Comparison) {
  const verified = assembleComparison(
    comparison.baseline,
    comparison.scenario,
    comparison.requestedSeeds,
    comparison.baselineRuns,
    comparison.scenarioRuns,
  );
  if (
    comparison.engineVersion !== ENGINE_VERSION ||
    JSON.stringify(verified.metrics) !== JSON.stringify(comparison.metrics) ||
    JSON.stringify(verified.seeds) !== JSON.stringify(comparison.seeds) ||
    JSON.stringify(verified.differences) !==
      JSON.stringify(comparison.differences)
  )
    throw new Error(
      "Rapportens metrics eller inputdiff stemmer ikke med de underliggende kørsler. Kør sammenligningen igen.",
    );
  if (
    comparison.status !== "completed" ||
    verified.status !== "completed" ||
    comparison.seeds.length < 30 ||
    comparison.baselineRuns.some((r) => r.status !== "completed") ||
    comparison.scenarioRuns.some((r) => r.status !== "completed")
  )
    throw new Error(
      "En beslutningsrapport kræver mindst 30 fuldførte, parrede kørsler. Kør den fulde sammenligning først.",
    );
}
