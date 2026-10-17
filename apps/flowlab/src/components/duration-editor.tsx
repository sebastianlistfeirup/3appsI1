"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, X } from "lucide-react";
import type { Distribution } from "@tre/flow-engine";
import { formatNumber } from "../lib/document";
import { formatCaseTime } from "../lib/time-profile";
import {
  changeDurationUnit,
  durationDraft,
  durationFields,
  DURATION_FIELD_LABELS,
  DURATION_UNIT_LABELS,
  expectedDuration,
  parseDurationDraft,
  type DurationUnit,
} from "../lib/duration-editor";

export default function DurationEditor({
  duration,
  label,
  variant,
  kind,
  onApply,
  onClose,
}: {
  duration: Distribution;
  label: string;
  variant: string;
  kind: "activity" | "wait";
  onApply: (duration: Distribution) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => durationDraft(duration));
  const [unitError, setUnitError] = useState("");
  const prepared = useMemo(() => {
    try {
      return { ...parseDurationDraft(draft), error: "" };
    } catch (error) {
      return {
        duration: null,
        rounded: [],
        error:
          error instanceof Error ? error.message : "Kontrollér varigheden.",
      };
    }
  }, [draft]);
  const changed = prepared.duration
    ? JSON.stringify(prepared.duration) !== JSON.stringify(duration)
    : true;
  useEffect(() => {
    const element = dialog.current,
      trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="arrival-dialog duration-dialog"
      aria-labelledby="duration-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (prepared.duration && changed) onApply(prepared.duration);
        }}
      >
        <div className="arrival-dialog-heading">
          <div>
            <span className="eyebrow">
              {variant} ·{" "}
              {kind === "activity" ? "AKTIVT ARBEJDE" : "PLANLAGT VENT"}
            </span>
            <h2 id="duration-title">Tid med en tydelig antagelse</h2>
            <p>
              {label}. Ændringer anvendes samlet, når du vælger Anvend varighed.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Luk varighedsredigering"
          >
            <X size={20} />
          </button>
        </div>
        <div className="duration-editor-selects">
          <label>
            Varighedsfordeling
            <select
              value={draft.type}
              onChange={(event) => {
                setUnitError("");
                setDraft({
                  ...draft,
                  type: event.target.value as Distribution["type"],
                });
              }}
            >
              <option value="fixed">Fast varighed</option>
              <option value="triangular">Trekantet fordeling</option>
              <option value="exponential">Eksponentiel fordeling</option>
            </select>
          </label>
          <label>
            Tidsenhed
            <select
              value={draft.unit}
              onChange={(event) => {
                try {
                  setDraft(
                    changeDurationUnit(
                      draft,
                      event.target.value as DurationUnit,
                    ),
                  );
                  setUnitError("");
                } catch {
                  setUnitError(
                    "Ret først varigheden, så enhedsskiftet kan bevare den præcise tid.",
                  );
                }
              }}
            >
              {Object.entries(DURATION_UNIT_LABELS).map(([unit, name]) => (
                <option key={unit} value={unit}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="field-hint duration-meaning">
          {draft.type === "fixed"
            ? "Hvert besøg bruger præcis den angivne tid."
            : draft.type === "triangular"
              ? "Tiden trækkes mellem minimum og maksimum. Typisk er fordelingens top, ikke dens gennemsnit."
              : "Tiden trækkes eksponentielt med dette gennemsnit. Fordelingen har ingen fast øvre grænse; lange besøg kan forekomme."}{" "}
          {kind === "wait"
            ? "Planlagt vent optager ingen ressource."
            : "En aktivitet bruger én enhed fra sin ressourcepulje. Kalenderpauser forlænger det samlede forløb uden at ændre den trukne arbejdstid."}
        </p>
        <div
          className={`duration-editor-fields ${draft.type === "triangular" ? "three" : ""}`}
        >
          {durationFields(draft.type).map((field) => (
            <label key={field}>
              {DURATION_FIELD_LABELS[field]} ({DURATION_UNIT_LABELS[draft.unit]}
              )
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft[field]}
                maxLength={100}
                aria-invalid={!!prepared.error}
                aria-describedby={
                  prepared.error ? "duration-error" : "duration-resolution"
                }
                onChange={(event) => {
                  setUnitError("");
                  setDraft({ ...draft, [field]: event.target.value });
                }}
              />
            </label>
          ))}
        </div>
        <p id="duration-resolution" className="field-hint">
          Mindst 1 ms og højst 365 døgn. Komma og punktum accepteres som
          decimaltegn. Tider afrundes til nærmeste hele millisekund; et halvt
          millisekund rundes op.
        </p>
        {(prepared.error || unitError) && (
          <p
            id="duration-error"
            className="notice-text error-text"
            role="alert"
          >
            {unitError || prepared.error} Modellen er endnu ikke ændret.
          </p>
        )}
        {prepared.duration && (
          <div className="duration-preview">
            <span className="duration-preview-icon">
              <Clock3 size={23} />
            </span>
            <div>
              <span className="eyebrow">TEORETISK GENNEMSNIT</span>
              <strong>
                {formatCaseTime(expectedDuration(prepared.duration))}
              </strong>
              <p>
                {formatNumber(expectedDuration(prepared.duration), 3)} ms · fra
                fordelingen før trækning og afrunding
              </p>
            </div>
            {prepared.duration.type === "triangular" && (
              <dl>
                <div>
                  <dt>Minimum</dt>
                  <dd>{formatNumber(prepared.duration.min)} ms</dd>
                </div>
                <div>
                  <dt>Typisk</dt>
                  <dd>{formatNumber(prepared.duration.mode)} ms</dd>
                </div>
                <div>
                  <dt>Maksimum</dt>
                  <dd>{formatNumber(prepared.duration.max)} ms</dd>
                </div>
              </dl>
            )}
          </div>
        )}
        {!!prepared.rounded.length && (
          <p className="field-hint">
            Afrundet til hele millisekunder:{" "}
            {prepared.rounded.join(", ").toLowerCase()}. Forhåndsvisningen og
            modellen bruger de afrundede tider.
          </p>
        )}
        <div className="arrival-dialog-footer">
          <p className="field-hint">
            Luk eller Annuller bevarer den gældende model. En anvendt ændring
            kan fortrydes i modelværkstedet.
          </p>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Annuller
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!prepared.duration || !changed}
            >
              Anvend varighed
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
