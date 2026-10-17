import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, goldenModel, simulate } from "@tre/flow-engine";
import {
  changeDurationUnit,
  durationDraft,
  DURATION_UNITS,
  expectedDuration,
  parseDurationDraft,
  parseDurationValue,
  type DurationUnit,
} from "./duration-editor";

describe("atomic duration assumptions", () => {
  it("preserves exact integer milliseconds through every supported unit, including 1ms and the maximum", () => {
    for (const milliseconds of [
      1, 2, 59, 1001, 60001, 3599999, 31535999999, 31536000000,
    ]) {
      let draft = durationDraft({ type: "fixed", value: milliseconds });
      for (const unit of Object.keys(DURATION_UNITS) as DurationUnit[]) {
        draft = changeDurationUnit(draft, unit);
        expect(parseDurationDraft(draft).duration).toEqual({
          type: "fixed",
          value: milliseconds,
        });
      }
    }
    expect(durationDraft({ type: "fixed", value: 1 })).toMatchObject({
      unit: "ms",
      value: "1",
    });
  });
  it("accepts decimal comma and rounds exact half milliseconds up without masking budget violations", () => {
    expect(parseDurationValue("1,5", "ms", "Tid")).toEqual({
      milliseconds: 2,
      rounded: true,
    });
    expect(parseDurationValue("0.000025", "minutes", "Tid")).toEqual({
      milliseconds: 2,
      rounded: true,
    });
    expect(
      parseDurationValue("1.499999999999999999999999999999", "ms", "Tid")
        .milliseconds,
    ).toBe(1);
    expect(parseDurationValue("31536000000", "ms", "Tid").milliseconds).toBe(
      31536000000,
    );
    for (const invalid of [
      "",
      " ",
      "-1",
      "0",
      "0,9",
      "1e3",
      "Infinity",
      "NaN",
      "1.000,5",
      "31536000000.00000000000000001",
      "1".repeat(101),
    ])
      expect(() => parseDurationValue(invalid, "ms", "Tid")).toThrow();
  });
  it("validates the complete triangular ordering without mutating the original distribution", () => {
    const original = {
      type: "triangular" as const,
      min: 300000,
      mode: 600000,
      max: 1200000,
    };
    const draft = durationDraft(original);
    draft.min = "15";
    expect(() => parseDurationDraft(draft)).toThrow(
      "minimum ≤ typisk ≤ maksimum",
    );
    draft.mode = "20";
    draft.max = "30";
    expect(parseDurationDraft(draft).duration).toEqual({
      type: "triangular",
      min: 900000,
      mode: 1200000,
      max: 1800000,
    });
    expect(original).toEqual({
      type: "triangular",
      min: 300000,
      mode: 600000,
      max: 1200000,
    });
    expect(expectedDuration(parseDurationDraft(draft).duration)).toBe(1300000);
    draft.min = draft.mode = draft.max = "2";
    expect(parseDurationDraft(draft).duration).toEqual({
      type: "triangular",
      min: 120000,
      mode: 120000,
      max: 120000,
    });
  });
  it("keeps edits to each distribution until applied, and does not require unused fields", () => {
    const draft = durationDraft({ type: "exponential", mean: 1001 });
    draft.value = "";
    draft.min = "bad";
    expect(parseDurationDraft(draft).duration).toEqual({
      type: "exponential",
      mean: 1001,
    });
    expect(() => parseDurationDraft({ ...draft, type: "fixed" })).toThrow(
      "Varighed",
    );
    expect(() => changeDurationUnit({ ...draft, mean: "" }, "hours")).toThrow(
      "Gennemsnit",
    );
    draft.min = "15";
    draft.mode = "20";
    draft.max = "30";
    const converted = changeDurationUnit(draft, "seconds");
    expect(converted).toMatchObject({
      value: "",
      min: "0.015",
      mode: "0.02",
      max: "0.03",
    });
    expect(
      parseDurationDraft({ ...converted, type: "triangular" }).duration,
    ).toEqual({ type: "triangular", min: 15, mode: 20, max: 30 });
  });
  it("applied millisecond values drive the actual engine, including a degenerate triangle and zero backlog", () => {
    const model = goldenModel();
    model.nodes.find((node) => node.kind === "activity")!.duration =
      parseDurationDraft({
        ...durationDraft({ type: "fixed", value: 60000 }),
        unit: "ms",
        value: "1,5",
      }).duration;
    const first = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 42,
    });
    expect(first.cases.map((item) => item.completedAt)).toEqual([
      2, 60002, 120002,
    ]);
    model.nodes.find((node) => node.kind === "activity")!.duration = {
      type: "triangular",
      min: 2,
      mode: 2,
      max: 2,
    };
    expect(
      simulate({
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
        model,
        seed: 42,
      }).cases,
    ).toEqual(first.cases);
    expect(first.metrics.backlog).toBe(0);
  });
});
