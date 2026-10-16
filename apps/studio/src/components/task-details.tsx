"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Pause, Pencil, Play } from "lucide-react";
import { editTask, setTaskState } from "../lib/model";
import { Badge, Modal, Notice } from "./primitives";
import type { ProjectActions } from "./studio-app";

export function TaskDetails({
  project,
  taskId,
  update,
  notify,
  onClose,
  onDeliver,
  onChooseTask,
}: ProjectActions & {
  taskId: string;
  onClose: () => void;
  onDeliver: (taskId: string) => void;
  onChooseTask: (taskId: string) => void;
}) {
  const task = project.tasks.find((candidate) => candidate.id === taskId)!;
  const [mode, setMode] = useState<"view" | "edit" | "block">("view");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [reason, setReason] = useState(task.blockedReason ?? "");
  const [editingRevision, setEditingRevision] = useState(task.revision);
  const active = project.runs.find(
    (run) =>
      run.taskId === task.id &&
      ["awaiting_upload", "review"].includes(run.state),
  );
  const review =
    active &&
    project.deliveries.find((delivery) => delivery.runId === active.id);
  const dependencies = project.edges
    .filter((edge) => edge.to === task.id)
    .map((edge) =>
      project.tasks.find((candidate) => candidate.id === edge.from)!,
    );
  const waiting = dependencies.filter(
    (dependency) => dependency.state !== "done",
  );
  const canEdit =
    !active && !task.replacedBy && ["ready", "blocked"].includes(task.state);
  const label = task.replacedBy
    ? "Erstattet · historik bevaret"
    : {
        ready: "Klar",
        in_progress: "I gang",
        review: "Til review",
        done: "Afsluttet",
        blocked: "Blokeret",
      }[task.state];
  return (
    <Modal
      title={
        mode === "edit"
          ? "Gør opgaven tydelig"
          : mode === "block"
            ? "Hvad holder arbejdet tilbage?"
            : task.title
      }
      description={
        mode === "block"
          ? "Det allerede låste arbejde og dets input bliver bevaret."
          : `Brief v${task.briefVersion} · revision ${task.revision} · ${task.owner}`
      }
      onClose={onClose}
    >
      {mode === "edit" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !update((value) =>
                editTask(value, task.id, title, description, editingRevision),
              )
            )
              return;
            setMode("view");
            notify("Opgavens beskrivelse er opdateret.");
          }}
        >
          <label>
            Opgavetitel
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={300}
              required
            />
          </label>
          <label>
            Opgavebeskrivelse
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={10000}
              rows={5}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setMode("view")}
            >
              Fortryd redigering
            </button>
            <button className="button primary" disabled={!title.trim()}>
              <Check size={15} />
              Gem opgave
            </button>
          </div>
        </form>
      ) : mode === "block" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !update((value) =>
                setTaskState(value, task.id, "blocked", reason),
              )
            )
              return;
            setMode("view");
            notify(
              "Opgaven er blokeret. Fjern blokeringen, når årsagen er afklaret.",
            );
          }}
        >
          <label>
            Årsag til blokering
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Fx afventer tekst eller en afklaring af designet"
              maxLength={2000}
              rows={4}
              required
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setMode("view")}
            >
              Tilbage til opgaven
            </button>
            <button className="button primary" disabled={!reason.trim()}>
              <Pause size={15} />
              Gem blokering
            </button>
          </div>
        </form>
      ) : (
        <div className="task-detail-content">
          <Badge
            kind={
              task.state === "done"
                ? "success"
                : task.state === "blocked"
                  ? "warning"
                  : "purple"
            }
          >
            {label}
          </Badge>
          <p className="preserve-lines">
            {task.description || "Ingen beskrivelse endnu."}
          </p>
          {task.correctionOf && (
            <div className="task-relation">
              <span>Denne opgave retter et tidligere resultat.</span>
              <button
                className="text-button"
                onClick={() => onChooseTask(task.correctionOf!)}
              >
                Se oprindelig opgave <ArrowRight size={13} />
              </button>
            </div>
          )}
          {task.replacedBy ? (
            <Notice>
              En rettelsesopgave fører arbejdet videre. Efterfølgende opgaver
              venter på dens godkendte leverance.
              <button
                className="text-button"
                onClick={() => onChooseTask(task.replacedBy!)}
              >
                Åbn rettelsesopgaven <ArrowRight size={13} />
              </button>
            </Notice>
          ) : (
            task.state === "blocked" && (
              <Notice>
                {task.blockedReason ||
                  "Årsagen blev ikke angivet i denne tidligere version."}
              </Notice>
            )
          )}
          {task.acceptance.length > 0 && (
            <section className="task-detail-section">
              <h3>Acceptkrav · brief v{task.briefVersion}</h3>
              <ul>
                {task.acceptance.map((criterion, i) => (
                  <li key={i}>{criterion}</li>
                ))}
              </ul>
            </section>
          )}
          {dependencies.length > 0 && (
            <section className="task-detail-section">
              <h3>Skal være færdigt først</h3>
              <div className="task-prerequisites">
                {dependencies.map((dependency) => (
                  <button
                    key={dependency.id}
                    onClick={() => onChooseTask(dependency.id)}
                  >
                    <span>{dependency.title}</span>
                    <small>
                      {dependency.state === "done" ? "Afsluttet" : "Afventer"}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}
          {active && (
            <p className="task-lock-note">
              {active.state === "review"
                ? "Leverancen er klar til din vurdering."
                : `En manuel levering er allerede startet på brief v${active.briefVersion}. Genoptag det samme forløb, når du har filen klar.`}
            </p>
          )}
          {review && (
            <Link
              className="button primary"
              href={`/projects/${project.id}/review/${review.id}`}
              onClick={onClose}
            >
              Se denne leverance <ArrowRight size={15} />
            </Link>
          )}
          {!task.replacedBy && task.state !== "done" && (
            <div className="modal-actions task-detail-actions">
              {canEdit && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setTitle(task.title);
                    setDescription(task.description);
                    setEditingRevision(task.revision);
                    setMode("edit");
                  }}
                >
                  <Pencil size={14} />
                  Redigér opgave
                </button>
              )}
              {task.state === "blocked" ? (
                <button
                  className="button primary"
                  onClick={() => {
                    if (
                      !update((value) => setTaskState(value, task.id, "ready"))
                    )
                      return;
                    notify(
                      active
                        ? "Det eksisterende leveringsforløb er genoptaget med de samme input."
                        : "Blokeringen er fjernet.",
                    );
                  }}
                >
                  <Play size={14} />
                  Fjern blokering
                </button>
              ) : (
                active?.state !== "review" && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setReason("");
                        setMode("block");
                      }}
                    >
                      <Pause size={14} />
                      Markér blokeret
                    </button>
                    {waiting.length === 0 && (
                      <button
                        className="button primary"
                        onClick={() => onDeliver(task.id)}
                      >
                        {active ? "Fortsæt levering" : "Opret manuel levering"}
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          )}
          {waiting.length > 0 && !task.replacedBy && (
            <p className="task-lock-note">
              {waiting.length}{" "}
              {waiting.length === 1
                ? "forudsætning mangler"
                : "forudsætninger mangler"}{" "}
              stadig en accepteret leverance.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
