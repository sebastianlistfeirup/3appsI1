import { describe, expect, it } from "vitest";
import { compareModels, goldenModel, seedList } from "@tre/flow-engine";
import {
  costProfile,
  costProfilesCsv,
  formatCost,
  resourceIds,
  resourceProfile,
  resourceProfilesCsv,
} from "./cost-profile";

describe("Cost and capacity evidence use the actual measured window", () => {
  it("reconciles reserved salaries, activity starts and fixed cost with warmup and an unused pool", async () => {
    const baseline = goldenModel();
    baseline.observationStart = 120000;
    baseline.fixedAutomationCost = 100;
    baseline.nodes.find((node) => node.kind === "activity")!.variableCost = 7;
    const scenario = structuredClone(baseline);
    scenario.fixedAutomationCost = 250;
    scenario.resources[0].capacity = 2;
    scenario.resources[0].label = "Nyt navn, samme id";
    scenario.resources.push({
      id: "unused",
      label: "Reserveret reserve",
      capacity: 2,
      hourlyCost: 300,
      calendar: [],
    });
    const comparison = await compareModels(baseline, scenario, {
      seeds: seedList(2026, 3),
    });
    const seed = comparison.seeds[0];
    expect(costProfile(comparison, "baseline", seed)).toEqual({
      runs: 1,
      partial: false,
      salaryCost: 5,
      variableCost: 7,
      fixedCost: 100,
      totalCost: 112,
    });
    expect(costProfile(comparison, "scenario")).toEqual({
      runs: 3,
      partial: false,
      salaryCost: 40,
      variableCost: 7,
      fixedCost: 250,
      totalCost: 297,
    });
    expect(resourceProfile(comparison, "baseline", "r", seed)).toMatchObject({
      availableTime: 180000,
      busyTime: 150000,
      idleTime: 30000,
      salaryCost: 5,
      used: true,
    });
    expect(resourceProfile(comparison, "scenario", "r", seed)).toMatchObject({
      label: "Nyt navn, samme id",
      availableTime: 360000,
      busyTime: 120000,
      idleTime: 240000,
      salaryCost: 10,
    });
    expect(resourceProfile(comparison, "scenario", "unused")).toMatchObject({
      availableTime: 360000,
      busyTime: 0,
      idleTime: 360000,
      salaryCost: 30,
      used: false,
      utilization: 0,
    });
    expect(costProfilesCsv(comparison)).toContain(
      `${seed},"baseline","completed",120000,300000,5,7,100,112`,
    );
    const csv = resourceProfilesCsv(comparison).split("\n");
    expect(csv).toHaveLength(10);
    expect(csv).toContain(
      `${seed},"scenario","completed","unused","Reserveret reserve",2,300,"no",120000,300000,360000,0,360000,0,30`,
    );
    for (const side of ["baseline", "scenario"] as const) {
      const profile = costProfile(comparison, side);
      expect(profile.totalCost).toBe(
        profile.salaryCost! + profile.variableCost! + profile.fixedCost!,
      );
      expect(
        comparison[side === "baseline" ? "baselineRuns" : "scenarioRuns"].every(
          (run) =>
            run.metrics.salaryCost ===
            run.resources.reduce((sum, pool) => sum + pool.salaryCost, 0),
        ),
      ).toBe(true);
    }
  });
  it("keeps a missing pool, zero capacity and a missing run distinct", async () => {
    const baseline = goldenModel(),
      scenario = goldenModel();
    baseline.resources[0].capacity = 0;
    scenario.resources[0].id = "new";
    scenario.nodes.find((node) => node.kind === "activity")!.resourceId = "new";
    const comparison = await compareModels(baseline, scenario, {
      seeds: seedList(44, 1),
    });
    expect(resourceIds(comparison)).toEqual(["r", "new"]);
    expect(resourceProfile(comparison, "baseline", "r")).toMatchObject({
      availableTime: 0,
      busyTime: 0,
      salaryCost: 0,
      utilization: null,
      runs: 1,
    });
    expect(resourceProfile(comparison, "scenario", "r")).toBeNull();
    expect(resourceProfile(comparison, "baseline", "r", 123)).toMatchObject({
      availableTime: null,
      salaryCost: null,
      runs: 0,
    });
    expect(costProfile(comparison, "baseline", 123)).toMatchObject({
      totalCost: null,
      fixedCost: null,
      runs: 0,
    });
    expect(resourceProfilesCsv(comparison)).toContain(
      ',"r","Ressource",0,100,"yes",0,300000,0,0,0,,0',
    );
  });
  it("matches seeds rather than run order and preserves calendar pauses in the actual time ledger", async () => {
    const model = goldenModel();
    model.horizon = 200000;
    model.arrivals = {
      type: "explicit",
      cases: [{ id: "a", time: 0, caseType: "standard" }],
    };
    model.resources[0].calendar = [
      { start: 0, end: 60000 },
      { start: 120000, end: 200000 },
    ];
    const comparison = await compareModels(model, model, {
      seeds: seedList(5, 3),
    });
    comparison.baselineRuns.reverse();
    const seed = comparison.seeds[1];
    const profile = resourceProfile(comparison, "baseline", "r", seed)!;
    expect(profile.availableTime).toBe(140000);
    expect(profile.busyTime).toBe(90000);
    expect(profile.idleTime).toBe(50000);
    expect(profile.salaryCost).toBe((140000 / 3600000) * 100);
    expect(profile.utilization).toBe(90000 / 140000);
    expect(costProfilesCsv(comparison).split("\n")[3]).toMatch(
      new RegExp(`^${seed},"baseline"`),
    );
  });
  it("protects formula-like resource text in CSV while preserving real numeric values and source names", async () => {
    const model = goldenModel();
    model.resources[0].id = "=1+1";
    model.resources[0].label = '  =HYPERLINK("x")';
    model.nodes.find((node) => node.kind === "activity")!.resourceId = "=1+1";
    const comparison = await compareModels(model, model, {
      seeds: seedList(7, 1),
    });
    const csv = resourceProfilesCsv(comparison);
    expect(csv).toContain('"\'=1+1","\'  =HYPERLINK(""x"")"');
    expect(comparison.baseline.resources[0].label).toBe('  =HYPERLINK("x")');
    expect(formatCost(1e12)).toBe("1.000,00 mia. kr.");
    expect(formatCost(5, true)).toBe("+5,00 kr.");
    expect(formatCost(null)).toBe("—");
  });
  it("retains the full fixed charge when a partial run stops before the observation window", async () => {
    const model = goldenModel();
    model.observationStart = 120000;
    model.fixedAutomationCost = 100;
    model.maxEvents = 1;
    const comparison = await compareModels(model, model, {
      seeds: seedList(8, 1),
    });
    expect(costProfile(comparison, "baseline")).toEqual({
      runs: 1,
      partial: true,
      salaryCost: 0,
      variableCost: 0,
      fixedCost: 100,
      totalCost: 100,
    });
    expect(costProfilesCsv(comparison)).toContain(
      ',"baseline","partial",120000,0,0,0,100,100',
    );
  });
});
