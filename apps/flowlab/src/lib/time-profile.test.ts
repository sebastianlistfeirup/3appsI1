import { describe, expect, it } from "vitest";
import { compareModels, goldenModel, seedList } from "@tre/flow-engine";
import {
  aggregateTimeProfile,
  formatCaseTime,
  timeProfilePair,
  timeProfilesCsv,
} from "./time-profile";
describe("Case time distributions retain their observation basis", () => {
  it("exposes exact golden median, interpolated p90 and sample count rather than the distribution of run differences", async () => {
    const baseline = goldenModel(),
      scenario = goldenModel();
    scenario.resources[0].capacity = 2;
    const comparison = await compareModels(baseline, scenario),
      profile = aggregateTimeProfile(comparison.baselineRuns, "leadTime");
    expect(profile).toEqual({
      runCount: 30,
      availableRuns: 30,
      minCount: 3,
      maxCount: 3,
      meanOfMeans: 120000,
      meanOfMedians: 120000,
      meanOfP90: 144000,
    });
    expect(
      aggregateTimeProfile(comparison.scenarioRuns, "leadTime").meanOfP90,
    ).toBe(90000);
    const pair = timeProfilePair(
      { ...comparison, baselineRuns: [...comparison.baselineRuns].reverse() },
      comparison.seeds[2],
    );
    expect(pair.baseline?.seed).toBe(comparison.seeds[2]);
    expect(pair.scenario?.metrics.queueTime.mean).toBe(0);
    const csv = timeProfilesCsv(comparison).split("\n");
    expect(csv).toHaveLength(181);
    expect(csv[1]).toBe(
      `${comparison.seeds[0]},baseline,leadTime,ms,3,120000,120000,144000`,
    );
    expect(csv[2]).toBe(
      `${comparison.seeds[0]},baseline,queueTime,ms,3,30000,30000,54000`,
    );
    expect(csv[3]).toBe(
      `${comparison.seeds[0]},baseline,plannedWaitTime,ms,3,0,0,0`,
    );
  });
  it("separates planned waiting, and does not count unfinished cases in completed-case times", async () => {
    const model = goldenModel();
    model.nodes.push({
      id: "hold",
      label: "Planlagt vent",
      kind: "wait",
      duration: { type: "fixed", value: 30000 },
      position: { x: 300, y: 0 },
      variableCost: 0,
      maxVisits: 20,
    });
    model.edges[1].target = "hold";
    model.edges.push({ id: "hold-end", source: "hold", target: "e" });
    model.horizon = 200000;
    const comparison = await compareModels(model, model, {
        seeds: seedList(3, 1),
      }),
      run = comparison.baselineRuns[0];
    expect(run.metrics.leadTime).toEqual({
      count: 1,
      mean: 120000,
      median: 120000,
      p90: 120000,
    });
    expect(run.metrics.plannedWaitTime).toEqual({
      count: 1,
      mean: 30000,
      median: 30000,
      p90: 30000,
    });
    expect(run.metrics.backlog).toBe(2);
    expect(run.metrics.plannedWait).toBe(1);
    expect(
      aggregateTimeProfile(comparison.baselineRuns, "leadTime").minCount,
    ).toBe(1);
  });
  it("preserves zero measured waiting and missing time measurements as distinct outcomes", async () => {
    const baseline = goldenModel(),
      scenario = goldenModel();
    scenario.resources[0].capacity = 0;
    const comparison = await compareModels(baseline, scenario, {
      seeds: seedList(4, 1),
    });
    expect(aggregateTimeProfile(comparison.scenarioRuns, "leadTime")).toEqual({
      runCount: 1,
      availableRuns: 0,
      minCount: 0,
      maxCount: 0,
      meanOfMeans: null,
      meanOfMedians: null,
      meanOfP90: null,
    });
    expect(timeProfilesCsv(comparison)).toContain(
      `${comparison.seeds[0]},scenario,leadTime,ms,0,,,`,
    );
    expect(timeProfilesCsv(comparison)).toContain(
      `${comparison.seeds[0]},baseline,plannedWaitTime,ms,3,0,0,0`,
    );
    expect(timeProfilePair(comparison, 123456)).toEqual({
      baseline: null,
      scenario: null,
    });
    expect(formatCaseTime(null)).toBe("—");
    expect(formatCaseTime(0)).toBe("0 ms");
    expect(formatCaseTime(1)).toBe("1 ms");
    expect(formatCaseTime(54000)).toBe("54 sek.");
    expect(formatCaseTime(144000)).toBe("2,4 min");
  });
});
