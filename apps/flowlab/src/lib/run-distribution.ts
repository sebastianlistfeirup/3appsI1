import {
  metricValue,
  percentile,
  type Comparison,
  type MetricKey,
} from "@tre/flow-engine";
export interface PairedRunValue {
  seed: number;
  baseline: number | null;
  scenario: number | null;
  delta: number | null;
}
export interface DistributionBin {
  from: number;
  to: number;
  includesUpper: boolean;
  rows: PairedRunValue[];
}
export function pairedRunValues(
  comparison: Comparison,
  key: MetricKey,
): PairedRunValue[] {
  const baseline = new Map(
      comparison.baselineRuns.map((run) => [run.seed, run]),
    ),
    scenario = new Map(comparison.scenarioRuns.map((run) => [run.seed, run]));
  return comparison.seeds.map((seed) => {
    const a = baseline.get(seed),
      b = scenario.get(seed),
      left = a ? metricValue(a, key) : null,
      right = b ? metricValue(b, key) : null;
    return {
      seed,
      baseline: left,
      scenario: right,
      delta: left !== null && right !== null ? right - left : null,
    };
  });
}
export function runDistribution(rows: PairedRunValue[]) {
  const available = rows.filter(
      (row): row is PairedRunValue & { delta: number } => row.delta !== null,
    ),
    values = available.map((row) => row.delta);
  const low = values.length ? Math.min(...values) : null,
    high = values.length ? Math.max(...values) : null;
  const count =
    low === high
      ? 1
      : Math.min(10, Math.max(4, Math.ceil(Math.sqrt(values.length))));
  const bins: DistributionBin[] =
    low === null || high === null
      ? []
      : Array.from({ length: count }, (_, index) => ({
          from: low + ((high - low) * index) / count,
          to:
            index === count - 1
              ? high
              : low + ((high - low) * (index + 1)) / count,
          includesUpper: index === count - 1,
          rows: [],
        }));
  for (const row of available) {
    // Compare the displayed interval boundaries directly, avoiding rounding
    // disagreement when a value lies exactly at a floating-point boundary.
    const index = bins.findIndex(
      (bin) => row.delta < bin.to || bin.includesUpper,
    );
    bins[index].rows.push(row);
  }
  return {
    bins,
    available: values.length,
    missing: rows.length - values.length,
    lower: values.filter((value) => value < 0).length,
    equal: values.filter((value) => value === 0).length,
    higher: values.filter((value) => value > 0).length,
    p10: percentile(values, 0.1),
    median: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    min: low,
    max: high,
  };
}
