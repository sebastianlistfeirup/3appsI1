"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, Pencil, Plus, Trash2, X } from "lucide-react";
import type { FlowModel } from "@tre/flow-engine";
import { formatCaseTime } from "../lib/time-profile";
import {
  ARRIVAL_UNIT_LABELS,
  arrivalDraft,
  arrivalWindowCounts,
  checkArrivals,
  emptyArrivalDraft,
  parseArrivalDraft,
  putArrival,
  type ArrivalTimeUnit,
  type Arrivals,
} from "../lib/arrival-editor";

const PAGE_SIZE = 20;
export default function ArrivalEditor({
  model,
  variant,
  onApply,
  onClose,
}: {
  model: FlowModel;
  variant: string;
  onApply: (arrivals: Arrivals) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [original] = useState(() => JSON.stringify(model.arrivals));
  const [mode, setMode] = useState(model.arrivals.type),
    [manual, setManual] = useState(
      model.arrivals.type === "explicit" ? model.arrivals.cases : [],
    ),
    [poisson, setPoisson] = useState(
      model.arrivals.type === "poisson"
        ? {
            interval: String(model.arrivals.meanInterval),
            maxCases: String(model.arrivals.maxCases),
            backlog: String(model.arrivals.initialBacklog),
          }
        : {
            interval: String(Math.max(1, Math.round(model.horizon / 100))),
            maxCases: "1000",
            backlog: "0",
          },
    ),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [draft, setDraft] = useState(emptyArrivalDraft),
    [editingId, setEditingId] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  const nextArrivals = useMemo<Arrivals>(
    () =>
      mode === "explicit"
        ? { type: "explicit", cases: manual }
        : {
            type: "poisson",
            meanInterval: Number(poisson.interval),
            maxCases: Number(poisson.maxCases),
            initialBacklog: Number(poisson.backlog),
          },
    [mode, manual, poisson],
  );
  const dirty = useMemo(
      () => JSON.stringify(nextArrivals) !== original,
      [nextArrivals, original],
    ),
    counts = useMemo(
      () => arrivalWindowCounts(manual, model.horizon, model.observationStart),
      [manual, model.horizon, model.observationStart],
    ),
    filtered = useMemo(() => {
      const search = query.trim().toLocaleLowerCase("da-DK");
      return search
        ? manual.filter((item) =>
            `${item.id} ${item.caseType}`
              .toLocaleLowerCase("da-DK")
              .includes(search),
          )
        : manual;
    }, [manual, query]),
    pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1),
    shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE),
    previous =
      editingId === null ? null : manual.find((item) => item.id === editingId),
    pendingRow =
      JSON.stringify(draft) !==
      JSON.stringify(previous ? arrivalDraft(previous) : emptyArrivalDraft());
  const clearRow = () => {
    setDraft(emptyArrivalDraft());
    setEditingId(null);
    setError("");
  };
  return (
    <dialog
      ref={dialog}
      className="arrival-dialog"
      aria-labelledby="arrival-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="arrival-dialog-heading">
        <div>
          <span className="eyebrow">ANKOMSTER · {variant.toUpperCase()}</span>
          <h2 id="arrival-editor-title">Hvilke sager kommer ind?</h2>
          <p>
            Justér modelantagelserne. Anvend ændringerne samlet, når listen er
            klar.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Luk ankomstredigering"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <label className="arrival-mode">
        Ankomstmetode
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as typeof mode);
            setError("");
          }}
        >
          <option value="poisson">Tilfældige ankomster (Poisson)</option>
          <option value="explicit">Manuel ankomstliste</option>
        </select>
      </label>
      {mode !== model.arrivals.type && (
        <p className="notice-text">
          Du skifter ankomstmetode. Den nuværende metode erstattes først, når du
          vælger Anvend ankomster. Fortryd kan bagefter gendanne den.
        </p>
      )}
      {mode === "poisson" ? (
        <div className="arrival-poisson">
          <p className="field-hint">
            Tidsrummet mellem nye sager trækkes eksponentielt. Alle får
            sagstypen standard. Startkøen ankommer ved tid nul.
          </p>
          <div className="arrival-poisson-fields">
            {(
              [
                [
                  "interval",
                  "Gennemsnitligt ankomstinterval (ms)",
                  1,
                  31536000000,
                ],
                ["maxCases", "Loft for nye sager", 1, 100000],
                ["backlog", "Startkø (sager)", 0, 10000],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={poisson[key]}
                  onChange={(event) => {
                    setPoisson({ ...poisson, [key]: event.target.value });
                    setError("");
                  }}
                />
              </label>
            ))}
          </div>
          <p className="field-hint">
            Nye sagers loft og startkø må tilsammen højst være 100.000. Brug en
            manuel liste, når tidspunkter eller sagstyper skal være bestemte.
          </p>
        </div>
      ) : (
        <>
          <div className="arrival-counts">
            <Clock3 size={18} />
            <span>
              <b>{manual.length.toLocaleString("da-DK")} sager</b> ·{" "}
              {counts.inPeriod.toLocaleString("da-DK")} ankommer før stop ved{" "}
              {formatCaseTime(model.horizon)}.{" "}
              {counts.outside.toLocaleString("da-DK")} ved eller efter stop.
            </span>
          </div>
          <p className="field-hint">
            Sager ved eller efter stop er bevaret i listen, men ankommer ikke i
            denne simulering. {counts.beforeMeasurement.toLocaleString("da-DK")}{" "}
            ankommer før målestart. Det er afslutningstidspunktet, der afgør
            målevinduets throughput.
          </p>
          {manual.length > 0 && (
            <label>
              Find ankomst
              <input
                type="search"
                maxLength={100}
                value={query}
                placeholder="Sags-id eller sagstype"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          <div
            className="arrival-list"
            role={shown.length ? "list" : undefined}
            aria-label="Manuelle ankomster"
            tabIndex={0}
          >
            {shown.map((arrival) => (
              <div
                key={arrival.id}
                role="listitem"
                className={`arrival-list-row ${editingId === arrival.id ? "selected" : ""}`}
              >
                <div>
                  <strong>{arrival.id}</strong>
                  <span>
                    {formatCaseTime(arrival.time)} · {arrival.caseType}
                    {arrival.time >= model.horizon
                      ? " · uden for perioden"
                      : ""}
                  </span>
                </div>
                <div className="arrival-row-actions">
                  <button
                    className="icon-button"
                    disabled={pendingRow}
                    aria-label={`Rediger sag ${arrival.id}`}
                    onClick={() => {
                      setEditingId(arrival.id);
                      setDraft(arrivalDraft(arrival));
                      setError("");
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Fjern sag ${arrival.id}`}
                    onClick={() => {
                      setManual(
                        manual.filter((item) => item.id !== arrival.id),
                      );
                      if (editingId === arrival.id) clearRow();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {!shown.length && (
              <p className="empty-state compact">
                {manual.length
                  ? "Ingen ankomster matcher søgningen."
                  : "Listen er tom. Tilføj den første sag nedenfor. En tom liste giver ingen ankomster."}
              </p>
            )}
          </div>
          <div className="arrival-pagination">
            <span>
              {filtered.length.toLocaleString("da-DK")} match · højst{" "}
              {PAGE_SIZE} pr. side
            </span>
            {pages > 1 && (
              <div>
                <button
                  className="button subtle"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                  aria-label="Forrige ankomster"
                >
                  Forrige
                </button>
                <label>
                  Side
                  <input
                    type="number"
                    min={1}
                    max={pages}
                    step={1}
                    value={current + 1}
                    aria-label="Side med ankomster"
                    onChange={(event) =>
                      setPage(
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
                  onClick={() => setPage(current + 1)}
                  aria-label="Næste ankomster"
                >
                  Næste
                </button>
              </div>
            )}
          </div>
          <div className="arrival-case-form">
            <h3>
              {editingId === null ? "Tilføj en sag" : "Rediger den valgte sag"}
            </h3>
            <div className="arrival-case-fields">
              <label>
                Sags-id
                <input
                  maxLength={100}
                  value={draft.id}
                  placeholder="syntetisk-001"
                  onChange={(event) => {
                    setDraft({ ...draft, id: event.target.value });
                    setError("");
                  }}
                />
              </label>
              <label>
                Sagstype
                <input
                  maxLength={100}
                  value={draft.caseType}
                  onChange={(event) => {
                    setDraft({ ...draft, caseType: event.target.value });
                    setError("");
                  }}
                />
              </label>
              <label>
                Ankomsttid
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft.time}
                  onChange={(event) => {
                    setDraft({ ...draft, time: event.target.value });
                    setError("");
                  }}
                />
              </label>
              <label>
                Tidsenhed
                <select
                  value={draft.unit}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      unit: event.target.value as ArrivalTimeUnit,
                    });
                    setError("");
                  }}
                >
                  {Object.entries(ARRIVAL_UNIT_LABELS).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-hint">
              Tid regnes fra simulationsstart og afrundes til nærmeste
              millisekund. Id’er skal være unikke; ændret id ændrer også sagens
              tilfældighedsstrøm. Sagstype bruges af eksplicitte routingregler.
            </p>
            <div className="arrival-case-actions">
              <button
                className="button secondary"
                onClick={() => {
                  try {
                    const arrival = parseArrivalDraft(draft);
                    setManual(
                      putArrival(manual, arrival, editingId ?? undefined),
                    );
                    setQuery("");
                    setPage(
                      editingId === null
                        ? Math.floor(manual.length / PAGE_SIZE)
                        : current,
                    );
                    clearRow();
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Sagen kunne ikke ændres.",
                    );
                  }
                }}
              >
                {editingId === null ? <Plus size={16} /> : <Check size={16} />}
                {editingId === null
                  ? "Føj sag til kladden"
                  : "Opdatér sag i kladden"}
              </button>
              {(editingId !== null || pendingRow) && (
                <button className="button subtle" onClick={clearRow}>
                  Annuller sagsfelter
                </button>
              )}
            </div>
            {pendingRow && (
              <p className="field-hint" role="status">
                Sagsfelterne er endnu ikke føjet til kladden. Opdatér/tilføj
                sagen, eller annullér felterne før du anvender listen.
              </p>
            )}
          </div>
        </>
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
            : "Ingen ændringer i ankomsterne endnu."}
        </p>
        <div>
          <button className="button secondary" onClick={onClose}>
            Luk uden at anvende
          </button>
          <button
            className="button primary"
            disabled={!dirty || (mode === "explicit" && pendingRow)}
            onClick={() => {
              try {
                if (
                  mode === "poisson" &&
                  Object.values(poisson).some((value) => !value.trim())
                )
                  throw new Error(
                    "Udfyld alle tre felter for Poisson-ankomster.",
                  );
                onApply(checkArrivals(nextArrivals));
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Ankomsterne kunne ikke anvendes.",
                );
              }
            }}
          >
            Anvend ankomster
          </button>
        </div>
      </div>
    </dialog>
  );
}
