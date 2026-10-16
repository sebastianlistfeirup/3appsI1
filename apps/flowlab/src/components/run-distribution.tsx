"use client";
import { useMemo, useState } from "react";
import { ArrowDownToLine, BarChart3, Info } from "lucide-react";
import {
  metricDefinitions,
  type Comparison,
  type MetricKey,
} from "@tre/flow-engine";
import { downloadFile } from "@tre/persistence";
import { formatDifference, formatMetric, formatNumber } from "../lib/document";
import {
  pairedRunValues,
  runDistribution,
  type PairedRunValue,
} from "../lib/run-distribution";
export default function RunDistribution({
  comparison,
}: {
  comparison: Comparison;
}) {
  const [key, setKey] = useState<MetricKey>("leadTime"),
    [selectedBin, setSelectedBin] = useState<number | null>(null),
    [selectedSeed, setSelectedSeed] = useState<number | null>(null);
  const rows = useMemo(
      () => pairedRunValues(comparison, key),
      [comparison, key],
    ),
    distribution = useMemo(() => runDistribution(rows), [rows]);
  const activeBin =
      selectedBin !== null ? distribution.bins[selectedBin] : null,
    visible = activeBin?.rows ?? rows,
    active = visible.find((row) => row.seed === selectedSeed) ?? visible[0],
    maxCount = Math.max(1, ...distribution.bins.map((bin) => bin.rows.length));
  const precise = (value: number) => {
    const time = key === "leadTime" || key === "queueTime",
      ratio = key === "utilization" || key === "slaCompleted";
    const factor = time ? 1 / 60000 : ratio ? 100 : 1;
    const unit = time
      ? "min"
      : ratio
        ? "procentpoint"
        : key === "cost"
          ? "kr."
          : "sager";
    return `${new Intl.NumberFormat("da-DK", { maximumSignificantDigits: 8 }).format(value * factor)} ${unit}`;
  };
  const label = (from: number, to: number) =>
    from === to ? precise(from) : `${precise(from)} til ${precise(to)}`;
  const choose = (row: PairedRunValue) => setSelectedSeed(row.seed);
  return (
    <section
      className="panel run-distribution"
      aria-labelledby="run-distribution-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">ALLE KØRSLER TÆLLER</span>
          <h3 id="run-distribution-title">Hvordan varierer effekten?</h3>
          <p>
            Se de faktiske forskelle mellem alternativ og baseline, seed for
            seed.
          </p>
        </div>
        <BarChart3 size={23} />
      </div>
      <div className="distribution-controls">
        <label>
          Vælg måling
          <select
            value={key}
            onChange={(event) => {
              setKey(event.target.value as MetricKey);
              setSelectedBin(null);
              setSelectedSeed(null);
            }}
          >
            {(Object.keys(metricDefinitions) as MetricKey[]).map((metric) => (
              <option key={metric} value={metric}>
                {metricDefinitions[metric].label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() =>
            downloadFile(
              "FlowLab-parrede-koersler.csv",
              [
                "seed,metric,unit,baseline,scenario,delta",
                ...rows.map((row) =>
                  [
                    row.seed,
                    key,
                    metricDefinitions[key].unit,
                    row.baseline ?? "",
                    row.scenario ?? "",
                    row.delta ?? "",
                  ].join(","),
                ),
              ].join("\n"),
              "text/csv;charset=utf-8",
            )
          }
        >
          <ArrowDownToLine size={16} />
          Hent kørsler som CSV
        </button>
      </div>
      <p className="field-hint">
        {metricDefinitions[key].definition} Negative forskelle betyder, at
        alternativets måling er lavere; positive betyder højere.
      </p>
      <div className="distribution-summary">
        <div>
          <strong>{distribution.lower}</strong>
          <span>par med lavere måling</span>
        </div>
        <div>
          <strong>{distribution.equal}</strong>
          <span>par med samme måling</span>
        </div>
        <div>
          <strong>{distribution.higher}</strong>
          <span>par med højere måling</span>
        </div>
      </div>
      {distribution.available ? (
        <>
          <div
            className="histogram"
            role="group"
            aria-label="Fordeling af faktiske parrede forskelle"
          >
            <div className="histogram-y" aria-hidden="true">
              <span>{maxCount} par</span>
              <span>0</span>
            </div>
            <div className="histogram-bars">
              {distribution.bins.map((bin, index) => (
                <button
                  key={index}
                  className={`histogram-bin ${selectedBin === index ? "selected" : ""}`}
                  aria-pressed={selectedBin === index}
                  aria-label={`${bin.rows.length} par: ${label(bin.from, bin.to)}${bin.includesUpper ? ", inklusive øvre grænse" : "; øvre grænse tilhører næste interval"}`}
                  onClick={() => {
                    setSelectedBin(selectedBin === index ? null : index);
                    setSelectedSeed(null);
                  }}
                >
                  <span
                    className="histogram-bar"
                    style={{
                      height: `${(bin.rows.length / maxCount) * 145}px`,
                    }}
                  >
                    <b>{bin.rows.length}</b>
                  </span>
                  <span className="histogram-bin-label">
                    {distribution.bins.length === 1
                      ? formatDifference(key, bin.from)
                      : index + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {distribution.bins.length > 1 && (
            <div className="histogram-range">
              <span>{formatDifference(key, distribution.min)}</span>
              <span>Forskel: alternativ − baseline</span>
              <span>{formatDifference(key, distribution.max)}</span>
            </div>
          )}
          <p className="histogram-help">
            {distribution.bins.length === 1
              ? `Alle ${distribution.available} tilgængelige par giver samme forskel. `
              : "Søjlernes tal under aksen er intervalnumre. "}
            Vælg en søjle for at se dens præcise interval og de par, der ligger
            i det.
          </p>
          <div className="distribution-quantiles">
            <div>
              <span>10.-percentil</span>
              <b>{formatDifference(key, distribution.p10)}</b>
            </div>
            <div>
              <span>Median</span>
              <b>{formatDifference(key, distribution.median)}</b>
            </div>
            <div>
              <span>90.-percentil</span>
              <b>{formatDifference(key, distribution.p90)}</b>
            </div>
          </div>
        </>
      ) : (
        <div className="distribution-empty">
          <Info size={23} />
          <p>
            Ingen par har begge målinger. Baseline og alternativ vises enkeltvis
            nedenfor; manglende målinger bliver ikke til nul.
          </p>
        </div>
      )}
      {distribution.missing > 0 && (
        <p className="notice-text">
          {distribution.missing} af {rows.length} par mangler mindst én måling
          og indgår ikke i fordelingen.
        </p>
      )}
      {activeBin && (
        <div className="distribution-filter">
          <span>
            Interval {selectedBin! + 1}:{" "}
            <strong>{label(activeBin.from, activeBin.to)}</strong> ·{" "}
            {activeBin.rows.length} par
          </span>
          <button className="text-button" onClick={() => setSelectedBin(null)}>
            Vis alle par
          </button>
        </div>
      )}
      <div className="distribution-pairs">
        <label>
          Undersøg et seedpar
          <select
            value={active?.seed ?? ""}
            disabled={!visible.length}
            onChange={(event) => setSelectedSeed(Number(event.target.value))}
          >
            {visible.map((row) => (
              <option key={row.seed} value={row.seed}>
                Seed {row.seed}
              </option>
            ))}
          </select>
        </label>
        {active && (
          <div className="distribution-pair-detail" aria-live="polite">
            <div>
              <span>Baseline</span>
              <strong>{formatMetric(key, active.baseline)}</strong>
            </div>
            <div>
              <span>Alternativ</span>
              <strong>{formatMetric(key, active.scenario)}</strong>
            </div>
            <div>
              <span>Parret forskel</span>
              <strong>{formatDifference(key, active.delta)}</strong>
            </div>
          </div>
        )}
      </div>
      <details className="distribution-table">
        <summary>Se alle {rows.length} seedpar som tabel</summary>
        <div
          className="table-scroll"
          role="region"
          aria-label="Faktiske målinger for hvert seedpar"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Seed</th>
                <th>Baseline</th>
                <th>Alternativ</th>
                <th>Forskel</th>
                <th>Undersøg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.seed}>
                  <td>{row.seed}</td>
                  <td>{formatMetric(key, row.baseline)}</td>
                  <td>{formatMetric(key, row.scenario)}</td>
                  <td>{formatDifference(key, row.delta)}</td>
                  <td>
                    <button
                      className="text-button"
                      aria-label={`Undersøg seed ${row.seed}`}
                      onClick={() => {
                        setSelectedBin(null);
                        choose(row);
                      }}
                    >
                      Vis par
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="notice-text">
        Målinger afrundes i visningen; CSV indeholder de fulde værdier og deres
        enhed. Fordelingen beskriver variation i denne model, ikke
        sandsynligheden for en gevinst i virkeligheden.{" "}
        {formatNumber(distribution.available)} par med begge målinger indgår;
        10.–90.-percentiler er simulationsspredning og ikke et
        konfidensinterval.
      </p>
    </section>
  );
}
