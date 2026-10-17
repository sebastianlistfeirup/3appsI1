"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Plus, Trash2, UsersRound, X } from "lucide-react";
import type { FlowModel, ResourcePool } from "@tre/flow-engine";
import { formatMetric, formatNumber } from "../lib/document";
import { formatCaseTime } from "../lib/time-profile";
import {
  applyResourceDrafts,
  parseResourceDraft,
  removeResourceDraft,
  resourceDraft,
  ResourceDraftError,
  resourcePlan,
  resourceReferences,
  type ResourceDraft,
} from "../lib/resource-editor";

const PAGE_SIZE = 20;
const money = (value: number) =>
  value >= 1e9 ? formatMetric("cost", value) : `${formatNumber(value, 2)} kr.`;
export default function ResourceEditor({
  model,
  initialPoolId,
  variant,
  onApply,
  onClose,
}: {
  model: FlowModel;
  initialPoolId: string;
  variant: string;
  onApply: (resources: ResourcePool[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState(() =>
      model.resources.map(resourceDraft),
    ),
    [original] = useState(() =>
      JSON.stringify(model.resources.map(resourceDraft)),
    ),
    [selection, setSelection] = useState(
      initialPoolId || model.resources[0]?.id || "",
    ),
    [calendarPage, setCalendarPage] = useState(0),
    [error, setError] = useState("");
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
  const selected = drafts.find((draft) => draft.id === selection) ?? drafts[0],
    references = selected ? resourceReferences(model, selected.id) : [],
    dirty = useMemo(
      () => JSON.stringify(drafts) !== original,
      [drafts, original],
    ),
    prepared = useMemo(
      () =>
        drafts.map((draft) => {
          try {
            const pool = parseResourceDraft(draft);
            return {
              id: draft.id,
              plan: resourcePlan(pool, model.horizon, model.observationStart),
              error: "",
            };
          } catch (caught) {
            return {
              id: draft.id,
              plan: null,
              error:
                caught instanceof Error
                  ? caught.message
                  : "Kontrollér puljens felter.",
            };
          }
        }),
      [drafts, model.horizon, model.observationStart],
    ),
    selectedPreview = prepared.find((item) => item.id === selected?.id),
    totalCost = prepared.every((item) => item.plan)
      ? prepared.reduce((sum, item) => sum + item.plan!.salaryCost, 0)
      : null,
    unused = drafts.filter(
      (draft) => !resourceReferences(model, draft.id).length,
    ),
    pages = Math.max(
      1,
      Math.ceil((selected?.calendar.length ?? 0) / PAGE_SIZE),
    ),
    current = Math.min(calendarPage, pages - 1);
  const patch = (patch: Partial<ResourceDraft>) => {
    if (selected)
      setDrafts(
        drafts.map((draft) =>
          draft.id === selected.id ? { ...draft, ...patch } : draft,
        ),
      );
    setError("");
  };
  return (
    <dialog
      ref={dialog}
      className="arrival-dialog resource-dialog"
      aria-labelledby="resource-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="arrival-dialog-heading">
        <div>
          <span className="eyebrow">RESSOURCER · {variant.toUpperCase()}</span>
          <h2 id="resource-editor-title">Kapacitet med en tydelig pris</h2>
          <p>
            Lønomkostningen følger planlagt kapacitet i målevinduet, også når
            puljen står ledig.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Luk ressourcer"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="resource-overview">
        <div>
          <span>Planlagt lønkapacitet</span>
          <strong>
            {totalCost === null ? "Ret kladdens felter" : money(totalCost)}
          </strong>
          <small>
            Målevindue {formatCaseTime(model.observationStart)}–
            {formatCaseTime(model.horizon)}
          </small>
        </div>
        <div>
          <span>Uden tilknyttede trin</span>
          <strong>
            {unused.length} af {drafts.length}{" "}
            {drafts.length === 1 ? "pulje" : "puljer"}
          </strong>
          <small>Deres planlagte løn er med i beløbet.</small>
        </div>
      </div>
      <p className="field-hint">
        Beløbet beregnes fra kladdens arbejdstider, antal medarbejdere og
        timeløn. Faktisk optaget tid ændrer ikke lønkapaciteten. Variable
        aktivitetsomkostninger og fast automation opgøres særskilt.
      </p>
      <div className="resource-selector">
        <label>
          Vælg ressourcepulje
          <select
            disabled={!drafts.length}
            value={selected?.id ?? ""}
            onChange={(event) => {
              setSelection(event.target.value);
              setCalendarPage(0);
              setError("");
            }}
          >
            {!drafts.length && <option value="">Ingen puljer</option>}
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.label || "Unavngivet pulje"}
                {resourceReferences(model, draft.id).length
                  ? ""
                  : " · uden trin"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={drafts.length >= 50}
          onClick={() => {
            const id = crypto.randomUUID();
            setDrafts([
              ...drafts,
              {
                id,
                label: `Nyt team ${drafts.length + 1}`,
                capacity: "1",
                hourlyCost: "0",
                calendar: [],
              },
            ]);
            setSelection(id);
            setCalendarPage(0);
            setError("");
          }}
        >
          <Plus size={16} />
          Ny pulje
        </button>
      </div>
      {drafts.length >= 50 && (
        <p className="notice-text">
          Modellen har nået loftet på 50 puljer. Fjern en ubrugt pulje før du
          opretter en ny.
        </p>
      )}
      {selected ? (
        <div className="resource-detail">
          <div className="resource-fields">
            <label>
              Puljens navn
              <input
                maxLength={100}
                value={selected.label}
                onChange={(event) => patch({ label: event.target.value })}
              />
            </label>
            <label>
              Medarbejdere
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={selected.capacity}
                onChange={(event) => patch({ capacity: event.target.value })}
              />
            </label>
            <label>
              Timeløn pr. medarbejder (kr.)
              <input
                type="number"
                min={0}
                max={1000000}
                step="any"
                value={selected.hourlyCost}
                onChange={(event) => patch({ hourlyCost: event.target.value })}
              />
            </label>
          </div>
          <div className="resource-reference-note">
            <UsersRound size={17} />
            <div>
              {references.length ? (
                <>
                  <strong>{references.length} trin bruger puljen</strong>
                  <p>
                    {references
                      .slice(0, 6)
                      .map((node) => node.label)
                      .join(" · ")}
                    {references.length > 6
                      ? ` · og ${references.length - 6} flere`
                      : ""}
                  </p>
                  <p>
                    De deler kapaciteten. Puljen kan først fjernes, når disse
                    trin er knyttet til andre ressourcer.
                  </p>
                </>
              ) : (
                <>
                  <strong>Ingen trin bruger denne pulje</strong>
                  <p>
                    Den giver stadig en lønomkostning, hvis kapacitet og
                    planlagt tid er større end nul. Nye puljer tilknyttes i
                    aktivitetens indstillinger.
                  </p>
                </>
              )}
            </div>
          </div>
          {selectedPreview?.plan ? (
            <div className="resource-plan">
              <div>
                <span>Åben pr. medarbejder</span>
                <b>{formatCaseTime(selectedPreview.plan.openTime)}</b>
              </div>
              <div>
                <span>Reserveret medarbejdertid</span>
                <b>{formatCaseTime(selectedPreview.plan.capacityTime)}</b>
              </div>
              <div>
                <span>Planlagt løn for puljen</span>
                <b>{money(selectedPreview.plan.salaryCost)}</b>
              </div>
            </div>
          ) : (
            <p className="notice-text">{selectedPreview?.error}</p>
          )}
          <div className="resource-calendar-heading">
            <h3>
              <CalendarDays size={18} />
              Arbejdsplan
            </h3>
            <span>{selected.calendar.length} af 1.000 intervaller</span>
          </div>
          <p className="field-hint">
            Tom arbejdsplan betyder åben i hele simulationsperioden. Brug nul
            medarbejdere til en lukket pulje. Tiderne regnes fra
            simulationsstart i minutter og sorteres ved anvendelse. Arbejde
            sættes på pause uden for intervallerne og fortsætter ved næste
            åbning.
          </p>
          {!selected.calendar.length ? (
            <p className="notice-text">
              Åben i hele perioden. Kun overlap med målevinduet tæller i
              lønkapaciteten.
            </p>
          ) : (
            <div className="resource-calendar-list">
              {selected.calendar
                .slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
                .map((interval, offset) => {
                  const index = current * PAGE_SIZE + offset;
                  return (
                    <div className="resource-calendar-row" key={index}>
                      <span>{index + 1}</span>
                      <label>
                        Fra (minutter)
                        <input
                          aria-label={`Arbejdstid ${index + 1}, fra (minutter)`}
                          type="number"
                          min={0}
                          max={525600}
                          step="any"
                          value={interval.start}
                          onChange={(event) =>
                            patch({
                              calendar: selected.calendar.map(
                                (slot, slotIndex) =>
                                  slotIndex === index
                                    ? { ...slot, start: event.target.value }
                                    : slot,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Til (minutter)
                        <input
                          aria-label={`Arbejdstid ${index + 1}, til (minutter)`}
                          type="number"
                          min={0}
                          max={525600}
                          step="any"
                          value={interval.end}
                          onChange={(event) =>
                            patch({
                              calendar: selected.calendar.map(
                                (slot, slotIndex) =>
                                  slotIndex === index
                                    ? { ...slot, end: event.target.value }
                                    : slot,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        className="icon-button danger"
                        aria-label={`Fjern arbejdsinterval ${index + 1}`}
                        onClick={() =>
                          patch({
                            calendar: selected.calendar.filter(
                              (_, slotIndex) => slotIndex !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
          {pages > 1 && (
            <div className="arrival-pagination">
              <span>Højst {PAGE_SIZE} intervaller ad gangen</span>
              <div>
                <button
                  className="button subtle"
                  disabled={current === 0}
                  onClick={() => setCalendarPage(current - 1)}
                >
                  Forrige
                </button>
                <label>
                  Side
                  <input
                    aria-label="Side med arbejdsintervaller"
                    type="number"
                    min={1}
                    max={pages}
                    step={1}
                    value={current + 1}
                    onChange={(event) =>
                      setCalendarPage(
                        Math.max(
                          0,
                          Math.min(
                            pages - 1,
                            Math.round(Number(event.target.value)) - 1,
                          ),
                        ),
                      )
                    }
                  />
                  <span>af {pages}</span>
                </label>
                <button
                  className="button subtle"
                  disabled={current === pages - 1}
                  onClick={() => setCalendarPage(current + 1)}
                >
                  Næste
                </button>
              </div>
            </div>
          )}
          <div className="resource-calendar-actions">
            <button
              className="button secondary"
              disabled={selected.calendar.length >= 1000}
              onClick={() => {
                const raw = Number(selected.calendar.at(-1)?.end ?? 0),
                  start = Number.isFinite(raw) && raw >= 0 ? raw : 0,
                  end = Math.min(525600, start + 240);
                if (end <= start) {
                  setError(
                    "Der er ingen tid tilbage efter sidste interval inden for 365 døgn. Ret intervallet, før du tilføjer et nyt.",
                  );
                  return;
                }
                patch({
                  calendar: [
                    ...selected.calendar,
                    { start: String(start), end: String(end) },
                  ],
                });
                setCalendarPage(
                  Math.floor(selected.calendar.length / PAGE_SIZE),
                );
              }}
            >
              <Plus size={16} />
              Tilføj arbejdsinterval
            </button>
            {selected.calendar.length > 0 && (
              <button
                className="button subtle"
                onClick={() => {
                  patch({ calendar: [] });
                  setCalendarPage(0);
                }}
              >
                Nulstil til åben hele perioden
              </button>
            )}
          </div>
          <button
            className="text-button danger resource-remove"
            disabled={references.length > 0}
            onClick={() => {
              try {
                const next = removeResourceDraft(drafts, selected.id, model);
                setDrafts(next);
                setSelection(next[0]?.id ?? "");
                setCalendarPage(0);
                setError("");
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Puljen kunne ikke fjernes.",
                );
              }
            }}
          >
            <Trash2 size={16} />
            Fjern denne pulje fra kladden
          </button>
        </div>
      ) : (
        <p className="empty-state compact">
          Ingen ressourcepuljer i kladden. Opret en pulje, før den vælges på en
          aktivitet.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="arrival-dialog-footer">
        <p className="field-hint">
          {dirty
            ? "Kladden har ændringer. Modellen er endnu ikke opdateret."
            : "Ingen ændringer i ressourcerne endnu."}{" "}
          Fortryd kan gendanne en anvendt ændring.
        </p>
        <div>
          <button className="button secondary" onClick={onClose}>
            Luk uden at anvende
          </button>
          <button
            className="button primary"
            disabled={!dirty}
            onClick={() => {
              try {
                onApply(applyResourceDrafts(model, drafts));
              } catch (caught) {
                if (caught instanceof ResourceDraftError)
                  setSelection(caught.poolId);
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Ressourcerne kunne ikke anvendes.",
                );
              }
            }}
          >
            Anvend ressourcer
          </button>
        </div>
      </div>
    </dialog>
  );
}
