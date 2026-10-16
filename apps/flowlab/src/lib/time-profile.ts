import type {
  Comparison,
  MetricSummary,
  SimulationResult,
} from "@tre/flow-engine";
export const TIME_METRICS = [
  "leadTime",
  "queueTime",
  "plannedWaitTime",
] as const;
export type TimeMetric = (typeof TIME_METRICS)[number];
export const TIME_LABELS: Record<TimeMetric, string> = {
  leadTime: "Gennemløbstid",
  queueTime: "Vent i aktivitetskø",
  plannedWaitTime: "Planlagt vent",
};
export function formatCaseTime(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const unit =
    value < 1000
      ? { scale: 1, label: "ms" }
      : value < 60000
        ? { scale: 1000, label: "sek." }
        : value < 3600000
          ? { scale: 60000, label: "min" }
          : { scale: 3600000, label: "t" };
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(value / unit.scale)} ${unit.label}`;
}
export function timeProfilePair(comparison: Comparison, seed: number) {
  if (!comparison.seeds.includes(seed))
    return { baseline: null, scenario: null };
  return {
    baseline: comparison.baselineRuns.find((run) => run.seed === seed) ?? null,
    scenario: comparison.scenarioRuns.find((run) => run.seed === seed) ?? null,
  };
}
/** Means of run summaries, deliberately never described as pooled case quantiles. */
export function aggregateTimeProfile(
  runs: SimulationResult[],
  key: TimeMetric,
) {
  const summaries = runs.map((run) => run.metrics[key]);
  const mean = (field: "mean" | "median" | "p90") => {
    const values = summaries.flatMap((summary) =>
      summary[field] === null ? [] : [summary[field]],
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  return {
    runCount: runs.length,
    availableRuns: summaries.filter((summary) => summary.count > 0).length,
    minCount: summaries.length
      ? Math.min(...summaries.map((summary) => summary.count))
      : null,
    maxCount: summaries.length
      ? Math.max(...summaries.map((summary) => summary.count))
      : null,
    meanOfMeans: mean("mean"),
    meanOfMedians: mean("median"),
    meanOfP90: mean("p90"),
  };
}
export function timeProfilesCsv(comparison: Comparison): string {
  const lines = ["seed,side,metric,unit,completed_cases,mean,median,p90"];
  for (const seed of comparison.seeds) {
    const pair = timeProfilePair(comparison, seed);
    for (const side of ["baseline", "scenario"] as const) {
      for (const metric of TIME_METRICS) {
        const summary: MetricSummary | undefined = pair[side]?.metrics[metric];
        lines.push(
          [
            seed,
            side,
            metric,
            "ms",
            summary?.count ?? "",
            summary?.mean ?? "",
            summary?.median ?? "",
            summary?.p90 ?? "",
          ].join(","),
        );
      }
    }
  }
  return lines.join("\n");
}
