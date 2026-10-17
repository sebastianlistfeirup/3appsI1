import { describe, expect, it } from "vitest";
import {
  addTask,
  assertProject,
  assertProjectUpdate,
  beginManualRun,
  briefDraftFields,
  briefDraftIssue,
  createProject,
  latestBrief,
  projectSchema,
  publishBriefDraft,
  saveBrief,
  saveBriefDraft,
} from "./model";
import { exportProject, importProject } from "./archive";
import {
  validateProjectDocument,
  projectDocument,
  validateProjectDocumentUpdate,
} from "./cloud-document";
const fields = {
  goal: "Bevar min ufærdige bestilling. Æble · 東京 🌱",
  audience: "Et lille studio",
  constraints: "Bevar gamle filer.\nIngen ekstern udførelse.",
  criteria: "Mobilvisning kan læses\n\nVersionen kan hentes",
};
describe("brief drafts before a committed immutable version", () => {
  it("roundtrips an incomplete draft without changing the brief, tasks, runs or activity", async () => {
    let p = saveBrief(createProject("Min bestilling"), {
      goal: "Det eksisterende mål",
      audience: "",
      constraints: "",
      acceptance: ["Krav"],
    });
    p = addTask(p, "Igangværende opgave");
    p = beginManualRun(p, p.tasks[0]!.id, "existing-run");
    const draft = saveBriefDraft(p, latestBrief(p).id, {
      ...fields,
      goal: "",
      criteria: "Ufærdigt",
    });
    const restored = await importProject(await exportProject(draft));
    expect(restored.briefDraft).toMatchObject({
      goal: "",
      criteria: "Ufærdigt",
      baseBriefId: latestBrief(p).id,
    });
    for (const key of ["briefVersions", "tasks", "runs", "activity"] as const)
      expect(draft[key]).toEqual(p[key]);
    expect(projectSchema.parse(p).briefDraft).toBeUndefined();
    expect(() => assertProjectUpdate(p, draft)).not.toThrow();
    expect(validateProjectDocument(projectDocument(draft)).briefDraft).toEqual(
      draft.briefDraft,
    );
  });
  it("requires a known base, bounded draft fields and an editable project", () => {
    const p = createProject("Kladde");
    expect(() => saveBriefDraft(p, "unknown", fields)).toThrow(
      "kendt briefversion",
    );
    expect(() =>
      saveBriefDraft(
        { ...p, archivedAt: new Date().toISOString() },
        latestBrief(p).id,
        fields,
      ),
    ).toThrow("arkiveret");
    expect(() =>
      saveBriefDraft(p, latestBrief(p).id, {
        ...fields,
        criteria: "x".repeat(32001),
      }),
    ).toThrow();
    expect(() =>
      assertProject({
        ...p,
        briefDraft: {
          ...fields,
          baseBriefId: "absent",
          updatedAt: new Date().toISOString(),
        },
      }),
    ).toThrow("kendt briefversion");
  });
  it("keeps invalid acceptance text verbatim and rejects publication without silently trimming criteria", () => {
    const p = createProject("For mange krav"),
      base = latestBrief(p).id;
    for (const criteria of [
      "",
      Array.from({ length: 31 }, (_, i) => `Krav ${i}`).join("\n"),
      "x".repeat(1001),
    ]) {
      const draft = saveBriefDraft(p, base, { ...fields, criteria });
      expect(draft.briefDraft!.criteria).toBe(criteria);
      expect(briefDraftIssue(draft.briefDraft!)).toBeTruthy();
      expect(() => publishBriefDraft(draft, base, draft.briefDraft!)).toThrow();
    }
  });
  it("publishes exactly one new brief, removes the draft atomically and preserves historical snapshots", () => {
    const original = createProject("Ny retning"),
      base = latestBrief(original).id;
    const draft = saveBriefDraft(original, base, fields),
      published = publishBriefDraft(draft, base, fields);
    expect(published.briefDraft).toBeUndefined();
    expect(published.briefVersions).toHaveLength(2);
    expect(published.briefVersions[0]).toEqual(original.briefVersions[0]);
    expect(latestBrief(published).acceptance).toEqual([
      "Mobilvisning kan læses",
      "Versionen kan hentes",
    ]);
    expect(published.activity).toHaveLength(1);
    expect(() => assertProjectUpdate(draft, published)).not.toThrow();
    expect(() =>
      assertProjectUpdate(draft, { ...draft, briefDraft: undefined }),
    ).toThrow("ny briefversion");
    expect(() =>
      validateProjectDocumentUpdate(
        projectDocument(draft),
        projectDocument(published),
      ),
    ).not.toThrow();
    expect(briefDraftFields(latestBrief(published)).criteria).toBe(
      "Mobilvisning kan læses\nVersionen kan hentes",
    );
  });
  it("keeps a draft based on an older brief and requires a fresh explicit acknowledgment", () => {
    const p = createProject("Ældre kladde"),
      base = latestBrief(p).id;
    const draft = saveBriefDraft(p, base, fields),
      changed = saveBrief(draft, {
        goal: "En nyere beslutning",
        audience: "",
        constraints: "",
        acceptance: ["Nyt krav"],
      });
    expect(changed.briefDraft!.baseBriefId).toBe(base);
    expect(() => publishBriefDraft(changed, base, fields)).toThrow(
      "nyere bestilling",
    );
    const published = publishBriefDraft(changed, base, fields, true);
    expect(published.briefVersions).toHaveLength(3);
    expect(published.briefVersions[1]!.goal).toBe("En nyere beslutning");
    expect(published.briefDraft).toBeUndefined();
  });
});
