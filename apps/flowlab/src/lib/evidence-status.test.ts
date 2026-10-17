import { describe, expect, it } from "vitest";
import {
  assessHoldout,
  compareModels,
  goldenModel,
  parseCsv,
} from "@tre/flow-engine";
import { evidenceStatus, holdoutPeriod } from "./evidence-status";

async function fixture() {
  const model = goldenModel();
  const comparison = await compareModels(model, model);
  const input = {
    model,
    runs: comparison.baselineRuns,
    dataset: parseCsv(
      "case_id,arrived_at,activity,started_at,finished_at\na,0,Aktivitet,0,90\nb,60,Aktivitet,90,180\nc,120,Aktivitet,180,270",
      { unit: "seconds" },
    ),
    sourceName: "kontrol.csv",
    sourceHash: "a".repeat(64),
    unit: "seconds" as const,
    periodStart: 0,
    periodEnd: 300000,
    completionActivity: "Aktivitet",
    independent: true,
    completeWindow: true,
  };
  return { model, input, assessment: assessHoldout(input) };
}

describe("Baseline evidence status", () => {
  it("does not treat imported or calibrated metadata alone as a holdout", () => {
    for (const evidence of ["synthetic", "imported", "calibrated"] as const) {
      const model = goldenModel();
      model.evidence = evidence;
      expect(evidenceStatus(model, null)).toMatchObject({
        code: "unassessed",
        current: false,
        tone: "neutral",
      });
    }
  });
  it("qualifies an actual matching 30-seed assessment to its baseline and period", async () => {
    const { model, assessment } = await fixture();
    const status = evidenceStatus(model, assessment);
    expect(status).toMatchObject({
      code: "target_met",
      current: true,
      tone: "met",
      period: "0–300 sekunder",
    });
    expect(status.detail).toContain(
      "alternativet er ikke særskilt holdout-vurderet",
    );
    expect(status.detail).toContain("15,0 %");
    const scenario = structuredClone(model);
    scenario.resources[0].capacity++;
    expect(evidenceStatus(scenario, assessment).code).toBe("historical");
    expect(evidenceStatus(model, assessment).code).toBe("target_met");
  });
  it("invalidates a prior passing status for a changed baseline or engine while retaining its assessment", async () => {
    const { model, assessment } = await fixture();
    const snapshot = structuredClone(assessment);
    expect(evidenceStatus(model, assessment, "future-engine")).toMatchObject({
      code: "historical",
      tone: "review",
      current: false,
    });
    model.revision++;
    expect(evidenceStatus(model, assessment).code).toBe("historical");
    expect(assessment).toEqual(snapshot);
  });
  it("distinguishes incomplete data from an actual missed target", async () => {
    const { model, input } = await fixture();
    expect(
      evidenceStatus(model, assessHoldout({ ...input, independent: false }))
        .code,
    ).toBe("insufficient_data");
    const outside = assessHoldout({
      ...input,
      dataset: parseCsv(
        "case_id,arrived_at,activity,started_at,finished_at\na,0,Aktivitet,0,90",
        { unit: "seconds" },
      ),
    });
    expect(evidenceStatus(model, outside)).toMatchObject({
      code: "outside_target",
      current: true,
      tone: "review",
    });
  });
  it("shows the actual threshold and explicit UTC or numeric periods without discarding subsecond detail", async () => {
    const { model, assessment } = await fixture();
    assessment.threshold = 0.125;
    expect(evidenceStatus(model, assessment).detail).toContain("12,5 %");
    assessment.source.periodEnd = 300001;
    expect(holdoutPeriod(assessment)).toBe("0–300,001 sekunder");
    assessment.source.unit = "minutes";
    assessment.source.periodEnd = 1;
    expect(holdoutPeriod(assessment)).toBe("0–0,000016667 minutter");
    assessment.source.periodEnd = 300001;
    assessment.source.unit = "iso";
    expect(holdoutPeriod(assessment)).toBe(
      "1970-01-01T00:00:00.000Z – 1970-01-01T00:05:00.001Z (UTC)",
    );
    assessment.source.periodEnd = 9e15;
    expect(holdoutPeriod(assessment)).toContain("ms fra Unix-epoken");
  });
});
