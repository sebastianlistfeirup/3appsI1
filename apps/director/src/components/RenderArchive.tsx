"use client";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Download,
  RefreshCw,
  Clock3,
  AlertCircle,
} from "lucide-react";
import type { Project } from "@tre/scene-format";
import type { RenderHistory, RenderState } from "../lib/render-state";
const labels: Record<RenderState["state"], string> = {
  queued: "Klar til render",
  running: "Render startet",
  validating: "Kontrollerer film",
  succeeded: "Færdig film",
  failed: "Eksport fejlede",
  cancelled: "Annulleret",
};
const date = (value: string) =>
  new Date(value).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function RenderArchive({
  project,
  current,
  snapshotHash,
  onSelect,
}: {
  project: Project;
  current: RenderState | null;
  snapshotHash?: string;
  onSelect: (job: RenderState) => void;
}) {
  const [open, setOpen] = useState(false),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false),
    [history, setHistory] = useState<RenderHistory | null>(null),
    [error, setError] = useState("");
  const projectRef = useRef(project.id);
  useEffect(() => {
    if (projectRef.current !== project.id) {
      projectRef.current = project.id;
      setHistory(null);
    }
  }, [project.id]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), 15000);
    setLoading(true);
    setError("");
    void fetch(
      `/api/exports/history?projectId=${encodeURIComponent(project.id)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error ?? "Eksportarkivet kunne ikke hentes");
        return result as RenderHistory;
      })
      .then((result) => {
        if (!controller.signal.aborted) setHistory(result);
      })
      .catch((error) => {
        if (
          !controller.signal.aborted ||
          controller.signal.reason === "timeout"
        )
          setError(
            controller.signal.reason === "timeout"
              ? "Eksportarkivet svarede ikke. Prøv igen."
              : error instanceof TypeError || error instanceof SyntaxError
                ? "Forbindelsen til det lokale eksportarkiv blev afbrudt. Prøv igen; dine filer er bevaret."
                : error.message,
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (
          !controller.signal.aborted ||
          controller.signal.reason === "timeout"
        )
          setLoading(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, project.id, current?.id, current?.state, refresh]);
  const jobs =
    history?.jobs.filter((job) => job.source?.projectId === project.id) ?? [];
  return (
    <details
      className="render-archive"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Archive size={17} />
        <span>
          Tidligere eksporter
          <small>Bevar og hent dine tidligere klipninger</small>
        </span>
      </summary>
      {open && (
        <div className="render-archive-body">
          <div className="archive-header">
            <strong>Eksporter fra denne produktion</strong>
            <button
              className="text-button"
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={14} /> Opdatér arkiv
            </button>
          </div>
          {loading && <p role="status">Henter lokale eksporter …</p>}
          {error && (
            <p className="caption-warning" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && !jobs.length && (
            <p>
              Du har endnu ingen eksporter i dette lokale arkiv. Din første
              færdige film bliver gemt her.
            </p>
          )}
          <div className="render-history-list">
            {jobs.map((job) => {
              const pending = ["queued", "running", "validating"].includes(
                job.state,
              );
              const query = `projectId=${encodeURIComponent(project.id)}`;
              return (
                <article
                  key={job.id}
                  className={`render-history-item ${current?.id === job.id ? "selected" : ""}`}
                  data-render-id={job.id}
                >
                  <div className="render-history-heading">
                    {job.state === "succeeded" ? (
                      <Check size={16} />
                    ) : pending ? (
                      <Clock3 size={16} />
                    ) : (
                      <AlertCircle size={16} />
                    )}
                    <span>
                      <strong>{job.source?.title}</strong>
                      <small>
                        Revision {job.source?.revision} · {date(job.createdAt)}
                      </small>
                    </span>
                    <span className="render-history-state">
                      {labels[job.state]}
                    </span>
                  </div>
                  <p>
                    {(job.expectedFrames / 24).toLocaleString("da-DK", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    sek. ·{" "}
                    {job.sequenceVersion
                      ? `${job.sequenceVersion.name} · v${job.sequenceVersion.version}`
                      : "Uden navngivet sekvens"}
                  </p>
                  <small className="snapshot-relation">
                    {snapshotHash
                      ? job.manifestHash === snapshotHash
                        ? "Matcher din aktuelle projektversion"
                        : "Tidligere projektversion · dine ændringer er bevaret"
                      : "En selvstændig, gemt projektversion"}
                  </small>
                  <div className="render-history-actions">
                    <button
                      className="text-button"
                      onClick={() => onSelect(job)}
                      aria-label={`${pending ? "Genoptag og vis" : "Vis"} eksport fra revision ${job.source?.revision}, ${job.id.slice(0, 8)}`}
                    >
                      {pending ? "Genoptag og vis" : "Vis detaljer"}
                    </button>
                    {job.state === "succeeded" && (
                      <a
                        href={`/api/exports/${job.id}?${query}&download=1`}
                        download
                      >
                        <Download size={13} /> Hent MP4
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {history && (
            <p className="render-retention">
              På render-serveren: {history.storage.occupiedEntries} af{" "}
              {history.storage.maxJobs} lokale jobpladser. Filer slettes ikke
              automatisk. Nye jobs kræver mindst 512 MB fri disk; aktuelt cirka{" "}
              {(history.storage.freeBytes / 1024 ** 3).toLocaleString("da-DK", {
                maximumFractionDigits: 1,
              })}{" "}
              GB. Arkivet følger serveren, ikke denne browser.
            </p>
          )}
          {!!history?.legacyJobs && (
            <p className="render-retention">
              {history.legacyJobs} ældre job mangler projektbinding og vises
              derfor ikke i produktionens liste. Deres filer er bevaret.
            </p>
          )}
          {!!history?.unreadableJobs && (
            <p className="caption-warning">
              {history.unreadableJobs} lokale jobstatusser kunne ikke læses.
              Ingen filer er slettet.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
