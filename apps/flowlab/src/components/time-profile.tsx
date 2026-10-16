"use client";
import { useState } from "react";
import { Clock3, ArrowDownToLine } from "lucide-react";
import { downloadFile } from "@tre/persistence";
import type { Comparison } from "@tre/flow-engine";
import { formatNumber } from "../lib/document";
import {
  formatCaseTime,
  timeProfilePair,
  timeProfilesCsv,
} from "../lib/time-profile";

export default function TimeProfile({
  comparison,
}: {
  comparison: Comparison;
}) {
  const [selectedSeed, setSelectedSeed] = useState(comparison.seeds[0]);
  const seed = comparison.seeds.includes(selectedSeed)
    ? selectedSeed
    : comparison.seeds[0];
  if (seed === undefined) return null;
  const pair = timeProfilePair(comparison, seed);
  return (
    <section
      className="panel time-profile"
      aria-labelledby="time-profile-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">SAGERNES TIDER</span>
          <h3 id="time-profile-title">Se også dem, der tager længere tid.</h3>
          <p>Median og p90 blandt de afsluttede sager i én konkret kørsel.</p>
        </div>
        <Clock3 size={21} />
      </div>
      <div className="time-profile-controls">
        <label>
          Seed for sagernes tider
          <select
            value={seed}
            onChange={(event) => setSelectedSeed(Number(event.target.value))}
          >
            {comparison.seeds.map((value, index) => (
              <option key={value} value={value}>
                Kørsel {index + 1} · {value}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(
              "flowlab-sagernes-tider.csv",
              timeProfilesCsv(comparison),
              "text/csv",
            )
          }
        >
          <ArrowDownToLine size={16} />
          Hent tidstal for alle seeds
        </button>
      </div>
      <div className="time-profile-grid">
        {(["baseline", "scenario"] as const).map((side) => {
          const run = pair[side],
            metrics = run?.metrics,
            count = metrics?.leadTime.count ?? 0;
          return (
            <article
              className={`time-profile-card ${side}`}
              key={side}
              aria-label={`${side === "baseline" ? "Baseline" : "Alternativ"} · sagernes tider`}
            >
              <span className="eyebrow">
                {side === "baseline" ? "BASELINE" : "ALTERNATIV"}
              </span>
              {!run ? (
                <p>Ingen kørsel for dette seed.</p>
              ) : (
                <>
                  {run.status !== "completed" && (
                    <p className="notice-text">
                      Ufuldstændig kørsel. Tallene gælder kun frem til stop.
                    </p>
                  )}
                  <div className="time-profile-numbers">
                    <div>
                      <span>Median, gennemløbstid</span>
                      <strong>
                        {formatCaseTime(metrics!.leadTime.median)}
                      </strong>
                    </div>
                    <div>
                      <span>P90, gennemløbstid</span>
                      <strong>{formatCaseTime(metrics!.leadTime.p90)}</strong>
                    </div>
                  </div>
                  <p className="time-profile-count">
                    <b>{formatNumber(count)}</b> afsluttede sager i målevinduet
                    · <b>{formatNumber(metrics!.backlog)}</b> i restkø
                  </p>
                  {count === 0 ? (
                    <p className="notice-text">
                      Ingen afsluttede sager. Tiderne er ukendte og vises ikke
                      som nul.
                    </p>
                  ) : count < 20 ? (
                    <p className="notice-text">
                      Få observationer. P90 påvirkes tydeligt af de enkelte
                      sagers tider.
                    </p>
                  ) : null}
                  <dl className="time-profile-details">
                    <div>
                      <dt>Vent i aktivitetskø, gennemsnit</dt>
                      <dd>{formatCaseTime(metrics!.queueTime.mean)}</dd>
                    </div>
                    <div>
                      <dt>Planlagt vent, gennemsnit</dt>
                      <dd>{formatCaseTime(metrics!.plannedWaitTime.mean)}</dd>
                    </div>
                    <div>
                      <dt>Aktive ved stop</dt>
                      <dd>{formatNumber(metrics!.active)}</dd>
                    </div>
                    <div>
                      <dt>Venter i kø ved stop</dt>
                      <dd>{formatNumber(metrics!.waiting)}</dd>
                    </div>
                    <div>
                      <dt>I planlagt vent ved stop</dt>
                      <dd>{formatNumber(metrics!.plannedWait)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </article>
          );
        })}
      </div>
      <p className="notice-text">
        P90 beskriver den langsomme del af de afsluttede sager og beregnes med
        lineær interpolation. Restkøen indgår ikke i tidsfordelingen. En lav tid
        blandt få afsluttede sager kan derfor skjule lang ventetid for dem, der
        stadig er i kø.
      </p>
      <p className="field-hint">
        Tallene ovenfor gælder seed {seed}. CSV indeholder gennemsnit, median,
        p90 og antal observationer for alle {comparison.seeds.length} seeds i
        millisekunder. Planlagt vent er en separat modelantagelse og tælles ikke
        som tid i aktivitetskø.
      </p>
    </section>
  );
}
