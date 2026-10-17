import type { Comparison, SimulationResult } from "@tre/flow-engine";

export type SlaView = "mean" | number;
export const SLA_FIELDS = [
  "completed",
  "withinSla",
  "completedBreaches",
  "backlog",
  "knownBacklogBreaches",
  "unknownBacklog",
  "aborted",
] as const;
export const SLA_LABELS = {
  completed: "Afsluttede sager",
  withinSla: "Afsluttet inden for SLA",
  completedBreaches: "Afsluttet efter SLA",
  backlog: "Uafsluttede sager ved stop",
  knownBacklogBreaches: "Heraf allerede over SLA",
  unknownBacklog: "Heraf endnu ukendt SLA-udfald",
  aborted: "Afbrudt af motoren",
};
function counts(run: SimulationResult) {
  const metrics = run.metrics;
  return {
    completed: metrics.throughput,
    withinSla: metrics.slaMet,
    completedBreaches: metrics.throughput - metrics.slaMet,
    backlog: metrics.backlog,
    knownBacklogBreaches: metrics.slaKnownBacklogBreaches,
    unknownBacklog: metrics.slaUnknownBacklog,
    aborted: metrics.aborted,
  };
}
const mean = (values: number[]): number | null =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
function selectedRuns(
  comparison: Comparison,
  side: "baseline" | "scenario",
  view: SlaView,
) {
  const seeds = new Set(
    view === "mean"
      ? comparison.seeds
      : comparison.seeds.includes(view)
        ? [view]
        : [],
  );
  return comparison[
    side === "baseline" ? "baselineRuns" : "scenarioRuns"
  ].filter((run) => seeds.has(run.seed));
}
export function slaProfile(
  comparison: Comparison,
  side: "baseline" | "scenario",
  view: SlaView = "mean",
) {
  const runs = selectedRuns(comparison, side, view);
  const observed = runs.map(counts);
  const rates = runs.flatMap((run) =>
    run.metrics.slaCompleted === null ? [] : [run.metrics.slaCompleted],
  );
  return {
    runs: runs.length,
    availableRates: rates.length,
    partial: runs.some((run) => run.status !== "completed"),
    threshold: comparison[side].sla,
    completedShare: mean(rates),
    counts: Object.fromEntries(
      SLA_FIELDS.map((field) => [
        field,
        mean(observed.map((row) => row[field])),
      ]),
    ) as Record<(typeof SLA_FIELDS)[number], number | null>,
  };
}
/** Counts come directly from each run. No final SLA is invented for unfinished cases. */
export function slaProfilesCsv(comparison: Comparison): string {
  const lines = [
    "seed,side,status,threshold_ms,observation_start_ms,measured_until_ms,completed_cases,within_sla,completed_breaches,completed_share,backlog,known_backlog_breaches,unknown_backlog,aborted",
  ];
  for (const seed of comparison.seeds)
    for (const side of ["baseline", "scenario"] as const) {
      const run = selectedRuns(comparison, side, seed)[0];
      const row = run ? counts(run) : null;
      lines.push(
        [
          seed,
          side,
          run?.status ?? "",
          comparison[side].sla,
          run?.observationStart ?? "",
          run?.measuredUntil ?? "",
          row?.completed ?? "",
          row?.withinSla ?? "",
          row?.completedBreaches ?? "",
          run?.metrics.slaCompleted ?? "",
          row?.backlog ?? "",
          row?.knownBacklogBreaches ?? "",
          row?.unknownBacklog ?? "",
          row?.aborted ?? "",
        ].join(","),
      );
    }
  return lines.join("\n");
}
