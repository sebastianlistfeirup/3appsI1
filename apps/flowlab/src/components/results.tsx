"use client";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Info,
  TrendingUp,
} from "lucide-react";
import {
  metricDefinitions,
  type Comparison,
  type MetricKey,
} from "@tre/flow-engine";
import { formatMetric, formatDifference, formatNumber } from "../lib/document";
export function MetricCards({ comparison }: { comparison: Comparison | null }) {
  return (
    <div className="metric-grid">
      {(["throughput", "leadTime", "backlog", "cost"] as MetricKey[]).map(
        (key) => {
          const m = comparison?.metrics.find((m) => m.key === key),
            delta = m?.deltaMean ?? null,
            better =
              delta !== null && (key === "throughput" ? delta > 0 : delta < 0),
            Icon = delta !== null && delta < 0 ? ArrowDownRight : ArrowUpRight;
          return (
            <article className="metric-card" key={key}>
              <div className="metric-label">
                {metricDefinitions[key].label}
                <span
                  tabIndex={0}
                  className="tip"
                  aria-label={metricDefinitions[key].definition}
                >
                  <Info size={14} />
                  <span>{metricDefinitions[key].definition}</span>
                </span>
              </div>
              <div className="metric-value">
                {m ? formatMetric(key, m.scenario) : "—"}
                <span className="metric-baseline">
                  {m ? formatMetric(key, m.baseline) : "Afventer kørsel"}
                </span>
              </div>
              <div
                className={`metric-delta ${better ? "positive" : delta === 0 ? "neutral" : "caution"}`}
              >
                {m && delta !== null ? (
                  <>
                    <Icon size={14} />
                    {delta > 0 ? "+" : ""}
                    {formatMetric(key, delta)}
                    <span>vs. baseline</span>
                  </>
                ) : (
                  <span>Beregnes af simulationsmotoren</span>
                )}
              </div>
            </article>
          );
        },
      )}
    </div>
  );
}
export function QueueChart({ comparison }: { comparison: Comparison }) {
  const baseline = comparison.baselineRuns[0]?.queueSamples ?? [],
    scenario = comparison.scenarioRuns[0]?.queueSamples ?? [],
    max = Math.max(
      5,
      ...baseline.map((s) => s.waiting),
      ...scenario.map((s) => s.waiting),
    ),
    horizon = comparison.baseline.horizon;
  const path = (list: typeof baseline) =>
    list
      .map(
        (s, i) =>
          `${i ? "L" : "M"}${44 + (s.time / horizon) * 572},${190 - (s.waiting / max) * 150}`,
      )
      .join(" ");
  return (
    <div className="chart-card">
      <div className="section-title">
        <div>
          <h3>Hvordan udvikler køen sig?</h3>
          <p>Ventende sager gennem arbejdsdagen</p>
        </div>
        <span className="small-badge">Seed {comparison.seeds[0]}</span>
      </div>
      <div className="chart-legend">
        <span>
          <i className="dot baseline" />
          Baseline
        </span>
        <span>
          <i className="dot scenario" />
          Alternativ
        </span>
      </div>
      <svg
        viewBox="0 0 640 230"
        role="img"
        aria-label={`Ventende sager over ${horizon / 3600000} timer. Én af ${comparison.seeds.length} parrede kørsler.`}
        className="queue-chart"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={44}
              x2={616}
              y1={190 - t * 150}
              y2={190 - t * 150}
              stroke="#e8eeea"
              strokeDasharray="3 4"
            />
            <text x={32} y={194 - t * 150} textAnchor="end">
              {formatNumber(max * t)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={44 + t * 572} y={218} textAnchor="middle">
            {formatNumber((horizon * t) / 3600000, 0)} t
          </text>
        ))}
        <path d={`${path(scenario)} L616,190 L44,190 Z`} fill="#008c8310" />
        <path
          d={path(baseline)}
          fill="none"
          stroke="#cda66f"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <path
          d={path(scenario)}
          fill="none"
          stroke="#00887c"
          strokeWidth={2.8}
          strokeLinejoin="round"
        />
      </svg>
      <p className="chart-note">
        En repræsentation af første seed. Spredning på tværs af alle kørsler
        vises separat.
      </p>
    </div>
  );
}
export function ResourceChart({ comparison }: { comparison: Comparison }) {
  return (
    <div className="chart-card resource-chart">
      <div className="section-title">
        <div>
          <h3>Plads til at gøre arbejdet</h3>
          <p>Udnyttelse af planlagt kapacitet</p>
        </div>
        <TrendingUp size={20} />
      </div>
      {comparison.baseline.resources.map((resource) => {
        const average = (runs: Comparison["baselineRuns"]) => {
          const values = runs
            .map(
              (r) => r.resources.find((p) => p.id === resource.id)?.utilization,
            )
            .filter((v): v is number => v !== null && v !== undefined);
          return values.length
            ? values.reduce((a, b) => a + b, 0) / values.length
            : null;
        };
        const a = average(comparison.baselineRuns),
          b = average(comparison.scenarioRuns);
        return (
          <div className="resource-bars" key={resource.id}>
            <strong>{resource.label}</strong>
            <div>
              <span>Baseline</span>
              <div className="bar-track">
                <i
                  className="bar baseline"
                  style={{ width: `${(a ?? 0) * 100}%` }}
                />
              </div>
              <b>{formatMetric("utilization", a)}</b>
            </div>
            <div>
              <span>Alternativ</span>
              <div className="bar-track">
                <i
                  className="bar scenario"
                  style={{ width: `${(b ?? 0) * 100}%` }}
                />
              </div>
              <b>{formatMetric("utilization", b)}</b>
            </div>
          </div>
        );
      })}
      <p className="chart-note">
        Høj udnyttelse kan give lange køer ved variation i ankomst og
        behandling.
      </p>
    </div>
  );
}
export function ResultsPanel({
  comparison,
}: {
  comparison: Comparison | null;
}) {
  if (!comparison)
    return (
      <div className="empty-state">
        <BarChart3 size={35} />
        <h3>Fra antagelse til indsigt</h3>
        <p>
          Kør baseline og alternativ med samme seeds. Så kan du se, hvad én
          ændring betyder for dit team.
        </p>
      </div>
    );
  return (
    <>
      <div className="results-intro">
        <div>
          <span className="eyebrow">RESULTATER FRA MOTOREN</span>
          <h2>Gør forskellen synlig.</h2>
        </div>
        <span className="small-badge">
          {comparison.seeds.length} parrede kørsler ·{" "}
          {comparison.status === "completed" ? "Fuldført" : "Ufuldstændig"}
        </span>
      </div>
      <MetricCards comparison={comparison} />
      <div className="charts-grid">
        <QueueChart comparison={comparison} />
        <ResourceChart comparison={comparison} />
      </div>
      <div className="panel spread-panel">
        <div className="section-title">
          <div>
            <h3>Hvor sikkert er udfaldet?</h3>
            <p>10.–90.-percentil af forskellen mellem alternativ og baseline</p>
          </div>
          <Info size={20} />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Måling</th>
                <th>Baseline</th>
                <th>Alternativ</th>
                <th>Forskel, median</th>
                <th>Simulationsspredning</th>
                <th>Par</th>
              </tr>
            </thead>
            <tbody>
              {comparison.metrics.map((m) => (
                <tr key={m.key}>
                  <td>
                    <strong>{metricDefinitions[m.key].label}</strong>
                  </td>
                  <td>{formatMetric(m.key, m.baseline)}</td>
                  <td>{formatMetric(m.key, m.scenario)}</td>
                  <td>{formatDifference(m.key, m.deltaMedian)}</td>
                  <td>
                    {formatDifference(m.key, m.deltaP10)} til{" "}
                    {formatDifference(m.key, m.deltaP90)}
                  </td>
                  <td>{m.pairs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="notice-text">
          Spredningen beskriver variation i denne model. Den er ikke et
          konfidensinterval for virkeligheden. Gode antagelser er stadig
          afgørende.
        </p>
      </div>
      <div className="panel">
        <h3>Sagerne, du endnu ikke kan se hele udfaldet af</h3>
        <div className="cohort-grid">
          {(["baselineRuns", "scenarioRuns"] as const).map((field, i) => {
            const runs = comparison[field],
              avg = (
                f: "slaKnownBacklogBreaches" | "slaUnknownBacklog" | "aborted",
              ) =>
                runs.reduce((s, r) => s + r.metrics[f], 0) / (runs.length || 1);
            return (
              <div key={field}>
                <span className="eyebrow">
                  {i === 0 ? "BASELINE" : "ALTERNATIV"}
                </span>
                <p>
                  <b>{formatNumber(avg("slaKnownBacklogBreaches"), 1)}</b> sager
                  i restkøen har allerede overskredet SLA.
                </p>
                <p>
                  <b>{formatNumber(avg("slaUnknownBacklog"), 1)}</b> har endnu
                  ukendt SLA-udfald.
                </p>
                <p>
                  <b>{formatNumber(avg("aborted"), 1)}</b> er eksplicit afbrudt
                  af motoren.
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
