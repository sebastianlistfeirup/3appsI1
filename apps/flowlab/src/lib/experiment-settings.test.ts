import { describe, expect, it } from "vitest";
import {
  compareModels,
  goldenModel,
  MAX_FIXED_AUTOMATION_COST,
  parseModel,
  validateModel,
} from "@tre/flow-engine";
import { initialDocument, comparisonMatches, formatMetric } from "./document";
import { applyExperimentSettings } from "./experiment-settings";
import { serializeWorkspace, importWorkspace } from "./workspace";

describe("Shared experiment frame and explicit cost budget", () => {
  it("applies a common observation window and retains the actual warmup cohort and costs", async () => {
    const doc = initialDocument();
    doc.baseline = goldenModel();
    doc.scenario = goldenModel();
    doc.scenario.resources[0].capacity = 2;
    doc.comparison = await compareModels(doc.baseline, doc.scenario);
    const updated = applyExperimentSettings(doc, {
      horizon: 300000,
      observationStart: 120000,
      maxEvents: 10000,
      baselineAutomationCost: 100,
      scenarioAutomationCost: 250,
    });
    expect(updated.comparison).toBe(doc.comparison);
    expect(comparisonMatches(updated)).toBe(false);
    expect(updated.baseline.revision).toBe(doc.baseline.revision + 1);
    expect(updated.scenario.revision).toBe(doc.scenario.revision + 1);
    const comparison = await compareModels(updated.baseline, updated.scenario);
    expect(comparison.baselineRuns[0].metrics).toMatchObject({
      throughput: 2,
      completedBeforeWindow: 1,
      cost: 105,
      salaryCost: 5,
      leadTime: { median: 135000, p90: 147000, count: 2 },
    });
    expect(comparison.scenarioRuns[0].metrics).toMatchObject({
      throughput: 2,
      completedBeforeWindow: 1,
      cost: 260,
      salaryCost: 10,
      leadTime: { median: 90000, count: 2 },
    });
    const restored = importWorkspace(serializeWorkspace(updated));
    expect(restored.baseline).toEqual(updated.baseline);
    expect(restored.scenario).toEqual(updated.scenario);
  });
  it("keeps unaffected model identity and revision and validates every shared input before mutation", () => {
    const doc = initialDocument(),
      settings = {
        horizon: doc.baseline.horizon,
        observationStart: doc.baseline.observationStart,
        maxEvents: doc.baseline.maxEvents,
        baselineAutomationCost: 0,
        scenarioAutomationCost: 0,
      };
    expect(applyExperimentSettings(doc, settings)).toBe(doc);
    const changed = applyExperimentSettings(doc, {
      ...settings,
      scenarioAutomationCost: 250,
    });
    expect(changed.baseline).toBe(doc.baseline);
    expect(changed.scenario.revision).toBe(doc.scenario.revision + 1);
    for (const bad of [
      { horizon: Infinity },
      { horizon: 0 },
      { horizon: 0.1 },
      { horizon: 366 * 24 * 3600000 },
      { observationStart: settings.horizon },
      { observationStart: -1 },
      { maxEvents: 0 },
      { maxEvents: 1.5 },
      { maxEvents: 5000001 },
      { baselineAutomationCost: -1 },
      { scenarioAutomationCost: NaN },
      { scenarioAutomationCost: 1e308 },
    ])
      expect(() =>
        applyExperimentSettings(doc, { ...settings, ...bad }),
      ).toThrow();
    expect(doc.scenario.fixedAutomationCost).toBe(0);
  });
  it("rejects an unbounded fixed cost before it can overflow the mean over replications", async () => {
    const model = goldenModel();
    model.fixedAutomationCost = 1e308;
    expect(
      validateModel(model).some(
        (issue) => issue.field === "fixedAutomationCost",
      ),
    ).toBe(true);
    expect(() => parseModel(model)).toThrow("1.000.000.000.000");
    await expect(compareModels(model, model)).rejects.toThrow(
      "1.000.000.000.000",
    );
    model.fixedAutomationCost = MAX_FIXED_AUTOMATION_COST;
    const comparison = await compareModels(model, model);
    expect(
      Number.isFinite(
        comparison.metrics.find((metric) => metric.key === "cost")!.baseline,
      ),
    ).toBe(true);
    expect(
      comparison.metrics.find((metric) => metric.key === "cost")!.deltaMean,
    ).toBe(0);
    expect(formatMetric("cost", MAX_FIXED_AUTOMATION_COST)).toBe(
      "1.000,0 mia. kr.",
    );
    expect(formatMetric("cost", -MAX_FIXED_AUTOMATION_COST)).toBe(
      "-1.000,0 mia. kr.",
    );
  });
});
