"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import type { Project, Run } from "../lib/model";
import { formatDate, Notice } from "./primitives";

const RUN_PAGE = 8;
const EVENT_PAGE = 20;
const states: Record<Run["state"], string> = {
  awaiting_upload: "Afventer fil",
  review: "Til review",
  failed: "Rettelse ønsket",
  cancelled: "Annulleret",
  succeeded: "Accepteret",
};

export function RunHistory({
  project,
  children,
}: {
  project: Project;
  children: (runs: Run[]) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<string>();
  const [missing, setMissing] = useState(false);
  const applied = useRef("");
  const runs = [...project.runs].reverse();
  const query = search.trim().toLocaleLowerCase("da");
  const filtered = runs.filter((run) => {
    const task = project.tasks.find((item) => item.id === run.taskId);
    return (
      (state === "all" || run.state === state) &&
      `${run.id} ${run.taskSnapshot?.title ?? task?.title ?? ""} ${run.taskSnapshot?.owner ?? task?.owner ?? ""} brief v${run.briefVersion}`
        .toLocaleLowerCase("da")
        .includes(query)
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / RUN_PAGE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(
    currentPage * RUN_PAGE,
    (currentPage + 1) * RUN_PAGE,
  );
  useEffect(() => {
    function followHash(force = false) {
      const hash = location.hash;
      if (!force && applied.current === hash) return;
      applied.current = hash;
      if (!hash.startsWith("#run-")) {
        setTarget(undefined);
        setMissing(false);
        return;
      }
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(5));
      } catch {
        setMissing(true);
        return;
      }
      const index = [...project.runs]
        .reverse()
        .findIndex((run) => run.id === id);
      setMissing(index < 0);
      if (index < 0) return;
      setSearch("");
      setState("all");
      setPage(Math.floor(index / RUN_PAGE));
      setTarget(id);
    }
    followHash();
    const listener = () => followHash(true);
    window.addEventListener("hashchange", listener);
    window.addEventListener("popstate", listener);
    return () => {
      window.removeEventListener("hashchange", listener);
      window.removeEventListener("popstate", listener);
    };
  }, [project.id, project.runs]);
  const targetVisible = target && visible.some((run) => run.id === target);
  useEffect(() => {
    if (!targetVisible || !target) return;
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`run-${target}`);
      card?.scrollIntoView({ block: "start" });
      card?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [target, targetVisible]);
  return (
    <>
      <div className="history-tools">
        <label>
          Søg leveringsforløb
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
              setTarget(undefined);
            }}
            placeholder="Titel, ansvarlig eller forløbs-id…"
          />
        </label>
        <label>
          Forløbets status
          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(0);
              setTarget(undefined);
            }}
          >
            <option value="all">Alle forløb</option>
            {Object.entries(states).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {missing && (
        <Notice>
          Linkets leveringsforløb findes ikke i dette projekt. Den øvrige
          historik er bevaret.
        </Notice>
      )}
      {filtered.length ? (
        children(visible)
      ) : (
        <p className="history-empty">
          Ingen forløb matcher din søgning og status. Prøv et andet navn eller
          vælg Alle forløb.
        </p>
      )}
      <div
        className="history-pagination"
        aria-label="Sider med leveringsforløb"
      >
        <button
          className="button secondary small"
          disabled={currentPage === 0}
          onClick={() => {
            setPage(currentPage - 1);
            setTarget(undefined);
          }}
        >
          Forrige forløb
        </button>
        <span role="status">
          Side {currentPage + 1} af {pages} · {filtered.length} af {runs.length}{" "}
          forløb
        </span>
        <button
          className="button secondary small"
          disabled={currentPage + 1 === pages}
          onClick={() => {
            setPage(currentPage + 1);
            setTarget(undefined);
          }}
        >
          Næste forløb
        </button>
      </div>
    </>
  );
}

export function ActivityHistory({ project }: { project: Project }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase("da");
  const activity = [...project.activity]
    .reverse()
    .filter((event) =>
      `${event.title} ${event.type} rev ${event.revision}`
        .toLocaleLowerCase("da")
        .includes(query),
    );
  const pages = Math.max(1, Math.ceil(activity.length / EVENT_PAGE));
  const currentPage = Math.min(page, pages - 1);
  return (
    <aside className="activity-card full-activity">
      <div className="section-heading">
        <h2>Aktivitetslog</h2>
        <History size={16} />
      </div>
      <label className="activity-search">
        Søg hændelser
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Hændelse eller revision…"
        />
      </label>
      <div className="activity-list">
        {activity
          .slice(currentPage * EVENT_PAGE, (currentPage + 1) * EVENT_PAGE)
          .map((event, i) => (
            <div key={event.id}>
              <span
                className={`activity-dot ${i === 0 && currentPage === 0 && !query ? "recent" : ""}`}
              />
              <div>
                <p>{event.title}</p>
                <small>
                  {formatDate(event.createdAt)} · rev {event.revision}
                </small>
              </div>
            </div>
          ))}
        {activity.length === 0 && (
          <p className="history-empty">Ingen hændelser matcher din søgning.</p>
        )}
      </div>
      <div
        className="history-pagination compact"
        aria-label="Sider med hændelser"
      >
        <button
          className="text-button"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Forrige hændelser
        </button>
        <span role="status">
          Side {currentPage + 1} af {pages} · {activity.length} hændelser
        </span>
        <button
          className="text-button"
          disabled={currentPage + 1 === pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Næste hændelser
        </button>
      </div>
    </aside>
  );
}
