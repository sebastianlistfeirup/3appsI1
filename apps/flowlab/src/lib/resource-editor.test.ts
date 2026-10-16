import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, goldenModel, simulate } from "@tre/flow-engine";
import {
  applyResourceDrafts,
  parseResourceDraft,
  removeResourceDraft,
  resourceDraft,
  resourcePlan,
} from "./resource-editor";
const run = (model: ReturnType<typeof goldenModel>) =>
  simulate({
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    seed: 2026,
    model,
  });
describe("Resource drafts, references and reserved salary", () => {
  it("keeps unused capacity in reserved salary and removes only unreferenced pools", () => {
    const model = goldenModel();
    model.observationStart = 120000;
    model.resources.push({
      id: "unused",
      label: "Ubrugt team",
      capacity: 2,
      hourlyCost: 300,
      calendar: [],
    });
    const original = structuredClone(model),
      drafts = model.resources.map(resourceDraft);
    const before = run(model);
    expect(before.metrics.salaryCost).toBe(35);
    expect(before.resources.find((pool) => pool.id === "unused")).toMatchObject(
      { availableTime: 360000, busyTime: 0, salaryCost: 30 },
    );
    expect(
      resourcePlan(model.resources[1], model.horizon, model.observationStart),
    ).toEqual({ openTime: 180000, capacityTime: 360000, salaryCost: 30 });
    expect(() => removeResourceDraft(drafts, "r", model)).toThrow(
      "bruges af trin",
    );
    expect(() => applyResourceDrafts(model, [drafts[1]])).toThrow(
      "manglende ressource",
    );
    model.resources = applyResourceDrafts(
      model,
      removeResourceDraft(drafts, "unused", model),
    );
    const after = run(model);
    expect(after.metrics.salaryCost).toBe(5);
    expect(after.cases).toEqual(before.cases);
    expect(model.nodes).toEqual(original.nodes);
  });
  it("validates whole schedules, allows touching intervals and measures a real paused activity", () => {
    const model = goldenModel();
    model.horizon = 200000;
    model.arrivals = {
      type: "explicit",
      cases: [{ id: "one", time: 0, caseType: "standard" }],
    };
    const draft = resourceDraft(model.resources[0]);
    draft.calendar = [
      { start: "2", end: String(200000 / 60000) },
      { start: "0", end: "1" },
    ];
    model.resources = applyResourceDrafts(model, [draft]);
    expect(model.resources[0].calendar).toEqual([
      { start: 0, end: 60000 },
      { start: 120000, end: 200000 },
    ]);
    const result = run(model),
      plan = resourcePlan(
        model.resources[0],
        model.horizon,
        model.observationStart,
      );
    expect(result.cases[0].completedAt).toBe(150000);
    expect(result.resources[0]).toMatchObject({
      availableTime: 140000,
      busyTime: 90000,
    });
    expect(result.metrics.salaryCost).toBe(plan.salaryCost);
    model.observationStart = 70000;
    const warmed = run(model);
    expect(warmed.resources[0]).toMatchObject({
      availableTime: 80000,
      busyTime: 30000,
    });
    expect(warmed.metrics.salaryCost).toBe(
      resourcePlan(model.resources[0], model.horizon, model.observationStart)
        .salaryCost,
    );
    for (const calendar of [
      [
        { start: "0", end: "2" },
        { start: "1", end: "3" },
      ],
      [{ start: "1", end: "1" }],
      [{ start: "-0.0001", end: "1" }],
      [{ start: "", end: "1" }],
      [{ start: "0", end: "1e308" }],
    ])
      expect(() => parseResourceDraft({ ...draft, calendar })).toThrow();
    expect(
      parseResourceDraft({
        ...draft,
        calendar: [
          { start: "0", end: "1" },
          { start: "1", end: "2" },
        ],
      }).calendar,
    ).toHaveLength(2);
  });
  it("preserves millisecond boundaries, validates pool budgets and makes an empty calendar explicitly full-window", () => {
    const model = goldenModel(),
      pool = model.resources[0];
    pool.calendar = [
      { start: 1, end: 1001 },
      { start: 1002, end: 31536000000 },
    ];
    expect(parseResourceDraft(resourceDraft(pool))).toEqual(pool);
    for (const patch of [
      { label: "" },
      { capacity: "1.5" },
      { capacity: "1001" },
      { hourlyCost: "1000001" },
      { hourlyCost: "" },
    ])
      expect(() =>
        parseResourceDraft({ ...resourceDraft(pool), ...patch }),
      ).toThrow();
    expect(() =>
      applyResourceDrafts(model, [resourceDraft(pool), resourceDraft(pool)]),
    ).toThrow("entydige");
    expect(() =>
      applyResourceDrafts(
        model,
        Array.from({ length: 51 }, (_, index) => ({
          ...resourceDraft(pool),
          id: String(index),
        })),
      ),
    ).toThrow("50");
    pool.calendar = [];
    expect(resourcePlan(pool, 300000, 120000)).toEqual({
      openTime: 180000,
      capacityTime: 180000,
      salaryCost: 5,
    });
    pool.capacity = 0;
    expect(resourcePlan(pool, 300000, 120000).salaryCost).toBe(0);
  });
});
