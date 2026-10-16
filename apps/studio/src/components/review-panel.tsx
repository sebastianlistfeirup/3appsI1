"use client";
import { sandboxDocument } from "../lib/preview";
import { useEffect, useMemo, useState } from "react";
import { compareText, comparisonInput, contextRows } from "../lib/comparison";
import Link from "./local-link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Columns2,
  FileText,
  Layers3,
  MessageSquare,
  Monitor,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { downloadFile } from "@tre/persistence";
import {
  artifactBytes,
  isStale,
  latestReview,
  reviewDelivery,
} from "../lib/model";
import {
  AssetIcon,
  Badge,
  DeliveryStatus,
  Empty,
  Notice,
  bytesLabel,
  formatDate,
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
}: ProjectActions & {
  deliveryId?: string;
  onExport: () => void;
  exporting: boolean;
}) {
  const delivery =
    project.deliveries.find((d) => d.id === deliveryId) ??
    (!deliveryId
      ? (project.deliveries.find((d) => !latestReview(project, d.id)) ??
        project.deliveries.at(-1))
      : undefined);
  const [tab, setTab] = useState<"preview" | "diff" | "files">("preview");
  const [view, setView] = useState<"new" | "old" | "split">("new");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [comment, setComment] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [outputId, setOutputId] = useState<string | null>(null);
  useEffect(() => {
    setComment("");
    setChecked([]);
    setAck(false);
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
  const review = latestReview(project, delivery.id);
  const stale = isStale(project, delivery);
  const canAccept =
    comment.trim() &&
    delivery.checks.every((c) => c.passed && checked.includes(c.id)) &&
    (!stale || ack);
  const index = project.deliveries.indexOf(delivery) + 1;
  function decide(decision: "accepted" | "changes_requested") {
    try {
      const next = reviewDelivery(project, delivery!.id, {
        decision,
        reviewer: "Mig",
        comment: comment.trim(),
        checkedCriteria: checked,
        acknowledgedStale: ack,
      });
      if (!update(() => next)) return;
      notify(
        decision === "accepted"
          ? "Leverancen er accepteret. Dit review og alle filversioner er bevaret."
          : "En ny rettelsesopgave er oprettet med din kommentar.",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Review kunne ikke gemmes.",
        true,
      );
    }
  }
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
          srcDoc={sandboxDocument(a.content)}
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
              window.location.href = `/projects/${project.id}/review/${e.target.value}`;
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
          <section className="review-checklist">
            <div className="inspector-heading">
              <div className="review-symbol">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h2>{review ? "Dit review er gemt." : "Klar til dit blik."}</h2>
                <p>
                  {review
                    ? "Resultatet og historien er bevaret."
                    : "Tag stilling til det færdige arbejde."}
                </p>
              </div>
            </div>
            <div className="inspector-divider" />
            <span className="small-label">
              ACCEPTKRAV{" "}
              <span>
                {review ? review.checkedCriteria.length : checked.length}/
                {delivery.checks.length}
              </span>
            </span>
            <div className="checklist-items">
              {delivery.checks.map((check, i) => (
                <div
                  key={check.id}
                  className={!check.passed ? "check-failed" : ""}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        review
                          ? review.checkedCriteria.includes(check.id)
                          : checked.includes(check.id)
                      }
                      disabled={Boolean(review) || !check.passed}
                      onChange={(e) =>
                        setChecked((c) =>
                          e.target.checked
                            ? [...c, check.id]
                            : c.filter((x) => x !== check.id),
                        )
                      }
                    />
                    <span>{check.label}</span>
                  </label>
                  {!check.passed && (
                    <small>Kontrolpunkt fejlede · kræver rettelse</small>
                  )}
                  <details>
                    <summary>Se grundlag</summary>
                    <p>{check.evidence}</p>
                  </details>
                </div>
              ))}
            </div>
            {review ? (
              <div
                className={`review-decision ${review.decision === "accepted" ? "accepted" : "requested"}`}
              >
                <CheckCircle2 size={22} />
                <strong>
                  {review.decision === "accepted"
                    ? "Accepteret af dig"
                    : "Rettelse ønsket"}
                </strong>
                <p>{review.comment}</p>
                <small>{formatDate(review.createdAt)}</small>
                {review.decision === "changes_requested" && (
                  <Link href={`/projects/${project.id}/tasks`}>
                    Se rettelsesopgaven <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="inspector-divider" />
                <label className="review-comment">
                  DIN VURDERING
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    placeholder="Hvad har du gennemgået? Er noget stadig usikkert?"
                  />
                </label>
                {stale && (
                  <label className="checkbox-row stale-confirm">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    <span>
                      Jeg accepterer eksplicit leverancen med dens ældre input.
                    </span>
                  </label>
                )}
                <button
                  className="button primary accept-button"
                  disabled={!canAccept}
                  onClick={() => decide("accepted")}
                >
                  <Check size={17} /> Acceptér leverance
                </button>
                <button
                  className="button secondary request-button"
                  disabled={!comment.trim()}
                  onClick={() => decide("changes_requested")}
                >
                  <MessageSquare size={16} /> Bed om en rettelse
                </button>
                <p className="review-hint">
                  {!comment.trim()
                    ? "Gennemgå kravene og tilføj din vurdering."
                    : "Dit review bliver knyttet til denne præcise version."}
                </p>
              </>
            )}
          </section>
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
