import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addTask,
  assertProject,
  assertProjectUpdate,
  beginManualRun,
  cancelRun,
  createProject,
  editTask,
  latestBrief,
  reviewDelivery,
  runAcceptance,
  saveBrief,
  submitDelivery,
  textArtifact,
} from "./model";
import { createSample } from "./sample";
import { exportProject, importProject } from "./archive";
import {
  projectDocument,
  validateProjectDocumentUpdate,
} from "./cloud-document";

function ready() {
  return addTask(
    saveBrief(createProject("En konkret opgave"), {
      goal: "Gør hjælpen læsbar",
      audience: "Spillere",
      constraints: "",
      acceptance: ["Hele menuen er afprøvet", "Alle skærme er læsbare"],
    }),
    "Skriv hjælpeteksten",
    "Én kort sætning.",
    {
      owner: "Sebastian",
      acceptance: ["Næste handling forklares i én sætning"],
    },
  );
}
describe("task-specific definitions and immutable run snapshots", () => {
  it("locks the exact task definition instead of replacing it with project-wide criteria", async () => {
    const p = ready(),
      task = p.tasks[0]!;
    const next = beginManualRun(p, task.id, "start-specific");
    expect(next.tasks[0]!.acceptance).toEqual(task.acceptance);
    expect(next.runs[0]!.taskSnapshot).toEqual({
      title: task.title,
      description: task.description,
      owner: task.owner,
      acceptance: task.acceptance,
      revision: task.revision,
    });
    expect(runAcceptance(next, next.runs[0]!)).toEqual(task.acceptance);
    const restored = await importProject(await exportProject(next));
    expect(restored.runs).toEqual(next.runs);
    expect(assertProject(restored)).toBe(restored);
  });
  it("preserves a cancelled run's original owner, title and criteria after task edits and restart", () => {
    const p = ready(),
      task = p.tasks[0]!;
    const started = beginManualRun(p, task.id, "first");
    const cancelled = cancelRun(started, started.runs[0]!.id);
    const edited = editTask(
      cancelled,
      task.id,
      "En ny opgavebeskrivelse",
      "En anden tekst",
      cancelled.tasks[0]!.revision,
      {
        owner: "Maja",
        acceptance: ["Et andet afgrænset krav"],
      },
    );
    const restarted = beginManualRun(edited, task.id, "second");
    expect(restarted.runs[0]).toEqual(cancelled.runs[0]);
    expect(restarted.runs[1]!.taskSnapshot).toMatchObject({
      owner: "Maja",
      title: "En ny opgavebeskrivelse",
      acceptance: ["Et andet afgrænset krav"],
    });
    expect(runAcceptance(restarted, restarted.runs[0]!)).toEqual(
      task.acceptance,
    );
    expect(() => assertProjectUpdate(cancelled, restarted)).not.toThrow();
  });
  it("requires current explicit acknowledgment for an older task brief and never adopts newer requirements silently", () => {
    const p = ready(),
      task = p.tasks[0]!;
    const newer = saveBrief(p, {
      ...latestBrief(p),
      goal: "Et helt nyt mål",
      acceptance: ["Nyt projektkrav"],
    });
    expect(() => beginManualRun(newer, task.id, "stale")).toThrow(
      "nyere bestilling",
    );
    const next = beginManualRun(
      newer,
      task.id,
      "stale",
      latestBrief(newer).version,
    );
    expect(next.runs[0]!.briefVersion).toBe(task.briefVersion);
    expect(runAcceptance(next, next.runs[0]!)).toEqual(task.acceptance);
    expect(next.tasks[0]!.briefVersion).toBe(task.briefVersion);
    const changedAgain = saveBrief(newer, {
      ...latestBrief(newer),
      goal: "Endnu en ændring",
    });
    expect(() =>
      beginManualRun(
        changedAgain,
        task.id,
        "late-ack",
        latestBrief(newer).version,
      ),
    ).toThrow("nyere bestilling");
  });
  it("explicitly changes the task's brief without replacing its custom acceptance or altering history", () => {
    const p = ready(),
      task = p.tasks[0]!;
    const newer = saveBrief(p, {
      ...latestBrief(p),
      acceptance: ["Et nyt samlet krav"],
    });
    const updated = editTask(
      newer,
      task.id,
      task.title,
      task.description,
      task.revision,
      {
        owner: "Maja",
        acceptance: task.acceptance,
        briefVersion: latestBrief(newer).version,
      },
    );
    expect(updated.tasks[0]).toMatchObject({
      owner: "Maja",
      acceptance: task.acceptance,
      briefVersion: latestBrief(newer).version,
    });
    expect(updated.briefVersions).toEqual(newer.briefVersions);
    expect(beginManualRun(updated, task.id, "current").runs).toHaveLength(1);
    expect(() =>
      editTask(newer, task.id, task.title, "", task.revision, {
        owner: "Maja",
        acceptance: task.acceptance,
        briefVersion: 999,
      }),
    ).toThrow("briefversion");
    expect(() =>
      editTask(updated, task.id, task.title, "", task.revision),
    ).toThrow("ændret");
  });
  it("rejects blank, duplicate, oversized definitions and changes to already locked work", () => {
    const p = ready(),
      task = p.tasks[0]!;
    for (const fields of [
      { owner: " ", acceptance: ["Krav"] },
      { owner: "Mig", acceptance: [] },
      { owner: "Mig", acceptance: ["Samme", "Samme"] },
      { owner: "Mig", acceptance: ["x".repeat(1001)] },
      {
        owner: "Mig",
        acceptance: Array.from({ length: 31 }, (_, i) => `Krav ${i}`),
      },
    ])
      expect(() =>
        editTask(p, task.id, task.title, "", task.revision, fields),
      ).toThrow();
    const active = beginManualRun(p, task.id, "locked");
    expect(() =>
      editTask(active, task.id, "Ny titel", "", active.tasks[0]!.revision, {
        owner: "Anden",
        acceptance: ["Nyt"],
      }),
    ).toThrow("igangværende");
    const rewritten = structuredClone(active);
    rewritten.runs[0]!.taskSnapshot!.acceptance = ["Andet krav"];
    expect(() => assertProjectUpdate(active, rewritten)).toThrow("låste input");
    expect(() =>
      validateProjectDocumentUpdate(
        projectDocument(active),
        projectDocument(rewritten),
      ),
    ).toThrow("låste input");
    const changedTask = structuredClone(active);
    changedTask.tasks[0]!.owner = "En anden";
    expect(() => assertProjectUpdate(active, changedTask)).toThrow(
      "låste opgaveaftale",
    );
  });
  it("checks the run's task criteria and gives its correction the same owner and brief context", async () => {
    let p = ready();
    p = beginManualRun(p, p.tasks[0]!.id, "review-task");
    const run = p.runs[0]!,
      file = await textArtifact(p, "hjælp.txt", "Åbn menuen.", "document");
    p = addArtifact(p, file);
    const input = {
      title: "Hjælp",
      summary: "Læs teksten",
      outputVersionIds: [file.id],
      checks: [],
    };
    expect(() => submitDelivery(p, run.id, input)).toThrow("alle acceptkrav");
    p = submitDelivery(p, run.id, {
      ...input,
      checks: runAcceptance(p, run).map((label, i) => ({
        id: `criterion-${i}`,
        label,
        passed: false,
        source: "manual" as const,
        evidence: "Teksten er uklar",
      })),
    });
    const delivery = p.deliveries[0]!;
    p = saveBrief(p, {
      ...latestBrief(p),
      acceptance: ["Et andet projektmål"],
    });
    const fixed = reviewDelivery(p, delivery.id, {
      decision: "changes_requested",
      reviewer: "Mig",
      comment: "Gør handlingen konkret",
      acknowledgedStale: false,
      checkedCriteria: [],
    });
    expect(fixed.tasks.at(-1)).toMatchObject({
      owner: "Sebastian",
      acceptance: runAcceptance(p, run),
      briefVersion: run.briefVersion,
      correctionOf: run.taskId,
    });
    expect(fixed.runs[0]!.taskSnapshot).toEqual(run.taskSnapshot);
    expect(fixed.deliveries[0]).toEqual(delivery);
    expect(assertProject(fixed)).toBe(fixed);
    const corrupted = structuredClone(fixed);
    corrupted.deliveries[0]!.checks = [];
    expect(() => assertProject(corrupted)).toThrow("acceptkrav");
  });
  it("reads legacy runs against their original brief without manufacturing a newer task snapshot", () => {
    const p = createSample().projects[0]!,
      run = p.runs[0]!;
    expect(run.taskSnapshot).toBeUndefined();
    expect(runAcceptance(p, run)).toEqual(p.briefVersions[0]!.acceptance);
    expect(assertProject(p)).toBe(p);
  });
  it("preserves exact admitted text when locking an imported older task", () => {
    const p = ready();
    p.tasks[0]!.owner = " Sebastian ";
    p.tasks[0]!.acceptance = ["  Første linje\nAnden linje  "];
    const next = beginManualRun(p, p.tasks[0]!.id, "verbatim");
    expect(next.runs[0]!.taskSnapshot!.owner).toBe(p.tasks[0]!.owner);
    expect(next.runs[0]!.taskSnapshot!.acceptance).toEqual(
      p.tasks[0]!.acceptance,
    );
  });
});
