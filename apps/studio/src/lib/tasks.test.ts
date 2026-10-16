import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addDependency,
  addTask,
  assertProject,
  beginManualRun,
  cancelRun,
  changeProject,
  createProject,
  editTask,
  latestBrief,
  removeDependency,
  reviewDelivery,
  saveBrief,
  setTaskState,
  submitDelivery,
  textArtifact,
} from "./model";
import { createSample } from "./sample";

function ready() {
  return addTask(
    saveBrief(createProject("Ny opgave"), {
      goal: "En læsbar levering",
      audience: "Mig",
      constraints: "",
      acceptance: ["Teksten kan læses"],
    }),
    "Skriv teksten",
  );
}
describe("task recovery and correction dependencies", () => {
  it("unblocks a paused manual upload without replacing its locked run", () => {
    const p = ready(),
      task = p.tasks[0]!;
    const running = beginManualRun(p, task.id, "start");
    const blocked = setTaskState(
      running,
      task.id,
      "blocked",
      "Afventer tekst fra forfatteren",
    );
    expect(blocked.tasks[0]?.blockedReason).toBe(
      "Afventer tekst fra forfatteren",
    );
    expect(() =>
      submitDelivery(blocked, blocked.runs[0]!.id, {
        title: "Resultat",
        summary: "",
        outputVersionIds: [],
        checks: [],
      }),
    ).toThrow("blokering");
    const resumed = setTaskState(blocked, task.id, "ready");
    expect(resumed.tasks[0]?.state).toBe("in_progress");
    expect(resumed.tasks[0]?.blockedReason).toBeUndefined();
    expect(resumed.runs).toEqual(running.runs);
    expect(resumed.activity.at(-1)?.type).toBe("task.resumed");
  });
  it("cancelling a blocked upload does not falsely resolve its reason", () => {
    const p = ready(),
      task = p.tasks[0]!;
    const blocked = setTaskState(
      beginManualRun(p, task.id, "start"),
      task.id,
      "blocked",
      "Mangler input",
    );
    const cancelled = cancelRun(blocked, blocked.runs[0]!.id);
    expect(cancelled.tasks[0]?.state).toBe("blocked");
    expect(cancelled.tasks[0]?.blockedReason).toBe("Mangler input");
    expect(() => beginManualRun(cancelled, task.id, "next")).toThrow(
      "blokering",
    );
    const resumed = setTaskState(cancelled, task.id, "ready");
    expect(beginManualRun(resumed, task.id, "next").runs).toHaveLength(2);
  });
  it("a rejected task's successor waits for the correction and can start once it is accepted", async () => {
    const p = createSample().projects[0]!,
      d = p.deliveries[0]!;
    let next = reviewDelivery(p, d.id, {
      decision: "changes_requested",
      reviewer: "Mig",
      comment: "Gør titlen tydelig",
      checkedCriteria: [],
      acknowledgedStale: false,
    });
    const correction = next.tasks.at(-1)!;
    expect(correction.correctionOf).toBe("task-menu");
    expect(next.tasks.find((t) => t.id === "task-menu")?.replacedBy).toBe(
      correction.id,
    );
    expect(next.edges).toContainEqual({
      from: "task-design",
      to: correction.id,
    });
    expect(next.edges).toContainEqual({
      from: correction.id,
      to: "task-polish",
    });
    expect(next.edges).not.toContainEqual({
      from: "task-menu",
      to: "task-polish",
    });
    expect(() => beginManualRun(next, "task-polish", "too-soon")).toThrow(
      "afhængige",
    );
    expect(() => setTaskState(next, "task-menu", "ready")).toThrow(
      "rettelsesopgaven",
    );
    const oldReview = structuredClone(next.reviews[0]!);
    next = beginManualRun(next, correction.id, "correction-run");
    const run = next.runs.at(-1)!;
    const file = await textArtifact(
      next,
      "quest-menu.html",
      "<h1>Tydelig questtitel</h1>",
      "code",
      "menu",
    );
    next = addArtifact(next, file);
    next = submitDelivery(next, run.id, {
      title: "Rettet titel",
      summary: "Kontrolleret af mig",
      outputVersionIds: [file.id],
      checks: latestBrief(next).acceptance.map((label, i) => ({
        id: `check-${i}`,
        label,
        passed: true,
        source: "manual",
        evidence: "Afprøvet i preview",
      })),
    });
    const fixed = next.deliveries.at(-1)!;
    next = reviewDelivery(next, fixed.id, {
      decision: "accepted",
      reviewer: "Mig",
      comment: "Afprøvet og godkendt",
      checkedCriteria: fixed.checks.map((check) => check.id),
      acknowledgedStale: false,
    });
    expect(
      beginManualRun(next, "task-polish", "follow-on").runs.at(-1)?.state,
    ).toBe("awaiting_upload");
    expect(next.reviews[0]).toEqual(oldReview);
    expect(next.deliveries[0]).toEqual(d);
    expect(next.artifacts.slice(0, p.artifacts.length)).toEqual(p.artifacts);
    expect(next.tasks.find((t) => t.id === "task-menu")?.state).toBe("blocked");
    expect(assertProject(next)).toBe(next);
  });
  it("rejects rewriting or breaking correction ancestry and completed task state", () => {
    const state = createSample(),
      p = state.projects[0]!,
      d = p.deliveries[0]!;
    const next = reviewDelivery(p, d.id, {
      decision: "changes_requested",
      reviewer: "Mig",
      comment: "Rettelse",
      checkedCriteria: [],
      acknowledgedStale: false,
    });
    const invalid = structuredClone(next);
    invalid.tasks.at(-1)!.correctionOf = "missing";
    expect(() => assertProject(invalid)).toThrow(
      /oprindelige|rettelsesrelation/,
    );
    state.projects[0] = next;
    expect(() =>
      changeProject(state, next.id, (value) => {
        value.tasks.find((t) => t.id === "task-design")!.state = "ready";
        return value;
      }),
    ).toThrow("genåbnes");
    expect(() => setTaskState(p, "task-design", "blocked")).toThrow("genåbnes");
    expect(() => setTaskState(p, "task-menu", "blocked")).toThrow("review");
  });
  it("edits only pending descriptions with expected revision and protects started prerequisites", () => {
    const p = addTask(ready(), "Efterfølger"),
      task = p.tasks[0]!,
      successor = p.tasks[1]!;
    const edited = editTask(
      p,
      task.id,
      "Præcis titel",
      "Ny beskrivelse",
      task.revision,
    );
    expect(edited.tasks[0]?.title).toBe("Præcis titel");
    expect(p.tasks[0]?.title).toBe("Skriv teksten");
    expect(() =>
      editTask(edited, task.id, "Forældet", "", task.revision),
    ).toThrow("ændret");
    const linked = addDependency(edited, task.id, successor.id);
    const unlinked = removeDependency(linked, task.id, successor.id);
    expect(unlinked.edges).toHaveLength(0);
    const running = beginManualRun(unlinked, successor.id, "start-successor");
    expect(() => addDependency(running, task.id, successor.id)).toThrow(
      "låses",
    );
    expect(() =>
      editTask(
        running,
        successor.id,
        "Skjult ændring",
        "",
        running.tasks[1]!.revision,
      ),
    ).toThrow("bevarer");
  });
});
