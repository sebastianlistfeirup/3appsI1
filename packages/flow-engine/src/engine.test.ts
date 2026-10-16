import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  goldenModel,
  membershipTemplate,
  simulate,
  randomStream,
  validateModel,
  compareModels,
  assertReportReady,
  assembleComparison,
  seedList,
  type FlowModel,
} from "./index";
const run = (model = goldenModel(), seed = 2026) =>
  simulate({
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    model,
    seed,
    trace: true,
  });
describe("FlowLab numerical contract", () => {
  it("bounded timelines retain exact capacity, costs and all completions", () => {
    const model = goldenModel();
    const result = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 2026,
      timelineLimit: 1,
    });
    expect(result.resourceTimelines).toHaveLength(1);
    expect(result.warningCodes).toContain("timeline_limit");
    expect(result.metrics).toEqual(run(model).metrics);
    expect(result.resources).toEqual(run(model).resources);
  });
  it("unfinished planned waiting records elapsed time rather than future duration", () => {
    const model = goldenModel();
    model.horizon = 60000;
    model.nodes[1] = {
      ...model.nodes[1],
      kind: "wait",
      resourceId: undefined,
      duration: { type: "fixed", value: 90000 },
    };
    const result = run(model);
    expect(result.cases[0].plannedWait).toBe(60000);
    expect(result.metrics.throughput).toBe(0);
    expect(result.metrics.backlog).toBe(1);
    expect(result.metrics.plannedWaitTime.mean).toBe(null);
  });
  it("explicit case identifiers do not implicitly change warmup cohorts", () => {
    const model = goldenModel();
    model.arrivals = {
      type: "explicit",
      cases: [{ id: "backlog-customer-1", time: 0, caseType: "standard" }],
    };
    expect(run(model).cases[0].cohort).toBe("observation");
  });
  it("simultaneous overload remains bounded and keeps stable FCFS", () => {
    const model = goldenModel();
    model.horizon = 1000;
    model.maxEvents = 100000;
    model.nodes[1].duration = { type: "fixed", value: 100 };
    model.arrivals = {
      type: "explicit",
      cases: Array.from({ length: 10000 }, (_, i) => ({
        id: `case-${String(i).padStart(5, "0")}`,
        time: 0,
        caseType: "standard",
      })).reverse(),
    };
    const result = run(model);
    expect(result.status).toBe("completed");
    expect(result.metrics).toMatchObject({
      throughput: 10,
      backlog: 9990,
      utilization: 1,
    });
    expect(result.eventCount).toBeLessThan(21000);
    expect(
      result.cases.filter((c) => c.status === "completed").map((c) => c.id),
    ).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `case-${String(i).padStart(5, "0")}`,
      ),
    );
  });
  it("a completion exactly at the horizon counts; an arrival there does not", () => {
    const model = goldenModel();
    model.horizon = 90000;
    model.arrivals = {
      type: "explicit",
      cases: [
        { id: "a", time: 0, caseType: "standard" },
        { id: "b", time: 90000, caseType: "standard" },
      ],
    };
    expect(run(model).metrics).toMatchObject({
      arrived: 1,
      throughput: 1,
      backlog: 0,
      utilization: 1,
    });
  });
  it("a fully captured trace has no truncation warning", () => {
    const model = goldenModel();
    const size = run(model).trace.length;
    expect(
      simulate({
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
        model,
        seed: 2026,
        trace: true,
        traceLimit: size,
      }).warningCodes,
    ).not.toContain("trace_limit");
  });
  it("rejects mixed run versions, duplicate seeds and altered report aggregates", async () => {
    const model = goldenModel();
    const result = run(model);
    expect(() =>
      assembleComparison(
        model,
        model,
        [2026, 2026],
        [result, result],
        [result, result],
      ),
    ).toThrow("forskellige");
    expect(() =>
      assembleComparison(
        model,
        model,
        [2026],
        [{ ...result, engineVersion: "old" }],
        [result],
      ),
    ).toThrow("motorversion");
    expect(() =>
      assembleComparison(
        model,
        model,
        [2026],
        [{ ...result, modelRevision: model.revision + 1 }],
        [result],
      ),
    ).toThrow("modelversion");
    const comparison = await compareModels(model, model);
    comparison.metrics[0].baseline = 999;
    expect(() => assertReportReady(comparison)).toThrow();
  });
  it("FL-AT01: exact FCFS starts, completions, waiting, lead time and utilization", () => {
    const r = run();
    expect(r.status).toBe("completed");
    expect(
      r.trace.filter((e) => e.type === "activity_start").map((e) => e.time),
    ).toEqual([0, 90000, 180000]);
    expect(r.cases.map((c) => c.completedAt)).toEqual([90000, 180000, 270000]);
    expect(r.cases.map((c) => c.queueTime)).toEqual([0, 30000, 60000]);
    expect(r.metrics.queueTime.mean).toBe(30000);
    expect(r.metrics.leadTime.mean).toBe(120000);
    expect(r.metrics).toMatchObject({
      throughput: 3,
      backlog: 0,
      utilization: 0.9,
    });
  });
  it("FL-AT02: normalized result is byte-identical, streams are isolated", () => {
    expect(JSON.stringify(run(membershipTemplate(), 42))).toBe(
      JSON.stringify(run(membershipTemplate(), 42)),
    );
    const a = randomStream(42, "arrivals"),
      b = randomStream(42, "arrivals"),
      other = randomStream(42, "activity:one");
    other();
    other();
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it("locks the PRNG sequence", () => {
    const r = randomStream(42, "golden");
    expect([r(), r(), r()]).toMatchSnapshot();
  });
  it("FL-AT03: censored cases remain backlog and do not enter lead times", () => {
    const m = goldenModel();
    m.horizon = 200000;
    const r = run(m);
    expect(r.metrics).toMatchObject({ throughput: 2, backlog: 1, active: 1 });
    expect(r.metrics.leadTime.count).toBe(2);
    expect(r.metrics.utilization).toBe(1);
  });
  it("FL-AT04: two resources remove all queueing", () => {
    const m = goldenModel();
    m.resources[0].capacity = 2;
    const r = run(m);
    expect(r.cases.map((c) => c.completedAt)).toEqual([90000, 150000, 210000]);
    expect(r.cases.map((c) => c.queueTime)).toEqual([0, 0, 0]);
  });
  it("FL-AT05: pauses at shift end without resampling duration", () => {
    const m = goldenModel();
    m.arrivals = {
      type: "explicit",
      cases: [{ id: "a", time: 0, caseType: "standard" }],
    };
    m.resources[0].calendar = [
      { start: 0, end: 60000 },
      { start: 120000, end: 300000 },
    ];
    const r = run(m);
    expect(r.cases[0].completedAt).toBe(150000);
    expect(r.resourceTimelines.map((s) => [s.start, s.end])).toEqual([
      [0, 60000],
      [120000, 150000],
    ]);
    expect(r.metrics.utilization).toBe(90000 / 240000);
    expect(r.trace.filter((e) => e.type === "activity_start")).toHaveLength(1);
  });
  it("FL-AT06: rejects probabilities summing to .9", () => {
    const m = membershipTemplate();
    m.edges[2].weight = 0.2;
    expect(validateModel(m).some((i) => i.field === "routing")).toBe(true);
    expect(() => run(m)).toThrow("100 %");
  });
  it("FL-AT07: rework retains identity and does not double-count throughput", () => {
    const m = reworkModel(0.6);
    const r = run(m, 1);
    expect(r.cases).toHaveLength(3);
    expect(r.metrics.throughput).toBe(3);
    expect(r.cases.some((c) => c.visitCount > 5)).toBe(true);
    const enters = r.trace.filter(
      (e) => e.type === "enter" && e.nodeId === "a" && e.caseId === "a",
    );
    expect(new Set(enters.map((e) => e.visitId)).size).toBe(enters.length);
  });
  it("stops bounded cycles with an explicit truncation error", () => {
    const r = run(reworkModel(1));
    expect(r.status).toBe("failed");
    expect(r.warningCodes).toContain("rework_truncated");
    expect(r.metrics.aborted).toBe(1);
  });
  it("rejects unguarded cycles", () => {
    const m = goldenModel();
    m.edges[1].target = "a";
    expect(validateModel(m).some((i) => i.message.includes("cirkel"))).toBe(
      true,
    );
  });
  it("conserves unique cases in every sampled state across multiple streams", () => {
    for (const seed of [1, 7, 99]) {
      const r = run(membershipTemplate(), seed);
      for (const s of r.queueSamples)
        expect(s.arrived).toBe(
          s.completed + s.waiting + s.active + s.plannedWait,
        );
      expect(r.metrics.arrived).toBe(r.metrics.throughput + r.metrics.backlog);
    }
  });
  it("completion precedes same-time arrivals; ties are stable by case id", () => {
    const m = goldenModel();
    m.arrivals = {
      type: "explicit",
      cases: [
        { id: "z", time: 0, caseType: "standard" },
        { id: "a", time: 0, caseType: "standard" },
      ],
    };
    expect(
      run(m)
        .trace.filter((e) => e.type === "activity_start")
        .map((e) => e.caseId),
    ).toEqual(["a", "z"]);
  });
  it("zero capacity is N/A, preserves backlog and does not divide by zero", () => {
    const m = goldenModel();
    m.resources[0].capacity = 0;
    const r = run(m);
    expect(r.metrics.utilization).toBe(null);
    expect(r.metrics.backlog).toBe(3);
    expect(r.metrics.leadTime.median).toBe(null);
  });
  it("event limit returns an explicitly partial result", () => {
    const m = goldenModel();
    m.maxEvents = 2;
    expect(run(m).status).toBe("partial");
  });
  it("FL-AT08: cancellation produces partial, cannot become a report", async () => {
    const abort = new AbortController();
    const c = await compareModels(goldenModel(), goldenModel(), {
      signal: abort.signal,
      onProgress: (done) => {
        if (done === 2) abort.abort();
      },
    });
    expect(c.status).toBe("partial");
    expect(c.seeds).toHaveLength(2);
    expect(() => assertReportReady(c)).toThrow("30");
  });
  it("FL-AT10: pairs all 30 seeds and retains the entire input diff", async () => {
    const a = goldenModel(),
      b = goldenModel();
    b.resources[0].capacity = 2;
    const c = await compareModels(a, b);
    expect(c.status).toBe("completed");
    expect(c.seeds).toEqual(seedList());
    expect(c.baselineRuns.map((r) => r.seed)).toEqual(
      c.scenarioRuns.map((r) => r.seed),
    );
    expect(c.differences).toEqual([
      { path: "resources.0.capacity", before: 1, after: 2 },
    ]);
    expect(c.metrics.find((m) => m.key === "queueTime")?.deltaMean).toBe(
      -30000,
    );
    expect(() => assertReportReady(c)).not.toThrow();
  });
  it("rejects incompatible measurement periods", async () => {
    const b = goldenModel();
    b.horizon = 200000;
    await expect(compareModels(goldenModel(), b)).rejects.toThrow(
      "måleperiode",
    );
  });
  it("separates planned waiting from resource queues and enforces cost accounting", () => {
    const m = goldenModel();
    m.nodes.splice(2, 0, {
      id: "wait",
      kind: "wait",
      label: "Vent",
      position: { x: 300, y: 0 },
      duration: { type: "fixed", value: 1000 },
      variableCost: 0,
      maxVisits: 20,
    });
    m.edges[1].target = "wait";
    m.edges.push({ id: "we", source: "wait", target: "e" });
    m.nodes[1].variableCost = 2;
    m.fixedAutomationCost = 5;
    const r = run(m);
    expect(r.metrics.plannedWaitTime.mean).toBe(1000);
    expect(r.metrics.queueTime.mean).toBe(30000);
    expect(r.metrics.cost).toBeCloseTo((100 * 300000) / 3600000 + 6 + 5);
  });
});
function reworkModel(weight: number): FlowModel {
  const m = goldenModel();
  m.horizon = 10_000_000;
  m.nodes.splice(
    2,
    0,
    {
      id: "d",
      kind: "decision",
      label: "Kontrol",
      position: { x: 300, y: 0 },
      variableCost: 0,
      maxVisits: 20,
    },
    {
      id: "r",
      kind: "rework",
      label: "Om igen",
      position: { x: 300, y: 200 },
      variableCost: 0,
      maxVisits: 20,
    },
  );
  m.edges[1].target = "d";
  m.edges.push(
    { id: "dr", source: "d", target: "r", weight },
    { id: "de", source: "d", target: "e", weight: 1 - weight },
    { id: "ra", source: "r", target: "a" },
  );
  return m;
}

it("separates pre-window completions while preserving all-case conservation", () => {
  const model = goldenModel();
  model.observationStart = 100000;
  const result = run(model);
  expect(result.metrics.throughput).toBe(2);
  expect(result.metrics.completedBeforeWindow).toBe(1);
  expect(result.metrics.arrived).toBe(
    result.metrics.throughput +
      result.metrics.completedBeforeWindow +
      result.metrics.backlog +
      result.metrics.aborted,
  );
  expect(result.cases[0].cohort).toBe("warmup");
  expect(result.metrics.utilization).toBe(0.85);
});
