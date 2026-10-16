"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  Square,
  Waypoints,
} from "lucide-react";
import {
  ENGINE_VERSION,
  describeEngineCode,
  type CaseEvidence,
  type Comparison,
} from "@tre/flow-engine";
import { downloadFile } from "@tre/persistence";
import { formatNumber } from "../lib/document";
import {
  pairCases,
  caseStatus,
  eventLabels,
  eventVisit,
  formatTime,
  caseEvidenceMatches,
} from "../lib/case-analysis";

type EvidencePair = { baseline: CaseEvidence; scenario: CaseEvidence };
export default function CaseExplorer({
  comparison,
}: {
  comparison: Comparison;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [evidence, setEvidence] = useState<EvidencePair | null>(null),
    [variant, setVariant] = useState<"baseline" | "scenario">("baseline"),
    [running, setRunning] = useState(false),
    [error, setError] = useState("");
  const [eventPage, setEventPage] = useState(0);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setEvidence(null);
    setSelected(null);
    setRunning(false);
    setError("");
    setPage(0);
  }, [comparison]);
  const cases = useMemo(() => pairCases(comparison), [comparison]);
  const filtered = useMemo(
    () =>
      cases.filter((pair) => {
        const items = [pair.baseline, pair.scenario].filter(
          (item) => item !== null,
        );
        return (
          (!query ||
            `${pair.id} ${items.map((item) => item.caseType).join(" ")}`
              .toLocaleLowerCase("da-DK")
              .includes(query.toLocaleLowerCase("da-DK"))) &&
          (filter === "all" ||
            items.some((item) =>
              filter === "backlog"
                ? item.status !== "completed" && item.status !== "aborted"
                : item.status === filter,
            ))
        );
      }),
    [cases, query, filter],
  );
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 20) - 1),
    ),
    rows = filtered.slice(currentPage * 20, currentPage * 20 + 20),
    shown = evidence?.[variant];
  const inspect = (caseId: string) => {
    setEventPage(0);
    worker.current?.terminate();
    setEvidence(null);
    setSelected(caseId);
    setRunning(true);
    setError("");
    const w = new Worker(new URL("../workers/case.worker.ts", import.meta.url));
    worker.current = w;
    const fail = (message: string) => {
      if (worker.current !== w) return;
      setError(message);
      setRunning(false);
      w.terminate();
      worker.current = null;
    };
    w.onmessage = (event) => {
      if (worker.current !== w) return;
      if (event.data.type !== "result") {
        fail(event.data.message);
        return;
      }
      const result = event.data as EvidencePair,
        expected = cases.find((pair) => pair.id === caseId);
      if (
        !caseEvidenceMatches(result.baseline, expected?.baseline) ||
        !caseEvidenceMatches(result.scenario, expected?.scenario)
      ) {
        fail(
          "Genberegningen svarer ikke til det gemte sagsresultat. Kør hele sammenligningen igen; dette spor bruges ikke som dokumentation.",
        );
        return;
      }
      setEvidence({ baseline: result.baseline, scenario: result.scenario });
      setRunning(false);
      w.terminate();
      worker.current = null;
    };
    w.onerror = () =>
      fail(
        "Hændelsesforløbet kunne ikke genberegnes. Prøv igen; sammenligningen er bevaret.",
      );
    w.postMessage({
      engineVersion: comparison.engineVersion,
      baseline: comparison.baseline,
      scenario: comparison.scenario,
      seed: comparison.seeds[0],
      caseId,
    });
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setError(
      "Undersøgelsen er afbrudt. Vælg sagen igen for at genberegne hændelserne.",
    );
  };
  return (
    <section
      className="panel case-explorer"
      aria-labelledby="case-explorer-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">FRA TAL TIL FORLØB</span>
          <h3 id="case-explorer-title">Følg en sag gennem modellen</h3>
          <p>De faktiske hændelser forklarer, hvor tiden bliver af.</p>
        </div>
        <Waypoints size={22} />
      </div>
      <p className="field-hint">
        Sager fra første parrede kørsel, seed {comparison.seeds[0]}. En enkelt
        sag forklarer sit eget udfald; rapportens målinger samler alle{" "}
        {comparison.seeds.length} kørsler.
      </p>
      {comparison.engineVersion !== ENGINE_VERSION ? (
        <p className="notice-text">
          Resultatet er fra en tidligere motorversion. Kør sammenligningen igen
          for at undersøge hændelser med den samme motor.
        </p>
      ) : (
        <>
          <div className="case-filters">
            <label>
              <span>Find sag</span>
              <span className="case-search">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Sags-id eller sagstype"
                  maxLength={100}
                />
              </span>
            </label>
            <label>
              Sagsudfald
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Alle sager</option>
                <option value="backlog">I restkø i mindst ét scenarie</option>
                <option value="completed">
                  Afsluttet i mindst ét scenarie
                </option>
                <option value="aborted">Afbrudt i mindst ét scenarie</option>
              </select>
            </label>
          </div>
          <div className="case-list-labels" aria-hidden="true">
            <span>Sag</span>
            <span>Baseline · køtid</span>
            <span>Alternativ · køtid</span>
          </div>
          <div className="case-list">
            {rows.map((pair) => (
              <button
                className={`case-row ${selected === pair.id ? "selected" : ""}`}
                key={pair.id}
                aria-label={`Undersøg sag ${pair.id}`}
                aria-pressed={selected === pair.id}
                onClick={() => inspect(pair.id)}
              >
                <span className="case-identity">
                  <strong>{pair.id}</strong>
                  <small>
                    {pair.baseline?.caseType ?? pair.scenario?.caseType}
                  </small>
                </span>
                {(["baseline", "scenario"] as const).map((side) => (
                  <span key={side}>
                    <b>{formatTime(pair[side]?.queueTime ?? null)}</b>
                    <small>
                      {pair[side]
                        ? caseStatus[pair[side]!.status]
                        : "Ikke ankommet"}
                    </small>
                  </span>
                ))}
              </button>
            ))}
          </div>
          {!filtered.length && (
            <p className="empty-state compact">
              Ingen sager matcher søgningen. Prøv et andet id eller udfald.
            </p>
          )}
          <div className="case-pagination">
            <span>
              {formatNumber(filtered.length)} sager ·{" "}
              {filtered.length ? currentPage * 20 + 1 : 0}–
              {Math.min(filtered.length, (currentPage + 1) * 20)}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Forrige sager"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Næste sager"
                disabled={(currentPage + 1) * 20 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div
            className="case-inspection"
            aria-live="polite"
            aria-busy={running}
          >
            {!selected && (
              <div className="case-empty">
                <Waypoints size={25} />
                <p>
                  Vælg en sag for at se ankomst, kø, behandling og afslutning i
                  begge scenarier.
                </p>
              </div>
            )}
            {running && (
              <div className="case-loading">
                <LoaderCircle className="spin" size={20} />
                <p>
                  Genberegner sag <strong>{selected}</strong> med samme model og
                  seed…
                </p>
                <button className="button secondary" onClick={cancel}>
                  <Square size={14} />
                  Afbryd undersøgelse
                </button>
              </div>
            )}
            {error && (
              <p className="notice-text" role="alert">
                {error}
              </p>
            )}
            {evidence && (
              <>
                <div className="section-title case-detail-heading">
                  <div>
                    <span className="eyebrow">SAGENS HÆNDELSER</span>
                    <h4>Sag {selected}</h4>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      downloadFile(
                        `FlowLab-sagsforloeb.json`,
                        JSON.stringify(
                          {
                            evidenceVersion: 1,
                            generatedAt: new Date().toISOString(),
                            ...evidence,
                          },
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} />
                    Hent sagsforløb
                  </button>
                </div>
                <div className="case-summary-grid">
                  {(["baseline", "scenario"] as const).map((side) => {
                    const value = evidence[side],
                      item = value.case;
                    return (
                      <div className={`case-summary ${side}`} key={side}>
                        <span className="eyebrow">
                          {side === "baseline" ? "BASELINE" : "ALTERNATIV"}
                        </span>
                        <h4>
                          {item ? caseStatus[item.status] : "Ikke ankommet"}
                        </h4>
                        {item && value.timing ? (
                          <>
                            <p>
                              Ankomst ved {formatTime(item.arrival)} ·{" "}
                              {item.cohort === "warmup"
                                ? "Warm-up / startbeholdning"
                                : "Observationskohorte"}
                            </p>
                            <strong className="case-total">
                              {formatTime(value.timing.elapsed)}
                              <small>
                                {item.completedAt === null
                                  ? "forløbet indtil observationsstop"
                                  : "fra ankomst til afslutning"}
                              </small>
                            </strong>
                            <dl>
                              {(
                                [
                                  ["Køtid", value.timing.queue],
                                  ["Aktivt arbejde", value.timing.work],
                                  ["Planlagt vent", value.timing.plannedWait],
                                  [
                                    "Pause i kalender",
                                    value.timing.calendarPause,
                                  ],
                                ] as const
                              ).map(([label, time]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>{formatTime(time)}</dd>
                                </div>
                              ))}
                            </dl>
                            {item.completedAt === null && (
                              <p className="field-hint">
                                Uafsluttet ved {formatTime(value.measuredUntil)}
                                . Den endelige gennemløbstid er ukendt og indgår
                                ikke i kørslens gennemløbstid.
                              </p>
                            )}
                            {item.completedAt !== null &&
                              item.completedAt <
                                value.model.observationStart && (
                                <p className="field-hint">
                                  Afsluttet før målevinduet. Sagen indgår ikke i
                                  kørslens gennemløbstid eller throughput.
                                </p>
                              )}
                          </>
                        ) : (
                          <p>
                            Sags-id’et ankom ikke inden observationsstop i dette
                            scenarie. Der vises ingen opdigtet modpart.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="field-hint">
                  Køtid er venten før aktivitetsstart. En pause i kalenderen
                  opstår efter aktivitetsstart, mens ressourcen er uden for
                  arbejdstid. Tallene er fra hele sagens forløb frem til
                  afslutning eller observationsstop. Tider afrundes i visningen;
                  JSON bevarer heltalsmillisekunder.
                </p>
                <div
                  className="segmented case-variant"
                  aria-label="Vælg hændelsesforløb"
                >
                  {(["baseline", "scenario"] as const).map((side) => (
                    <button
                      key={side}
                      aria-pressed={variant === side}
                      className={variant === side ? "active" : ""}
                      onClick={() => {
                        setVariant(side);
                        setEventPage(0);
                      }}
                    >
                      {side === "baseline"
                        ? "Baselinehændelser"
                        : "Alternativhændelser"}
                    </button>
                  ))}
                </div>
                {shown && (
                  <>
                    {shown.events.length > 0 && (
                      <p className="case-scroll-hint">
                        Rul tabellen til siden for at se trin og besøg.
                      </p>
                    )}
                    {shown.warningCodes.map((code) => (
                      <p className="notice-text" key={code}>
                        {describeEngineCode(code)}
                      </p>
                    ))}
                    {shown.events.length > 0 ? (
                      <div
                        className="table-scroll case-events"
                        role="region"
                        aria-label={`${variant === "baseline" ? "Baseline" : "Alternativ"}: faktiske hændelser for sag ${selected}`}
                        tabIndex={0}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Tid fra start</th>
                              <th>Hændelse</th>
                              <th>Trin</th>
                              <th>Besøg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.events
                              .slice(eventPage * 100, eventPage * 100 + 100)
                              .map((event, index) => (
                                <tr key={index}>
                                  <td title={`${event.time} ms`}>
                                    {formatTime(event.time)}
                                  </td>
                                  <td>
                                    {eventLabels[event.type] ?? event.type}
                                    {event.duration !== undefined && (
                                      <small className="event-duration">
                                        Trukket varighed:{" "}
                                        {formatTime(event.duration)}
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    {shown.model.nodes.find(
                                      (node) => node.id === event.nodeId,
                                    )?.label ?? event.nodeId}
                                  </td>
                                  <td>{eventVisit(event) ?? "—"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="field-hint">
                        Ingen hændelser for dette sags-id i det valgte scenarie.
                      </p>
                    )}
                    {shown.events.length > 100 && (
                      <div className="case-pagination">
                        <span>
                          {eventPage * 100 + 1}–
                          {Math.min(shown.events.length, eventPage * 100 + 100)}{" "}
                          af {formatNumber(shown.events.length)} hændelser
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            aria-label="Forrige hændelser"
                            disabled={eventPage === 0}
                            onClick={() => setEventPage(eventPage - 1)}
                          >
                            <ChevronLeft size={19} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Næste hændelser"
                            disabled={
                              (eventPage + 1) * 100 >= shown.events.length
                            }
                            onClick={() => setEventPage(eventPage + 1)}
                          >
                            <ChevronRight size={19} />
                          </button>
                        </div>
                      </div>
                    )}
                    {shown.workSegments.length > 0 && (
                      <details className="case-work">
                        <summary>
                          Se {formatNumber(shown.workSegments.length)} faktiske
                          arbejdsintervaller
                        </summary>
                        <div
                          className="table-scroll"
                          role="region"
                          aria-label="Faktiske arbejdsintervaller"
                          tabIndex={0}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>Ressource</th>
                                <th>Fra</th>
                                <th>Til</th>
                                <th>Arbejde</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shown.workSegments
                                .slice(0, 200)
                                .map((segment, index) => (
                                  <tr key={index}>
                                    <td>
                                      {shown.model.resources.find(
                                        (pool) =>
                                          pool.id === segment.resourceId,
                                      )?.label ?? segment.resourceId}
                                    </td>
                                    <td>{formatTime(segment.start)}</td>
                                    <td>{formatTime(segment.end)}</td>
                                    <td>
                                      {formatTime(segment.end - segment.start)}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {shown.workSegments.length > 200 && (
                          <p className="field-hint">
                            De første 200 intervaller vises her. Alle
                            registrerede intervaller følger med i sagsforløbets
                            JSON.
                          </p>
                        )}
                      </details>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
