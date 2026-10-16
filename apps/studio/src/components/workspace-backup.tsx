"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { downloadFile, type SaveState } from "@tre/persistence";
import Link from "./local-link";
import { Badge, bytesLabel, formatDate, Modal, Notice } from "./primitives";
import type { Project, Studio } from "../lib/model";
import {
  exportWorkspaceFile,
  importWorkspaceFile,
} from "../lib/workspace-archive-client";
import {
  MAX_WORKSPACE_ARCHIVE_BYTES,
  MAX_WORKSPACE_FILE_BYTES,
  mergeWorkspaceProjects,
  workspaceFileBytes,
  type WorkspaceArchive,
  type WorkspaceArchiveProgress,
} from "../lib/workspace-archive";

type Props = {
  state: Studio;
  setState: (fn: (state: Studio) => Studio) => void;
  flush: () => Promise<void>;
  saveState: SaveState;
};
function ProjectSelection({
  projects,
  selected,
  onChange,
  disabled = false,
  existingIds,
  label,
}: {
  projects: Project[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  existingIds?: Set<string>;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = projects.filter((project) =>
    project.name
      .toLocaleLowerCase("da")
      .includes(query.toLocaleLowerCase("da")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const activePage = Math.min(page, pages - 1);
  return (
    <div className="backup-selection">
      <div className="backup-selection-tools">
        <label>
          Søg projekter
          <input
            aria-label={`Søg projekter i ${label}`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Navn på produktion…"
          />
        </label>
        <button
          type="button"
          className="text-button"
          disabled={disabled || !filtered.length}
          onClick={() =>
            onChange([...new Set([...selected, ...filtered.map((p) => p.id)])])
          }
        >
          Vælg alle fundne
        </button>
        <button
          type="button"
          className="text-button"
          disabled={disabled || !selected.length}
          onClick={() => onChange([])}
        >
          Fravælg alle
        </button>
      </div>
      <div className="backup-projects" role="group" aria-label={label}>
        {filtered.slice(activePage * 8, activePage * 8 + 8).map((project) => (
          <label className="backup-project" key={project.id}>
            <input
              type="checkbox"
              aria-label={`Vælg ${project.name}`}
              checked={selected.includes(project.id)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, project.id]
                    : selected.filter((id) => id !== project.id),
                )
              }
            />
            <span className="backup-project-info">
              <strong>{project.name}</strong>
              <small>
                Rev {project.revision} · {project.artifacts.length} filversioner
                · {bytesLabel(workspaceFileBytes([project]))}
                {project.archivedAt ? " · Arkiveret" : ""}
              </small>
            </span>
            {existingIds?.has(project.id) && (
              <Badge kind="purple">Indlæses som kopi</Badge>
            )}
          </label>
        ))}
        {!filtered.length && (
          <p className="backup-empty">Ingen projekter matcher søgningen.</p>
        )}
      </div>
      <div className="backup-pagination">
        <span>
          {selected.length} valgt · {filtered.length} i oversigten
        </span>
        {pages > 1 && (
          <div>
            <button
              type="button"
              className="text-button"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
              aria-label={`Forrige side i ${label}`}
            >
              Forrige
            </button>
            <span>
              {activePage + 1} / {pages}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={activePage === pages - 1}
              onClick={() => setPage(activePage + 1)}
              aria-label={`Næste side i ${label}`}
            >
              Næste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export function WorkspaceBackup({ state, setState, flush, saveState }: Props) {
  const [selected, setSelected] = useState(() =>
    state.projects.map((project) => project.id),
  );
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [progress, setProgress] = useState<WorkspaceArchiveProgress | null>(
    null,
  );
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [candidate, setCandidate] = useState<WorkspaceArchive | null>(null);
  const [restoreIds, setRestoreIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [restoredIds, setRestoredIds] = useState<string[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const latestSaveState = useRef(saveState);
  latestSaveState.current = saveState;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  const selectedProjects = state.projects.filter((project) =>
    selected.includes(project.id),
  );
  const selectedBytes = workspaceFileBytes(selectedProjects);
  const existingIds = useMemo(
    () => new Set(state.projects.map((project) => project.id)),
    [state.projects],
  );
  const selectedIds = selectedProjects.map((project) => project.id);
  async function run(kind: "export" | "import", file?: File) {
    if (busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind);
    setProgress(null);
    setMessage(null);
    try {
      if (kind === "export") {
        const bytes = await exportWorkspaceFile(
          state,
          selectedIds,
          controller.signal,
          setProgress,
        );
        if (!alive.current || controller.signal.aborted) return;
        downloadFile(
          `studio-backup-${new Date().toISOString().slice(0, 10)}.zip`,
          bytes as Uint8Array<ArrayBuffer>,
          "application/zip",
        );
        setMessage({
          text: `${selectedIds.length} projekter hentet med filversioner, reviews og kladder.${latestSaveState.current === "saved" ? " Gem filen et sted, du kan finde igen." : " Kopien indeholder den aktuelle session; browserlagringen er stadig ikke bekræftet."}`,
          error: false,
        });
      } else {
        if (!file) return;
        if (file.size > MAX_WORKSPACE_ARCHIVE_BYTES)
          throw new Error("Backupfilen må højst fylde 128 MB.");
        const archive = await importWorkspaceFile(
          new Uint8Array(await file.arrayBuffer()),
          controller.signal,
          setProgress,
        );
        if (!alive.current || controller.signal.aborted) return;
        setCandidate(archive);
        setRestoreIds(archive.projects.map((project) => project.id));
        setApplied(false);
        setRestoredIds([]);
        setRestoreError(null);
      }
    } catch (error) {
      if (alive.current)
        setMessage({
          text:
            error instanceof Error
              ? error.message
              : "Backupfilen kunne ikke behandles.",
          error: !(
            error instanceof DOMException && error.name === "AbortError"
          ),
        });
    } finally {
      if (alive.current) {
        setBusy(null);
        setProgress(null);
      }
      if (operation.current === controller) operation.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function apply() {
    if (!candidate || applying || applied) return;
    setApplying(true);
    setRestoreError(null);
    try {
      let additions: string[] = [];
      setState((current) => {
        const next = mergeWorkspaceProjects(current, candidate, restoreIds);
        additions = next.projects
          .slice(current.projects.length)
          .map((project) => project.id);
        return next;
      });
      // A failed database commit must not make a second click add duplicate copies.
      setApplied(true);
      setRestoredIds(additions);
      setSelected((previous) => [...new Set([...previous, ...additions])]);
      await flush();
    } catch (error) {
      setRestoreError(
        error instanceof Error
          ? error.message
          : "Projekterne kunne ikke gemmes.",
      );
    } finally {
      if (alive.current) setApplying(false);
    }
  }
  const progressText = !progress
    ? "Åbner backupfilen…"
    : progress.phase === "packing"
      ? "Samler de kontrollerede projektpakker…"
      : progress.phase === "reading"
        ? "Læser backupfilens oversigt…"
        : `Kontrollerer projekt ${progress.completed + 1} af ${progress.total}: ${progress.name}`;
  return (
    <section
      className="settings-card full-width workspace-backup"
      aria-labelledby="workspace-backup-title"
    >
      <div className="backup-heading">
        <span className="backup-icon">
          <Archive size={24} />
        </span>
        <div>
          <span className="small-label">DIT ARBEJDE, MED DIG</span>
          <h2 id="workspace-backup-title">En kopi af hele din produktion.</h2>
        </div>
        <Badge kind="purple">LOKAL BACKUP</Badge>
      </div>
      <p>
        Vælg projekter, og hent dem samlet. Filer, historik, reviews og ufærdige
        kladder følger med — også fra arkiverede projekter.
      </p>
      <div className="backup-summary">
        <div>
          <strong>{state.projects.length}</strong>
          <span>lokale projekter</span>
        </div>
        <div>
          <strong>
            {state.projects.reduce((n, p) => n + p.artifacts.length, 0)}
          </strong>
          <span>filversioner bevaret</span>
        </div>
        <div>
          <strong>{bytesLabel(workspaceFileBytes(state.projects))}</strong>
          <span>indhold i filversioner</span>
        </div>
      </div>
      <ProjectSelection
        projects={state.projects}
        selected={selectedIds}
        onChange={setSelected}
        disabled={!!busy}
        label="backup"
      />
      <div className="backup-actions">
        <button
          className="button primary"
          disabled={
            !!busy ||
            !selectedIds.length ||
            selectedBytes > MAX_WORKSPACE_FILE_BYTES
          }
          onClick={() => void run("export")}
        >
          <ArrowDownToLine size={16} />
          Hent samlet backup
        </button>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} />
          Åbn backupfil
        </button>
        <span>{bytesLabel(selectedBytes)} filindhold valgt</span>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        aria-label="Vælg samlet Studio-backup"
        className="sr-only"
        onChange={(event) => void run("import", event.target.files?.[0])}
      />
      {selectedBytes > MAX_WORKSPACE_FILE_BYTES && (
        <Notice>
          Vælg færre projekter. En samlet backup kan indeholde højst 96 MB
          filversioner; hent gerne flere pakker.
        </Notice>
      )}
      {busy && (
        <div className="backup-progress" role="status">
          <span>{progressText}</span>
          <button
            className="text-button"
            onClick={() => operation.current?.abort()}
          >
            <X size={15} />
            Afbryd
          </button>
        </div>
      )}
      {message && (
        <div
          className={`backup-message ${message.error ? "backup-error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}
      <div className="backup-footnote">
        <ShieldCheck size={17} />
        <p>
          Hver projektpakke kontrolleres med SHA-256 og kan også indlæses
          separat. Højst 96 MB filversioner og 8 MB historik pr. backup. Tallene
          ovenfor er filindhold, ikke browserens faktiske diskforbrug. En
          download er en lokal kopi; der er ingen automatisk cloudbackup.
        </p>
      </div>
      {candidate && (
        <Modal
          title="Vælg det, der skal med tilbage."
          description={`${candidate.workspace.name} · backup fra ${formatDate(candidate.exportedAt)}`}
          onClose={() => {
            if (!applying) setCandidate(null);
          }}
        >
          {!applied ? (
            <>
              <Notice>
                Projekter med samme identitet indlæses som selvstændige kopier.
                Dine eksisterende projekter og navnet på dit workspace bevares.
                Arkiverede projekter forbliver arkiverede.
              </Notice>
              <ProjectSelection
                projects={candidate.projects}
                selected={restoreIds}
                onChange={setRestoreIds}
                disabled={applying}
                existingIds={existingIds}
                label="indlæsning"
              />
              <p className="backup-limit">
                {state.projects.length} af 100 lokale projektpladser er i brug.
                Du har valgt {restoreIds.length} projekter.
              </p>
            </>
          ) : (
            <div className="backup-restored">
              <CheckCircle2 size={28} />
              <h3>
                {applying
                  ? "Gemmer projekterne…"
                  : restoreError
                    ? "Projekterne er åbne i denne session."
                    : `${restoredIds.length} ${restoredIds.length === 1 ? "projekt" : "projekter"} indlæst og gemt.`}
              </h3>
              <p>
                {restoreError
                  ? "Browserlagringen er ikke bekræftet. Hent en ny samlet backup, før du lukker siden eller genindlæser gemt data."
                  : "Filversioner og historik er bevaret. Åbn en produktion, når du er klar."}
              </p>
              {!applying && restoredIds[0] && (
                <Link
                  className="button secondary"
                  href={`/projects/${restoredIds[0]}/overview`}
                >
                  Åbn første projekt
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
          {restoreError && (
            <div className="backup-message backup-error" role="alert">
              {restoreError}
            </div>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={applying}
              onClick={() => setCandidate(null)}
            >
              {applied ? "Tilbage til backup" : "Annullér"}
            </button>
            {!applied && (
              <button
                className="button primary"
                disabled={
                  applying ||
                  !restoreIds.length ||
                  state.projects.length + restoreIds.length > 100 ||
                  saveState === "loading"
                }
                onClick={() => void apply()}
              >
                Indlæs {restoreIds.length}{" "}
                {restoreIds.length === 1 ? "projekt" : "projekter"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
