"use client";
import { sandboxDocument } from "../lib/preview";
import { useEffect, useRef, useState } from "react";
import Link from "./local-link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FolderOpen,
  Grid2X2,
  Layers3,
  ListChecks,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  Waypoints,
  X,
} from "lucide-react";
import { downloadFile, usePersistentDocument } from "@tre/persistence";
import {
  archiveProject,
  changeProject,
  createProject,
  latestBrief,
  latestReview,
  copyProject,
  validateStudio,
  type Project,
  type Studio,
} from "../lib/model";
import { createSample } from "../lib/sample";
import type { ArchiveProgress } from "../lib/archive";
import {
  exportProjectFile,
  importProjectFile,
  progressLabel,
} from "../lib/archive-client";
import { MAX_ARCHIVE_BYTES } from "../lib/limits";
import {
  Badge,
  DeliveryStatus,
  Empty,
  Modal,
  Notice,
  formatDate,
} from "./primitives";
import {
  BriefPanel,
  TasksPanel,
  AssetsPanel,
  RunsPanel,
  SettingsPanel,
} from "./workspace-panels";
import { ReviewPanel } from "./review-panel";
export type ProjectActions = {
  project: Project;
  update: (action: (p: Project) => Project) => boolean;
  notify: (message: string, error?: boolean) => void;
};
export function StudioApp() {
  const store = usePersistentDocument<Studio>(
    "studio",
    "workspace",
    createSample,
    validateStudio,
  );
  const router = useRouter();
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [archiveProgress, setArchiveProgress] =
    useState<ArchiveProgress | null>(null);
  const [duplicateImport, setDuplicateImport] = useState<Project | null>(null);
  const projectId =
    parts[0] === "projects" && parts[1]
      ? parts[1]
      : store.data.projects.find((p) => !p.archivedAt)?.id;
  const project = store.data.projects.find((p) => p.id === projectId);
  const section =
    parts[0] === "settings"
      ? "settings"
      : parts[0] === "projects" && parts.length === 1
        ? "projects"
        : (parts[2] ?? "overview");
  const base = project ? `/projects/${project.id}` : "/projects";
  const notify = (message: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const update = (action: (p: Project) => Project) => {
    if (!project) return false;
    try {
      if (project.archivedAt)
        throw new Error(
          "Projektet er arkiveret. Gendan det under Produktioner før nye ændringer.",
        );
      store.setData((state) =>
        changeProject(state, project.id, action, project.revision),
      );
      return true;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Ændringen kunne ikke gemmes.",
        true,
      );
      return false;
    }
  };
  async function exportCurrent() {
    if (!project || exporting || importing) return;
    setExporting(true);
    try {
      setArchiveProgress(null);
      const file = await exportProjectFile(project, setArchiveProgress);
      downloadFile(
        `${project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-v${project.revision}.zip`,
        file as Uint8Array<ArrayBuffer>,
        "application/zip",
      );
      notify(
        store.saveState === "saved"
          ? "Projektpakken er hentet med versioner, manifest og reviewbeviser."
          : "Din aktuelle lokale kopi er hentet. Browserlagringen er stadig ikke bekræftet.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Eksporten fejlede.", true);
    } finally {
      setExporting(false);
    }
  }
  async function importZip(file?: File) {
    if (!file || importing || exporting) return;
    setImporting(true);
    setArchiveProgress(null);
    try {
      if (file.size > MAX_ARCHIVE_BYTES)
        throw new Error("Projektpakken må højst fylde 64 MB.");
      const imported = await importProjectFile(
        new Uint8Array(await file.arrayBuffer()),
        setArchiveProgress,
      );
      if (store.data.projects.some((p) => p.id === imported.id)) {
        setDuplicateImport(imported);
        return;
      }
      store.setData((s) => ({ ...s, projects: [...s.projects, imported] }));
      router.push(`/projects/${imported.id}/overview`);
      notify(
        "Projekt importeret. Alle filhashes og versionsreferencer er kontrolleret.",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Projektpakken kunne ikke læses.",
        true,
      );
    } finally {
      setImporting(false);
      if (input.current) input.current.value = "";
    }
  }
  const pending =
    project?.deliveries.filter((d) => !latestReview(project, d.id)).length ?? 0;
  const nav = [
    {
      key: "overview",
      label: "Overblik",
      icon: Grid2X2,
      href: `${base}/overview`,
    },
    {
      key: "brief",
      label: "Bestilling",
      icon: FileBriefIcon,
      href: `${base}/brief`,
    },
    { key: "tasks", label: "Opgaver", icon: ListChecks, href: `${base}/tasks` },
    {
      key: "assets",
      label: "Filer & versioner",
      icon: Layers3,
      href: `${base}/assets`,
    },
    {
      key: "review",
      label: "Leverancer",
      icon: CheckCircle2,
      href: `${base}/review`,
      count: pending,
    },
    { key: "runs", label: "Aktivitet", icon: Clock3, href: `${base}/runs` },
  ];
  return (
    <div className="studio-shell">
      <a className="skip-link" href="#main">
        Gå til indhold
      </a>
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            studio<span className="brand-one">one</span>
            <small>PLADS TIL AT SKABE</small>
          </span>
        </Link>
        <button
          className="workspace-switch"
          onClick={() => router.push("/projects")}
        >
          <span className="workspace-avatar">S</span>
          <span>
            {store.data.workspace.name}
            <small>Personligt workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="sidebar-caption">WORKSPACE</div>
        <Link
          className={`nav-link ${section === "projects" ? "active" : ""}`}
          href="/projects"
          onClick={() => setMenu(false)}
        >
          <FolderOpen size={18} />
          <span>Produktioner</span>
          <span className="nav-count">
            {store.data.projects.filter((p) => !p.archivedAt).length}
          </span>
        </Link>
        <div className="sidebar-rule" />
        <div className="sidebar-caption">{project?.name ?? "DIT PROJEKT"}</div>
        <nav aria-label="Projektnavigation">
          {project &&
            nav.map((n) => (
              <Link
                key={n.key}
                className={`nav-link ${section === n.key ? "active" : ""}`}
                href={n.href}
                onClick={() => setMenu(false)}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {!!n.count && (
                  <span className="nav-count accent-count">{n.count}</span>
                )}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <span className="mode-dot" />
            <strong>Dit arbejde. Dit tempo.</strong>
            <p>
              Manuelt produktionsflow.
              <br />
              Ingen betalte AI-kald.
            </p>
            <Link href="/settings">
              Se integrationer <ArrowUpRight size={13} />
            </Link>
          </div>
          <button className="nav-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>En god start</span>
          </button>
          <Link
            className={`nav-link ${section === "settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings2 size={18} />
            <span>Indstillinger</span>
          </Link>
          <div className="user-row">
            <span className="user-avatar">S</span>
            <span>
              Mit workspace<small>Lokal demoprofil</small>
            </span>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Luk navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu((v) => !v)}
            aria-label="Åbn navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {section === "projects"
                ? "Produktioner"
                : section === "settings"
                  ? "Indstillinger"
                  : (project?.name ?? "Projekt")}
            </strong>
          </div>
          <div className="topbar-right">
            <div className="save-status" role="status">
              <span
                className={
                  store.saveState === "saved" ? "saved-dot" : "pending-dot"
                }
              />
              {store.saveState === "saved"
                ? "Gemt lokalt"
                : store.saveState === "saving"
                  ? "Gemmer…"
                  : store.saveState === "loading"
                    ? "Åbner…"
                    : "Ikke gemt"}
            </div>
            <span className="demo-label">DEMO</span>
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="Hjælp"
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          {(exporting || importing) && (
            <div className="archive-progress" role="status" aria-live="polite">
              <span className="loading-orbit" />
              {progressLabel(archiveProgress)}
              <span>Du kan fortsætte med at se projektet.</span>
            </div>
          )}
          {store.error && (
            <div role="alert" className="storage-error">
              <Notice danger>{store.error}</Notice>
              <button
                className="button secondary"
                onClick={() => void store.reload()}
              >
                Genindlæs gemt version
              </button>
              {project && (
                <button
                  className="button secondary"
                  onClick={() => void exportCurrent()}
                >
                  Eksportér lokal kopi
                </button>
              )}
            </div>
          )}
          {!store.ready ? (
            <div className="loading-screen">
              <span className="loading-orbit" />
              <h2>
                {store.error
                  ? "Lagringen kræver din opmærksomhed"
                  : "Gør plads til dit arbejde…"}
              </h2>
              <p>
                {store.error
                  ? "Tillad browserlagring, og prøv igen. Dine eksisterende data bliver ikke nulstillet."
                  : "Åbner dit lokale workspace."}
              </p>
            </div>
          ) : (
            <>
              {section === "projects" ? (
                <ProjectsPanel
                  state={store.data}
                  search={search}
                  setSearch={setSearch}
                  onCreate={() => setCreating(true)}
                  onImport={() => input.current?.click()}
                  onArchive={(id) => {
                    try {
                      store.setData((s) =>
                        changeProject(s, id, archiveProject),
                      );
                    } catch (e) {
                      notify(String(e), true);
                    }
                  }}
                />
              ) : section === "settings" ? (
                <SettingsPanel
                  state={store.data}
                  setState={store.setData}
                  flush={store.flush}
                  saveState={store.saveState}
                  notify={notify}
                  onImport={() => input.current?.click()}
                />
              ) : !project ? (
                <Empty
                  icon={<FolderOpen />}
                  title="Projektet findes ikke"
                  text="Åbn en eksisterende produktion, eller opret dit næste projekt."
                >
                  <Link className="button primary" href="/projects">
                    Til produktioner
                  </Link>
                </Empty>
              ) : (
                <>
                  <div className="project-topline">
                    <Link href="/projects">
                      <ArrowLeft size={14} /> Alle produktioner
                    </Link>
                    <div>
                      <Badge>WEBPROJEKT</Badge>
                      <span className="revision-label">
                        REV {String(project.revision).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                  {project.archivedAt && (
                    <Notice>
                      Dette projekt er arkiveret. Gendan det under Produktioner
                      for at arbejde videre.
                    </Notice>
                  )}
                  {section === "overview" ? (
                    <Overview
                      project={project}
                      onExport={() => void exportCurrent()}
                      exporting={exporting}
                    />
                  ) : section === "brief" ? (
                    <BriefPanel
                      project={project}
                      update={update}
                      notify={notify}
                    />
                  ) : section === "tasks" ? (
                    <TasksPanel
                      storage={{ saveState: store.saveState }}
                      project={project}
                      update={update}
                      notify={notify}
                    />
                  ) : section === "assets" ? (
                    <AssetsPanel
                      project={project}
                      update={update}
                      notify={notify}
                    />
                  ) : section === "review" ? (
                    <ReviewPanel
                      storage={{ saveState: store.saveState }}
                      project={project}
                      update={update}
                      notify={notify}
                      deliveryId={parts[3]}
                      onExport={() => void exportCurrent()}
                      exporting={exporting}
                    />
                  ) : section === "runs" ? (
                    <RunsPanel
                      storage={{ saveState: store.saveState }}
                      project={project}
                      update={update}
                      notify={notify}
                    />
                  ) : (
                    <Empty
                      icon={<FolderOpen />}
                      title="Siden findes ikke"
                      text="Gå tilbage til projektets overblik."
                    >
                      <Link
                        className="button primary"
                        href={`${base}/overview`}
                      >
                        Til overblikket
                      </Link>
                    </Empty>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            <span className="tiny-square" /> Studio One{" "}
            <span className="footer-muted">· Et bedre sted at færdiggøre.</span>
          </span>
          <span>Syntetiske demodata · Gemmes kun i denne browser</span>
        </footer>
      </div>
      <input
        ref={input}
        type="file"
        accept=".zip"
        className="sr-only"
        aria-label="Importér projektpakke"
        onChange={(e) => void importZip(e.target.files?.[0])}
      />
      {creating && (
        <CreateProject
          onClose={() => setCreating(false)}
          onCreate={(name, description) => {
            const p = createProject(name, description);
            store.setData((s) => ({ ...s, projects: [...s.projects, p] }));
            setCreating(false);
            router.push(`/projects/${p.id}/brief`);
            notify("Dit nye projekt er klar. Start med en tydelig bestilling.");
          }}
        />
      )}{" "}
      {duplicateImport && (
        <Modal
          title="Projektet findes allerede"
          description={`Pakken indeholder “${duplicateImport.name}”. Åbn en selvstændig kopi med hele den importerede historik.`}
          onClose={() => setDuplicateImport(null)}
        >
          <Notice>
            Det eksisterende projekt bevares. Kopien får sit eget projekt-id, og
            filversioner, reviews og ophav følger med.
          </Notice>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDuplicateImport(null)}
            >
              Behold som nu
            </button>
            <button
              className="button primary"
              onClick={() => {
                try {
                  const copy = copyProject(duplicateImport);
                  store.setData((state) => ({
                    ...state,
                    projects: [...state.projects, copy],
                  }));
                  setDuplicateImport(null);
                  router.push(`/projects/${copy.id}/overview`);
                  notify(
                    "Projektet er åbnet som en selvstændig kopi. Den oprindelige produktion er bevaret.",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Kopien kunne ikke åbnes.",
                    true,
                  );
                }
              }}
            >
              Åbn som kopi <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <HelpDialog
          onClose={() => setHelp(false)}
          onSample={() => {
            const p = store.data.projects.find((p) => p.id === "realmread");
            if (p) router.push("/projects/realmread/review");
            else
              notify("Eksempelprojektet findes ikke i dette workspace.", true);
            setHelp(false);
          }}
        />
      )}{" "}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Luk besked">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function FileBriefIcon({ size }: { size: number }) {
  return <Waypoints size={size} />;
}
function CreateProject({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal
      title="Et nyt projekt begynder her"
      description="Giv din produktion et navn. Resten tager vi ét skridt ad gangen."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim(), description);
        }}
      >
        <label>
          Projektnavn
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="Fx min næste weboplevelse"
          />
        </label>
        <label>
          Kort beskrivelse
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Hvad vil du skabe?"
            rows={3}
          />
        </label>
        <div className="template-option">
          <div className="template-icon">
            <Waypoints size={22} />
          </div>
          <div>
            <strong>Webændring</strong>
            <p>Bestilling → filer → manuel levering → review</p>
          </div>
          <CheckCircle2 size={18} />
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuller
          </button>
          <button className="button primary" disabled={!name.trim()}>
            Opret projekt <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProjectsPanel({
  state,
  search,
  setSearch,
  onCreate,
  onImport,
  onArchive,
}: {
  state: Studio;
  search: string;
  setSearch: (x: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onArchive: (id: string) => void;
}) {
  const [archived, setArchived] = useState(false);
  const projects = state.projects.filter(
    (p) =>
      Boolean(p.archivedAt) === archived &&
      `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DET KREATIVE OVERBLIK</div>
          <h1>Plads til dine næste idéer.</h1>
          <p>
            Fra den første bestilling til en leverance, du kan stå inde for.
          </p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={17} /> Nyt projekt
        </button>
      </div>
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={!archived ? "selected" : ""}
            onClick={() => setArchived(false)}
          >
            Aktive produktioner
          </button>
          <button
            className={archived ? "selected" : ""}
            onClick={() => setArchived(true)}
          >
            Arkiverede
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find en produktion"
            aria-label="Søg i produktioner"
          />
        </label>
      </div>
      <div className="project-grid">
        {projects.map((p) => (
          <article className="project-card" key={p.id}>
            <Link
              href={`/projects/${p.id}/overview`}
              className={`project-cover ${p.id === "realmread" ? "realm-cover" : ""}`}
            >
              {p.id === "realmread" ? (
                <>
                  <div className="cover-mountains" />
                  <span className="cover-title">
                    REALMREAD<small>HISTORIERNE FINDER DERES VEJ</small>
                  </span>
                </>
              ) : (
                <span className="project-initial">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="cover-badge">WEBPROJEKT</span>
              <span className="cover-open">
                <ArrowUpRight size={20} />
              </span>
            </Link>
            <div className="project-card-body">
              <Link href={`/projects/${p.id}/overview`}>
                <h2>{p.name}</h2>
              </Link>
              <p>{p.description || "Dit næste gode arbejde starter her."}</p>
              <div className="project-card-meta">
                <span>
                  <Layers3 size={14} />
                  {p.artifacts.length} filversioner
                </span>
                <span>
                  <CheckCircle2 size={14} />
                  {p.deliveries.length} leverancer
                </span>
              </div>
              <div className="project-card-bottom">
                <Badge
                  kind={
                    p.deliveries.some((d) => !latestReview(p, d.id))
                      ? "purple"
                      : "neutral"
                  }
                >
                  {p.deliveries.some((d) => !latestReview(p, d.id))
                    ? "Klar til review"
                    : p.archivedAt
                      ? "Arkiveret"
                      : "Under udvikling"}
                </Badge>
                <button
                  className="text-button"
                  aria-label={`${p.archivedAt ? "Gendan" : "Arkivér"} ${p.name}`}
                  onClick={() => onArchive(p.id)}
                >
                  {p.archivedAt ? "Gendan" : "Arkivér"}
                </button>
              </div>
            </div>
          </article>
        ))}
        {!archived && !search && (
          <button className="new-project-card" onClick={onCreate}>
            <span>
              <Plus size={26} />
            </span>
            <strong>Hvad vil du skabe?</strong>
            <p>Start et nyt projekt</p>
          </button>
        )}
      </div>
      {!projects.length && (
        <Empty
          icon={<Search />}
          title={
            search
              ? "Ingen produktioner matcher"
              : archived
                ? "Arkivet er tomt"
                : "Din første produktion venter"
          }
          text={
            search
              ? "Prøv et andet søgeord."
              : archived
                ? "Arkiverede projekter kan stadig åbnes og eksporteres."
                : "Opret et projekt eller importér en tidligere projektpakke."
          }
        />
      )}
      <div className="import-strip">
        <div>
          <Upload size={20} />
          <span>
            <strong>Dit arbejde følger med dig.</strong>
            <small>Importér en Studio One-pakke med alle dens versioner.</small>
          </span>
        </div>
        <button className="button secondary" onClick={onImport}>
          Importér projekt <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}
function Overview({
  project: p,
  onExport,
  exporting,
}: {
  project: Project;
  onExport: () => void;
  exporting: boolean;
}) {
  const pending = p.deliveries.filter((d) => !latestReview(p, d.id));
  const accepted = p.reviews.filter((r) => r.decision === "accepted").length;
  const tasks = p.tasks.filter((t) => !t.replacedBy);
  const done = tasks.filter((t) => t.state === "done").length;
  const base = `/projects/${p.id}`;
  const d = pending[0] ?? p.deliveries.at(-1);
  const preview =
    d &&
    p.artifacts.find(
      (a) => d.outputVersionIds.includes(a.id) && a.mime === "text/html",
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DIN PRODUKTION, SAMLET</div>
          <h1>
            {p.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {p.description || "Fra en klar bestilling til noget, der virker."}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={onExport}
          disabled={exporting}
        >
          <ArrowDownToLine size={16} />
          {exporting ? "Pakker…" : "Eksportér projekt"}
        </button>
      </div>
      <div className="overview-stats">
        <div>
          <span>PRODUKTION</span>
          <strong>
            {tasks.length}
            <small>opgaver i dit flow</small>
          </strong>
          <div className="mini-progress">
            {tasks.map((t) => (
              <i
                key={t.id}
                className={
                  t.state === "done"
                    ? "complete"
                    : t.state === "review"
                      ? "review"
                      : ""
                }
              />
            ))}
          </div>
        </div>
        <div>
          <span>KLAR TIL DIT BLIK</span>
          <strong>
            {pending.length.toString().padStart(2, "0")}
            <small>leverancer til review</small>
          </strong>
          <span className="stat-note">
            {pending.length ? "Du har det sidste ord" : "Alt er gennemgået"}
          </span>
        </div>
        <div>
          <span>FÆRDIGT ARBEJDE</span>
          <strong>
            {accepted.toString().padStart(2, "0")}
            <small>accepterede leverancer</small>
          </strong>
          <span className="stat-note">
            {done} af {tasks.length} opgaver afsluttet
          </span>
        </div>
      </div>
      <div className="overview-columns">
        <section>
          <div className="section-heading">
            <h2>
              {pending.length
                ? "Det næste skridt er dit."
                : "Dit seneste arbejde."}
            </h2>
            <Link href={`${base}/review`}>
              Alle leverancer <ArrowRight size={14} />
            </Link>
          </div>
          {d ? (
            <article className="featured-delivery">
              <div className="featured-preview">
                {preview ? (
                  <iframe
                    title="Preview af seneste leverance"
                    srcDoc={sandboxDocument(preview.content)}
                    sandbox=""
                    tabIndex={-1}
                  />
                ) : (
                  <div className="abstract-preview">
                    <Layers3 size={70} />
                  </div>
                )}
                <span className="preview-chip">
                  <span /> MANUEL LEVERANCE
                </span>
                <span className="preview-version">
                  v{preview?.version ?? 1}.0
                </span>
              </div>
              <div className="featured-body">
                <div className="featured-meta">
                  <Badge kind="purple">
                    LEVERANCE{" "}
                    {String(p.deliveries.indexOf(d) + 1).padStart(2, "0")}
                  </Badge>
                  <DeliveryStatus project={p} deliveryId={d.id} />
                </div>
                <h2>{d.title}</h2>
                <p>{d.summary}</p>
                <div className="featured-bottom">
                  <span>
                    <CheckCircle2 size={16} />
                    {d.checks.length} acceptkrav · {d.outputVersionIds.length}{" "}
                    filer
                  </span>
                  <Link
                    className="button primary"
                    href={`${base}/review/${d.id}`}
                  >
                    Se resultat <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </article>
          ) : (
            <Empty
              icon={<Sparkles size={30} />}
              title="Først en god bestilling."
              text="Beskriv det, du vil skabe. Tilføj derefter opgaver og inputfiler til din produktion."
            >
              <Link className="button primary" href={`${base}/brief`}>
                Skriv din bestilling <ArrowRight size={16} />
              </Link>
            </Empty>
          )}
        </section>
        <aside className="overview-right">
          <section className="brief-summary">
            <div className="section-heading">
              <h2>Retningen er sat.</h2>
              <span className="subtle">v{latestBrief(p).version}</span>
            </div>
            <span className="small-label">MÅLET</span>
            <p>
              {latestBrief(p).goal ||
                "Du har endnu ikke beskrevet projektets mål."}
            </p>
            <div className="brief-criteria">
              {latestBrief(p)
                .acceptance.slice(0, 3)
                .map((a, i) => (
                  <div key={a}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {a}
                  </div>
                ))}
            </div>
            <Link href={`${base}/brief`}>
              Åbn bestilling <ArrowUpRight size={15} />
            </Link>
          </section>
          <section className="activity-card">
            <div className="section-heading">
              <h2>Seneste aktivitet</h2>
              <Clock3 size={16} />
            </div>
            <div className="activity-list">
              {p.activity
                .slice(-4)
                .reverse()
                .map((a, i) => (
                  <div key={a.id}>
                    <span
                      className={`activity-dot ${i === 0 ? "recent" : ""}`}
                    />
                    <div>
                      <p>{a.title}</p>
                      <small>{formatDate(a.createdAt)}</small>
                    </div>
                  </div>
                ))}
            </div>
            <Link href={`${base}/runs`}>
              Se hele historien <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
      <div className="workflow-strip">
        <span className="workflow-caption">ÉN SAMMENHÆNGENDE PRODUKTION</span>
        <div>
          {[
            { label: "Bestilling", href: "brief", icon: Waypoints },
            { label: "Opgaver", href: "tasks", icon: ListChecks },
            { label: "Versioner", href: "assets", icon: Layers3 },
            { label: "Review", href: "review", icon: CheckCircle2 },
          ].map((s, i) => (
            <div key={s.label}>
              <Link href={`${base}/${s.href}`}>
                <s.icon size={17} />
                {s.label}
              </Link>
              {i < 3 && <ChevronRight size={14} />}
            </div>
          ))}
        </div>
        <span className="workflow-note">Ingen tabte overleveringer.</span>
      </div>
    </>
  );
}
function HelpDialog({
  onClose,
  onSample,
}: {
  onClose: () => void;
  onSample: () => void;
}) {
  return (
    <Modal
      title="Fra idé til accepteret arbejde"
      description="Studio One holder styr på det, du skaber — og hvorfor det er færdigt."
      onClose={onClose}
    >
      <div className="help-steps">
        {[
          [
            "01",
            "Giv arbejdet en retning",
            "Opret et projekt, beskriv målet og skriv konkrete acceptkrav.",
          ],
          [
            "02",
            "Saml input og versioner",
            "Tilføj filer og opgaver. En manuel levering låser den præcise version af dine input.",
          ],
          [
            "03",
            "Se resultatet. Tag stilling.",
            "Upload din leverance, sammenlign før og efter, og gennemgå hvert acceptkrav.",
          ],
          [
            "04",
            "Tag dit arbejde med",
            "Eksportér en ZIP med bestilling, opgaver, filer, hashes og review.",
          ],
        ].map(([n, t, d]) => (
          <div key={n}>
            <span>{n}</span>
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          </div>
        ))}
      </div>
      <Notice>
        Denne version bruger syntetiske demodata og lokal browserlagring.
        GitHub, kodeagenter, cloud og betaling er ikke tilkoblet. Brug ikke
        rigtige kundeoplysninger.
      </Notice>
      <div className="modal-actions">
        <button className="button primary" onClick={onSample}>
          Åbn eksempelreview <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
