"use client";
import { sandboxDocument } from "../lib/preview";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCode2,
  FileText,
  GitBranch,
  History,
  Layers3,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { downloadFile } from "@tre/persistence";
import {
  addArtifact,
  addDependency,
  addTask,
  artifactBytes,
  artifactSchema,
  beginManualRun,
  cancelRun,
  latestBrief,
  saveBrief,
  setTaskState,
  sha256,
  submitDelivery,
  textArtifact,
  uid,
  type Artifact,
  type Project,
  type Studio,
  type Task,
} from "../lib/model";
import {
  AssetIcon,
  Badge,
  Empty,
  Modal,
  Notice,
  bytesLabel,
  formatDate,
} from "./primitives";
import type { ProjectActions } from "./studio-app";

export function BriefPanel({ project, update, notify }: ProjectActions) {
  const brief = latestBrief(project);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(brief.version);
  const [goal, setGoal] = useState(brief.goal);
  const [audience, setAudience] = useState(brief.audience);
  const [constraints, setConstraints] = useState(brief.constraints);
  const [criteria, setCriteria] = useState(brief.acceptance.join("\n"));
  const selected =
    project.briefVersions.find((b) => b.version === version) ?? brief;
  function edit() {
    setGoal(brief.goal);
    setAudience(brief.audience);
    setConstraints(brief.constraints);
    setCriteria(brief.acceptance.join("\n"));
    setEditing(true);
  }
  return (
    <>
      <PanelHeading
        eyebrow="EN KLAR RETNING"
        title="Den gode bestilling."
        text="Færdigt arbejde begynder med en fælles forståelse."
      >
        <button className="button primary" onClick={edit}>
          <Plus size={16} />
          {brief.goal ? "Ny briefversion" : "Skriv din bestilling"}
        </button>
      </PanelHeading>
      <div className="detail-columns">
        <section className="paper-card">
          <div className="paper-header">
            <Badge kind="purple">BRIEF V{selected.version}</Badge>
            <span>{formatDate(selected.createdAt)}</span>
          </div>
          <div className="paper-section">
            <span className="small-label">DET VIL VI OPNÅ</span>
            <h2>
              {selected.goal ||
                "Hvad skal være anderledes, når arbejdet er færdigt?"}
            </h2>
          </div>
          <div className="paper-section">
            <span className="small-label">FOR HVEM</span>
            <p>
              {selected.audience || "Beskriv, hvem der får glæde af ændringen."}
            </p>
          </div>
          <div className="paper-section">
            <span className="small-label">FÆRDIG BETYDER</span>
            {selected.acceptance.length ? (
              <ol className="numbered-criteria">
                {selected.acceptance.map((a, i) => (
                  <li key={`${i}-${a}`}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <p>{a}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Tilføj konkrete, efterprøvelige acceptkrav.</p>
            )}
          </div>
          <div className="paper-section">
            <span className="small-label">RAMMER OG BEGRÆNSNINGER</span>
            <p className="preserve-lines">
              {selected.constraints || "Ingen begrænsninger beskrevet endnu."}
            </p>
          </div>
        </section>
        <aside>
          <div className="info-card">
            <History size={21} />
            <h3>Historien bliver her.</h3>
            <p>
              En ny bestilling opretter en ny version. Igangværende leverancer
              beholder deres oprindelige input.
            </p>
            <div className="version-list">
              {[...project.briefVersions].reverse().map((b) => (
                <button
                  key={b.id}
                  className={b.version === selected.version ? "selected" : ""}
                  onClick={() => setVersion(b.version)}
                >
                  <span>Bestilling v{b.version}</span>
                  {b.version === brief.version ? (
                    <Badge kind="purple">Aktuel</Badge>
                  ) : (
                    <span>{formatDate(b.createdAt)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="tip-card">
            <span className="small-label">ET GODT ACCEPTKRAV</span>
            <p>
              “Spilleren kan se sin aktive quest og næste handling direkte i
              menuen.”
            </p>
            <small>Beskriv det observerbare resultat.</small>
          </div>
        </aside>
      </div>
      {editing && (
        <Modal
          title="Giv arbejdet en tydelig retning"
          description={`Gemmes som uforanderlig bestilling v${brief.version + 1}.`}
          onClose={() => setEditing(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !update((p) =>
                  saveBrief(p, {
                    goal: goal.trim(),
                    audience: audience.trim(),
                    constraints: constraints.trim(),
                    acceptance: criteria
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                )
              )
                return;
              setVersion(brief.version + 1);
              setEditing(false);
              notify("Ny briefversion gemt. Tidligere versioner er bevaret.");
            }}
          >
            <label>
              Hvad vil du opnå?
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
                rows={3}
                maxLength={10000}
              />
            </label>
            <label>
              Hvem er det til?
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                maxLength={1000}
              />
            </label>
            <label>
              Acceptkrav <span>Ét krav pr. linje</span>
              <textarea
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                required
                rows={4}
                maxLength={10000}
                placeholder="Resultatet kan åbnes på mobil…"
              />
            </label>
            <label>
              Rammer og begrænsninger
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                rows={3}
                maxLength={10000}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
              >
                Annuller
              </button>
              <button className="button primary">
                Gem ny version <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function PanelHeading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}
const taskLabels: Record<Task["state"], string> = {
  ready: "Klar",
  in_progress: "I gang",
  review: "Til review",
  done: "Afsluttet",
  blocked: "Afventer rettelse",
};
export function TasksPanel({ project, update, notify }: ProjectActions) {
  const [creating, setCreating] = useState(false);
  const [dependency, setDependency] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [deliverTask, setDeliverTask] = useState<string | null>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  const columns: Task["state"][] = [
    "ready",
    "in_progress",
    "review",
    "done",
    "blocked",
  ];
  return (
    <>
      <PanelHeading
        eyebrow="SMÅ SKRIDT. SYNLIG FREMDRIFT."
        title="Arbejdet finder sin form."
        text="Hold styr på det næste skridt — og hvad der skal være færdigt først."
      >
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Ny opgave
        </button>
      </PanelHeading>
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={view === "board" ? "selected" : ""}
            onClick={() => setView("board")}
          >
            <Layers3 size={14} /> Tavle
          </button>
          <button
            className={view === "list" ? "selected" : ""}
            onClick={() => setView("list")}
          >
            <ListChecks size={14} /> Liste
          </button>
        </div>
        <button
          className="button secondary"
          onClick={() => setDependency(true)}
          disabled={project.tasks.length < 2}
        >
          <GitBranch size={15} /> Tilføj afhængighed
        </button>
      </div>
      {!project.tasks.length ? (
        <Empty
          icon={<ListChecks size={30} />}
          title="Del idéen op i gode skridt."
          text="Opret den første konkrete opgave. Hver opgave refererer til en præcis briefversion."
        >
          <button className="button primary" onClick={() => setCreating(true)}>
            Opret første opgave
          </button>
        </Empty>
      ) : (
        <div className={view === "board" ? "task-board" : "task-list"}>
          {columns
            .filter(
              (s) =>
                s !== "blocked" ||
                project.tasks.some((t) => t.state === "blocked"),
            )
            .map((state) => (
              <section className={`task-column column-${state}`} key={state}>
                <div className="task-column-title">
                  <span className={`state-dot state-${state}`} />
                  <h2>{taskLabels[state]}</h2>
                  <span>
                    {project.tasks.filter((t) => t.state === state).length}
                  </span>
                </div>
                {project.tasks
                  .filter((t) => t.state === state)
                  .map((t) => {
                    const deps = project.edges
                      .filter((e) => e.to === t.id)
                      .map((e) => project.tasks.find((x) => x.id === e.from)!);
                    return (
                      <article className="task-card" key={t.id}>
                        <button
                          className="task-card-main"
                          onClick={() => setDetail(t)}
                        >
                          <div className="task-id">
                            OPGAVE{" "}
                            {String(project.tasks.indexOf(t) + 1).padStart(
                              2,
                              "0",
                            )}
                            <span>BRIEF V{t.briefVersion}</span>
                          </div>
                          <h3>{t.title}</h3>
                          <p>{t.description || "Klar til dit næste skridt."}</p>
                        </button>
                        {deps.length > 0 && (
                          <div className="task-dependencies">
                            <GitBranch size={13} />
                            <span>
                              Afhænger af {deps.map((x) => x.title).join(", ")}
                            </span>
                          </div>
                        )}
                        <div className="task-card-bottom">
                          <span className="owner-chip">M</span>
                          <span>{t.owner}</span>
                          {["ready", "in_progress"].includes(t.state) && (
                            <button
                              className="text-button"
                              onClick={() => setDeliverTask(t.id)}
                            >
                              Levér <ArrowUpRight size={13} />
                            </button>
                          )}
                          {t.state === "review" && (
                            <Link
                              className="text-button"
                              href={`/projects/${project.id}/review`}
                            >
                              Se review <ArrowUpRight size={13} />
                            </Link>
                          )}
                          {t.state === "done" && (
                            <CheckCircle2 size={16} className="text-success" />
                          )}
                        </div>
                      </article>
                    );
                  })}
                {project.tasks.every((t) => t.state !== state) && (
                  <div className="empty-column">Ingen opgaver her endnu</div>
                )}
              </section>
            ))}
        </div>
      )}
      <Notice>
        Manuelt flow: Du udfører arbejdet i dine egne værktøjer og afleverer
        filen her. Kodeagent og GitHub er ikke tilkoblet.
      </Notice>
      {creating && (
        <Modal
          title="Ét konkret skridt videre"
          onClose={() => setCreating(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!update((p) => addTask(p, title, description))) return;
              setTitle("");
              setDescription("");
              setCreating(false);
              notify("Opgaven er oprettet med den aktuelle briefversion.");
            }}
          >
            <label>
              Hvad skal laves?
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                placeholder="Fx tilføj et questpanel til menuen"
              />
            </label>
            <label>
              Beskrivelse
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={10000}
              />
            </label>
            <div className="modal-actions">
              <button className="button primary">
                Opret opgave <Plus size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dependency && (
        <Modal
          title="Hvad kommer først?"
          description="Afhængigheden bliver kun gemt, hvis opgavegrafen forbliver uden cirkler."
          onClose={() => setDependency(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const next = addDependency(project, from, to);
                if (!update(() => next)) return;
                setDependency(false);
                notify("Afhængigheden er tilføjet.");
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Ugyldig afhængighed",
                  true,
                );
              }
            }}
          >
            <label>
              Denne opgave skal afsluttes først
              <select
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Vælg opgave</option>
                {project.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Før denne opgave kan starte
              <select
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Vælg opgave</option>
                {project.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="button primary">Gem afhængighed</button>
            </div>
          </form>
        </Modal>
      )}
      {deliverTask && (
        <DeliveryDialog
          project={project}
          taskId={deliverTask}
          update={update}
          notify={notify}
          onClose={() => setDeliverTask(null)}
        />
      )}{" "}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <p className="preserve-lines">
            {detail.description || "Ingen beskrivelse."}
          </p>
          <div className="paper-section">
            <span className="small-label">
              ACCEPTKRAV FRA BRIEF V{detail.briefVersion}
            </span>
            {detail.acceptance.map((a) => (
              <p key={a}>◇ {a}</p>
            ))}
          </div>
          <Badge kind="purple">{taskLabels[detail.state]}</Badge>
          {detail.state !== "done" && (
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => {
                  if (!update((p) => setTaskState(p, detail.id, "blocked")))
                    return;
                  setDetail(null);
                }}
              >
                Markér blokeret
              </button>
              {["ready", "in_progress"].includes(detail.state) && (
                <button
                  className="button primary"
                  onClick={() => {
                    setDeliverTask(detail.id);
                    setDetail(null);
                  }}
                >
                  Opret manuel levering <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
function DeliveryDialog({
  project,
  taskId,
  update,
  notify,
  onClose,
}: ProjectActions & { taskId: string; onClose: () => void }) {
  const task = project.tasks.find((t) => t.id === taskId)!;
  const existing = project.runs.find(
    (r) => r.taskId === taskId && r.state === "awaiting_upload",
  );
  const [runId, setRunId] = useState(existing?.id ?? "");
  const [requestId] = useState(() => uid("request"));
  const [title, setTitle] = useState(task.title);
  const [summary, setSummary] = useState("");
  const [artifactId, setArtifactId] = useState("");
  const [content, setContent] = useState("");
  const [name, setName] = useState("resultat.html");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"text" | "existing">("text");
  const [risk, setRisk] = useState(false);
  function start() {
    try {
      const next = beginManualRun(project, taskId, requestId);
      const run = next.runs.find((r) => r.idempotencyKey === requestId)!;
      if (!update(() => next)) return;
      setRunId(run.id);
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Leveringen kunne ikke startes.",
        true,
      );
    }
  }
  async function deliver() {
    setBusy(true);
    try {
      let next = project;
      let outputId = artifactId;
      if (mode === "text") {
        const previous = project.artifacts.find((a) => a.name === name);
        const artifact = await textArtifact(
          project,
          name,
          content,
          "code",
          previous?.artifactId,
        );
        next = addArtifact(next, artifact);
        outputId = artifact.id;
      }
      const run = next.runs.find((r) => r.id === runId)!;
      const brief = next.briefVersions.find(
        (b) => b.version === run.briefVersion,
      )!;
      next = submitDelivery(next, runId, {
        title,
        summary,
        outputVersionIds: [outputId],
        checks: brief.acceptance.map((label, i) => ({
          id: `criterion-${i}`,
          label,
          passed: !risk,
          source: "manual",
          evidence: risk
            ? "Afleverer har markeret kendt fejl. Kræver rettelse."
            : "Manuel aflevering. Kræver brugerens gennemgang før accept.",
        })),
      });
      if (!update(() => next)) return;
      onClose();
      notify(
        "Leverancen er klar til review. Den er ikke automatisk verificeret.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Leveringen fejlede.", true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        runId ? "Aflevér et konkret resultat" : "Lås input. Skab noget godt."
      }
      description={
        runId
          ? "Dit arbejde bliver en ny leverance. Tidligere versioner bliver bevaret."
          : `Opgave: ${task.title}`
      }
      onClose={onClose}
    >
      {!runId ? (
        <>
          <div className="input-snapshot">
            <span className="small-label">DIT INPUTSNAPSHOT</span>
            <h3>Bestilling v{latestBrief(project).version}</h3>
            <p>
              {
                project.artifacts.filter(
                  (a) =>
                    !project.artifacts.some(
                      (b) =>
                        b.artifactId === a.artifactId && b.version > a.version,
                    ),
                ).length
              }{" "}
              aktuelle filversioner · 0 kr. i eksternt forbrug
            </p>
          </div>
          <Notice>
            Dette starter en manuel levering. Studio One udfører ikke kode eller
            AI-arbejde i denne profil.
          </Notice>
          <div className="modal-actions">
            <button className="button primary" onClick={start}>
              Lås input og fortsæt <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void deliver();
          }}
        >
          <Badge kind="purple">INPUT LÅST · MANUAL</Badge>
          <label>
            Leverancens titel
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={300}
            />
          </label>
          <label>
            Hvad er ændret?
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              rows={2}
            />
          </label>
          <div className="segmented">
            <button
              type="button"
              className={mode === "text" ? "selected" : ""}
              onClick={() => setMode("text")}
            >
              Ny tekst-/kodefil
            </button>
            <button
              type="button"
              className={mode === "existing" ? "selected" : ""}
              onClick={() => setMode("existing")}
            >
              Eksisterende fil
            </button>
          </div>
          {mode === "text" ? (
            <>
              <label>
                Filnavn
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Filindhold
                <textarea
                  className="code-input"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={7}
                  maxLength={100000}
                />
              </label>
            </>
          ) : (
            <label>
              Vælg outputversion
              <select
                required
                value={artifactId}
                onChange={(e) => setArtifactId(e.target.value)}
              >
                <option value="">Vælg fil</option>
                {project.artifacts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · v{a.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={risk}
              onChange={(e) => setRisk(e.target.checked)}
            />
            <span>
              Der er en kendt fejl. Leverancen må ikke accepteres endnu.
            </span>
          </label>
          <div className="modal-actions">
            <button className="button primary" disabled={busy}>
              {busy ? "Gemmer…" : "Send til review"} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function AssetsPanel({ project, update, notify }: ProjectActions) {
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const [provenance, setProvenance] = useState("Mit eget arbejde");
  const [rights, setRights] = useState<Artifact["rights"]>("unknown");
  const [uploading, setUploading] = useState(false);
  const files = project.artifacts.filter(
    (a) =>
      (all ||
        !project.artifacts.some(
          (b) => b.artifactId === a.artifactId && b.version > a.version,
        )) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function addFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2_000_000)
        throw new Error("Filer i den lokale demo må højst fylde 2 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const textual = /\.(html|css|js|ts|tsx|json|md|txt|svg)$/i.test(
        file.name,
      );
      const previous = project.artifacts
        .filter((a) => a.name === file.name)
        .sort((a, b) => b.version - a.version)[0];
      let binary = "";
      if (!textual) for (const b of bytes) binary += String.fromCharCode(b);
      const a = artifactSchema.parse({
        id: uid("version"),
        artifactId: previous?.artifactId ?? uid("artifact"),
        version: (previous?.version ?? 0) + 1,
        name: file.name,
        mime: file.type || "application/octet-stream",
        content: textual
          ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
          : btoa(binary),
        encoding: textual ? "utf8" : "base64",
        sha256: await sha256(bytes),
        bytes: bytes.length,
        kind: file.type.startsWith("image/")
          ? "image"
          : textual
            ? "code"
            : "other",
        rights,
        provenance,
        createdAt: new Date().toISOString(),
      });
      if (!update((p) => addArtifact(p, a))) return;
      setUploading(false);
      notify(`${file.name} er tilføjet som version ${a.version}.`);
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Filen kunne ikke tilføjes.",
        true,
      );
    } finally {
      setBusy(false);
      if (upload.current) upload.current.value = "";
    }
  }
  return (
    <>
      <PanelHeading
        eyebrow="ET STED TIL ALLE VERSIONER"
        title="Intet godt arbejde går tabt."
        text="Filer, ophav og historik — knyttet til den produktion, de hører til."
      >
        <button className="button primary" onClick={() => setUploading(true)}>
          <Upload size={16} /> Tilføj fil
        </button>
      </PanelHeading>
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={!all ? "selected" : ""}
            onClick={() => setAll(false)}
          >
            Aktuelle filer
          </button>
          <button
            className={all ? "selected" : ""}
            onClick={() => setAll(true)}
          >
            Alle versioner
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søg i filer"
            placeholder="Find en fil"
          />
        </label>
      </div>
      {files.length ? (
        <div className="asset-table">
          <div className="asset-table-head">
            <span>FIL</span>
            <span>VERSION</span>
            <span>OPHAV</span>
            <span>STØRRELSE</span>
            <span />
          </div>
          {files.map((a) => (
            <div className="asset-row" key={a.id}>
              <button className="asset-name" onClick={() => setSelected(a)}>
                <span className={`file-icon file-${a.kind}`}>
                  <AssetIcon artifact={a} />
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.kind === "evidence"
                      ? "Review & dokumentation"
                      : a.kind === "design"
                        ? "Designreference"
                        : a.mime}
                  </small>
                </span>
              </button>
              <Badge>v{a.version}</Badge>
              <span className={a.rights === "unknown" ? "text-warning" : ""}>
                {a.rights === "owned"
                  ? "Eget indhold"
                  : a.rights === "licensed"
                    ? "Licenseret"
                    : "Uafklaret"}
              </span>
              <span className="subtle">{bytesLabel(a.bytes)}</span>
              <button
                className="icon-button"
                aria-label={`Hent ${a.name} v${a.version}`}
                onClick={() =>
                  downloadFile(
                    a.name,
                    artifactBytes(a) as Uint8Array<ArrayBuffer>,
                    a.mime,
                  )
                }
              >
                <ArrowDownToLine size={17} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Layers3 size={30} />}
          title={
            search
              ? "Ingen filer matcher"
              : "Giv projektet noget at arbejde med."
          }
          text={
            search
              ? "Prøv et andet filnavn."
              : "Tilføj et design, eksisterende kode eller en reference. Tidligere versioner bliver altid bevaret."
          }
        />
      )}
      <div className="integrity-strip">
        <ShieldCheck size={19} />
        <span>
          <strong>Versioner med et fingeraftryk.</strong> Hver fil har en
          SHA-256-kontrolsum. Eksport og import kontrollerer, at indholdet er
          uændret.
        </span>
      </div>
      {selected && (
        <Modal
          title={selected.name}
          description={`Version ${selected.version} · ${bytesLabel(selected.bytes)} · ${selected.rights === "unknown" ? "Rettigheder uafklaret" : selected.provenance}`}
          onClose={() => setSelected(null)}
        >
          {selected.mime === "text/html" ||
          selected.mime === "image/svg+xml" ? (
            <iframe
              className="asset-preview"
              title={`Preview af ${selected.name}`}
              srcDoc={sandboxDocument(selected.content)}
              sandbox=""
            />
          ) : selected.mime.startsWith("image/") &&
            selected.encoding === "base64" ? (
            <img
              className="asset-image"
              src={`data:${selected.mime};base64,${selected.content}`}
              alt={selected.name}
            />
          ) : selected.encoding === "utf8" ? (
            <pre className="source-view">{selected.content}</pre>
          ) : (
            <Notice>
              Denne filtype kan hentes og versionsstyres, men har ikke et
              indbygget preview.
            </Notice>
          )}
          <details className="hash-details">
            <summary>Filintegritet og ophav</summary>
            <p>{selected.provenance}</p>
            <code>{selected.sha256}</code>
          </details>
          <div className="modal-actions">
            {selected.encoding === "utf8" && (
              <button
                className="button secondary"
                onClick={() => {
                  setContent(selected.content);
                  setEditing(selected);
                  setSelected(null);
                }}
              >
                Opret ny version
              </button>
            )}
            <button
              className="button primary"
              onClick={() =>
                downloadFile(
                  selected.name,
                  artifactBytes(selected) as Uint8Array<ArrayBuffer>,
                  selected.mime,
                )
              }
            >
              Hent fil <ArrowDownToLine size={16} />
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`Ny version af ${editing.name}`}
          description="Den eksisterende fil og alle leverancer, der bruger den, bevares."
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void textArtifact(
                project,
                editing.name,
                content,
                editing.kind,
                editing.artifactId,
              )
                .then((a) => {
                  if (!update((p) => addArtifact(p, a))) return;
                  setEditing(null);
                  notify(
                    "Ny version gemt. Berørte leverancer viser ældre input.",
                  );
                })
                .catch((e) => notify(String(e), true))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Filindhold
              <textarea
                className="code-input"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={100000}
              />
            </label>
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Gemmer…" : "Gem ny version"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {uploading && (
        <Modal
          title="Tilføj en fil til produktionen"
          description="Et eksisterende filnavn bliver en ny version. Maks. 2 MB i lokal demo."
          onClose={() => setUploading(false)}
        >
          <label>
            Hvor kommer indholdet fra?
            <input
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
              maxLength={1000}
            />
          </label>
          <label>
            Rettigheder
            <select
              value={rights}
              onChange={(e) => setRights(e.target.value as Artifact["rights"])}
            >
              <option value="unknown">Ikke afklaret endnu</option>
              <option value="owned">Mit eget indhold</option>
              <option value="licensed">Jeg har en gyldig licens</option>
            </select>
          </label>
          {rights === "unknown" && (
            <Notice>
              Du kan arbejde videre med filen som privat demo. Uafklarede
              rettigheder er synlige og skal afklares før offentlig brug.
            </Notice>
          )}
          <input
            ref={upload}
            type="file"
            aria-label="Vælg fil til projektet"
            onChange={(e) => void addFile(e.target.files?.[0])}
            disabled={busy}
          />
        </Modal>
      )}
    </>
  );
}
export function RunsPanel({ project, update, notify }: ProjectActions) {
  const [taskId, setTaskId] = useState<string | null>(null);
  return (
    <>
      <PanelHeading
        eyebrow="DEN FAKTISKE HISTORIE"
        title="Fremdrift, du kan følge."
        text="Konkrete hændelser, låste input og kendte resultater."
      />
      <div className="detail-columns">
        <section>
          <div className="section-heading">
            <h2>Leveringsforløb</h2>
            <span>{project.runs.length} forløb</span>
          </div>
          {project.runs.length ? (
            project.runs
              .slice()
              .reverse()
              .map((run) => (
                <article className="run-card" key={run.id}>
                  <div className="run-card-heading">
                    <span className="file-icon">
                      <FileCode2 size={20} />
                    </span>
                    <div>
                      <h3>
                        {project.tasks.find((t) => t.id === run.taskId)?.title}
                      </h3>
                      <code>{run.id.slice(0, 25)}</code>
                    </div>
                    <Badge
                      kind={
                        run.state === "succeeded"
                          ? "success"
                          : run.state === "failed"
                            ? "warning"
                            : "purple"
                      }
                    >
                      {
                        {
                          awaiting_upload: "Afventer fil",
                          review: "Til review",
                          failed: "Rettelse ønsket",
                          cancelled: "Annulleret",
                          succeeded: "Accepteret",
                        }[run.state]
                      }
                    </Badge>
                  </div>
                  <div className="run-metadata">
                    <span>
                      <small>INPUT</small>Brief v{run.briefVersion} ·{" "}
                      {run.inputVersionIds.length} filer
                    </span>
                    <span>
                      <small>ADAPTER</small>Manuel aflevering
                    </span>
                    <span>
                      <small>FORBRUG</small>0,00 kr.
                    </span>
                  </div>
                  <div className="run-footer">
                    <span>{formatDate(run.startedAt)}</span>
                    {run.state === "awaiting_upload" ? (
                      <div>
                        <button
                          className="text-button"
                          onClick={() => {
                            if (!update((p) => cancelRun(p, run.id))) return;
                            notify(
                              "Manuel levering annulleret. Input er bevaret.",
                            );
                          }}
                        >
                          Annuller
                        </button>
                        <button
                          className="button primary small"
                          onClick={() => setTaskId(run.taskId)}
                        >
                          Aflevér resultat <Upload size={14} />
                        </button>
                      </div>
                    ) : (
                      run.state !== "cancelled" && (
                        <Link
                          className="text-button"
                          href={`/projects/${project.id}/review/${project.deliveries.find((d) => d.runId === run.id)?.id ?? ""}`}
                        >
                          Se leverance <ArrowRight size={14} />
                        </Link>
                      )
                    )}
                  </div>
                </article>
              ))
          ) : (
            <Empty
              icon={<Clock3 />}
              title="Den første levering venter"
              text="Opret en opgave, og start en manuel levering for at låse dine input."
            />
          )}
        </section>
        <aside className="activity-card full-activity">
          <div className="section-heading">
            <h2>Aktivitetslog</h2>
            <History size={16} />
          </div>
          <div className="activity-list">
            {[...project.activity].reverse().map((a, i) => (
              <div key={a.id}>
                <span className={`activity-dot ${i === 0 ? "recent" : ""}`} />
                <div>
                  <p>{a.title}</p>
                  <small>
                    {formatDate(a.createdAt)} · rev {a.revision}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {taskId && (
        <DeliveryDialog
          project={project}
          taskId={taskId}
          update={update}
          notify={notify}
          onClose={() => setTaskId(null)}
        />
      )}
    </>
  );
}
export function SettingsPanel({
  state,
  setState,
  notify,
  onImport,
}: {
  state: Studio;
  setState: (fn: (s: Studio) => Studio) => void;
  notify: (s: string, error?: boolean) => void;
  onImport: () => void;
}) {
  const [name, setName] = useState(state.workspace.name);
  return (
    <>
      <PanelHeading
        eyebrow="DIT WORKSPACE"
        title="Et trygt sted at skabe."
        text="Tydelige rammer for data, værktøjer og forbrug."
      />
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Dit studio</h2>
          <p>Navnet følger dine lokale projekter.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setState((s) => ({
                ...s,
                workspace: { ...s.workspace, name: name.trim() },
              }));
              notify("Workspacenavn gemt.");
            }}
          >
            <label>
              Workspacenavn
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </label>
            <button className="button secondary" disabled={!name.trim()}>
              Gem navn
            </button>
          </form>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <h2>Forbrug og budget</h2>
            <Badge kind="success">0 kr.</Badge>
          </div>
          <p>
            Manuelt arbejde og lokale eksporter udløser ingen providerbetaling.
          </p>
          <div className="budget-line">
            <span>Nye betalte eksterne kald</span>
            <strong>Deaktiveret</strong>
          </div>
          <div className="budget-line">
            <span>Budgetloft</span>
            <strong>0,00 DKK</strong>
          </div>
          <small>Abonnement og betaling er ikke tilkoblet i demoen.</small>
        </section>
        <section className="settings-card full-width">
          <h2>Integrationer</h2>
          <p>
            Din produktion fungerer manuelt. Tilkoblede værktøjer aktiveres
            først med verificeret adgang.
          </p>
          <div className="integration-list">
            {[
              [
                "GitHub App",
                "Repositorymetadata, afgrænset branch og draft-PR.",
              ],
              [
                "Kodeagent",
                "Isoleret kodearbejde, build og konkret testbevis.",
              ],
              [
                "Cloud workspace",
                "Login, medlemsroller, privat filopbevaring og recovery.",
              ],
            ].map(([name, description]) => (
              <div key={name}>
                <span className="integration-icon">
                  <GitBranch size={20} />
                </span>
                <div>
                  <h3>{name}</h3>
                  <p>{description}</p>
                </div>
                <Badge>Ikke tilkoblet</Badge>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h2>Dit arbejde er flytbart.</h2>
          <p>
            Eksportér hvert projekt fra overblikket. Projektpakken indeholder
            filversioner, reviews og et valideret manifest.
          </p>
          <button className="button secondary" onClick={onImport}>
            <Upload size={15} /> Importér projektpakke
          </button>
        </section>
        <section className="settings-card">
          <h2>Lokal demo, tydelige grænser.</h2>
          <p>
            Data gemmes i IndexedDB i denne browser. Rydning af browserdata
            fjerner lokale projekter. Eksportér en kopi før du skifter computer.
          </p>
          <Notice>
            Brug syntetisk materiale. Cloudbackup, teamadgang og sikker
            opbevaring af kundedata er endnu ikke tilkoblet.
          </Notice>
        </section>
      </div>
    </>
  );
}
