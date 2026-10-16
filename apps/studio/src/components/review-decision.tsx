"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudOff,
  LoaderCircle,
  MessageSquare,
  Upload,
} from "lucide-react";
import { downloadFile, type SaveState } from "@tre/persistence";
import { z } from "zod";
import Link from "./local-link";
import {
  idSchema,
  isStale,
  latestBrief,
  latestReview,
  reviewDelivery,
  reviewDraftFieldsSchema,
  saveReviewDraft,
  type ReviewDraftFields,
} from "../lib/model";
import { Notice, formatDate } from "./primitives";
import type { ProjectActions } from "./studio-app";
const transferSchema = z
  .object({
    app: z.literal("studio-review-draft"),
    schemaVersion: z.literal(1),
    projectId: idSchema,
    deliveryId: idSchema,
    outputVersionIds: z.array(idSchema).min(1).max(100),
    fields: reviewDraftFieldsSchema.strict(),
  })
  .strict();
const fieldsOf = (value: ReviewDraftFields) =>
  reviewDraftFieldsSchema.parse(value);
const empty = (): ReviewDraftFields => ({ comment: "", checkedCriteria: [] });

export function ReviewDecision({
  project,
  deliveryId,
  update,
  notify,
  storage,
}: ProjectActions & { deliveryId: string; storage: { saveState: SaveState } }) {
  const delivery = project.deliveries.find((item) => item.id === deliveryId)!;
  const commentId = useId();
  const review = latestReview(project, deliveryId);
  const stored = project.reviewDrafts?.find(
    (item) => item.deliveryId === deliveryId,
  );
  const [fields, setFields] = useState<ReviewDraftFields>(() =>
    stored ? fieldsOf(stored) : empty(),
  );
  const [ack, setAck] = useState(false),
    [draftError, setDraftError] = useState(false),
    [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    submitted = useRef(false),
    reloading = useRef(false);
  const hasDraft =
    Boolean(stored) ||
    fields.comment.length > 0 ||
    fields.checkedCriteria.length > 0;
  const dirty =
    hasDraft &&
    JSON.stringify(fieldsOf(fields)) !==
      JSON.stringify(stored ? fieldsOf(stored) : empty());
  const writable =
    !review && !project.archivedAt && storage.saveState !== "loading";
  const stale = isStale(project, delivery);
  // A stale acceptance is never restored from disk or carried across newer inputs.
  const inputContext = JSON.stringify([
    latestBrief(project).id,
    project.artifacts.map((item) => item.id),
  ]);
  useEffect(() => setAck(false), [inputContext]);
  const latest = useRef({ update, fields, dirty, writable, deliveryId });
  latest.current = { update, fields, dirty, writable, deliveryId };
  function commitDraft(showError = true) {
    const current = latest.current;
    if (!current.dirty || !current.writable || submitted.current) return true;
    const accepted = current.update((p) =>
      saveReviewDraft(p, current.deliveryId, current.fields),
    );
    if (showError) setDraftError(!accepted);
    return accepted;
  }
  useEffect(() => {
    if (!dirty || !writable || importing || draftError) return;
    const timer = setTimeout(() => commitDraft(), 450);
    return () => clearTimeout(timer);
  }, [fields, dirty, writable, importing, draftError]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty && !submitted.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      commitDraft(false);
    };
  }, []);
  useEffect(() => {
    if (storage.saveState === "loading") reloading.current = true;
    else if (reloading.current && storage.saveState === "saved") {
      reloading.current = false;
      setFields(stored ? fieldsOf(stored) : empty());
      setAck(false);
      setDraftError(false);
    }
  }, [storage.saveState, stored]);
  function edit<K extends keyof ReviewDraftFields>(
    key: K,
    value: ReviewDraftFields[K],
  ) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setDraftError(false);
  }
  const saved = !dirty && storage.saveState === "saved" && !draftError;
  const failed =
    draftError || ["error", "conflict"].includes(storage.saveState);
  const canAccept =
    fields.comment.trim() &&
    delivery.checks.every(
      (check) => check.passed && fields.checkedCriteria.includes(check.id),
    ) &&
    (!stale || ack);
  function decide(decision: "accepted" | "changes_requested") {
    submitted.current = true;
    const accepted = update((p) =>
      reviewDelivery(p, deliveryId, {
        decision,
        reviewer: "Mig",
        comment: fields.comment.trim(),
        checkedCriteria: fields.checkedCriteria,
        acknowledgedStale: ack,
      }),
    );
    if (!accepted) {
      submitted.current = false;
      return;
    }
    notify(
      decision === "accepted"
        ? "Leverancen er accepteret. Dit review og alle filversioner er bevaret."
        : "En ny rettelsesopgave er oprettet med din kommentar.",
    );
  }
  function exportDraft() {
    downloadFile(
      `reviewkladde-${deliveryId}.json`,
      JSON.stringify(
        {
          app: "studio-review-draft",
          schemaVersion: 1,
          projectId: project.id,
          deliveryId,
          outputVersionIds: delivery.outputVersionIds,
          fields,
        },
        null,
        2,
      ),
    );
    notify(
      "Din vurdering og afkrydsninger er hentet som kladde. Det er ikke et afleveret review.",
    );
  }
  async function importDraft(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 100_000)
        throw new Error("Reviewkladden må højst fylde 100 KB.");
      const imported = transferSchema.parse(JSON.parse(await file.text()));
      if (
        imported.projectId !== project.id ||
        imported.deliveryId !== deliveryId ||
        JSON.stringify(imported.outputVersionIds) !==
          JSON.stringify(delivery.outputVersionIds)
      )
        throw new Error(
          "Kladden tilhører et andet projekt eller en anden leverance. Åbn den tilhørende projektpakke.",
        );
      // Domain validation checks every criterion and rejects duplicates/failed checks.
      saveReviewDraft(project, deliveryId, imported.fields);
      setFields(imported.fields);
      setAck(false);
      setDraftError(false);
      notify(
        "Reviewkladden er indlæst. Aflever først, når du er færdig med din gennemgang.",
      );
    } catch (error) {
      notify(
        error instanceof z.ZodError
          ? "Filen er ikke en gyldig reviewkladde."
          : error instanceof Error
            ? error.message
            : "Kladden kunne ikke indlæses.",
        true,
      );
    } finally {
      setImporting(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section
      className="review-checklist"
      onBlurCapture={(event) => {
        // Moving between fields must not flush a possible storage-error banner
        // between pointer-down and pointer-up, which can move the clicked target.
        if (
          event.relatedTarget &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        if (!importing) commitDraft();
      }}
    >
      <div className="inspector-heading">
        <div className="review-symbol">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <h2>
            {review
              ? storage.saveState === "saved"
                ? "Dit review er gemt."
                : "Dit review venter på lagring."
              : "Klar til dit blik."}
          </h2>
          <p>
            {review
              ? "Resultatet og historien er bevaret."
              : "Tag stilling til det færdige arbejde."}
          </p>
        </div>
      </div>
      <div className="inspector-divider" />
      <span className="small-label">
        ACCEPTKRAV{" "}
        <span>
          {review
            ? review.checkedCriteria.length
            : fields.checkedCriteria.length}
          /{delivery.checks.length}
        </span>
      </span>
      <div className="checklist-items">
        {delivery.checks.map((check) => (
          <div key={check.id} className={!check.passed ? "check-failed" : ""}>
            <label>
              <input
                type="checkbox"
                checked={
                  review
                    ? review.checkedCriteria.includes(check.id)
                    : fields.checkedCriteria.includes(check.id)
                }
                disabled={!writable || !check.passed || importing}
                onChange={(event) =>
                  edit(
                    "checkedCriteria",
                    event.target.checked
                      ? [...fields.checkedCriteria, check.id]
                      : fields.checkedCriteria.filter((id) => id !== check.id),
                  )
                }
              />
              <span>{check.label}</span>
            </label>
            {!check.passed && (
              <small>Kontrolpunkt fejlede · kræver rettelse</small>
            )}
            <details>
              <summary>Se grundlag</summary>
              <p>{check.evidence}</p>
            </details>
          </div>
        ))}
      </div>
      {review ? (
        <div
          className={`review-decision ${review.decision === "accepted" ? "accepted" : "requested"}`}
        >
          <CheckCircle2 size={22} />
          <strong>
            {review.decision === "accepted"
              ? "Accepteret af dig"
              : "Rettelse ønsket"}
          </strong>
          <p>{review.comment}</p>
          <small>{formatDate(review.createdAt)}</small>
          {review.decision === "changes_requested" && (
            <Link href={`/projects/${project.id}/tasks`}>
              Se rettelsesopgaven <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="inspector-divider" />
          <div className="review-comment">
            <label htmlFor={commentId}>DIN VURDERING</label>
            <textarea
              id={commentId}
              value={fields.comment}
              onChange={(event) => edit("comment", event.target.value)}
              rows={4}
              maxLength={5000}
              disabled={!writable || importing}
              placeholder="Hvad har du gennemgået? Er noget stadig usikkert?"
            />
          </div>
          <div className="review-draft-status" role="status" aria-live="polite">
            {failed ? (
              <CloudOff size={15} />
            ) : saved ? (
              <Check size={15} />
            ) : (
              <LoaderCircle size={15} />
            )}
            <span>
              {!hasDraft
                ? "Din kladde gemmes, når du begynder."
                : failed
                  ? "Kladde bevaret her · ikke gemt"
                  : saved
                    ? "Reviewkladde gemt lokalt"
                    : "Gemmer reviewkladde…"}
            </span>
          </div>
          <div className="review-draft-tools">
            <button
              className="text-button"
              onClick={exportDraft}
              disabled={!hasDraft}
            >
              <ArrowDownToLine size={14} />
              Hent reviewkladde
            </button>
            {writable && (
              <button
                className="text-button"
                disabled={importing}
                onClick={() => input.current?.click()}
              >
                <Upload size={14} />
                Indlæs kladde
              </button>
            )}
            {draftError && (
              <button className="text-button" onClick={() => commitDraft()}>
                Prøv at gemme igen
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Indlæs reviewkladde"
              onChange={(event) => void importDraft(event.target.files?.[0])}
            />
          </div>
          {failed && (
            <p className="review-draft-warning">
              Hent kladden eller hele projektet, før du forlader siden.
              Lagringen er ikke bekræftet.
            </p>
          )}
          {project.archivedAt ? (
            <Notice>
              Projektet er arkiveret. Din kladde er bevaret; gendan projektet
              før et endeligt review.
            </Notice>
          ) : (
            <>
              {stale && (
                <label className="checkbox-row stale-confirm">
                  <input
                    type="checkbox"
                    checked={ack}
                    disabled={!writable || importing}
                    onChange={(event) => setAck(event.target.checked)}
                  />
                  <span>
                    Jeg accepterer eksplicit leverancen med dens ældre input.
                  </span>
                </label>
              )}
              <button
                className="button primary accept-button"
                disabled={!writable || !canAccept || importing}
                onClick={() => decide("accepted")}
              >
                <Check size={17} />
                Acceptér leverance
              </button>
              <button
                className="button secondary request-button"
                disabled={!writable || !fields.comment.trim() || importing}
                onClick={() => decide("changes_requested")}
              >
                <MessageSquare size={16} />
                Bed om en rettelse
              </button>
            </>
          )}
          <p className="review-hint">
            {!fields.comment.trim()
              ? "Gennemgå kravene og tilføj din vurdering."
              : "Kladden er ikke et review. Din beslutning knyttes til denne præcise version."}
          </p>
        </>
      )}
    </section>
  );
}
