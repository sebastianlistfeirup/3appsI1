import { describe, expect, it } from "vitest";
import { goldenModel } from "@tre/flow-engine";
import {
  inputArrivalLimit,
  inputDecimal,
  inputExpectedArrivals,
  inputHorizon,
  inputLabel,
  inputNumber,
  inputTime,
} from "./inspector-input";
import { parseDurationValue } from "./duration-editor";

describe("inspector input is validated before it becomes model input", () => {
  it("keeps real zero distinct from empty input and rejects fractional people and silent clamping", () => {
    expect(inputNumber("0", 0, 1000, true)).toBe(0);
    for (const text of ["", " ", "-1", "1.5", "1001", "NaN", "Infinity", "1e3"])
      expect(() => inputNumber(text, 0, 1000, true)).toThrow();
    expect(inputNumber("1000", 0, 1000, true)).toBe(1000);
    expect(inputNumber("285,75", 0, 1000000)).toBe(285.75);
    expect(() => inputNumber("1000000.01", 0, 1000000)).toThrow();
    expect(() => inputNumber("1".repeat(101), 0, 1000000)).toThrow();
  });
  it("protects the observation window, exact minimum time and original time units", () => {
    expect(inputHorizon("2", 3600000)).toBe(7200000);
    expect(() => inputHorizon("1", 3600000)).toThrow("efter målestart");
    expect(() => inputHorizon("", 0)).toThrow();
    expect(() => inputHorizon("8760.0000000000000001", 0)).toThrow("365 døgn");
    for (const ms of [1, 1001, 60001, 31535999999, 31536000000]) {
      expect(inputHorizon(inputTime(ms, "hours"), 0)).toBe(ms);
      expect(
        parseDurationValue(inputTime(ms, "minutes"), "minutes", "SLA")
          .milliseconds,
      ).toBe(ms);
    }
  });
  it("enforces the combined arrival budget before either field is applied", () => {
    const model = goldenModel();
    model.arrivals = {
      type: "poisson",
      meanInterval: 1000,
      maxCases: 99990,
      initialBacklog: 10,
    };
    expect(inputArrivalLimit("99990", model, "maxCases")).toBe(99990);
    expect(inputArrivalLimit("0", model, "initialBacklog")).toBe(0);
    expect(() => inputArrivalLimit("99991", model, "maxCases")).toThrow(
      "tilsammen",
    );
    expect(() => inputArrivalLimit("11", model, "initialBacklog")).toThrow(
      "tilsammen",
    );
    expect(() => inputArrivalLimit("0", model, "maxCases")).toThrow();
    expect(() => inputArrivalLimit("0.1", model, "initialBacklog")).toThrow();
  });
  it("does not round a low arrival expectation to zero or impose the case ceiling on the arrival rate", () => {
    const horizon = 3600000;
    expect(inputExpectedArrivals("0,5", horizon)).toBe(7200000);
    expect(inputExpectedArrivals("200000", horizon)).toBe(18);
    for (const interval of [1, 3, 1000001, 31536000000])
      expect(
        inputExpectedArrivals(inputDecimal(horizon / interval), horizon),
      ).toBe(interval);
    for (const text of ["", "0", "0.000000001", "99999999999"])
      expect(() => inputExpectedArrivals(text, horizon)).toThrow();
    expect(inputDecimal(1e-30)).toBe(`0.${"0".repeat(29)}1`);
    expect(inputDecimal(1.25e22)).toBe("12500000000000000000000");
  });
  it("retains meaningful names and refuses placeholder substitution", () => {
    expect(inputLabel("Komplekse sager · Øst")).toBe("Komplekse sager · Øst");
    expect(inputLabel("a".repeat(100))).toHaveLength(100);
    for (const text of ["", "   ", "a".repeat(101), "Team\n2", "x\u0000"])
      expect(() => inputLabel(text)).toThrow();
  });
});
