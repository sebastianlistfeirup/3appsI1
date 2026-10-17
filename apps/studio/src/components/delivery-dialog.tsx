"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CloudOff,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { downloadFile, type SaveState } from "@tre/persistence";
import { z } from "zod";
import {
  addArtifact,
  beginManualRun,
  deliveryDraftFieldsSchema,
  latestBrief,
  runAcceptance,
  saveDeliveryDraft,
  submitDelivery,
  textArtifact,
  uid,
  type DeliveryDraftFields,
} from "../lib/model";
import { taskSnapshotSchema } from "../lib/task-definition";
import { initialRunInputs } from "../lib/run-inputs";
import { inputSelectionIssue } from "../lib/input-selection";
import { RunInputPicker } from "./run-input-picker";
import { RunPackageButton } from "./run-package-button";
import { Badge, Modal, Notice } from "./primitives";
import type { ProjectActions } from "./studio-app";

export type DraftStorage = { saveState: SaveState };
const transferSchema = z
  .object({
    app: z.literal("studio-delivery-draft"),
    schemaVersion: z.literal(1),
    projectId: z.string().max(120),
    runId: z.string().max(120),
    fields: deliveryDraftFieldsSchema.strict(),
  })
  .strict();
function fieldsOf(draft: DeliveryDraftFields): DeliveryDraftFields {
  return deliveryDraftFieldsSchema.parse(draft);
}

export function DeliveryDialog({
  project,
  taskId,
  update,
  notify,
  onClose,
  storage,
  onEditTask,
}: ProjectActions & {
  taskId: string;
  onClose: () => void;
  storage: DraftStorage;
  onEditTask?: () => void;
}) {
  const task = project.tasks.find((t) => t.id === taskId)!;
  const existing = project.runs.find(
    (r) => r.taskId === taskId && r.state === "awaiting_upload",
  );
  const [runId, setRunId] = useState(existing?.id ?? "");
  const [requestId] = useState(() => uid("request"));
  const [inputVersionIds, setInputVersionIds] = useState(() =>
    initialRunInputs(project, task),
  );
  const [acknowledgedBrief, setAcknowledgedBrief] = useState<number>();
  const currentBrief = latestBrief(project);
  const olderBrief = task.briefVersion !== currentBrief.version;
  const definitionIssue = taskSnapshotSchema.safeParse(task).success
    ? undefined
    : "Opgaven skal have en ansvarlig og 1–30 forskellige, konkrete færdigkrav på højst 1.000 tegn.";
  useEffect(
    () => setAcknowledgedBrief(undefined),
    [currentBrief.version, task.briefVersion],
  );
  const [fields, setFields] = useState<DeliveryDraftFields>(() => {
    const draft = project.deliveryDrafts?.find(
      (item) => item.runId === existing?.id,
    );
    return draft
      ? fieldsOf(draft)
      : {
          title: task.title,
          summary: "",
          artifactId: "",
          content: "",
          name: "resultat.html",
          mode: "text",
          risk: false,
        };
  });
  const [busy, setBusy] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const draftInput = useRef<HTMLInputElement>(null);
  const storedDraft = project.deliveryDrafts?.find(
    (item) => item.runId === runId,
  );
  const dirty =
    Boolean(runId) &&
    (!storedDraft ||
      JSON.stringify(fieldsOf(fields)) !==
        JSON.stringify(fieldsOf(storedDraft)));
  const saved = !dirty && storage.saveState === "saved" && !draftError;
  const latest = useRef({ project, update, fields, runId, dirty });
  latest.current = { project, update, fields, runId, dirty };

  function commitDraft() {
    const current = latest.current;
    if (!current.runId || !current.dirty) return true;
    const accepted = current.update((p) =>
      saveDeliveryDraft(p, current.runId, current.fields),
    );
    setDraftError(!accepted);
    return accepted;
  }
  useEffect(() => {
    if (!runId || !dirty || busy) return;
    const timer = setTimeout(commitDraft, 450);
    return () => clearTimeout(timer);
  }, [fields, runId, busy, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function edit<K extends keyof DeliveryDraftFields>(
    key: K,
    value: DeliveryDraftFields[K],
  ) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setDraftError(false);
  }
  function close() {
    if (!busy && commitDraft()) onClose();
  }
  function exportDraft() {
    downloadFile(
      `afleveringskladde-${runId || taskId}.json`,
      JSON.stringify(
        {
          app: "studio-delivery-draft",
          schemaVersion: 1,
          projectId: project.id,
          runId,
          fields,
        },
        null,
        2,
      ),
    );
    notify("Kladden er hentet med tekst, filvalg og kendte fejl.");
  }
  async function importDraft(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2_000_000)
        throw new Error("Kladdefilen må højst fylde 2 MB.");
      const imported = transferSchema.parse(JSON.parse(await file.text()));
      if (
        imported.fields.artifactId &&
        (imported.projectId !== project.id ||
          !project.artifacts.some((a) => a.id === imported.fields.artifactId))
      )
        throw new Error(
          "Kladden henviser til en filversion i et andet projekt. Importér projektpakken for at bevare filen.",
        );
      setFields(imported.fields);
      setDraftError(false);
      notify(
        imported.runId === runId
          ? "Din kladde er indlæst."
          : "Kladdens indhold er indlæst i dette forløb. De aktuelle låste input er bevaret.",
      );
    } catch (error) {
      notify(
        error instanceof z.ZodError
          ? "Filen er ikke en gyldig Studio-afleveringskladde."
          : error instanceof Error
            ? error.message
            : "Kladden kunne ikke indlæses.",
        true,
      );
    } finally {
      if (draftInput.current) draftInput.current.value = "";
      setBusy(false);
    }
  }
  function start() {
    try {
      const next = beginManualRun(
        project,
        taskId,
        requestId,
        acknowledgedBrief,
        inputVersionIds,
      );
      const run = next.runs.find((r) => r.idempotencyKey === requestId)!;
      if (!update(() => saveDeliveryDraft(next, run.id, fields))) return;
      setRunId(run.id);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Leveringen kunne ikke startes.",
        true,
      );
    }
  }
  async function deliver() {
    setBusy(true);
    try {
      const artifact =
        fields.mode === "text"
          ? await textArtifact(
              project,
              fields.name,
              fields.content,
              "code",
              project.artifacts.find((a) => a.name === fields.name)?.artifactId,
            )
          : undefined;
      const accepted = latest.current.update((current) => {
        const next = artifact ? addArtifact(current, artifact) : current;
        const run = next.runs.find((r) => r.id === runId);
        if (!run) throw new Error("Leveringsforløbet findes ikke længere.");
        return submitDelivery(next, runId, {
          title: fields.title,
          summary: fields.summary,
          outputVersionIds: [artifact?.id ?? fields.artifactId],
          checks: runAcceptance(next, run).map((label, i) => ({
            id: `criterion-${i}`,
            label,
            passed: !fields.risk,
            source: "manual",
            evidence: fields.risk
              ? "Afleverer har markeret kendt fejl. Kræver rettelse."
              : "Manuel aflevering. Kræver brugerens gennemgang før accept.",
          })),
        });
      });
      if (!accepted) return;
      onClose();
      notify(
        "Leverancen er klar til review. Den er ikke automatisk verificeret.",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Leveringen fejlede.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        runId ? "Aflevér et konkret resultat" : "Lås input. Skab noget godt."
      }
      description={
        runId
          ? "Dit arbejde bliver en ny leverance. Tidligere versioner bliver bevaret."
          : `Opgave: ${task.title}`
      }
      onClose={close}
    >
      {!runId ? (
        <>
          <div className="input-snapshot">
            <span className="small-label">DIT INPUTSNAPSHOT</span>
            <h3>Bestilling v{task.briefVersion}</h3>
            <p>
              {task.owner} · opgaverevision {task.revision}
            </p>
            <p>
              {
                project.artifacts.filter(
                  (a) =>
                    !project.artifacts.some(
                      (b) =>
                        b.artifactId === a.artifactId && b.version > a.version,
                    ),
                ).length
              }{" "}
              tilgængelige filer · {inputVersionIds.length} valgt · 0 kr. i
              eksternt forbrug
            </p>
            <strong>Færdig betyder</strong>
            <ul className="locked-task-criteria">
              {task.acceptance.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
          <RunInputPicker
            project={project}
            selected={inputVersionIds}
            onChange={setInputVersionIds}
            correction={Boolean(task.correctionOf)}
          />
          {definitionIssue && (
            <Notice danger>
              {definitionIssue} Redigér opgaven, før du starter.
            </Notice>
          )}
          {olderBrief && (
            <div className="task-brief-warning">
              <Notice>
                Der findes en nyere bestilling, v{currentBrief.version}. Opgaven
                bruger fortsat v{task.briefVersion} og sine egne færdigkrav. Et
                resultat herfra opfylder ikke automatisk den nyere bestilling.
              </Notice>
              <label className="task-brief-ack">
                <input
                  type="checkbox"
                  checked={acknowledgedBrief === currentBrief.version}
                  onChange={(event) =>
                    setAcknowledgedBrief(
                      event.target.checked ? currentBrief.version : undefined,
                    )
                  }
                />
                Jeg vil arbejde på opgavens bestilling v{task.briefVersion},
                selv om v{currentBrief.version} findes.
              </label>
            </div>
          )}
          <Notice>
            Dette starter en manuel levering. Studio One udfører ikke kode eller
            AI-arbejde i denne profil.
          </Notice>
          <div className="modal-actions">
            {onEditTask && (
              <button className="button secondary" onClick={onEditTask}>
                Tilpas opgaven
              </button>
            )}
            <button
              className="button primary"
              onClick={start}
              disabled={
                Boolean(project.archivedAt) ||
                Boolean(definitionIssue) ||
                Boolean(inputSelectionIssue(project, inputVersionIds)) ||
                (olderBrief && acknowledgedBrief !== currentBrief.version)
              }
            >
              Lås input og fortsæt <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <form
          className="delivery-form"
          onSubmit={(event) => {
            event.preventDefault();
            void deliver();
          }}
        >
          <div className="draft-status" role="status" aria-live="polite">
            <span className={saved ? "draft-saved" : "draft-pending"}>
              {saved ? (
                <Check size={15} />
              ) : draftError ||
                ["error", "conflict"].includes(storage.saveState) ? (
                <CloudOff size={15} />
              ) : (
                <LoaderCircle size={15} />
              )}
              {saved
                ? "Kladde gemt lokalt"
                : draftError ||
                    ["error", "conflict"].includes(storage.saveState)
                  ? "Kladde ikke gemt · hent en kopi"
                  : "Gemmer kladde…"}
            </span>
            <Badge kind="purple">INPUT LÅST · MANUAL</Badge>
          </div>
          <p className="draft-help">
            Du kan lukke dialogen og fortsætte senere. Kladden følger med
            projektpakken.
          </p>
          <div className="run-package-help">
            <RunPackageButton project={project} runId={runId} notify={notify} />
            <p>
              Tag den låste aftale og de valgte input med til dine egne
              værktøjer. Aflevér resultatet her, når det er klar.
            </p>
          </div>
          {project.runs.find((run) => run.id === runId)?.taskSnapshot && (
            <details className="run-definition">
              <summary>Se opgavens låste færdigkrav</summary>
              <ul>
                {runAcceptance(
                  project,
                  project.runs.find((run) => run.id === runId)!,
                ).map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </details>
          )}
          <fieldset className="delivery-fields" disabled={busy}>
            <label>
              Leverancens titel
              <input
                value={fields.title}
                onChange={(e) => edit("title", e.target.value)}
                required
                maxLength={300}
              />
            </label>
            <label>
              Hvad er ændret?
              <textarea
                value={fields.summary}
                onChange={(e) => edit("summary", e.target.value)}
                required
                rows={2}
                maxLength={100000}
              />
            </label>
            <div className="segmented">
              <button
                type="button"
                aria-pressed={fields.mode === "text"}
                className={fields.mode === "text" ? "selected" : ""}
                onClick={() => edit("mode", "text")}
              >
                Ny tekst-/kodefil
              </button>
              <button
                type="button"
                aria-pressed={fields.mode === "existing"}
                className={fields.mode === "existing" ? "selected" : ""}
                onClick={() => edit("mode", "existing")}
              >
                Eksisterende fil
              </button>
            </div>
            {fields.mode === "text" ? (
              <>
                <label>
                  Filnavn
                  <input
                    value={fields.name}
                    onChange={(e) => edit("name", e.target.value)}
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  Filindhold
                  <textarea
                    className="code-input"
                    value={fields.content}
                    onChange={(e) => edit("content", e.target.value)}
                    required
                    rows={7}
                    maxLength={100000}
                  />
                </label>
              </>
            ) : (
              <label>
                Vælg outputversion
                <select
                  required
                  value={fields.artifactId}
                  onChange={(e) => edit("artifactId", e.target.value)}
                >
                  <option value="">Vælg fil</option>
                  {project.artifacts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · v{a.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={fields.risk}
                onChange={(e) => edit("risk", e.target.checked)}
              />
              <span>
                Der er en kendt fejl. Leverancen må ikke accepteres endnu.
              </span>
            </label>
          </fieldset>
          <div className="draft-tools">
            <button type="button" className="text-button" onClick={exportDraft}>
              <ArrowDownToLine size={15} /> Hent kladde
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => draftInput.current?.click()}
              disabled={busy}
            >
              <Upload size={15} /> Indlæs kladde
            </button>
            {draftError && (
              <button
                type="button"
                className="text-button"
                onClick={commitDraft}
              >
                Prøv at gemme igen
              </button>
            )}
            <input
              ref={draftInput}
              type="file"
              accept="application/json,.json"
              aria-label="Vælg afleveringskladde"
              hidden
              onChange={(e) => void importDraft(e.target.files?.[0])}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={busy}
            >
              Gem kladde og luk
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Gemmer…" : "Send til review"} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
