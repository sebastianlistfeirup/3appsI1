import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addTask,
  assertProject,
  assertProjectUpdate,
  beginManualRun,
  cancelRun,
  changeProject,
  createProject,
  deliveryDraftFieldsSchema,
  projectSchema,
  saveBrief,
  saveDeliveryDraft,
  setTaskState,
  submitDelivery,
  textArtifact,
  type DeliveryDraftFields,
} from "./model";
import { exportProject, importProject } from "./archive";

const fields: DeliveryDraftFields = {
  title: "Et ufærdigt resultat",
  summary: "Bevar også forklaringen.\nOg næste linje.",
  mode: "text",
  artifactId: "",
  name: "hjaelp.html",
  content: "\uFEFF<h1>Æble · 東京 🌱</h1>\r\n",
  risk: true,
};
function fixture() {
  const project = addTask(
    saveBrief(createProject("Kladder"), {
      goal: "En tydelig hjælp",
      audience: "Besøgende",
      constraints: "",
      acceptance: ["Læsbar hjælp"],
    }),
    "Skriv hjælpen",
  );
  return beginManualRun(project, project.tasks[0]!.id, "draft-request");
}
describe("durable manual delivery drafts", () => {
  it("roundtrips incomplete fields and exact text through ZIP without changing locked inputs", async () => {
    const original = fixture();
    const run = structuredClone(original.runs[0]!);
    const project = saveDeliveryDraft(original, run.id, {
      ...fields,
      title: "",
    });
    const restored = await importProject(await exportProject(project));
    expect(
      deliveryDraftFieldsSchema.parse(restored.deliveryDrafts![0]),
    ).toEqual({ ...fields, title: "" });
    expect(restored.runs[0]).toEqual(run);
    expect(original.deliveryDrafts).toBeUndefined();
    expect(project.revision).toBe(original.revision + 1);
    expect(project.activity).toEqual(original.activity);
    expect(projectSchema.parse(original).deliveryDrafts).toBeUndefined();
    expect(() => assertProjectUpdate(original, project)).not.toThrow();
  });
  it("preserves the paused and cancelled draft, then rejects rewrites of cancelled history", () => {
    const initial = fixture(),
      runId = initial.runs[0]!.id;
    const draft = saveDeliveryDraft(initial, runId, fields);
    const paused = setTaskState(
      draft,
      draft.tasks[0]!.id,
      "blocked",
      "Afventer tekst",
    );
    const cancelled = cancelRun(paused, runId);
    expect(cancelled.deliveryDrafts).toEqual(draft.deliveryDrafts);
    expect(() => assertProject(cancelled)).not.toThrow();
    expect(() => saveDeliveryDraft(cancelled, runId, fields)).toThrow(
      "afventende",
    );
    const overwritten = structuredClone(cancelled);
    overwritten.deliveryDrafts![0]!.content = "changed";
    expect(() => assertProjectUpdate(cancelled, overwritten)).toThrow(
      "annulleret",
    );
    expect(() =>
      assertProjectUpdate(cancelled, { ...cancelled, deliveryDrafts: [] }),
    ).toThrow("annulleret");
    const withoutDraft = cancelRun(initial, runId);
    expect(() => assertProjectUpdate(withoutDraft, cancelled)).toThrow(
      "afsluttet",
    );
  });
  it("removes the working draft only as part of a valid immutable delivery", async () => {
    const initial = fixture(),
      runId = initial.runs[0]!.id;
    const draft = saveDeliveryDraft(initial, runId, fields);
    const artifact = await textArtifact(draft, fields.name, fields.content);
    const withFile = addArtifact(draft, artifact);
    const input = {
      title: fields.title,
      summary: fields.summary,
      outputVersionIds: [artifact.id],
      checks: [
        {
          id: "c-1",
          label: "Læsbar hjælp",
          passed: false,
          source: "manual" as const,
          evidence: "Kendt fejl",
        },
      ],
    };
    expect(() => submitDelivery(draft, runId, input)).toThrow("Outputfilen");
    expect(draft.deliveryDrafts![0]!.content).toBe(fields.content);
    const delivered = submitDelivery(withFile, runId, input);
    expect(delivered.deliveryDrafts).toEqual([]);
    expect(delivered.artifacts[0]!.content).toBe(fields.content);
    expect(() => assertProjectUpdate(draft, delivered)).not.toThrow();
    expect(() => saveDeliveryDraft(delivered, runId, fields)).toThrow(
      "afventende",
    );
    expect(() =>
      assertProjectUpdate(draft, { ...draft, deliveryDrafts: [] }),
    ).toThrow("først fjernes");
  });
  it("enforces references, uniqueness, bounded metadata and project revision conflicts", () => {
    const initial = fixture(),
      runId = initial.runs[0]!.id;
    expect(() =>
      saveDeliveryDraft(initial, runId, { ...fields, artifactId: "missing" }),
    ).toThrow("filversion");
    expect(() => saveDeliveryDraft(initial, "missing", fields)).toThrow(
      "afventende",
    );
    expect(() =>
      saveDeliveryDraft(initial, runId, {
        ...fields,
        content: "x".repeat(100001),
      }),
    ).toThrow();
    const project = saveDeliveryDraft(initial, runId, fields);
    expect(() =>
      assertProject({
        ...project,
        deliveryDrafts: [
          ...project.deliveryDrafts!,
          ...project.deliveryDrafts!,
        ],
      }),
    ).toThrow("én afleveringskladde");
    const oversized = { ...project, description: "x".repeat(4_000_000) };
    expect(() => saveDeliveryDraft(oversized, runId, fields)).toThrow("4 MB");
    const state = {
      schemaVersion: 1 as const,
      workspace: {
        id: "workspace",
        name: "Demo",
        mode: "MANUAL" as const,
        budgetLimitMinor: 0 as const,
      },
      projects: [project],
    };
    expect(() =>
      changeProject(
        state,
        project.id,
        (p) => saveDeliveryDraft(p, runId, fields),
        initial.revision,
      ),
    ).toThrow("ændret");
    expect(state.projects[0]!.deliveryDrafts![0]!.content).toBe(fields.content);
  });
});
