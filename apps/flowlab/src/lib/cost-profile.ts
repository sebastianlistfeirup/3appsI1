import type { Comparison } from "@tre/flow-engine";

export type CostView = "mean" | number;
export type ModelSide = "baseline" | "scenario";
export const COST_FIELDS = [
  "salaryCost",
  "variableCost",
  "fixedCost",
  "totalCost",
] as const;
export const COST_LABELS = {
  salaryCost: "Reserveret løn",
  variableCost: "Startede aktivitetsbesøg",
  fixedCost: "Fast automation",
  totalCost: "Samlet omkostning",
};
export function formatCost(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const billions = Math.abs(value) >= 1e9;
  return `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(billions ? value / 1e9 : value)} ${billions ? "mia. kr." : "kr."}`;
}
function selectedRuns(comparison: Comparison, side: ModelSide, view: CostView) {
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
function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
export function costProfile(
  comparison: Comparison,
  side: ModelSide,
  view: CostView = "mean",
) {
  const runs = selectedRuns(comparison, side, view);
  return {
    runs: runs.length,
    partial: runs.some((run) => run.status !== "completed"),
    salaryCost: mean(runs.map((run) => run.metrics.salaryCost)),
    variableCost: mean(runs.map((run) => run.metrics.variableCost)),
    fixedCost: runs.length ? comparison[side].fixedAutomationCost : null,
    totalCost: mean(runs.map((run) => run.metrics.cost)),
  };
}
export function resourceIds(comparison: Comparison): string[] {
  return [
    ...new Set(
      [...comparison.baseline.resources, ...comparison.scenario.resources].map(
        (pool) => pool.id,
      ),
    ),
  ];
}
export function resourceProfile(
  comparison: Comparison,
  side: ModelSide,
  id: string,
  view: CostView = "mean",
) {
  const pool = comparison[side].resources.find((pool) => pool.id === id);
  if (!pool) return null;
  const resources = selectedRuns(comparison, side, view).flatMap((run) =>
    run.resources.filter((pool) => pool.id === id),
  );
  return {
    id,
    label: pool.label,
    capacity: pool.capacity,
    hourlyCost: pool.hourlyCost,
    used: comparison[side].nodes.some((node) => node.resourceId === id),
    runs: resources.length,
    availableTime: mean(resources.map((pool) => pool.availableTime)),
    busyTime: mean(resources.map((pool) => pool.busyTime)),
    idleTime: mean(
      resources.map((pool) => Math.max(0, pool.availableTime - pool.busyTime)),
    ),
    utilization: mean(
      resources.flatMap((pool) =>
        pool.utilization === null ? [] : [pool.utilization],
      ),
    ),
    salaryCost: mean(resources.map((pool) => pool.salaryCost)),
  };
}
/** Text can be opened in a spreadsheet. JSON remains the lossless source for labels. */
function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[\u0000-\u0020]*[=+@\-]|^[\t\r\n]/.test(value)
    ? "'" + value
    : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function row(values: (string | number | null | undefined)[]): string {
  return values.map(csvCell).join(",");
}
export function costProfilesCsv(comparison: Comparison): string {
  const lines = [
    "seed,side,status,observation_start_ms,measured_until_ms,salary_dkk,variable_dkk,fixed_dkk,total_dkk",
  ];
  for (const seed of comparison.seeds)
    for (const side of ["baseline", "scenario"] as const) {
      const run = selectedRuns(comparison, side, seed)[0];
      lines.push(
        row([
          seed,
          side,
          run?.status,
          run?.observationStart,
          run?.measuredUntil,
          run?.metrics.salaryCost,
          run?.metrics.variableCost,
          run ? comparison[side].fixedAutomationCost : null,
          run?.metrics.cost,
        ]),
      );
    }
  return lines.join("\n");
}
export function resourceProfilesCsv(comparison: Comparison): string {
  const lines = [
    "seed,side,status,resource_id,resource_label,capacity,hourly_cost_dkk,referenced_by_node,observation_start_ms,measured_until_ms,available_staff_ms,busy_staff_ms,idle_staff_ms,utilization,salary_dkk",
  ];
  for (const seed of comparison.seeds)
    for (const side of ["baseline", "scenario"] as const) {
      const run = selectedRuns(comparison, side, seed)[0];
      for (const pool of comparison[side].resources) {
        const measured = run?.resources.find(
          (resource) => resource.id === pool.id,
        );
        lines.push(
          row([
            seed,
            side,
            run?.status,
            pool.id,
            pool.label,
            pool.capacity,
            pool.hourlyCost,
            comparison[side].nodes.some((node) => node.resourceId === pool.id)
              ? "yes"
              : "no",
            run?.observationStart,
            run?.measuredUntil,
            measured?.availableTime,
            measured?.busyTime,
            measured
              ? Math.max(0, measured.availableTime - measured.busyTime)
              : null,
            measured?.utilization,
            measured?.salaryCost,
          ]),
        );
      }
    }
  return lines.join("\n");
}
