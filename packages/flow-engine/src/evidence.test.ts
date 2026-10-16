import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  PRNG_VERSION,
  goldenModel,
  membershipTemplate,
  randomStream,
  simulate,
  inspectCase,
} from "./index";

describe("Per-case evidence and stream identity", () => {
  it("hashes both UTF-16 surrogate halves so distinct Unicode activity IDs do not share draws", () => {
    const a = randomStream(42, "activity:😀"),
      b = randomStream(42, "activity:😁"),
      repeat = randomStream(42, "activity:😀");
    const first = [a(), a(), a()];
    expect(first).toEqual([repeat(), repeat(), repeat()]);
    expect(first).not.toEqual([b(), b(), b()]);
    expect(PRNG_VERSION).toBe("mulberry32-fnv1a/2");
  });
  it("uses unambiguous tuple visit IDs for cases and nodes containing colons", () => {
    const model = goldenModel();
    const first = model.nodes[1];
    first.id = "b:c";
    model.nodes.splice(2, 0, { ...first, id: "c" });
    model.edges = [
      { id: "e1", source: model.nodes[0].id, target: "b:c" },
      { id: "e2", source: "b:c", target: "c" },
      { id: "e3", source: "c", target: model.nodes.at(-1)!.id },
    ];
    model.arrivals = {
      type: "explicit",
      cases: [
        { id: "a", time: 0, caseType: "standard" },
        { id: "a:b", time: 0, caseType: "standard" },
      ],
    };
    model.horizon = 500000;
    const run = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 42,
      trace: true,
    });
    const starts = run.trace.filter((event) => event.type === "activity_start");
    expect(starts).toHaveLength(4);
    expect(new Set(starts.map((event) => event.visitId)).size).toBe(4);
    expect(starts.map((event) => JSON.parse(event.visitId))).toContainEqual([
      "a",
      "b:c",
      1,
    ]);
    expect(starts.map((event) => JSON.parse(event.visitId))).toContainEqual([
      "a:b",
      "c",
      1,
    ]);
    expect(
      run.resourceTimelines.every((segment) =>
        starts.some((event) => event.visitId === segment.visitId),
      ),
    ).toBe(true);
  });
  it("filters evidence without changing global competition, metrics, queues or sampled durations", () => {
    const model = membershipTemplate(),
      seed = 42;
    const full = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed,
      trace: true,
      traceLimit: 100000,
    });
    const caseId = full.cases.at(-1)!.id;
    const filtered = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed,
      trace: true,
      traceLimit: 100000,
      evidenceCaseId: caseId,
    });
    expect(filtered.metrics).toEqual(full.metrics);
    expect(filtered.cases).toEqual(full.cases);
    expect(filtered.resources).toEqual(full.resources);
    expect(filtered.queueSamples).toEqual(full.queueSamples);
    expect(filtered.trace).toEqual(
      full.trace.filter((event) => event.caseId === caseId),
    );
    expect(filtered.resourceTimelines).toEqual(
      full.resourceTimelines.filter((segment) => segment.caseId === caseId),
    );
    expect(filtered.warningCodes).toEqual(full.warningCodes);
  });
  it("explains the exact golden middle case and the real capacity alternative", () => {
    const model = goldenModel(),
      baseline = inspectCase(model, 42, "b");
    model.resources[0].capacity = 2;
    const alternative = inspectCase(model, 42, "b");
    expect(baseline.timing).toMatchObject({
      elapsed: 120000,
      queue: 30000,
      plannedWait: 0,
      work: 90000,
      calendarPause: 0,
    });
    expect(alternative.timing).toMatchObject({
      elapsed: 90000,
      queue: 0,
      plannedWait: 0,
      work: 90000,
      calendarPause: 0,
    });
    expect(
      baseline.events
        .filter((event) => event.type === "activity_start")
        .map((event) => event.time),
    ).toEqual([90000]);
  });
  it("separates shift pauses from queueing and never presents a censored case as completed", () => {
    const model = goldenModel();
    model.arrivals = {
      type: "explicit",
      cases: [{ id: "a", time: 0, caseType: "standard" }],
    };
    model.resources[0].calendar = [
      { start: 0, end: 60000 },
      { start: 120000, end: 300000 },
    ];
    const completed = inspectCase(model, 42, "a");
    expect(completed.timing).toMatchObject({
      elapsed: 150000,
      queue: 0,
      work: 90000,
      calendarPause: 60000,
    });
    model.horizon = 130000;
    const censored = inspectCase(model, 42, "a");
    expect(censored.case?.status).toBe("active");
    expect(censored.case?.completedAt).toBeNull();
    expect(censored.timing).toMatchObject({
      elapsed: 130000,
      queue: 0,
      work: 70000,
      calendarPause: 60000,
    });
    expect(censored.events.some((event) => event.type === "completed")).toBe(
      false,
    );
    expect(inspectCase(model, 42, "absent").case).toBeNull();
  });
  it("accounts for unfinished queue and planned waiting using elapsed time only", () => {
    const model = goldenModel();
    model.horizon = 200000;
    expect(inspectCase(model, 42, "c").timing).toMatchObject({
      elapsed: 80000,
      queue: 60000,
      work: 20000,
      calendarPause: 0,
    });
    model.resources[0].capacity = 0;
    expect(inspectCase(model, 42, "c").timing).toMatchObject({
      elapsed: 80000,
      queue: 80000,
      work: 0,
      calendarPause: 0,
    });
    model.nodes[1].kind = "wait";
    expect(inspectCase(model, 42, "c").timing).toMatchObject({
      elapsed: 80000,
      queue: 0,
      plannedWait: 80000,
      work: 0,
      calendarPause: 0,
    });
  });
  it("validates filtered case IDs before simulating", () => {
    expect(() => inspectCase(goldenModel(), 42, "bad\ncase")).toThrow(
      "ugyldigt",
    );
  });
});
