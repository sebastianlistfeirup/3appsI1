"use client";
import { useMemo, useState } from "react";
import { ArrowDownToLine, WalletCards } from "lucide-react";
import { downloadFile } from "@tre/persistence";
import type { Comparison } from "@tre/flow-engine";
import { formatMetric, formatNumber } from "../lib/document";
import { formatCaseTime } from "../lib/time-profile";
import {
  COST_FIELDS,
  COST_LABELS,
  costProfile,
  costProfilesCsv,
  formatCost,
  resourceIds,
  resourceProfile,
  resourceProfilesCsv,
  type CostView,
} from "../lib/cost-profile";

const PAGE_SIZE = 8;
export default function CostProfile({
  comparison,
}: {
  comparison: Comparison;
}) {
  const [selected, setSelected] = useState<CostView>("mean"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const view =
    selected === "mean" || comparison.seeds.includes(selected)
      ? selected
      : "mean";
  const profiles = {
    baseline: costProfile(comparison, "baseline", view),
    scenario: costProfile(comparison, "scenario", view),
  };
  const ids = useMemo(() => resourceIds(comparison), [comparison]);
  const filtered = ids.filter((id) => {
    const text = [
      id,
      comparison.baseline.resources.find((pool) => pool.id === id)?.label,
      comparison.scenario.resources.find((pool) => pool.id === id)?.label,
    ].join(" ");
    return text
      .toLocaleLowerCase("da-DK")
      .includes(query.trim().toLocaleLowerCase("da-DK"));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1),
    shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  return (
    <section
      className="panel cost-profile"
      aria-labelledby="cost-profile-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">TID OG PENGE</span>
          <h3 id="cost-profile-title">Se, hvad kapaciteten koster.</h3>
          <p>Den reserverede løn indgår også, når teamet ikke er optaget.</p>
        </div>
        <WalletCards size={22} />
      </div>
      <div className="cost-profile-controls">
        <label>
          Grundlag for omkostninger
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
              "flowlab-omkostninger.csv",
              costProfilesCsv(comparison),
              "text/csv",
            )
          }
        >
          <ArrowDownToLine size={16} /> Hent beløb for alle seeds
        </button>
      </div>
      <p className="field-hint">
        {view === "mean"
          ? `Gennemsnit af ${profiles.baseline.runs} baseline- og ${profiles.scenario.runs} alternativkørsler.`
          : `Begge scenarier for seed ${view}.`}{" "}
        Beløb er afrundet i visningen; CSV og JSON bevarer præcisionen.
      </p>
      {(profiles.baseline.partial || profiles.scenario.partial) && (
        <p className="notice-text">
          Ufuldstændig kørsel: løn og aktivitetsbesøg gælder kun frem til
          motorens stop. Den faste automation medregnes stadig fuldt én gang pr.
          kørsel.
        </p>
      )}
      <div
        className="cost-mobile-summary"
        aria-label="Samlet omkostning i hvert scenarie"
      >
        <div>
          <span>Baseline</span>
          <strong>{formatCost(profiles.baseline.totalCost)}</strong>
        </div>
        <div>
          <span>Alternativ</span>
          <strong>{formatCost(profiles.scenario.totalCost)}</strong>
        </div>
      </div>
      <p className="cost-scroll-hint">
        Træk tabellen til siden for at se alle beløb og forskelle.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Omkostningernes bestanddele"
        tabIndex={0}
      >
        <table className="cost-table">
          <thead>
            <tr>
              <th>Omkostning</th>
              <th>Baseline</th>
              <th>Alternativ</th>
              <th>Forskel</th>
            </tr>
          </thead>
          <tbody>
            {COST_FIELDS.map((key) => {
              const a = profiles.baseline[key],
                b = profiles.scenario[key];
              return (
                <tr
                  key={key}
                  className={key === "totalCost" ? "cost-total" : undefined}
                >
                  <th scope="row">{COST_LABELS[key]}</th>
                  <td>{formatCost(a)}</td>
                  <td>{formatCost(b)}</td>
                  <td>
                    {formatCost(a !== null && b !== null ? b - a : null, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cost-rules">
        <p>
          <strong>Reserveret løn</strong>Arbejdsplanens åbne tid i målevinduet ×
          antal medarbejdere × timeløn. Puljer uden tilknyttede trin koster også
          løn.
        </p>
        <p>
          <strong>Aktivitetspris</strong>Prisen på hvert besøg, som starter i
          målevinduet, også når sagen ikke når at blive færdig. Et besøg startet
          før målevinduet medregnes ikke igen.
        </p>
        <p>
          <strong>Fast automation</strong>Modellens faste beløb medregnes én
          gang pr. kørsel. Det fordeles ikke automatisk efter målevinduets
          længde.
        </p>
      </div>
      <div className="section-title resource-ledger-heading">
        <div>
          <h4>Hvert teams tid og løn</h4>
          <p>Medarbejdertid er summen på tværs af teamets medarbejdere.</p>
        </div>
        <button
          className="text-button"
          onClick={() =>
            downloadFile(
              "flowlab-ressourcer.csv",
              resourceProfilesCsv(comparison),
              "text/csv",
            )
          }
        >
          <ArrowDownToLine size={15} /> Hent puljetal for alle seeds
        </button>
      </div>
      <label className="resource-ledger-search">
        Find ressourcepulje
        <input
          type="search"
          maxLength={100}
          placeholder="Navn eller id"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <p className="field-hint">
        {filtered.length} af {ids.length}{" "}
        {ids.length === 1 ? "pulje" : "puljer"}. Højst {PAGE_SIZE} vises ad
        gangen. Samme pulje-id sammenlignes på tværs af modellerne.
      </p>
      <div
        className="resource-ledger-list"
        role="list"
        aria-label="Målt medarbejdertid og reserveret løn"
      >
        {shown.map((id) => (
          <div className="resource-ledger-pair" role="listitem" key={id}>
            <code className="resource-ledger-id">Pulje-id: {id}</code>
            <div className="resource-ledger-grid">
              {(["baseline", "scenario"] as const).map((side) => {
                const profile = resourceProfile(comparison, side, id, view);
                return (
                  <article
                    key={side}
                    className={`resource-ledger-card ${side}`}
                    aria-label={`${side === "baseline" ? "Baseline" : "Alternativ"} · ressource ${id}`}
                  >
                    <span className="eyebrow">
                      {side === "baseline" ? "BASELINE" : "ALTERNATIV"}
                    </span>
                    {profile ? (
                      <>
                        <h5>{profile.label}</h5>
                        <p className="field-hint">
                          {formatNumber(profile.capacity)} medarbejdere ·{" "}
                          {formatCost(profile.hourlyCost)} pr. medarbejdertime
                        </p>
                        {!profile.used && (
                          <p className="resource-unused">
                            Ingen trin bruger puljen. Den reserverede løn indgår
                            stadig.
                          </p>
                        )}
                        <dl className="resource-ledger-values">
                          <div>
                            <dt>Reserveret medarbejdertid</dt>
                            <dd>{formatCaseTime(profile.availableTime)}</dd>
                          </div>
                          <div>
                            <dt>Optaget medarbejdertid</dt>
                            <dd>{formatCaseTime(profile.busyTime)}</dd>
                          </div>
                          <div>
                            <dt>Ledig medarbejdertid</dt>
                            <dd>{formatCaseTime(profile.idleTime)}</dd>
                          </div>
                          <div>
                            <dt>Udnyttelse</dt>
                            <dd>
                              {formatMetric("utilization", profile.utilization)}
                            </dd>
                          </div>
                          <div className="resource-ledger-salary">
                            <dt>Reserveret løn</dt>
                            <dd>{formatCost(profile.salaryCost)}</dd>
                          </div>
                        </dl>
                        {profile.availableTime === 0 && (
                          <p className="field-hint">
                            Ingen planlagt kapacitet i målevinduet. Udnyttelse
                            er ukendt og vises som —.
                          </p>
                        )}
                        {profile.runs === 0 && (
                          <p className="notice-text">
                            Ingen kørselsmåling for den valgte pulje og det
                            valgte seed.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="resource-missing">
                        Puljen findes ikke i dette scenarie. Ingen måling.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!shown.length && (
        <p className="notice-text">
          {ids.length
            ? "Ingen ressourcepuljer matcher søgningen."
            : "Modellerne har ingen ressourcepuljer. Der reserveres ingen medarbejderløn."}
        </p>
      )}
      {pages > 1 && (
        <nav
          className="resource-ledger-pages"
          aria-label="Sider med ressourcepuljer"
        >
          <button
            className="button secondary"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Forrige
          </button>
          <label>
            Side med puljetal
            <select
              value={current}
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {Array.from({ length: pages }, (_, index) => (
                <option key={index} value={index}>
                  Side {index + 1} af {pages}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Næste
          </button>
        </nav>
      )}
      <p className="field-hint">
        {view === "mean"
          ? "Tider og løn er gennemsnit pr. kørsel. Udnyttelse er gennemsnittet af de kørsler, som har planlagt kapacitet. "
          : ""}
        Lønnen beregnes af den reserverede tid, ikke af den optagede tid. Ledig
        tid er ikke i sig selv en realiserbar besparelse.
      </p>
    </section>
  );
}
