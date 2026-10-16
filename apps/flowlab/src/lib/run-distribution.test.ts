import { describe, it, expect } from "vitest";
import {
  compareModels,
  goldenModel,
  metricValue,
  membershipTemplate,
} from "@tre/flow-engine";
import { pairedRunValues, runDistribution } from "./run-distribution";
describe("Observed paired run distribution", () => {
  it("uses the same seed pair rather than array order and agrees with engine percentiles", async () => {
    const baseline = membershipTemplate(),
      scenario = structuredClone(baseline);
    scenario.resources[0].capacity = 4;
    const comparison = await compareModels(baseline, scenario),
      expected = comparison.metrics.find(
        (metric) => metric.key === "leadTime",
      )!;
    comparison.scenarioRuns.reverse();
    const rows = pairedRunValues(comparison, "leadTime"),
      distribution = runDistribution(rows);
    expect(rows[0].scenario).toBe(
      metricValue(comparison.scenarioRuns.at(-1)!, "leadTime"),
    );
    expect(distribution).toMatchObject({
      available: 30,
      missing: 0,
      p10: expected.deltaP10,
      median: expected.deltaMedian,
      p90: expected.deltaP90,
    });
    expect(
      distribution.bins
        .flatMap((bin) => bin.rows)
        .map((row) => row.seed)
        .sort((a, b) => a - b),
    ).toEqual([...comparison.seeds].sort((a, b) => a - b));
    expect(distribution.lower + distribution.equal + distribution.higher).toBe(
      30,
    );
    for (const bin of distribution.bins)
      for (const row of bin.rows) {
        expect(row.delta!).toBeGreaterThanOrEqual(bin.from);
        expect(
          bin.includesUpper ? row.delta! <= bin.to : row.delta! < bin.to,
        ).toBe(true);
      }
  });
  it("shows a constant golden difference as a single real bin and preserves absent pairs", async () => {
    const baseline = goldenModel(),
      scenario = goldenModel();
    scenario.resources[0].capacity = 2;
    const comparison = await compareModels(baseline, scenario),
      rows = pairedRunValues(comparison, "queueTime"),
      distribution = runDistribution(rows);
    expect(distribution).toMatchObject({
      available: 30,
      lower: 30,
      equal: 0,
      higher: 0,
      min: -30000,
      max: -30000,
    });
    expect(distribution.bins).toHaveLength(1);
    expect(distribution.bins[0].rows).toHaveLength(30);
    scenario.resources[0].capacity = 0;
    const empty = pairedRunValues(
      await compareModels(baseline, scenario),
      "leadTime",
    );
    expect(
      empty.every(
        (row) =>
          row.baseline === 120000 &&
          row.scenario === null &&
          row.delta === null,
      ),
    ).toBe(true);
    expect(runDistribution(empty)).toMatchObject({
      available: 0,
      missing: 30,
      bins: [],
      p10: null,
      median: null,
      p90: null,
    });
  });
});
