import { describe, expect, it } from "vitest";
import { compareModels, validateModel } from "@tre/flow-engine";
import { createExampleTemplate, EXAMPLE_TEMPLATES } from "./templates";
import { openTemplateInWorkspace } from "./scenarios";

describe("Synthetic templates teach actual simulation mechanisms", () => {
  it.each(EXAMPLE_TEMPLATES.map((template) => template.id))(
    "opens valid independent %s models without claiming calibration",
    (key) => {
      const doc = createExampleTemplate(key),
        fresh = createExampleTemplate(key);
      expect(validateModel(doc.baseline)).toEqual([]);
      expect(validateModel(doc.scenario)).toEqual([]);
      expect(doc.baseline.evidence).toBe("synthetic");
      expect(doc.scenario.evidence).toBe("synthetic");
      expect(doc.comparison).toBeNull();
      const priorCapacity = doc.baseline.resources[0].capacity;
      doc.scenario.resources[0].capacity = 900;
      expect(doc.baseline.resources[0].capacity).toBe(priorCapacity);
      expect(createExampleTemplate(key)).toEqual(fresh);
    },
  );
  it("shows the selection trap: a lower completed-case median can accompany a larger complex backlog", async () => {
    const doc = createExampleTemplate("routing"),
      c = await compareModels(doc.baseline, doc.scenario);
    expect(c.seeds).toHaveLength(30);
    expect(c.status).toBe("completed");
    for (const run of c.baselineRuns) {
      expect(run.metrics.throughput).toBe(11);
      expect(run.metrics.backlog).toBe(1);
      expect(run.metrics.leadTime.median).toBe(35 * 60000);
      expect(run.metrics.cost).toBe(1140);
    }
    for (const run of c.scenarioRuns) {
      expect(run.metrics.throughput).toBe(9);
      expect(run.metrics.backlog).toBe(3);
      expect(run.metrics.leadTime.median).toBe(10 * 60000);
      expect(run.metrics.cost).toBe(1140);
    }
    const cases = c.scenarioRuns[0].cases;
    expect(
      cases
        .filter((item) => item.completedAt === null)
        .map((item) => item.caseType),
    ).toEqual(["kompleks", "kompleks", "kompleks"]);
    expect(
      cases
        .filter((item) => item.caseType === "enkel")
        .every((item) => item.completedAt !== null),
    ).toBe(true);
  });
  it("moves a pause while preserving total pay and continuing exactly the same active work", async () => {
    const doc = createExampleTemplate("calendar"),
      c = await compareModels(doc.baseline, doc.scenario);
    const base = c.baselineRuns[0],
      alternative = c.scenarioRuns[0];
    expect(base.cases.map((item) => item.completedAt)).toEqual(
      [90, 180, 330, 420].map((minutes) => minutes * 60000),
    );
    expect(alternative.cases.map((item) => item.completedAt)).toEqual(
      [90, 240, 330, 420].map((minutes) => minutes * 60000),
    );
    expect(base.metrics.leadTime.median).toBe(165 * 60000);
    expect(alternative.metrics.leadTime.median).toBe(195 * 60000);
    expect(base.metrics.queueTime.mean).toBe(75 * 60000);
    expect(alternative.metrics.queueTime.mean).toBe(75 * 60000);
    for (const run of [...c.baselineRuns, ...c.scenarioRuns]) {
      expect(run.metrics.throughput).toBe(4);
      expect(run.metrics.cost).toBe(1995);
      expect(run.resources[0].availableTime).toBe(420 * 60000);
      expect(run.resources[0].busyTime).toBe(360 * 60000);
    }
  });
  it("counts repeated activity visits separately from unique completed cases and includes planned waiting", async () => {
    const doc = createExampleTemplate("rework"),
      c = await compareModels(doc.baseline, doc.scenario);
    const base = c.baselineRuns[0],
      alternative = c.scenarioRuns[0];
    expect(c.status).toBe("completed");
    expect(base.metrics.throughput).toBe(20);
    expect(base.metrics.variableCost).toBe(24 * 5);
    expect(alternative.metrics.throughput).toBe(20);
    expect(alternative.metrics.variableCost).toBe(20 * 5);
    expect(base.metrics.plannedWaitTime.mean).toBe(6 * 60000);
    expect(alternative.metrics.plannedWaitTime.mean).toBe(0);
    expect(base.metrics.salaryCost).toBe(3420);
    expect(alternative.metrics.salaryCost).toBe(3420);
    expect(
      c.baselineRuns.reduce((sum, run) => sum + run.metrics.variableCost, 0),
    ).toBe(4200);
    expect(
      c.scenarioRuns.reduce((sum, run) => sum + run.metrics.variableCost, 0),
    ).toBe(3325);
    expect(
      [...c.baselineRuns, ...c.scenarioRuns].every(
        (run) => run.warningCodes.length === 0,
      ),
    ).toBe(true);
    expect(base.cases.some((item) => item.visitCount > 4)).toBe(true);
  });
  it("archives the previous experiment and preserves the workspace decision and seed when switching templates", () => {
    const doc = createExampleTemplate("routing");
    doc.scenarioName = "Mit eget routingforsøg";
    doc.scenario.resources[0].capacity = 7;
    doc.decision = "Denne beslutningskladde skal overleve";
    doc.baseSeed = 71;
    const opened = openTemplateInWorkspace(
      doc,
      createExampleTemplate("calendar"),
      "safety",
      new Date(0).toISOString(),
    );
    expect(opened.document.baseline.id).toBe("workday-break");
    expect(opened.document.scenarioName).toBe("En time tidligere pause");
    expect(opened.document.baseSeed).toBe(71);
    expect(opened.document.decision).toBe(doc.decision);
    expect(opened.archived?.context?.scenarioName).toBe(doc.scenarioName);
    expect(opened.archived?.scenario.resources[0].capacity).toBe(7);
    expect(opened.document.comparison).toBeNull();
  });
});
