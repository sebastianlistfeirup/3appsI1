import { describe, expect, it } from "vitest";
import { goldenModel } from "@tre/flow-engine";
import {
  differenceRows,
  inputDifferenceLabel,
  modelInputDifferences,
  previewInputValue,
} from "./input-differences";

describe("Complete input differences with bounded presentation", () => {
  it("retains every changed arrival in a 100,000-case model while excluding only identity, revision and canvas coordinates", () => {
    const baseline = goldenModel();
    baseline.arrivals = {
      type: "explicit",
      cases: Array.from({ length: 100000 }, (_, index) => ({
        id: `synthetic-${index}`,
        time: index,
        caseType: "standard",
      })),
    };
    const scenario = structuredClone(baseline);
    scenario.id = "alternative";
    scenario.revision++;
    scenario.nodes[0].position.x++;
    if (scenario.arrivals.type === "explicit")
      scenario.arrivals.cases.forEach((arrival) => arrival.time++);
    const differences = modelInputDifferences(baseline, scenario);
    expect(differences).toHaveLength(100000);
    expect(
      differences.find(
        (difference) => difference.path === "arrivals.cases.99999.time",
      ),
    ).toEqual({
      path: "arrivals.cases.99999.time",
      before: 99999,
      after: 100000,
    });
    expect(differenceRows(differences.slice(0, 20), baseline)).toHaveLength(20);
    expect(JSON.parse(JSON.stringify(differences))).toEqual(differences);
  });
  it("keeps tiny numeric changes visible and never materializes giant composite values in a preview", () => {
    expect(previewInputValue(0.0000000001)).toBe("0,0000000001");
    expect(previewInputValue(null)).toBe("Ikke angivet");
    expect(previewInputValue(0)).toBe("0");
    expect(previewInputValue(false)).toBe("false");
    expect(previewInputValue(" ")).toBe(" ");
    expect(previewInputValue("\n\t\u007f")).toBe("\\u000a\\u0009\\u007f");
    expect(previewInputValue("x".repeat(2000))).toHaveLength(238);
    const cases = Array.from({ length: 100000 }, (_, index) => ({
      id: String(index),
    }));
    expect(previewInputValue(cases)).toBe("Liste med 100.000 elementer");
    const baseline = goldenModel(),
      scenario = structuredClone(baseline);
    baseline.arrivals = {
      type: "poisson",
      meanInterval: 1000,
      maxCases: 1000,
      initialBacklog: 0,
    };
    const differences = modelInputDifferences(baseline, scenario);
    expect(
      differences.find((difference) => difference.path === "arrivals.cases")
        ?.after,
    ).toBe(
      scenario.arrivals.type === "explicit" ? scenario.arrivals.cases : null,
    );
    expect(
      differenceRows(differences, baseline).find(
        (row) => row.path === "arrivals.cases",
      )?.after,
    ).toBe("Liste med 3 elementer");
  });
  it("makes units and array-position semantics explicit without guessing the identity of a changed row", () => {
    const baseline = goldenModel();
    expect(inputDifferenceLabel("nodes.1.duration.value", baseline)).toContain(
      "fast varighed (ms)",
    );
    expect(
      inputDifferenceLabel("resources.0.calendar.12.end", baseline),
    ).toContain("arbejdsinterval 13, slut (ms)");
    expect(inputDifferenceLabel("arrivals.cases.99999.time", baseline)).toBe(
      "Ankomst #100000 · tidspunkt (ms)",
    );
    expect(inputDifferenceLabel("fixedAutomationCost", baseline)).toBe(
      "Fast automation (kr.)",
    );
    expect(inputDifferenceLabel("future.unknown", baseline)).toBe(
      "future.unknown",
    );
  });
});
