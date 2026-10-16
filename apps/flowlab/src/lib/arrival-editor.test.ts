import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, goldenModel, simulate } from "@tre/flow-engine";
import {
  arrivalDraft,
  arrivalWindowCounts,
  checkArrivals,
  emptyArrivalDraft,
  parseArrivalDraft,
  putArrival,
} from "./arrival-editor";

describe("Manual arrival editing and exact event boundaries", () => {
  it("roundtrips imported integer times without changing ids or case types and rejects invalid drafts", () => {
    for (const time of [
      0,
      1,
      1000,
      60000,
      90000,
      1001,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const value = { id: "syntetisk-Æ\ud801\udc00", time, caseType: "haster" };
      expect(parseArrivalDraft(arrivalDraft(value))).toEqual(value);
    }
    expect(
      parseArrivalDraft({
        id: "a",
        time: "1.001",
        unit: "seconds",
        caseType: "standard",
      }).time,
    ).toBe(1001);
    for (const draft of [
      emptyArrivalDraft(),
      { ...emptyArrivalDraft(), id: "a\n" },
      { ...emptyArrivalDraft(), id: "a", caseType: "\t" },
      { ...emptyArrivalDraft(), id: "a", time: "" },
      { ...emptyArrivalDraft(), id: "a", time: "-0.0001" },
      { ...emptyArrivalDraft(), id: "a", time: "1e308" },
    ])
      expect(() => parseArrivalDraft(draft)).toThrow();
  });
  it("preserves untouched cases, rejects duplicates and allows replacement at the 100,000-case limit", () => {
    const cases = Array.from({ length: 100000 }, (_, index) => ({
      id: String(index),
      time: index,
      caseType: "standard",
    }));
    const edited = putArrival(
      cases,
      { id: "99999", time: 5, caseType: "haster" },
      "99999",
    );
    expect(edited).toHaveLength(100000);
    expect(edited[0]).toBe(cases[0]);
    expect(cases[99999].time).toBe(99999);
    expect(() =>
      putArrival(cases, { id: "new", time: 0, caseType: "standard" }),
    ).toThrow("100.000");
    expect(() =>
      putArrival(cases, { id: "0", time: 5, caseType: "haster" }, "1"),
    ).toThrow("findes allerede");
    expect(() =>
      putArrival(cases, { id: "new", time: 5, caseType: "haster" }, "missing"),
    ).toThrow("findes ikke længere");
    expect(() =>
      checkArrivals({ type: "explicit", cases: [cases[0], cases[0]] }),
    ).toThrow("findes allerede");
    expect(() =>
      checkArrivals({
        type: "poisson",
        meanInterval: 1000,
        maxCases: 100000,
        initialBacklog: 1,
      }),
    ).toThrow("tilsammen");
    expect(checkArrivals({ type: "explicit", cases: [] })).toEqual({
      type: "explicit",
      cases: [],
    });
  });
  it("edits golden arrivals into actual engine behavior and exposes the strict arrival-stop boundary", () => {
    const model = goldenModel();
    if (model.arrivals.type !== "explicit") throw new Error("fixture");
    const cases = putArrival(
      model.arrivals.cases,
      parseArrivalDraft({
        id: "b",
        time: "0",
        unit: "minutes",
        caseType: "standard",
      }),
      "b",
    );
    model.arrivals = checkArrivals({
      type: "explicit",
      cases: putArrival(cases, {
        id: "at-stop",
        time: model.horizon,
        caseType: "standard",
      }),
    });
    expect(
      arrivalWindowCounts(
        model.arrivals.type === "explicit" ? model.arrivals.cases : [],
        model.horizon,
        60000,
      ),
    ).toEqual({ inPeriod: 3, outside: 1, beforeMeasurement: 2 });
    const run = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 2026,
    });
    expect(run.metrics.arrived).toBe(3);
    expect(run.metrics.throughput).toBe(3);
    expect(run.metrics.leadTime).toMatchObject({
      median: 150000,
      p90: 174000,
      count: 3,
    });
    expect(run.metrics.queueTime.mean).toBe(50000);
    expect(run.cases.some((item) => item.id === "at-stop")).toBe(false);
  });
});
