"use client";
import { useState } from "react";
import { ArrowDownToLine, Timer } from "lucide-react";
import { downloadFile } from "@tre/persistence";
import type { Comparison } from "@tre/flow-engine";
import { formatNumber } from "../lib/document";
import { formatCaseTime } from "../lib/time-profile";
import {
  SLA_FIELDS,
  SLA_LABELS,
  slaProfile,
  slaProfilesCsv,
  type SlaView,
} from "../lib/sla-profile";

export default function SlaProfile({ comparison }: { comparison: Comparison }) {
  const [selected, setSelected] = useState<SlaView>("mean");
  const view =
    selected === "mean" || comparison.seeds.includes(selected)
      ? selected
      : "mean";
  return (
    <section className="panel sla-profile" aria-labelledby="sla-profile-title">
      <div className="section-title">
        <div>
          <span className="eyebrow">SLA OG RESTKØ</span>
          <h3 id="sla-profile-title">
            Sagerne, du endnu ikke kan se hele udfaldet af
          </h3>
          <p>
            En høj andel blandt afsluttede sager fortæller ikke, hvordan
            restkøen ender.
          </p>
        </div>
        <Timer size={23} />
      </div>
      <div className="cost-profile-controls">
        <label>
          Grundlag for SLA
          <select
            value={view}
            onChange={(event) =>
              setSelected(
                event.target.value === "mean"
                  ? "mean"
                  : Number(event.target.value),
              )
            }
          >
            <option value="mean">Gennemsnit af alle kørsler</option>
            {comparison.seeds.map((seed, index) => (
              <option key={seed} value={seed}>
                Kørsel {index + 1} · {seed}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(
              "flowlab-sla.csv",
              slaProfilesCsv(comparison),
              "text/csv",
            )
          }
        >
          <ArrowDownToLine size={16} />
          Hent SLA-tal for alle seeds
        </button>
      </div>
      <p className="field-hint">
        {view === "mean"
          ? "Antal er gennemsnit pr. kørsel. Andelen er gennemsnittet af kørslernes andele, ikke én samlet andel af alle sager."
          : `De to frosne modeller for seed ${view}. Antal er sager i denne kørsel.`}
      </p>
      {comparison.baseline.sla !== comparison.scenario.sla && (
        <p className="notice-text">
          Modellerne bruger forskellige SLA-grænser. En ændret andel kan skyldes
          selve grænsen; sammenlign også sagernes tider. Baseline:{" "}
          {formatNumber(comparison.baseline.sla)} ms. Alternativ:{" "}
          {formatNumber(comparison.scenario.sla)} ms.
        </p>
      )}
      <div className="time-profile-grid">
        {(["baseline", "scenario"] as const).map((side) => {
          const profile = slaProfile(comparison, side, view);
          return (
            <article
              key={side}
              className={`time-profile-card sla-profile-card ${side}`}
              aria-label={`${side === "baseline" ? "Baseline" : "Alternativ"} · SLA`}
            >
              <div className="sla-card-title">
                <span className="eyebrow">
                  {side === "baseline" ? "BASELINE" : "ALTERNATIV"}
                </span>
                <span
                  title={`Præcis SLA-grænse: ${formatNumber(profile.threshold)} millisekunder`}
                >
                  Grænse: {formatCaseTime(profile.threshold)}
                </span>
              </div>
              <div className="sla-share">
                <strong>
                  {profile.completedShare === null
                    ? "—"
                    : `${formatNumber(profile.completedShare * 100, 1)} %`}
                </strong>
                <span>inden for SLA blandt afsluttede</span>
              </div>
              {!profile.runs ? (
                <p className="notice-text">Ingen kørsel for dette seed.</p>
              ) : (
                <>
                  {profile.partial && (
                    <p className="notice-text">
                      Ufuldstændig kørsel. Udfald gælder kun frem til motorens
                      stop.
                    </p>
                  )}
                  {profile.completedShare === null && (
                    <p className="notice-text">
                      Ingen afsluttede sager. En ukendt andel er hverken 0 %
                      eller 100 %.
                    </p>
                  )}
                  <dl className="time-profile-details">
                    {SLA_FIELDS.map((field) => (
                      <div
                        key={field}
                        className={
                          field === "backlog" ? "sla-backlog-row" : undefined
                        }
                      >
                        <dt>{SLA_LABELS[field]}</dt>
                        <dd data-sla-field={field}>
                          {formatNumber(
                            profile.counts[field],
                            view === "mean" ? 1 : 0,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="field-hint">
                    SLA-andel findes i {profile.availableRates} af{" "}
                    {profile.runs} kørsler.
                  </p>
                </>
              )}
            </article>
          );
        })}
      </div>
      <p className="notice-text">
        SLA måles fra oprindelig ankomst til afslutning, inklusive kø, planlagt
        vent og kalenderpauser. Præcis på grænsen er inden for SLA. En
        uafsluttet sag er et kendt brud, når dens forløbne tid er større end
        grænsen; ellers er det endelige udfald ukendt.
      </p>
      <p className="field-hint">
        Afsluttede sager tælles i målevinduet. Restkøen er alle ankomne,
        uafsluttede sager ved stop, også fra før målestart. Afbrudte sager vises
        separat. JSON og CSV bevarer de præcise antal og andele.
      </p>
    </section>
  );
}
