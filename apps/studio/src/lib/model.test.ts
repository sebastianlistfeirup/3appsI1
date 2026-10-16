import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addDependency,
  addTask,
  archiveProject,
  assertProject,
  beginManualRun,
  changeProject,
  createProject,
  isStale,
  latestBrief,
  reviewDelivery,
  saveBrief,
  submitDelivery,
  textArtifact,
  validateStudio,
} from "./model";
import { createSample } from "./sample";
import { exportProject, importProject } from "./archive";
import { strToU8, unzipSync, zipSync } from "fflate";

describe("Studio One versioned production", () => {
  it("validates the synthetic project and its immutable references", () => {
    const s = createSample();
    expect(validateStudio(s)).toEqual(s);
    expect(s.projects[0]!.artifacts).toHaveLength(4);
  });
  it("S-AT03 rejects cycles and cross-project references without changing original", () => {
    const p = createSample().projects[0]!;
    expect(() => addDependency(p, "task-polish", "task-design")).toThrow(
      "cirkel",
    );
    expect(p.edges).toHaveLength(2);
    expect(() => addDependency(p, "unknown", "task-menu")).toThrow(
      "samme projekt",
    );
  });
  it("S-AT02 deduplicates a manual run by request id", () => {
    const p = addTask(
      saveBrief(createProject("Test"), {
        goal: "Vis resultatet",
        audience: "Besøgende",
        constraints: "",
        acceptance: ["Resultatet kan åbnes"],
      }),
      "Implementér",
    );
    const a = beginManualRun(p, p.tasks[0]!.id, "request-1");
    const b = beginManualRun(a, p.tasks[0]!.id, "request-1");
    expect(b.runs).toHaveLength(1);
    expect(b.revision).toBe(a.revision);
    expect(b.runs[0]!.costMinor).toBe(0);
  });
  it("S-AT04 locks inputs, marks stale after new brief, requires explicit stale review", () => {
    const p = createSample().projects[0]!;
    const next = saveBrief(p, { ...latestBrief(p), goal: "Et nyt mål" });
    const delivery = next.deliveries[0]!;
    expect(isStale(next, delivery)).toBe(true);
    expect(next.runs[0]!.briefVersion).toBe(1);
    expect(() =>
      reviewDelivery(next, delivery.id, {
        decision: "accepted",
        reviewer: "Mig",
        comment: "Gennemgået",
        acknowledgedStale: false,
        checkedCriteria: delivery.checks.map((x) => x.id),
      }),
    ).toThrow("ældre input");
    expect(p.briefVersions).toHaveLength(1);
  });
  it("S-AT08 rejection preserves files, comments and original delivery and creates revision task", () => {
    const p = createSample().projects[0]!;
    const next = reviewDelivery(p, p.deliveries[0]!.id, {
      decision: "changes_requested",
      reviewer: "Mig",
      comment: "Gør questtitlen større",
      acknowledgedStale: false,
      checkedCriteria: [],
    });
    expect(next.deliveries).toEqual(p.deliveries);
    expect(next.artifacts).toEqual(p.artifacts);
    expect(next.tasks).toHaveLength(p.tasks.length + 1);
    expect(next.reviews[0]!.comment).toBe("Gør questtitlen større");
  });
  it("accepts only after explicit checklist review and preserves review immutability", () => {
    const p = createSample().projects[0]!;
    const d = p.deliveries[0]!;
    const input = {
      decision: "accepted" as const,
      reviewer: "Mig",
      comment: "Gennemgået i preview",
      acknowledgedStale: false,
      checkedCriteria: d.checks.map((x) => x.id),
    };
    expect(() =>
      reviewDelivery(p, d.id, { ...input, checkedCriteria: [] }),
    ).toThrow("acceptkrav");
    const next = reviewDelivery(p, d.id, input);
    expect(next.tasks.find((t) => t.id === "task-menu")!.state).toBe("done");
    expect(() => reviewDelivery(next, d.id, input)).toThrow("allerede");
    expect(() =>
      reviewDelivery(p, d.id, { ...input, reviewer: "manual" }),
    ).toThrow("sig selv");
  });
  it("S-AT11 failed evidence never permits acceptance", () => {
    const p = createSample().projects[0]!;
    p.deliveries[0]!.checks[0]!.passed = false;
    expect(() =>
      reviewDelivery(p, p.deliveries[0]!.id, {
        decision: "accepted",
        reviewer: "Mig",
        comment: "Ser fint ud",
        acknowledgedStale: false,
        checkedCriteria: p.deliveries[0]!.checks.map((c) => c.id),
      }),
    ).toThrow("fejlede");
  });
  it("S-AT09 ZIP roundtrip verifies all hashes and version relationships", async () => {
    const p = createSample().projects[0]!;
    const zip = await exportProject(p);
    expect(await importProject(zip)).toEqual(p);
    const files = unzipSync(zip);
    files["versions/menu-v2.bin"] = strToU8("changed");
    await expect(importProject(zipSync(files))).rejects.toThrow(
      "Filintegritet",
    );
  });
  it("rejects traversal archives and schema mismatch", async () => {
    await expect(
      importProject(zipSync({ "../outside": strToU8("bad") })),
    ).rejects.toThrow("usikker");
    expect(() =>
      validateStudio({ ...createSample(), schemaVersion: 2 }),
    ).toThrow();
  });
  it("adds new file versions without replacing accepted artifacts", async () => {
    const p = createSample().projects[0]!;
    const artifact = await textArtifact(
      p,
      "quest-menu.html",
      "<h1>Version 3</h1>",
      "code",
      "menu",
    );
    const next = addArtifact(p, artifact);
    expect(artifact.version).toBe(3);
    expect(next.artifacts.slice(0, 4)).toEqual(p.artifacts);
    expect(() => addArtifact(next, artifact)).toThrow("overskrives");
  });
  it("rejects detached deliveries and missing mutable project targets", () => {
    const p = createSample().projects[0]!;
    expect(() => changeProject(createSample(), "missing", (x) => x)).toThrow(
      "findes ikke",
    );
    expect(() =>
      submitDelivery(p, "missing", {
        title: "No output",
        summary: "",
        outputVersionIds: [],
        checks: [],
      }),
    ).toThrow("modtage");
  });
});

describe("Studio recovery and immutable review boundaries", () => {
  function ready() {
    return addTask(
      saveBrief(createProject("Arbejde"), {
        goal: "Vis et resultat",
        audience: "Mig",
        constraints: "",
        acceptance: ["Resultatet kan læses"],
      }),
      "Lav resultat",
    );
  }
  it("archives and cancels pending work, preserves versions and permits an explicit restore", () => {
    const p = ready(),
      running = beginManualRun(p, p.tasks[0]!.id, "archive-run");
    const archived = archiveProject(running);
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.runs[0]!.state).toBe("cancelled");
    expect(archived.briefVersions).toEqual(running.briefVersions);
    expect(() => addTask(archived, "Et uventet nyt job")).toThrow("arkiveret");
    expect(() => beginManualRun(archived, p.tasks[0]!.id, "new-run")).toThrow(
      "arkiveret",
    );
    const restored = archiveProject(archived);
    expect(restored.archivedAt).toBeNull();
    expect(
      beginManualRun(restored, p.tasks[0]!.id, "new-run").runs,
    ).toHaveLength(2);
  });
  it("rejects a conflicting request key and two active deliveries for one task", () => {
    const p = addTask(ready(), "En anden opgave"),
      running = beginManualRun(p, p.tasks[0]!.id, "same-request");
    expect(() =>
      beginManualRun(running, p.tasks[1]!.id, "same-request"),
    ).toThrow("anden opgave");
    expect(() =>
      beginManualRun(running, p.tasks[0]!.id, "other-request"),
    ).toThrow("aktiv levering");
  });
  it("requires evidence for every locked acceptance criterion", async () => {
    const p = ready();
    const running = beginManualRun(p, p.tasks[0]!.id, "checks-run");
    const artifact = await textArtifact(
      running,
      "resultat.txt",
      "Hej",
      "document",
    );
    const next = addArtifact(running, artifact);
    expect(() =>
      submitDelivery(next, next.runs[0]!.id, {
        title: "Et resultat",
        summary: "",
        outputVersionIds: [artifact.id],
        checks: [],
      }),
    ).toThrow("alle acceptkrav");
    const imported = createSample().projects[0]!;
    imported.deliveries[0]!.checks = [];
    expect(() => assertProject(imported)).toThrow("acceptkrav");
  });
  it("rejects mutation of historic versions and stale asynchronous editor writes", () => {
    const state = createSample(),
      p = state.projects[0]!;
    expect(() =>
      changeProject(state, p.id, (next) => {
        next.artifacts[0]!.content = "changed";
        return next;
      }),
    ).toThrow("Historiske");
    expect(() =>
      changeProject(state, p.id, (next) => {
        next.briefVersions[0]!.goal = "rewritten";
        return next;
      }),
    ).toThrow("Historiske");
    expect(() =>
      changeProject(
        state,
        p.id,
        (next) => addTask(next, "Sen ændring"),
        p.revision - 1,
      ),
    ).toThrow("ændret");
    expect(state.projects[0]).toEqual(p);
  });
  it("rejects IDs that can escape an exported path or application route", () => {
    const state = createSample();
    state.projects[0]!.id = "../other-project";
    expect(() => validateStudio(state)).toThrow("Ugyldigt id");
  });
});

describe("Run snapshot history", () => {
  it("rejects changing locked inputs even when the replacement brief exists", () => {
    const state = createSample(),
      project = state.projects[0]!;
    const updated = saveBrief(project, {
      ...latestBrief(project),
      goal: "Nyt brief",
    });
    state.projects[0] = updated;
    expect(() =>
      changeProject(state, project.id, (p) => ({
        ...p,
        runs: p.runs.map((r) => ({ ...r, briefVersion: 2 })),
      })),
    ).toThrow("låste input");
    expect(() =>
      changeProject(state, project.id, (p) => ({
        ...p,
        runs: p.runs.map((r) => ({ ...r, inputVersionIds: [] })),
      })),
    ).toThrow("låste input");
  });
  it("preserves terminal runs and their completion timestamp after review", () => {
    const state = createSample(),
      p = state.projects[0]!,
      d = p.deliveries[0]!;
    const accepted = reviewDelivery(p, d.id, {
      decision: "accepted",
      reviewer: "Mig",
      comment: "Godkendt",
      acknowledgedStale: false,
      checkedCriteria: d.checks.map((c) => c.id),
    });
    state.projects[0] = accepted;
    expect(() =>
      changeProject(state, p.id, (value) => ({
        ...value,
        runs: value.runs.map((r) => ({ ...r, state: "review" as const })),
      })),
    ).toThrow("genåbnes");
    expect(() =>
      changeProject(state, p.id, (value) => ({
        ...value,
        runs: value.runs.map((r) => ({
          ...r,
          completedAt: "2026-10-16T21:00:00.000Z",
        })),
      })),
    ).toThrow("færdigtidspunkt");
  });
});
