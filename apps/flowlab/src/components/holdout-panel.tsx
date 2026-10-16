"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  BadgeCheck,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import {
  assessHoldout,
  parseTimestamp,
  type Comparison,
  type FlowModel,
  type HoldoutAssessment,
} from "@tre/flow-engine";
import { downloadFile } from "@tre/persistence";
import { formatMetric, formatNumber, type Dataset } from "../lib/document";
export default function HoldoutPanel({
  dataset,
  baseline,
  comparison,
  assessment,
  trainingDataHashes,
  onSave,
}: {
  dataset: Dataset | null;
  baseline: FlowModel;
  comparison: Comparison | null;
  assessment: HoldoutAssessment | null;
  trainingDataHashes: string[];
  onSave: (assessment: HoldoutAssessment) => void;
}) {
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [completion, setCompletion] = useState(""),
    [independent, setIndependent] = useState(false),
    [complete, setComplete] = useState(false),
    [error, setError] = useState("");
  const unit = dataset?.unit ?? "seconds",
    windowMs = baseline.horizon - baseline.observationStart;
  const defaultStart =
    unit === "iso" &&
    dataset?.result.observedStart !== null &&
    dataset?.result.observedStart !== undefined
      ? new Date(dataset.result.observedStart).toISOString()
      : "0";
  const startValue = start || defaultStart,
    parsedStart = parseTimestamp(startValue, unit),
    defaultEnd =
      parsedStart === null || !Number.isFinite(parsedStart)
        ? ""
        : unit === "iso"
          ? new Date(parsedStart + windowMs).toISOString()
          : String(
              (parsedStart + windowMs) / (unit === "seconds" ? 1000 : 60000),
            );
  const activities = [
      ...new Set(
        dataset?.result.rows.map((row) => row.activity).filter(Boolean) ?? [],
      ),
    ].sort(),
    selected = completion || (activities.length === 1 ? activities[0] : "");
  const stale =
    assessment &&
    (JSON.stringify(assessment.model) !== JSON.stringify(baseline) ||
      assessment.engineVersion !== comparison?.engineVersion);
  const evaluate = () => {
    try {
      if (!dataset) throw new Error("Gem et valideret holdout-datasæt først.");
      if (
        !comparison ||
        JSON.stringify(comparison.baseline) !== JSON.stringify(baseline)
      )
        throw new Error("Kør sammenligningen på den aktuelle baseline først.");
      const periodStart = parseTimestamp(startValue, unit),
        periodEnd = parseTimestamp(end || defaultEnd, unit);
      if (periodStart === null || periodEnd === null)
        throw new Error("Angiv periodens start og slutning.");
      onSave(
        assessHoldout({
          model: baseline,
          runs: comparison.baselineRuns,
          dataset: dataset.result,
          sourceName: dataset.name,
          sourceHash: dataset.sha256,
          unit,
          periodStart,
          periodEnd,
          completionActivity: selected,
          independent,
          completeWindow: complete,
          trainingDataHashes,
        }),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Holdout-vurderingen kunne ikke gennemføres.",
      );
    }
  };
  return (
    <section className="panel holdout-panel" aria-labelledby="holdout-heading">
      <div className="section-title">
        <div>
          <span className="eyebrow">PRØV MODELLEN MOD VIRKELIGHEDEN</span>
          <h3 id="holdout-heading">
            En separat periode. Et ærligt kvalitetstjek.
          </h3>
          <p>
            Hold baseline op imod data, som ikke blev brugt til at tilpasse den.
          </p>
        </div>
        <FlaskConical size={24} />
      </div>
      {!dataset ? (
        <div className="empty-state compact">
          <FlaskConical size={30} />
          <h3>Gem dit holdout-datasæt først.</h3>
          <p>
            Datasættet skal dokumentere ankomster og afslutninger i en kendt
            periode. Brug kun syntetiske data i denne lokale demo.
          </p>
        </div>
      ) : (
        <>
          <div className="holdout-source">
            <strong>{dataset.name}</strong>
            <span>
              {formatNumber(dataset.result.rows.length)} gyldige rækker ·{" "}
              {unit === "iso"
                ? "ISO med tidszone"
                : unit === "seconds"
                  ? "Sekunder fra periodens start"
                  : "Minutter fra periodens start"}
            </span>
          </div>
          <div className="holdout-inputs">
            <label>
              Periodens start
              <input
                value={startValue}
                onChange={(event) => setStart(event.target.value)}
                placeholder={unit === "iso" ? "2026-10-16T09:00:00+02:00" : "0"}
              />
            </label>
            <label>
              Periodens slutning
              <input
                value={end || defaultEnd}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <label>
              Aktivitet, der afslutter sagen
              <select
                value={selected}
                onChange={(event) => setCompletion(event.target.value)}
              >
                <option value="">Vælg afsluttende aktivitet…</option>
                {activities.map((activity) => (
                  <option key={activity} value={activity}>
                    {activity}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-hint">
            Perioden skal matche baseline-målevinduet på{" "}
            {formatNumber(windowMs / 60000, 1)} minutter. Kun den valgte
            aktivitets afslutning tæller som en afsluttet sag. En fil uden
            kolonnen activity kan ikke dokumentere dette.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={independent}
              onChange={(event) => setIndependent(event.target.checked)}
            />
            Denne periode er uafhængig af data, der blev brugt til at tilpasse
            modellen.
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={complete}
              onChange={(event) => setComplete(event.target.checked)}
            />
            Alle ankomster, aktivitetsbesøg og sagsafslutninger i perioden er
            med, også sager i restkøen.
          </label>
          <button className="button primary" onClick={evaluate}>
            <FlaskConical size={16} />
            Vurdér baseline mod holdout
          </button>
        </>
      )}
      {error && (
        <div className="error-box" role="alert">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}
      {assessment && (
        <div className="holdout-result">
          {stale && (
            <p className="notice-text">
              Baseline er ændret siden denne vurdering. Nedenfor vises den gemte
              modelversion {assessment.model.revision}. Vurdér igen for en
              aktuel status.
            </p>
          )}
          <div
            className={`holdout-status ${assessment.status === "target_met" ? "met" : "review"}`}
          >
            {assessment.status === "target_met" ? (
              <BadgeCheck size={26} />
            ) : (
              <AlertTriangle size={25} />
            )}
            <div>
              <strong>
                {assessment.status === "target_met"
                  ? "Pilotmålet er nået for denne periode"
                  : assessment.status === "outside_target"
                    ? "Pilotmålet er ikke nået"
                    : "Datagrundlaget er ikke tilstrækkeligt"}
              </strong>
              <p>
                {assessment.status === "target_met"
                  ? "Throughput og median gennemløbstid afviger højst 15 %. Det dokumenterer denne holdout, ikke en garanti for fremtidig drift."
                  : "Modellen er ikke kalibreret for denne periode. Brug afvigelser og datamangler til at undersøge antagelserne."}
              </p>
            </div>
          </div>
          <div
            className="table-scroll"
            role="region"
            aria-label="Baseline sammenlignet med faktisk holdout"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Måling</th>
                  <th>Observeret</th>
                  <th>Simuleret baseline</th>
                  <th>Absolut afvigelse</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["throughput", "Afsluttede sager"],
                    ["leadTime", "Median gennemløbstid"],
                    ["queueTime", "Ventetid i kø"],
                    ["backlog", "Restkø"],
                  ] as const
                ).map(([key, label]) => {
                  const metric = assessment.metrics[key];
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{formatMetric(key, metric.observed)}</td>
                      <td>{formatMetric(key, metric.simulated)}</td>
                      <td>
                        {metric.relativeError === null
                          ? "Kan ikke vurderes"
                          : `${formatNumber(metric.relativeError * 100, 1)} %`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {assessment.dataGaps.length > 0 && (
            <div className="holdout-gaps">
              <h4>Datamangler, der skal afklares</h4>
              <ul>
                {assessment.dataGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          {assessment.notes.map((note) => (
            <p className="notice-text" key={note}>
              {note}
            </p>
          ))}
          <p className="field-hint">
            {assessment.metrics.leadTime.sampleCount} observerede, afsluttede
            sager med kendt ankomst · {assessment.seeds.length} seeds · Baseline
            v{assessment.model.revision} · {assessment.source.name}
          </p>
          <button
            className="text-button"
            onClick={() =>
              downloadFile(
                "flowlab-holdout.json",
                JSON.stringify(assessment, null, 2),
              )
            }
          >
            <ArrowDownToLine size={15} />
            Hent vurdering med kilde, periode og model
          </button>
        </div>
      )}
    </section>
  );
}
