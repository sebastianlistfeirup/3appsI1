"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  FileSpreadsheet,
  Upload,
  X,
  Database,
  ShieldCheck,
} from "lucide-react";
import {
  CSV_FIELDS,
  CsvParser,
  cleanedCsv,
  inferDelimiter,
  percentile,
  parseTimestamp,
  type Comparison,
  type HoldoutAssessment,
  type CsvImport,
  type CsvMapping,
  type FlowModel,
} from "@tre/flow-engine";
import { downloadFile } from "@tre/persistence";
import { formatNumber, type Dataset } from "../lib/document";
import HoldoutPanel from "./holdout-panel";
export default function DataWorkshop({
  dataset,
  model,
  onSave,
  onCalibrate,
  baseline,
  comparison,
  assessment,
  trainingDataHashes,
  onHoldout,
}: {
  dataset: Dataset | null;
  model: FlowModel;
  onSave: (dataset: Dataset) => void;
  onCalibrate: (nodeId: string, duration: number, sourceHash: string) => void;
  baseline: FlowModel;
  comparison: Comparison | null;
  assessment: HoldoutAssessment | null;
  trainingDataHashes: string[];
  onHoldout: (assessment: HoldoutAssessment) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<CsvMapping>({}),
    [unit, setUnit] = useState<"iso" | "seconds" | "minutes">("iso"),
    [result, setResult] = useState<CsvImport | null>(null),
    [sha256, setSha256] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [exclude, setExclude] = useState(false),
    [observedActivity, setObservedActivity] = useState(""),
    [target, setTarget] = useState(
      model.nodes.find((n) => n.kind === "activity")?.id ?? "",
    );
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const loadFile = async (next: File) => {
    setError("");
    setResult(null);
    setExclude(false);
    setObservedActivity("");
    if (next.size > 10 * 1024 * 1024) {
      setError("Filen er større end 10 MB.");
      return;
    }
    if (!next.name.toLowerCase().endsWith(".csv")) {
      setError("Vælg en CSV-fil.");
      return;
    }
    const text = await next.slice(0, 4096).text();
    let columns: string[] = [];
    const parser = new CsvParser(inferDelimiter(text), (row) => {
      if (!columns.length)
        columns = row.map((c) => c.replace(/^\uFEFF/, "").trim());
    });
    parser.write(text);
    if (!columns.length) parser.finish();
    setHeaders(columns);
    setMapping(
      Object.fromEntries(
        columns.map((h) => [
          h,
          CSV_FIELDS.includes(h as (typeof CSV_FIELDS)[number])
            ? (h as (typeof CSV_FIELDS)[number])
            : "",
        ]),
      ),
    );
    setFile(next);
  };
  const analyze = () => {
    if (!file) return;
    const mapped = Object.values(mapping).filter(Boolean);
    if (new Set(mapped).size !== mapped.length) {
      setError("To kolonner må ikke mappes til samme felt.");
      return;
    }
    setError("");
    setProgress(0);
    setResult(null);
    const w = new Worker(
      new URL("../workers/import.worker.ts", import.meta.url),
    );
    worker.current = w;
    w.onmessage = (event) => {
      if (event.data.type === "progress") setProgress(event.data.progress);
      else if (event.data.type === "result") {
        setResult(event.data.result);
        setSha256(event.data.sha256);
        setProgress(null);
        w.terminate();
        worker.current = null;
      } else {
        setError(event.data.message ?? "Importen blev afbrudt.");
        setProgress(null);
        w.terminate();
        worker.current = null;
      }
    };
    w.onerror = () => {
      setError("Import-worker kunne ikke startes. Genindlæs og prøv igen.");
      setProgress(null);
      w.terminate();
    };
    w.postMessage({ type: "import", file, mapping, unit });
  };
  const current = result ?? dataset?.result,
    currentUnit = result ? unit : (dataset?.unit ?? unit),
    activityOptions = [
      ...new Set(
        current?.rows.map((row) => row.activity).filter(Boolean) ?? [],
      ),
    ].sort(),
    activity =
      observedActivity ||
      (activityOptions.length === 1 ? activityOptions[0] : ""),
    durations =
      current?.rows
        .filter((row) => !activityOptions.length || row.activity === activity)
        .flatMap((row) => {
          const start = parseTimestamp(row.started_at ?? "", currentUnit),
            end = parseTimestamp(row.finished_at ?? "", currentUnit);
          return start !== null && end !== null && end > start
            ? [end - start]
            : [];
        }) ?? [],
    median = percentile(durations, 0.5);
  return (
    <div className="data-workshop">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DATAVÆRKSTED</span>
          <h2>Gode beslutninger starter her.</h2>
          <p>Undersøg kvaliteten, før du gør data til en antagelse.</p>
        </div>
        <span className="small-badge">
          <ShieldCheck size={14} />
          Kun lokalt i din browser
        </span>
      </div>
      <div className="notice">
        <Database size={18} />
        <p>
          Denne demo er til syntetiske data. Brug ikke personnavne, e-mails
          eller rigtige kundeoplysninger. En import er ikke automatisk en
          kalibreret model.
        </p>
      </div>
      <div className="data-columns">
        <section className="panel">
          <div className="section-title">
            <h3>1. Vælg dit datagrundlag</h3>
            <FileSpreadsheet size={20} />
          </div>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Vælg CSV-fil"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f).catch((e) => setError(e.message));
            }}
          />
          <button
            className="upload-zone"
            onClick={() => input.current?.click()}
          >
            <span className="upload-icon">
              <Upload size={24} />
            </span>
            <strong>{file?.name ?? "Vælg en CSV-fil"}</strong>
            <span>Op til 10 MB · 100.000 rækker</span>
          </button>
          <button
            className="text-button"
            onClick={() =>
              downloadFile(
                "flowlab-eksempel.csv",
                "case_id,case_type,arrived_at,activity,started_at,finished_at,resource_group,event_id\nsample-001,standard,2026-10-16T09:00:00+02:00,Behandling,2026-10-16T09:02:00+02:00,2026-10-16T09:17:00+02:00,Team,evt-001\nsample-002,standard,2026-10-16T09:05:00+02:00,Behandling,2026-10-16T09:08:00+02:00,2026-10-16T09:29:00+02:00,Team,evt-002\nsample-003,standard,2026-10-16T09:10:00+02:00,Behandling,2026-10-16T09:11:00+02:00,2026-10-16T09:23:00+02:00,Team,evt-003",
                "text/csv",
              )
            }
          >
            <ArrowDownToLine size={15} />
            Hent syntetisk eksempelfil
          </button>
          {file && (
            <>
              <div className="field-divider" />
              <h3>2. Fortolk kolonnerne</h3>
              <label>
                Tidsformat
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as typeof unit)}
                >
                  <option value="iso">ISO-dato med eksplicit tidszone</option>
                  <option value="seconds">Sekunder fra periodens start</option>
                  <option value="minutes">Minutter fra periodens start</option>
                </select>
              </label>
              <p className="field-hint">
                ISO kræver Z eller fx +02:00. Manglende værdier bliver aldrig
                udfyldt automatisk.
              </p>
              {headers.map((header) => (
                <label className="mapping-row" key={header}>
                  <span>{header}</span>
                  <select
                    value={mapping[header] ?? ""}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        [header]: e.target.value as CsvMapping[string],
                      })
                    }
                  >
                    <option value="">Udelad kolonne</option>
                    {CSV_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                className="button primary full"
                disabled={progress !== null}
                onClick={analyze}
              >
                <FileSpreadsheet size={16} />
                Kontrollér data
              </button>
            </>
          )}
          {progress !== null && (
            <div className="import-progress">
              <progress max={1} value={progress} />
              <span>{Math.round(progress * 100)} %</span>
              <button
                className="text-button"
                onClick={() => worker.current?.postMessage({ type: "cancel" })}
              >
                Afbryd
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-box">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h3>3. Se hvad data kan fortælle</h3>
            <span className="small-badge">
              {current ? "Ikke kalibreret" : "Afventer data"}
            </span>
          </div>
          {current ? (
            <>
              <div className="data-stat-grid">
                <div>
                  <strong>{formatNumber(current.rowCount)}</strong>
                  <span>Rækker læst</span>
                </div>
                <div>
                  <strong>{formatNumber(current.rows.length)}</strong>
                  <span>Gyldige rækker</span>
                </div>
                <div className={current.excludedRows ? "error-text" : ""}>
                  <strong>{formatNumber(current.excludedRows)}</strong>
                  <span>Rækker med fejl</span>
                </div>
              </div>
              {current.warnings.map((w) => (
                <p className="notice-text" key={w}>
                  {w}
                </p>
              ))}
              {current.issues.length > 0 && (
                <div className="import-issues">
                  <h4>
                    <AlertTriangle size={15} />
                    {current.issueCount} konkrete problemer
                  </h4>
                  {current.issues.slice(0, 12).map((issue, i) => (
                    <p key={i}>
                      <strong>
                        Række {issue.row} · {issue.field}
                      </strong>
                      <br />
                      {issue.message}
                    </p>
                  ))}
                  {current.issues.length > 12 && (
                    <p>Flere fejl findes i det eksporterede kvalitetstjek.</p>
                  )}
                </div>
              )}
              <div
                className="table-scroll"
                role="region"
                aria-label="Forhåndsvisning af importerede rækker"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Sags-id</th>
                      <th>Start</th>
                      <th>Afslutning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.case_id || "Mangler"}</td>
                        <td>{r.started_at || "Mangler"}</td>
                        <td>{r.finished_at || "Mangler"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result && (
                <>
                  {result.excludedRows > 0 && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={exclude}
                        onChange={(e) => setExclude(e.target.checked)}
                      />
                      Jeg vil udelade de {result.excludedRows} fejlbehæftede
                      rækker. Ingen værdier imputeres.
                    </label>
                  )}
                  <button
                    className="button primary full"
                    disabled={
                      result.rows.length === 0 ||
                      (result.excludedRows > 0 && !exclude)
                    }
                    onClick={() => {
                      onSave({
                        id: crypto.randomUUID(),
                        name: file!.name,
                        importedAt: new Date().toISOString(),
                        sha256,
                        unit,
                        result,
                      });
                      setResult(null);
                      setFile(null);
                      setHeaders([]);
                      setExclude(false);
                    }}
                  >
                    <Check size={16} />
                    Gem valideret datagrundlag
                  </button>
                </>
              )}
              <div className="data-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    downloadFile(
                      "flowlab-rensede-data.csv",
                      cleanedCsv(current),
                      "text/csv",
                    )
                  }
                >
                  <ArrowDownToLine size={14} />
                  Renset CSV
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    downloadFile(
                      "flowlab-datakvalitet.json",
                      JSON.stringify({ ...current, rows: undefined }, null, 2),
                    )
                  }
                >
                  <ArrowDownToLine size={14} />
                  Kvalitetstjek
                </button>
              </div>
              {dataset && (
                <p className="field-hint">
                  Gemt: {dataset.name} · SHA-256:{" "}
                  <span className="hash">{dataset.sha256}</span>
                </p>
              )}
            </>
          ) : (
            <div className="empty-state compact">
              <FileSpreadsheet size={30} />
              <h3>Hver række skal kunne forklares.</h3>
              <p>
                Du får en forhåndsvisning med manglende felter, ugyldige tider
                og dubletter. Intet importeres før dit valg.
              </p>
            </div>
          )}
        </section>
      </div>
      {current && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h3>Fra observation til antagelse</h3>
              <p>
                {durations.length} positive aktivitetsvarigheder · median{" "}
                {median === null
                  ? "—"
                  : `${formatNumber(median / 60000, 1)} min`}
              </p>
            </div>
            <span className="small-badge">Manuel overførsel</span>
          </div>
          <div className="calibrate-row">
            {activityOptions.length > 0 && (
              <label>
                Observeret aktivitet
                <select
                  value={activity}
                  onChange={(event) => setObservedActivity(event.target.value)}
                >
                  <option value="">Vælg observationer…</option>
                  {activityOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Aktivitet i alternativet
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {model.nodes
                  .filter((n) => n.kind === "activity")
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={
                !median || !target || (!!result?.excludedRows && !exclude)
              }
              onClick={() => {
                if (median)
                  onCalibrate(
                    target,
                    Math.round(median),
                    result ? sha256 : dataset!.sha256,
                  );
              }}
            >
              Brug median som fast varighed
            </button>
          </div>
          <p className="notice-text">
            Dette ændrer én antagelse. Kalibrering kræver en separat
            holdout-periode og sammenligning med faktisk throughput og median
            gennemløbstid. Pilotmålet er højst 15 % afvigelse; modellen er
            fortsat ikke kalibreret.
          </p>
        </section>
      )}
      <HoldoutPanel
        key={dataset?.id ?? "no-dataset"}
        dataset={dataset}
        baseline={baseline}
        comparison={comparison}
        assessment={assessment}
        trainingDataHashes={trainingDataHashes}
        onSave={onHoldout}
      />
    </div>
  );
}
