import { describe, expect, it } from "vitest";
import {
  assessHoldout,
  compareModels,
  goldenModel,
  parseCsv,
  type HoldoutAssessment,
} from "./index";
const data =
  "case_id,arrived_at,activity,started_at,finished_at,event_id\na,0,Aktivitet,0,90,1\nb,60,Aktivitet,90,180,2\nc,120,Aktivitet,180,270,3";
async function setup() {
  const model = goldenModel(),
    comparison = await compareModels(model, model);
  return {
    model,
    runs: comparison.baselineRuns,
    dataset: parseCsv(data, { unit: "seconds" }),
    sourceName: "holdout.csv",
    sourceHash: "a".repeat(64),
    unit: "seconds" as const,
    periodStart: 0,
    periodEnd: 300000,
    completionActivity: "Aktivitet",
    independent: true,
    completeWindow: true,
    assessedAt: "2026-10-16T00:00:00.000Z",
  };
}
describe("Independent holdout contract", () => {
  it("matches actual unique throughput, median lead, FCFS waiting and backlog against 30 frozen baseline runs", async () => {
    const r = assessHoldout(await setup());
    expect(r.status).toBe("target_met");
    expect(r.metrics.throughput).toMatchObject({
      observed: 3,
      simulated: 3,
      relativeError: 0,
      sampleCount: 3,
    });
    expect(r.metrics.leadTime).toMatchObject({
      observed: 120000,
      simulated: 120000,
      relativeError: 0,
    });
    expect(r.metrics.queueTime).toMatchObject({
      observed: 30000,
      simulated: 30000,
      relativeError: 0,
    });
    expect(r.metrics.backlog).toMatchObject({
      observed: 0,
      simulated: 0,
      relativeError: 0,
    });
    expect(r.seeds).toHaveLength(30);
    expect(r.dataGaps).toEqual([]);
  });
  it("rejects a baseline with an unknown PRNG before it can establish holdout quality", async () => {
    const input = await setup();
    input.runs[29].prngVersion = "unknown-prng";
    expect(() => assessHoldout(input)).toThrow("aktuelle baseline");
  });
  it("does not label the training data, unconfirmed completeness or unconfirmed independence as calibrated", async () => {
    const input = await setup();
    for (const change of [
      { independent: false },
      { completeWindow: false },
      { trainingDataHashes: [input.sourceHash] },
    ]) {
      const r = assessHoldout({ ...input, ...change });
      expect(r.status).toBe("insufficient_data");
      expect(r.dataGaps.length).toBeGreaterThan(0);
    }
  });
  it("records missing arrivals and excluded rows rather than imputing a better result", async () => {
    const input = await setup();
    input.dataset = parseCsv(
      data + "\nd,,Aktivitet,270,290,4\ne,200,Aktivitet,220,210,5",
      { unit: "seconds" },
    );
    const r = assessHoldout(input);
    expect(r.status).toBe("insufficient_data");
    expect(r.metrics.throughput.observed).toBe(4);
    expect(r.metrics.leadTime.sampleCount).toBe(3);
    expect(r.metrics.backlog.observed).toBeNull();
    expect(r.dataGaps.some((g) => g.includes("udeladt"))).toBe(true);
    expect(r.dataGaps.some((g) => g.includes("ankomsttid"))).toBe(true);
  });
  it("counts only final activity completions in the chosen window and retains censored backlog", async () => {
    const input = await setup();
    input.dataset = parseCsv(
      data +
        "\na,0,Slut,,90,4\nb,60,Slut,,180,5\nc,120,Slut,,270,6\nd,290,Aktivitet,295,,7\ne,300,Aktivitet,300,,8",
      { unit: "seconds" },
    );
    input.completionActivity = "Slut";
    const r = assessHoldout(input);
    expect(r.metrics.throughput.observed).toBe(3);
    expect(r.metrics.backlog.observed).toBe(1);
    expect(r.metrics.queueTime.observed).toBe(30000);
  });
  it("records a failed pilot target without hiding the observed values", async () => {
    const input = await setup();
    input.dataset = parseCsv(
      data.replace("c,120,Aktivitet,180,270,3", "c,120,Aktivitet,180,,3"),
      { unit: "seconds" },
    );
    const r = assessHoldout(input);
    expect(r.status).toBe("outside_target");
    expect(r.metrics.throughput.observed).toBe(2);
    expect(r.metrics.throughput.relativeError).toBe(0.5);
    expect(r.metrics.backlog.observed).toBe(1);
  });
  it("rejects incompatible windows and incomplete simulation batches", async () => {
    const input = await setup();
    expect(() => assessHoldout({ ...input, periodEnd: 299999 })).toThrow(
      "samme varighed",
    );
    expect(() =>
      assessHoldout({ ...input, runs: input.runs.slice(0, 29) }),
    ).toThrow("30");
  });
  it("rejects an unknown completion activity instead of treating it as zero output", async () => {
    const awaitedInput = await setup();
    expect(() =>
      assessHoldout({
        ...awaitedInput,
        completionActivity: "Aktivitet med slåfejl",
      }),
    ).toThrow("findes ikke");
  });
  it("does not mix planned waiting with activity queues", async () => {
    const input = await setup();
    input.model.nodes.splice(2, 0, {
      id: "w",
      label: "Vent",
      kind: "wait",
      position: { x: 300, y: 0 },
      duration: { type: "fixed", value: 1000 },
      variableCost: 0,
      maxVisits: 20,
    });
    input.model.edges[1].target = "w";
    input.model.edges.push({ id: "we", source: "w", target: "e" });
    input.runs = (await compareModels(input.model, input.model)).baselineRuns;
    const r = assessHoldout(input);
    expect(r.metrics.queueTime.observed).toBeNull();
    expect(r.notes.some((n) => n.includes("planlagt vent"))).toBe(true);
  });
  it("rejects ambiguous final events and mismatched arrivals", async () => {
    const input = await setup();
    input.dataset = parseCsv(data + "\na,1,Aktivitet,270,290,4", {
      unit: "seconds",
    });
    const r = assessHoldout(input);
    expect(r.status).toBe("insufficient_data");
    expect(r.dataGaps.some((g) => g.includes("flere afsluttende"))).toBe(true);
    expect(r.dataGaps.some((g) => g.includes("forskellige ankomst"))).toBe(
      true,
    );
  });
});
