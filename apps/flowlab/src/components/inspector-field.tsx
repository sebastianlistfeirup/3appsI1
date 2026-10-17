"use client";
import { useEffect, useId, useState, type ReactNode } from "react";

/** One edit per field, with no intermediate empty/invalid values reaching the model. */
export default function InspectorField<T extends string | number>({
  label,
  accessibleLabel,
  value,
  format = String,
  parse,
  onApply,
  inputMode = "text",
  before,
  after,
  wide = false,
}: {
  label: string;
  accessibleLabel?: string;
  value: T;
  format?: (value: T) => string;
  parse: (text: string) => T;
  onApply: (value: T) => void;
  inputMode?: "text" | "decimal" | "numeric";
  before?: ReactNode;
  after?: ReactNode;
  wide?: boolean;
}) {
  const helpId = useId();
  const formatted = format(value);
  const [draft, setDraft] = useState({
    source: value,
    sourceText: formatted,
    text: formatted,
    notice: "",
  });
  const current = draft.source === value && draft.sourceText === formatted;
  if (!current)
    setDraft({
      source: value,
      sourceText: formatted,
      text: formatted,
      notice: "",
    });
  const text = current ? draft.text : formatted;
  const dirty = text !== formatted;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  let prepared: T | undefined,
    error = "";
  if (dirty) {
    try {
      prepared = parse(text);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Kontrollér feltet.";
    }
  }
  const apply = (onBlur: boolean) => {
    if (!dirty) return;
    if (prepared === undefined) {
      setDraft({
        source: value,
        sourceText: formatted,
        text: onBlur ? formatted : text,
        notice: onBlur
          ? `Ikke anvendt. ${error} Den tidligere modelværdi er bevaret.`
          : error,
      });
      return;
    }
    setDraft({
      source: prepared,
      sourceText: format(prepared),
      text: format(prepared),
      notice: "",
    });
    if (prepared !== value) onApply(prepared);
  };
  const message =
    draft.notice ||
    (dirty
      ? error
        ? `Kladde: ${error}`
        : "Kladde · Enter eller forlad feltet for at anvende. Escape annullerer."
      : "");
  return (
    <div
      className={`inspector-draft-field ${wide ? "inspector-field-wide" : ""}`}
    >
      <label htmlFor={`${helpId}-input`}>{label}</label>
      <span className={before || after ? "stepper" : "inspector-field-control"}>
        {before}
        <input
          id={`${helpId}-input`}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          aria-label={accessibleLabel ?? label}
          value={text}
          maxLength={101}
          aria-invalid={dirty && !!error}
          aria-describedby={message ? helpId : undefined}
          onChange={(event) =>
            setDraft({
              source: value,
              sourceText: formatted,
              text: event.target.value,
              notice: "",
            })
          }
          onBlur={() => apply(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply(false);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft({
                source: value,
                sourceText: formatted,
                text: formatted,
                notice: "",
              });
            }
          }}
        />
        {after}
      </span>
      {message && (
        <span
          id={helpId}
          className={`inspector-field-feedback ${error || draft.notice ? "error-text" : ""}`}
          role={draft.notice ? "alert" : undefined}
        >
          {message}
        </span>
      )}
    </div>
  );
}
