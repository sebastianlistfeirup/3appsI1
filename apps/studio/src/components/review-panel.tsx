"use client";
import { ReviewDecision } from "./review-decision";
import type { SaveState } from "@tre/persistence";
import { sandboxDocument } from "../lib/preview";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { compareText, comparisonInput, contextRows } from "../lib/comparison";
import Link from "./local-link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Code2,
  Columns2,
  FileText,
  Layers3,
  Monitor,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { downloadFile } from "@tre/persistence";
import { artifactBytes, isStale, latestReview } from "../lib/model";
import {
  AssetIcon,
  Badge,
  DeliveryStatus,
  Empty,
  Notice,
  bytesLabel,
} from "./primitives";
import type { ProjectActions } from "./studio-app";
import { PanelHeading } from "./workspace-panels";
export function ReviewPanel({
  project,
  update,
  notify,
  deliveryId,
  onExport,
  exporting,
  storage,
}: ProjectActions & {
  deliveryId?: string;
  onExport: () => void;
  exporting: boolean;
  storage: { saveState: SaveState };
}) {
  const router = useRouter();
  const delivery =
    project.deliveries.find((d) => d.id === deliveryId) ??
    (!deliveryId
      ? (project.deliveries.find((d) => !latestReview(project, d.id)) ??
        project.deliveries.at(-1))
      : undefined);
  const [tab, setTab] = useState<"preview" | "diff" | "files">("preview");
  const [view, setView] = useState<"new" | "old" | "split">("new");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showDetails, setShowDetails] = useState(false);
  const [outputId, setOutputId] = useState<string | null>(null);
  useEffect(() => {
    setTab("preview");
    setOutputId(null);
    setView("new");
  }, [delivery?.id]);
  if (!delivery)
    return (
      <>
        <PanelHeading
          eyebrow="RESULTATET I CENTRUM"
          title="Godt arbejde fortjener et blik."
          text="Sammenlign, gennemgå og acceptér konkrete leverancer."
        />
        <Empty
          icon={<CheckCircle2 size={30} />}
          title={
            deliveryId
              ? "Leverancen findes ikke"
              : "Din første leverance venter"
          }
          text="Aflevér et resultat fra en opgave. Du får et låst inputsnapshot, filversioner og et review, der kan genåbnes."
        >
          <Link
            className="button primary"
            href={`/projects/${project.id}/tasks`}
          >
            Åbn opgaver <ArrowRight size={16} />
          </Link>
        </Empty>
      </>
    );
  const run = project.runs.find((r) => r.id === delivery.runId)!;
  const outputs = project.artifacts.filter((a) =>
    delivery.outputVersionIds.includes(a.id),
  );
  const primary =
    outputs.find((a) => a.id === outputId) ??
    outputs.find((a) => a.mime === "text/html") ??
    outputs.find((a) => a.kind === "code") ??
    outputs[0]!;
  const previous = comparisonInput(project, delivery, primary);
  const stale = isStale(project, delivery);
  const index = project.deliveries.indexOf(delivery) + 1;
  const renderPreview = (old: boolean) => {
    const a = old ? previous : primary;
    if (!a)
      return (
        <div className="no-preview">
          <Layers3 size={35} />
          <p>Denne fil fandtes ikke i opgavens input.</p>
        </div>
      );
    if (a.mime === "text/html" || a.mime === "image/svg+xml")
      return (
        <iframe
          title={old ? "Før: tidligere version" : "Efter: ny version"}
          srcDoc={sandboxDocument(
            a.encoding === "utf8"
              ? a.content
              : new TextDecoder().decode(artifactBytes(a)),
          )}
          sandbox=""
        />
      );
    if (a.mime.startsWith("image/") && a.encoding === "base64")
      return (
        <img
          src={`data:${a.mime};base64,${a.content}`}
          alt={`${old ? "Før" : "Efter"}: ${a.name}`}
        />
      );
    return (
      <pre className="text-preview">
        {a.encoding === "utf8"
          ? a.content.slice(0, 100_000) +
            (a.content.length > 100_000
              ? "\n\n… Preview viser de første 100.000 tegn. Hent filen for hele indholdet."
              : "")
          : "Denne filtype kan hentes fra fanen Filer."}
      </pre>
    );
  };
  return (
    <>
      <div className="review-heading">
        <div>
          <div className="eyebrow">
            LEVERANCE {String(index).padStart(2, "0")} <span>/</span> BRIEF V
            {run.briefVersion}
          </div>
          <h1>
            {delivery.title}
            <span className="heading-dot">.</span>
          </h1>
          <p>Se forskellen. Gennemgå resultatet. Du har det sidste ord.</p>
        </div>
        <DeliveryStatus project={project} deliveryId={delivery.id} />
      </div>
      {project.deliveries.length > 1 && (
        <label className="delivery-selector">
          Vælg leverance
          <select
            value={delivery.id}
            onChange={(e) => {
              router.push(`/projects/${project.id}/review/${e.target.value}`);
            }}
          >
            {project.deliveries.map((d, i) => (
              <option key={d.id} value={d.id}>
                {String(i + 1).padStart(2, "0")} · {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {stale && (
        <Notice>
          Der findes nyere input. Denne leverance bruger fortsat bestilling v
          {run.briefVersion} og sit oprindelige filsnapshot. Gennemgå ændringen
          før accept.
        </Notice>
      )}
      <div className="review-layout">
        <section className="review-main">
          <div className="review-workbench">
            <div className="review-file-selector">
              <label>
                Fil til gennemgang
                <select
                  value={primary.id}
                  onChange={(event) => {
                    setOutputId(event.target.value);
                    setView("new");
                  }}
                >
                  {outputs.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name} · v{file.version}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {outputs.length} {outputs.length === 1 ? "fil" : "filer"} i
                leverancen
              </span>
            </div>
            <div className="review-toolbar">
              <div
                className="tabs"
                role="tablist"
                aria-label="Leverancevisning"
              >
                <button
                  role="tab"
                  aria-selected={tab === "preview"}
                  onClick={() => setTab("preview")}
                  className={tab === "preview" ? "selected" : ""}
                >
                  <Monitor size={15} /> Preview
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "diff"}
                  onClick={() => setTab("diff")}
                  className={tab === "diff" ? "selected" : ""}
                >
                  <Code2 size={15} /> Kodediff
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "files"}
                  onClick={() => setTab("files")}
                  className={tab === "files" ? "selected" : ""}
                >
                  <Layers3 size={15} /> Filer <span>{outputs.length}</span>
                </button>
              </div>
              {tab === "preview" && (
                <div className="device-toggle">
                  <button
                    aria-label="Desktoppreview"
                    aria-pressed={device === "desktop"}
                    className={device === "desktop" ? "selected" : ""}
                    onClick={() => setDevice("desktop")}
                  >
                    <Monitor size={16} />
                  </button>
                  <button
                    aria-label="Mobilpreview"
                    aria-pressed={device === "mobile"}
                    className={device === "mobile" ? "selected" : ""}
                    onClick={() => setDevice("mobile")}
                  >
                    <Smartphone size={16} />
                  </button>
                </div>
              )}
            </div>
            <div className="comparison-baseline">
              <span>
                <ShieldCheck size={14} />
                {previous
                  ? `Låst input v${previous.version} → leveret v${primary.version}`
                  : "Ny fil · intet tidligere input"}
              </span>
              <div>
                {previous && (
                  <button
                    className="comparison-download"
                    onClick={() =>
                      downloadFile(
                        previous.name,
                        artifactBytes(previous) as Uint8Array<ArrayBuffer>,
                        previous.mime,
                      )
                    }
                    aria-label={`Hent låst input: ${previous.name} v${previous.version}`}
                  >
                    <ArrowDownToLine size={14} />
                    Input
                  </button>
                )}
                <button
                  className="comparison-download"
                  onClick={() =>
                    downloadFile(
                      primary.name,
                      artifactBytes(primary) as Uint8Array<ArrayBuffer>,
                      primary.mime,
                    )
                  }
                  aria-label={`Hent leveret fil: ${primary.name} v${primary.version}`}
                >
                  <ArrowDownToLine size={14} />
                  Output
                </button>
              </div>
            </div>
            {tab === "preview" ? (
              <>
                <div className="preview-frame-top">
                  <div className="window-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>{primary.name}</span>
                  <Badge>
                    v
                    {view === "old"
                      ? (previous?.version ?? "—")
                      : primary.version}
                  </Badge>
                </div>
                <div
                  className={`review-preview ${device === "mobile" ? "mobile-preview" : ""} ${view === "split" ? "split-preview" : ""}`}
                >
                  {view === "split" ? (
                    <>
                      <div>
                        <span className="frame-label">
                          FØR · v{previous?.version ?? "—"}
                        </span>
                        {renderPreview(true)}
                      </div>
                      <div>
                        <span className="frame-label new-label">
                          EFTER · v{primary.version}
                        </span>
                        {renderPreview(false)}
                      </div>
                    </>
                  ) : (
                    renderPreview(view === "old")
                  )}
                </div>
                <div className="preview-controls">
                  <div className="segmented">
                    <button
                      className={view === "old" ? "selected" : ""}
                      onClick={() => setView("old")}
                      disabled={!previous}
                    >
                      Før
                    </button>
                    <button
                      className={view === "new" ? "selected" : ""}
                      onClick={() => setView("new")}
                    >
                      Ny version
                    </button>
                    <button
                      className={view === "split" ? "selected" : ""}
                      onClick={() => setView("split")}
                      disabled={!previous}
                    >
                      <Columns2 size={14} /> Sammenlign
                    </button>
                  </div>
                  <span>
                    <ShieldCheck size={13} /> Isoleret preview
                  </span>
                </div>
              </>
            ) : tab === "diff" ? (
              <div className="diff-panel">
                <div className="diff-legend">
                  <span className="diff-old">− Låst input</span>
                  <span className="diff-new">+ Ny version</span>
                  <small>{primary.name}</small>
                </div>
                {primary.encoding === "utf8" ? (
                  <CodeDiff
                    key={`${delivery.id}:${primary.id}`}
                    before={
                      previous?.encoding === "utf8" ? previous.content : ""
                    }
                    after={primary.content}
                  />
                ) : (
                  <Notice>
                    Binære filer kan sammenlignes visuelt eller hentes som hver
                    sin version.
                  </Notice>
                )}
              </div>
            ) : (
              <div className="review-files">
                {outputs.map((a) => (
                  <div className="review-file" key={a.id}>
                    <span className="file-icon">
                      <AssetIcon artifact={a} />
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <small>
                        v{a.version} · {bytesLabel(a.bytes)} ·{" "}
                        {a.rights === "owned"
                          ? "Eget indhold"
                          : a.rights === "licensed"
                            ? "Licenseret"
                            : "Rettigheder uafklaret"}
                      </small>
                      <code>{a.sha256.slice(0, 24)}…</code>
                    </div>
                    <button
                      className="comparison-download"
                      aria-label={`Gennemgå ${a.name}`}
                      onClick={() => {
                        setOutputId(a.id);
                        setView("new");
                        setTab(
                          a.encoding === "utf8" && a.mime !== "text/html"
                            ? "diff"
                            : "preview",
                        );
                      }}
                    >
                      <Monitor size={16} /> Åbn
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Hent ${a.name}`}
                      onClick={() =>
                        downloadFile(
                          a.name,
                          artifactBytes(a) as Uint8Array<ArrayBuffer>,
                          a.mime,
                        )
                      }
                    >
                      <ArrowDownToLine size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <section className="change-summary">
            <div className="section-heading">
              <h2>Det er ændret.</h2>
              <Badge>MANUEL LEVERANCE</Badge>
            </div>
            <p>{delivery.summary}</p>
            <div className="change-facts">
              <span>
                <Layers3 size={16} />
                {outputs.length} outputversioner
              </span>
              <span>
                <FileText size={16} />
                Brief v{run.briefVersion}
              </span>
              <span>
                <CheckCircle2 size={16} />
                {delivery.checks.length} acceptkrav
              </span>
            </div>
          </section>
          <div className="evidence-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Et ærligt grundlag for dit review.</strong>
              <p>
                {delivery.checks.some((c) => c.source === "sample")
                  ? "Syntetisk eksempelproduktion. Kontrollér selv filerne og previewet; der er ikke udført et eksternt build eller en kodeagentkørsel."
                  : "Manuelt uploadet resultat. Kontrolpunkterne er aflevererens oplysninger og kræver din vurdering. Intet eksternt build er automatisk verificeret."}
              </p>
            </div>
          </div>
        </section>
        <aside className="review-inspector">
          <ReviewDecision
            key={`${project.id}:${delivery.id}`}
            project={project}
            deliveryId={delivery.id}
            update={update}
            notify={notify}
            storage={storage}
          />
          <section className="input-details">
            <button
              onClick={() => setShowDetails((s) => !s)}
              aria-expanded={showDetails}
            >
              <span>Låste input & historik</span>
              <ChevronDown size={16} />
            </button>
            {showDetails && (
              <div>
                <p>Bestilling v{run.briefVersion}</p>
                {run.taskSnapshot && (
                  <div className="review-task-definition">
                    <strong>{run.taskSnapshot.title}</strong>
                    <p>
                      Ansvarlig: {run.taskSnapshot.owner} · opgaverevision{" "}
                      {run.taskSnapshot.revision} ved start
                    </p>
                    <p className="preserve-lines">
                      {run.taskSnapshot.description}
                    </p>
                    <small>
                      Kontrolpunkterne er opgavens låste færdigkrav. Denne
                      leverance godkender ikke andre opgaver eller hele
                      projektet.
                    </small>
                  </div>
                )}
                {run.inputVersionIds.map((id) => {
                  const a = project.artifacts.find((x) => x.id === id);
                  return (
                    <p key={id}>
                      {a?.name} <strong>v{a?.version}</strong>
                    </p>
                  );
                })}
                <code>{run.id}</code>
                <p>Eksternt forbrug: 0,00 kr.</p>
              </div>
            )}
          </section>
          <button
            className="export-review"
            onClick={onExport}
            disabled={exporting}
          >
            <ArrowDownToLine size={17} />
            <span>
              {exporting ? "Pakker projekt…" : "Tag hele projektet med"}
              <small>ZIP · versioner, manifest & review</small>
            </span>
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>
    </>
  );
}
function CodeDiff({ before, after }: { before: string; after: string }) {
  const result = useMemo(() => compareText(before, after), [before, after]);
  const [showAll, setShowAll] = useState(false);
  const [showEndings, setShowEndings] = useState(
    () =>
      before !== after &&
      before.replace(/[\r\n]/g, "") === after.replace(/[\r\n]/g, ""),
  );
  const [limit, setLimit] = useState(400);
  if (result.kind === "too_large")
    return <div className="diff-message">{result.reason}</div>;
  const rows = showAll ? result.rows : contextRows(result.rows);
  const endings = showEndings;
  return (
    <>
      <div className="diff-options">
        <strong>
          {result.identical
            ? "Ingen ændringer i filens indhold"
            : `+${result.added} tilføjet · −${result.removed} fjernet`}
        </strong>
        <div>
          <label>
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => {
                setShowAll(event.target.checked);
                setLimit(400);
              }}
            />
            Vis alle linjer
          </label>
          <label>
            <input
              type="checkbox"
              checked={showEndings}
              onChange={(event) => setShowEndings(event.target.checked)}
            />
            Vis linjeskift
          </label>
        </div>
      </div>
      {result.coarse && (
        <p className="diff-message">
          Store blokke med gentagne linjer vises samlet som fjernet og tilføjet.
          Indholdet er komplet; fordelingen er forenklet.
        </p>
      )}
      {endings && (
        <p className="diff-ending-key">
          LF / CRLF / CR er filens linjeskift. ∅ betyder, at sidste linje ikke
          slutter med et linjeskift.
        </p>
      )}
      <div className="diff-column-labels" aria-hidden="true">
        <span>Før</span>
        <span>Ny</span>
        <span />
        <span>Filindhold</span>
      </div>
      <div
        className="diff-lines"
        tabIndex={0}
        role="region"
        aria-label="Kodeændringer med linjenumre"
      >
        {rows.slice(0, limit).map((row, i) =>
          row.type === "gap" ? (
            <div className="diff-gap" key={i}>
              {row.count} uændrede {row.count === 1 ? "linje" : "linjer"} · vælg
              “Vis alle linjer” for at læse dem
            </div>
          ) : (
            <div key={i} className={`diff-line ${row.type}`}>
              <span className="diff-number">
                {row.before && <span className="sr-only">Inputlinje </span>}
                {row.before ?? ""}
              </span>
              <span className="diff-number">
                {row.after && <span className="sr-only">Outputlinje </span>}
                {row.after ?? ""}
              </span>
              <span
                role="img"
                aria-label={
                  row.type === "added"
                    ? "Tilføjet"
                    : row.type === "removed"
                      ? "Fjernet"
                      : "Uændret"
                }
              >
                {row.type === "added"
                  ? "+"
                  : row.type === "removed"
                    ? "−"
                    : " "}
              </span>
              <code>
                {row.text || " "}
                {endings && (
                  <small className="diff-eol">
                    {row.ending === "none" ? "∅" : row.ending}
                  </small>
                )}
              </code>
            </div>
          ),
        )}
        {rows.length > limit && (
          <button
            className="diff-more"
            onClick={() => setLimit((current) => current + 400)}
          >
            Vis næste {Math.min(400, rows.length - limit)} linjer ·{" "}
            {rows.length - limit} tilbage
          </button>
        )}
      </div>
    </>
  );
}
