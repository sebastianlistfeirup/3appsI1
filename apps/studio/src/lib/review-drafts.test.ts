import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addTask,
  assertProject,
  assertProjectUpdate,
  beginManualRun,
  createProject,
  latestBrief,
  projectSchema,
  reviewDelivery,
  saveBrief,
  saveReviewDraft,
  submitDelivery,
  textArtifact,
} from "./model";
import { exportProject, importProject } from "./archive";
async function fixture() {
  let p = saveBrief(createProject("Reviewkladden"), {
    goal: "Bevar vurderingen",
    audience: "En reviewer",
    constraints: "",
    acceptance: ["Tekst læsbar", "Korrekt indhold"],
  });
  p = addTask(p, "En lille leverance");
  p = beginManualRun(p, p.tasks[0]!.id, "review-draft-run");
  const output = await textArtifact(p, "note.txt", "Æble · 東京 🌱\r\n");
  p = addArtifact(p, output);
  return submitDelivery(p, p.runs[0]!.id, {
    title: "Klar til review",
    summary: "En virkelig fil",
    outputVersionIds: [output.id],
    checks: latestBrief(p).acceptance.map((label, i) => ({
      id: `check-${i}`,
      label,
      passed: true,
      source: "manual",
      evidence: "Manuelt kontrolleret",
    })),
  });
}
const fields = {
  comment: "Første vurdering.\nJeg mangler stadig ét krav. 🌱",
  checkedCriteria: ["check-0"],
};
describe("review draft recovery without accidental acceptance", () => {
  it("roundtrips unfinished review text and exact checked criteria through a project ZIP", async () => {
    const original = await fixture(),
      id = original.deliveries[0]!.id,
      p = saveReviewDraft(original, id, fields);
    const restored = await importProject(await exportProject(p));
    expect(restored.reviewDrafts![0]).toMatchObject({
      ...fields,
      deliveryId: id,
    });
    expect(p.runs).toEqual(original.runs);
    expect(p.deliveries).toEqual(original.deliveries);
    expect(p.reviews).toEqual([]);
    expect(p.activity).toEqual(original.activity);
    expect(original.reviewDrafts).toBeUndefined();
    expect(projectSchema.parse(original).reviewDrafts).toBeUndefined();
    expect(() => assertProjectUpdate(original, p)).not.toThrow();
  });
  it("checks the exact delivery, passed criterion references, uniqueness, length and archive state", async () => {
    const p = await fixture(),
      id = p.deliveries[0]!.id;
    expect(() => saveReviewDraft(p, "absent", fields)).toThrow("leverance");
    for (const checkedCriteria of [["absent"], ["check-0", "check-0"]])
      expect(() =>
        saveReviewDraft(p, id, { ...fields, checkedCriteria }),
      ).toThrow("acceptkrav");
    const failed = structuredClone(p);
    failed.deliveries[0]!.checks[0]!.passed = false;
    expect(() => saveReviewDraft(failed, id, fields)).toThrow("acceptkrav");
    expect(() =>
      saveReviewDraft(
        { ...p, archivedAt: new Date().toISOString() },
        id,
        fields,
      ),
    ).toThrow("arkiveret");
    expect(() =>
      saveReviewDraft(p, id, { ...fields, comment: "x".repeat(5001) }),
    ).toThrow();
    const draft = saveReviewDraft(p, id, fields);
    expect(() =>
      assertProject({
        ...draft,
        reviewDrafts: [draft.reviewDrafts![0]!, draft.reviewDrafts![0]!],
      }),
    ).toThrow("én reviewkladde");
  });
  it("keeps the draft after a rejected decision and removes it only with a valid immutable review", async () => {
    const base = await fixture(),
      id = base.deliveries[0]!.id,
      p = saveReviewDraft(base, id, fields);
    const decision = {
      ...fields,
      decision: "accepted" as const,
      reviewer: "Mig",
      acknowledgedStale: false,
    };
    expect(() => reviewDelivery(p, id, decision)).toThrow("alle acceptkrav");
    expect(p.reviewDrafts![0]!.comment).toBe(fields.comment);
    expect(() => assertProjectUpdate(p, { ...p, reviewDrafts: [] })).toThrow(
      "først fjernes",
    );
    const completed = reviewDelivery(p, id, {
      ...decision,
      checkedCriteria: ["check-0", "check-1"],
    });
    expect(completed.reviewDrafts).toEqual([]);
    expect(completed.reviews[0]!.comment).toBe(fields.comment);
    expect(completed.runs[0]!.state).toBe("succeeded");
    expect(() => assertProjectUpdate(p, completed)).not.toThrow();
    expect(() => saveReviewDraft(completed, id, fields)).toThrow(
      "endeligt review",
    );
  });
  it("never persists stale-input approval or infers acceptance from a complete draft", async () => {
    const original = await fixture(),
      id = original.deliveries[0]!.id;
    const p = saveReviewDraft(original, id, {
      ...fields,
      checkedCriteria: ["check-0", "check-1"],
      acknowledgedStale: true,
    } as typeof fields);
    expect(p.reviewDrafts![0]).not.toHaveProperty("acknowledgedStale");
    expect(p.reviews).toHaveLength(0);
    const changed = saveBrief(p, {
      ...latestBrief(p),
      goal: "En ny bestilling",
    });
    expect(() =>
      reviewDelivery(changed, id, {
        ...fields,
        checkedCriteria: ["check-0", "check-1"],
        decision: "accepted",
        reviewer: "Mig",
        acknowledgedStale: false,
      }),
    ).toThrow("ældre input");
    expect(changed.reviewDrafts).toEqual(p.reviewDrafts);
  });
  it("uses a recovered draft for a correction without rewriting the old delivery or accepting duplicate criteria", async () => {
    const base = await fixture(),
      id = base.deliveries[0]!.id,
      p = saveReviewDraft(base, id, fields);
    const result = reviewDelivery(p, id, {
      ...fields,
      decision: "changes_requested",
      reviewer: "Mig",
      acknowledgedStale: false,
    });
    expect(result.reviewDrafts).toEqual([]);
    expect(result.tasks.at(-1)!.description).toBe(fields.comment);
    expect(result.deliveries).toEqual(base.deliveries);
    expect(() => assertProjectUpdate(p, result)).not.toThrow();
    expect(() =>
      reviewDelivery(p, id, {
        ...fields,
        checkedCriteria: ["check-0", "check-0"],
        decision: "changes_requested",
        reviewer: "Mig",
        acknowledgedStale: false,
      }),
    ).toThrow("acceptkrav");
  });
});
