import { describe, expect, it } from "vitest";
import { compareModels, goldenModel } from "@tre/flow-engine";
import { slaProfile, slaProfilesCsv } from "./sla-profile";

describe("SLA outcomes preserve unfinished cases", () => {
  it("keeps completed breaches separate from known and unknown backlog outcomes", async () => {
    const baseline = goldenModel();
    baseline.horizon = 200000;
    baseline.sla = 100000;
    const scenario = structuredClone(baseline);
    scenario.resources[0].capacity = 0;
    const comparison = await compareModels(baseline, scenario);
    expect(slaProfile(comparison, "baseline")).toMatchObject({
      runs: 30,
      availableRates: 30,
      partial: false,
      threshold: 100000,
      completedShare: 0.5,
      counts: {
        completed: 2,
        withinSla: 1,
        completedBreaches: 1,
        backlog: 1,
        knownBacklogBreaches: 0,
        unknownBacklog: 1,
        aborted: 0,
      },
    });
    expect(slaProfile(comparison, "scenario")).toMatchObject({
      availableRates: 0,
      completedShare: null,
      counts: {
        completed: 0,
        withinSla: 0,
        completedBreaches: 0,
        backlog: 3,
        knownBacklogBreaches: 2,
        unknownBacklog: 1,
        aborted: 0,
      },
    });
    const csv = slaProfilesCsv(comparison).split("\n");
    expect(csv).toHaveLength(61);
    for (const seed of comparison.seeds) {
      expect(csv).toContain(
        `${seed},baseline,completed,100000,0,200000,2,1,1,0.5,1,0,1,0`,
      );
      expect(csv).toContain(
        `${seed},scenario,completed,100000,0,200000,0,0,0,,3,2,1,0`,
      );
    }
  });
  it("counts from original arrival across calendar pauses, planned wait and observation start", async () => {
    const baseline = goldenModel();
    baseline.sla = 180000;
    baseline.observationStart = 180001;
    baseline.resources[0].calendar = [
      { start: 0, end: 60000 },
      { start: 120000, end: 300000 },
    ];
    const exit = baseline.edges.find((edge) => edge.target === "e")!;
    exit.target = "wait";
    baseline.nodes.push({
      id: "wait",
      label: "Afklaring",
      kind: "wait",
      duration: { type: "fixed", value: 30000 },
      maxVisits: 20,
      variableCost: 0,
      position: { x: 350, y: 0 },
    });
    baseline.edges.push({ id: "wait-end", source: "wait", target: "e" });
    const scenario = structuredClone(baseline);
    scenario.sla = 179999;
    const comparison = await compareModels(baseline, scenario);
    expect(
      comparison.baselineRuns[0].cases.map((item) => item.completedAt),
    ).toEqual([180000, 270000, null]);
    expect(slaProfile(comparison, "baseline")).toMatchObject({
      completedShare: 0,
      counts: {
        completed: 1,
        withinSla: 0,
        completedBreaches: 1,
        backlog: 1,
        knownBacklogBreaches: 0,
        unknownBacklog: 1,
      },
    });
    expect(slaProfile(comparison, "scenario")).toMatchObject({
      threshold: 179999,
      counts: {
        completed: 1,
        withinSla: 0,
        completedBreaches: 1,
        backlog: 1,
        knownBacklogBreaches: 1,
        unknownBacklog: 0,
      },
    });
    baseline.observationStart = 0;
    const exact = await compareModels(baseline, baseline, { seeds: [1] });
    expect(slaProfile(exact, "baseline", 1)).toMatchObject({
      completedShare: 0.5,
      counts: { completed: 2, withinSla: 1, completedBreaches: 1 },
    });
  });
  it("matches seeds and distinguishes an unknown run from a known empty period", async () => {
    const model = goldenModel();
    model.arrivals = { type: "explicit", cases: [] };
    const comparison = await compareModels(model, model, {
      seeds: [0, 4294967295],
    });
    comparison.scenarioRuns.reverse();
    expect(slaProfile(comparison, "scenario", 0)).toMatchObject({
      runs: 1,
      completedShare: null,
      counts: {
        completed: 0,
        backlog: 0,
        knownBacklogBreaches: 0,
        unknownBacklog: 0,
      },
    });
    expect(slaProfile(comparison, "scenario", 1)).toMatchObject({
      runs: 0,
      completedShare: null,
      counts: {
        completed: null,
        backlog: null,
        knownBacklogBreaches: null,
        unknownBacklog: null,
      },
    });
    comparison.baselineRuns = [];
    expect(slaProfilesCsv(comparison).split("\n")[1]).toBe(
      `0,baseline,,${model.sla},,,,,,,,,,`,
    );
  });
  it("averages known run shares without treating a zero-completion run as zero percent", async () => {
    const model = goldenModel();
    model.horizon = 200000;
    model.sla = 90000;
    model.arrivals = {
      type: "poisson",
      meanInterval: 100000,
      maxCases: 20,
      initialBacklog: 0,
    };
    const comparison = await compareModels(model, model);
    const rates = comparison.baselineRuns.flatMap((run) =>
      run.metrics.slaCompleted === null ? [] : [run.metrics.slaCompleted],
    );
    const profile = slaProfile(comparison, "baseline");
    expect(rates.length).toBeGreaterThan(0);
    expect(rates.length).toBeLessThan(30);
    expect(profile.availableRates).toBe(rates.length);
    expect(profile.completedShare).toBeCloseTo(
      rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
    );
    expect(profile.completedShare).not.toBeCloseTo(
      rates.reduce((sum, rate) => sum + rate, 0) / 30,
    );
    expect(
      profile.counts.withinSla! + profile.counts.completedBreaches!,
    ).toBeCloseTo(profile.counts.completed!);
    expect(
      profile.counts.knownBacklogBreaches! + profile.counts.unknownBacklog!,
    ).toBeCloseTo(profile.counts.backlog!);
  });
});
