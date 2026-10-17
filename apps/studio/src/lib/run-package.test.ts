import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  addArtifact,
  addTask,
  assertProjectUpdate,
  beginManualRun,
  cancelRun,
  createProject,
  editTask,
  latestBrief,
  reviewDelivery,
  saveBrief,
  sha256,
  textArtifact,
} from "./model";
import { createSample } from "./sample";
import { initialRunInputs } from "./run-inputs";
import { exportRunPackage, runPackageInput } from "./run-package";

async function fixture() {
  let project = addTask(
    saveBrief(createProject("Mit arbejdsgrundlag"), {
      goal: "Skriv en nyttig hjælp",
      audience: "Spillere",
      constraints: "Ingen eksterne tjenester",
      acceptance: ["Teksten forklarer næste skridt"],
    }),
    "Skriv hjælp",
    "Brug det valgte grundlag.",
  );
  const first = await textArtifact(
    project,
    "hjælp.txt",
    "\uFEFFFørste original: æ, ø, å og 東京",
    "document",
  );
  project = addArtifact(project, first);
  const second = await textArtifact(
    project,
    "hjælp.txt",
    "Anden original",
    "document",
    first.artifactId,
  );
  project = addArtifact(project, second);
  const unrelated = await textArtifact(
    project,
    "andet.txt",
    "Ikke valgt",
    "document",
  );
  project = addArtifact(project, unrelated);
  return { project, first, second, unrelated, taskId: project.tasks[0]!.id };
}
describe("explicit input selection and portable locked work", () => {
  it("locks a chosen older version and rejects unknown, duplicate and mixed-family choices", async () => {
    const { project, first, second, taskId } = await fixture();
    const next = beginManualRun(project, taskId, "chosen", undefined, [
      first.id,
    ]);
    expect(next.runs[0]!.inputVersionIds).toEqual([first.id]);
    expect(() => assertProjectUpdate(project, next)).not.toThrow();
    for (const ids of [
      ["missing"],
      [first.id, first.id],
      [first.id, second.id],
    ])
      expect(() =>
        beginManualRun(project, taskId, "bad", undefined, ids),
      ).toThrow();
    expect(
      beginManualRun(project, taskId, "empty", undefined, []).runs[0]!
        .inputVersionIds,
    ).toEqual([]);
  });
  it("never silently truncates a default selection beyond 100 families", async () => {
    const { project, first, taskId } = await fixture();
    project.artifacts = Array.from({ length: 101 }, (_, i) => ({
      ...first,
      id: `version-${i}`,
      artifactId: `family-${i}`,
    }));
    expect(initialRunInputs(project, project.tasks[0]!)).toHaveLength(101);
    expect(() => beginManualRun(project, taskId, "too-many")).toThrow(
      "højst 100",
    );
    expect(
      beginManualRun(project, taskId, "limited", undefined, [
        project.artifacts[100]!.id,
      ]).runs[0]!.inputVersionIds,
    ).toEqual(["version-100"]);
  });
  it("starts corrections from original input plus reviewed output, never later unrelated versions", async () => {
    let p = createSample().projects[0]!;
    const later = await textArtifact(
      p,
      "menu.html",
      "Senere ukendt ændring",
      "code",
      p.artifacts.find((a) => a.id === "menu-v2")!.artifactId,
    );
    p = addArtifact(p, later);
    p = reviewDelivery(p, "delivery-sample", {
      decision: "changes_requested",
      reviewer: "Mig",
      comment: "Ret teksten",
      acknowledgedStale: false,
      checkedCriteria: [],
    });
    const correction = p.tasks.at(-1)!;
    expect(initialRunInputs(p, correction)).toEqual([
      "menu-v2",
      "design-v1",
      "notes-v1",
    ]);
    expect(
      beginManualRun(p, correction.id, "correct").runs.at(-1)!.inputVersionIds,
    ).not.toContain(later.id);
  });
  it("exports original UTF-8 bytes and hashes, exact history, and only the chosen input", async () => {
    const { project, first, taskId } = await fixture();
    let next = beginManualRun(project, taskId, "work", undefined, [first.id]);
    const locked = next.runs[0]!;
    next = cancelRun(next, locked.id);
    next = editTask(
      next,
      taskId,
      "En helt anden opgave",
      "Nyt indhold",
      next.tasks[0]!.revision,
      { owner: "Maja", acceptance: ["Et andet krav"] },
    );
    next = saveBrief(next, {
      ...latestBrief(next),
      goal: "Et helt nyt projektmål",
    });
    const files = unzipSync(
      await exportRunPackage(runPackageInput(next, locked.id)),
    );
    const context = JSON.parse(strFromU8(files["context.json"]!));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(context.taskDefinition).toEqual(locked.taskSnapshot);
    expect(context.brief.goal).toBe("Skriv en nyttig hjælp");
    expect(context.inputs).toHaveLength(1);
    expect(context.inputs[0]).not.toHaveProperty("content");
    expect(
      new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        files[context.inputs[0].path],
      ),
    ).toBe(first.content);
    expect(
      Object.keys(files).filter((name) => name.startsWith("inputs/")),
    ).toHaveLength(1);
    for (const item of manifest.entries) {
      expect(files[item.path]!.length).toBe(item.bytes);
      expect(await sha256(files[item.path]!)).toBe(item.sha256);
    }
    expect(strFromU8(files["aftale.md"]!)).not.toContain(
      "En helt anden opgave",
    );
  });
  it("rejects altered selected bytes, criteria and identity while excluding unrelated corrupted content", async () => {
    const { project, first, taskId, unrelated } = await fixture();
    const next = beginManualRun(project, taskId, "integrity", undefined, [
      first.id,
    ]);
    next.artifacts.find((file) => file.id === unrelated.id)!.content =
      "Unrelated damaged byte content";
    await expect(
      exportRunPackage(runPackageInput(next, next.runs[0]!.id)),
    ).resolves.toBeInstanceOf(Uint8Array);
    const data = runPackageInput(next, next.runs[0]!.id);
    await expect(
      exportRunPackage({
        ...data,
        artifacts: [{ ...first, content: "Changed" }],
      }),
    ).rejects.toThrow("Filintegritet");
    await expect(
      exportRunPackage({ ...data, artifacts: [{ ...first, id: "another" }] }),
    ).rejects.toThrow("låste input");
    await expect(
      exportRunPackage({ ...data, acceptance: ["A changed requirement"] }),
    ).rejects.toThrow("låste aftale");
  });
  it("keeps legacy context honest and gives every potentially colliding filename its own bounded safe path", async () => {
    const p = createSample().projects[0]!;
    const input = runPackageInput(p, "run-sample");
    input.artifacts = input.artifacts.map((file) => ({
      ...file,
      name: "../../CON:æ?file.txt",
    }));
    const files = unzipSync(await exportRunPackage(input));
    const context = JSON.parse(strFromU8(files["context.json"]!));
    expect(context.taskDefinition).toBeNull();
    expect(context.acceptance).toEqual(p.briefVersions[0]!.acceptance);
    expect(context.inputs[0].path).not.toBe(context.inputs[1].path);
    expect(
      context.inputs.every((file: { path: string }) =>
        /^inputs\/\d{3}-[^/]+$/.test(file.path),
      ),
    ).toBe(true);
  });
});
