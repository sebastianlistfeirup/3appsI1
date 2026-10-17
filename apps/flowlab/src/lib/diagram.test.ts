import { describe, expect, it } from "vitest";
import { simulate, ENGINE_VERSION } from "@tre/flow-engine";
import { createExampleTemplate } from "./templates";
import { diagramNodeDetail } from "./diagram";

describe("diagram input summaries", () => {
  it("uses the engine's strict arrival horizon, including the empty period", () => {
    const model = createExampleTemplate("calendar").baseline;
    model.arrivals = {
      type: "explicit",
      cases: [
        { id: "within", time: model.horizon - 1, caseType: "x" },
        { id: "boundary", time: model.horizon, caseType: "x" },
        { id: "later", time: model.horizon + 1, caseType: "x" },
      ],
    };
    expect(diagramNodeDetail(model.nodes[0], model)).toEqual({
      primary: "1 ankomst i perioden",
      secondary: "2 uden for perioden",
    });
    expect(
      simulate({
        model,
        seed: 1,
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
      }).cases.map((entry) => entry.id),
    ).toEqual(["within"]);
    model.arrivals.cases.shift();
    expect(diagramNodeDetail(model.nodes[0], model).primary).toBe(
      "0 ankomster i perioden",
    );
    expect(
      simulate({
        model,
        seed: 1,
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
      }).cases,
    ).toEqual([]);
  });
  it("describes Poisson input and start backlog without claiming a daily total", () => {
    const model = createExampleTemplate("calendar").baseline;
    model.horizon = 2 * 24 * 3600000;
    model.arrivals = {
      type: "poisson",
      meanInterval: 90000,
      maxCases: 7,
      initialBacklog: 3,
    };
    expect(diagramNodeDetail(model.nodes[0], model)).toEqual({
      primary: "Gns. 1,5 min mellem nye sager",
      secondary: "Loft 7 nye · 3 i startrestkø",
    });
    expect(
      simulate({
        model,
        seed: 1,
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
      }).cases,
    ).toHaveLength(10);
    model.horizon = 120000;
    expect(diagramNodeDetail(model.nodes[0], model).primary).toBe(
      "Gns. 1,5 min mellem nye sager",
    );
    model.arrivals.meanInterval = 1;
    expect(diagramNodeDetail(model.nodes[0], model).primary).toBe(
      "Gns. 1 ms mellem nye sager",
    );
  });
  it("distinguishes fixed, typical and mean durations and shows resource-free wait time", () => {
    const model = createExampleTemplate("rework").baseline;
    const activity = model.nodes.find((node) => node.id === "process")!;
    expect(diagramNodeDetail(activity, model).primary).toBe(
      "Typisk 12,0 min · 2 medarbejdere",
    );
    activity.duration = { type: "exponential", mean: 90000 };
    expect(diagramNodeDetail(activity, model).primary).toBe(
      "Gns. 1,5 min · 2 medarbejdere",
    );
    activity.duration = { type: "fixed", value: 90000 };
    expect(diagramNodeDetail(activity, model).primary).toBe(
      "1,5 min · 2 medarbejdere",
    );
    activity.duration.value = 1;
    expect(diagramNodeDetail(activity, model).primary).toBe(
      "1 ms · 2 medarbejdere",
    );
    expect(
      diagramNodeDetail(
        model.nodes.find((node) => node.kind === "wait")!,
        model,
      ),
    ).toEqual({ primary: "30,0 min", secondary: "Uden ressourceforbrug" });
  });
});
