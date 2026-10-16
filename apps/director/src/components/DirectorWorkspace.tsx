"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Copy,
  Download,
  Film,
  FolderOpen,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Sparkles,
} from "lucide-react";
import { downloadFile, loadDocument } from "@tre/persistence";
import { parseProject, type Project } from "@tre/scene-format";
import {
  createProduction,
  isProductionKey,
  listProductions,
  type ProductionSummary,
} from "../lib/productions";
import DirectorEditor from "./DirectorEditor";
import { importPackage, verifyMedia } from "../lib/project-files";
const pointer = "director-active-production";
export default function DirectorWorkspace() {
  const [active, setActive] = useState<string | null>(null),
    [view, setView] = useState<"editor" | "library">("editor"),
    [current, setCurrent] = useState<Project | null>(null),
    [items, setItems] = useState<ProductionSummary[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [title, setTitle] = useState(""),
    [template, setTemplate] = useState<"empty" | "sample">("empty");
  const generation = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let key = "production";
      try {
        const saved = localStorage.getItem(pointer);
        if (
          saved &&
          isProductionKey(saved) &&
          (await loadDocument("director", saved))
        )
          key = saved;
      } catch {}
      if (alive) setActive(key);
    })();
    return () => {
      alive = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const run = ++generation.current;
    setLoading(true);
    try {
      const next = await listProductions();
      if (run === generation.current) {
        setItems(next);
        setError("");
      }
    } catch (e) {
      if (run === generation.current)
        setError(
          e instanceof Error ? e.message : "Biblioteket kunne ikke åbnes",
        );
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (view !== "library") return;
    void refresh();
    heading.current?.focus();
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("tre-apps-director");
    channel.onmessage = () => void refresh();
    return () => {
      channel.close();
      generation.current++;
    };
  }, [view, refresh]);
  const open = (key: string) => {
    try {
      localStorage.setItem(pointer, key);
    } catch {}
    setActive(key);
    setView("editor");
    setError("");
  };
  const act = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "QuotaExceededError"
          ? "Browserens lager er fuldt. Hent sikkerhedskopier, eller frigør plads på enheden. Dine eksisterende film er bevaret."
          : e instanceof Error
            ? e.message
            : "Handlingen kunne ikke gennemføres. Din eksisterende film er bevaret.",
      );
    } finally {
      setBusy("");
    }
  };
  const duplicate = (item: ProductionSummary) =>
    act("Opretter en selvstændig kopi …", async () => {
      const stored = await loadDocument<Project>("director", item.key);
      if (!stored) throw Error("Filmen kunne ikke findes");
      const source = parseProject(stored.data),
        next = await createProduction(
          (source.title + " · kopi").slice(0, 120),
          "sample",
          source,
        );
      open(next.key);
    });
  const importProject = (file: File) =>
    act("Validerer projektfil som en ny film …", async () => {
      if (file.size > 100 * 1024 * 1024)
        throw Error("Projektet må højst være 100 MB");
      const project = file.name.toLowerCase().endsWith(".zip")
        ? await importPackage(await file.arrayBuffer())
        : parseProject(JSON.parse(await file.text()));
      await verifyMedia(project);
      const next = await createProduction(project.title, "sample", project);
      open(next.key);
    });
  const backup = (item: ProductionSummary) =>
    act("Henter sikkerhedskopi …", async () => {
      const stored = await loadDocument<unknown>("director", item.key);
      if (!stored) throw Error("Filmen kunne ikke findes");
      downloadFile(
        `${item.title.toLocaleLowerCase("da-DK").replace(/[^a-zæøå0-9]+/g, "-")}-sikkerhedskopi.json`,
        JSON.stringify(stored.data, null, 2),
        "application/json",
      );
    });
  if (!active)
    return (
      <main className="loading-screen">
        <Clapperboard size={42} />
        <h1>Director</h1>
        <p>Åbner dit filmværksted …</p>
      </main>
    );
  if (view === "editor")
    return (
      <DirectorEditor
        key={active}
        documentKey={active}
        onOpenProductions={(project) => {
          setCurrent(project);
          setView("library");
          setQuery("");
        }}
      />
    );
  const filtered = items.filter((item) =>
    item.title
      .toLocaleLowerCase("da-DK")
      .includes(query.toLocaleLowerCase("da-DK")),
  );
  return (
    <div className="production-library">
      <header className="library-header">
        <div className="library-brand">
          <Clapperboard size={25} />
          <span>
            DIRECTOR<small>FILMVÆRKSTED</small>
          </span>
        </div>
        <span className="library-local">
          <LockKeyhole size={14} /> Dit lokale bibliotek
        </span>
        {current && (
          <button
            className="button secondary"
            onClick={() => open(active)}
            disabled={!!busy}
          >
            <ArrowLeft size={15} />
            <span>Tilbage til filmen</span>
          </button>
        )}
      </header>
      <main className="library-main" aria-busy={loading || !!busy}>
        <div className="library-intro">
          <div>
            <div className="eyebrow">
              FRA DEN FØRSTE IDÉ TIL DET SIDSTE KLIP
            </div>
            <h1 ref={heading} tabIndex={-1}>
              Dine fortællinger.
              <br />
              <em>Dit filmværksted.</em>
            </h1>
            <p>
              Byg dit set, find dine indstillinger, og saml fortællingen.
              <br />
              Her har hver film sit eget sted at vokse.
            </p>
          </div>
          <div className="library-intro-note">
            <span>01 / SKAB</span>
            <span>02 / INSTRUÉR</span>
            <span>03 / FORTÆL</span>
            <div className="library-orbit">
              <Film size={28} />
            </div>
          </div>
        </div>
        {error && (
          <div className="library-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void refresh()} disabled={!!busy}>
              Prøv igen
            </button>
          </div>
        )}
        <section
          className="new-production"
          aria-labelledby="new-production-title"
        >
          <div className="new-production-copy">
            <span className="section-kicker">NÆSTE FORTÆLLING</span>
            <h2 id="new-production-title">Start noget nyt</h2>
            <p>
              En tom scene eller et færdigt udgangspunkt.{" "}
              <br />
              Dine andre film bliver i biblioteket.
            </p>
            <button
              className="library-import"
              onClick={() => importInput.current?.click()}
              disabled={!!busy}
            >
              <Upload size={14} /> Importér projekt som ny film
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".json,.zip,application/json,application/zip"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void importProject(file);
              }}
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("Opretter din film …", async () => {
                const next = await createProduction(title, template);
                setTitle("");
                open(next.key);
              });
            }}
          >
            <label className="field">
              <span>Filmens titel</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Hvad skal din næste film hedde?"
                disabled={!!busy}
              />
            </label>
            <div className="new-production-controls">
              <label className="field">
                <span>Udgangspunkt</span>
                <select
                  value={template}
                  onChange={(e) =>
                    setTemplate(e.target.value as "empty" | "sample")
                  }
                  disabled={!!busy}
                >
                  <option value="empty">
                    Tomt observationsdæk · ingen shots
                  </option>
                  <option value="sample">
                    Det sidste signal · 5 shots / 60 sek.
                  </option>
                </select>
              </label>
              <button
                type="submit"
                className="button primary"
                disabled={!!busy}
              >
                <Plus size={17} /> Opret film
              </button>
            </div>
          </form>
        </section>
        <section
          className="library-projects"
          aria-labelledby="library-projects-title"
        >
          <div className="library-section-heading">
            <div>
              <h2 id="library-projects-title">
                Produktioner <span>{items.length}</span>
              </h2>
              <p>
                Gemmes i denne browser. Tag en projektkopi med dig, når du
                skifter enhed.
              </p>
            </div>
            <div className="library-search">
              <label>
                <Search size={15} />
                <input
                  type="search"
                  aria-label="Søg i produktioner"
                  placeholder="Find en fortælling …"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className="icon-button"
                aria-label="Opdatér produktionsbibliotek"
                onClick={() => void refresh()}
                disabled={loading || !!busy}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          {loading && !items.length ? (
            <div className="library-empty" role="status">
              Åbner dine produktioner …
            </div>
          ) : filtered.length ? (
            <div className="production-grid">
              {filtered.map((item, index) => (
                <article
                  className={`production-card ${item.key === active ? "is-current" : ""}`}
                  key={item.key}
                  data-production-key={item.key}
                >
                  <button
                    className="production-card-open"
                    disabled={!item.valid || !!busy}
                    onClick={() => open(item.key)}
                    aria-label={`Åbn ${item.title}`}
                  >
                    <div className="production-cover">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" />
                      ) : (
                        <div className="production-cover-empty">
                          <Clapperboard size={37} />
                          <span>
                            {item.valid
                              ? "Plads til en ny fortælling"
                              : "Projektformat kan ikke åbnes"}
                          </span>
                        </div>
                      )}
                      <span className="production-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {item.key === active && (
                        <span className="current-production-badge">
                          SENEST ÅBNET
                        </span>
                      )}
                      <span className="production-open-mark">
                        <ArrowRight size={18} />
                      </span>
                    </div>
                    <div className="production-card-info">
                      <h3>{item.title}</h3>
                      <span>
                        {item.valid
                          ? `${item.shots} shots · ${Math.round((item.frames / 24) * 10) / 10} sek. · 16:9`
                          : "Kan ikke åbnes · hent en sikkerhedskopi"}
                      </span>
                    </div>
                  </button>
                  <div className="production-card-footer">
                    <time dateTime={item.updatedAt ?? undefined}>
                      {item.updatedAt
                        ? new Intl.DateTimeFormat("da-DK", {
                            day: "numeric",
                            month: "short",
                          }).format(new Date(item.updatedAt))
                        : "Lokalt projekt"}
                    </time>
                    <button
                      aria-label={`Duplikér ${item.title}`}
                      onClick={() => void duplicate(item)}
                      disabled={!item.valid || !!busy}
                    >
                      <Copy size={14} />
                      <span>Kopi</span>
                    </button>
                    <button
                      aria-label={`Hent sikkerhedskopi af ${item.title}`}
                      onClick={() => void backup(item)}
                      disabled={!!busy}
                    >
                      <Download size={14} />
                      <span>Hent</span>
                    </button>
                  </div>
                  {!item.valid && (
                    <p className="production-card-error">{item.error}</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="library-empty">
              <FolderOpen size={29} />
              <h3>
                {query
                  ? "Ingen film matcher din søgning"
                  : "Din første fortælling begynder her"}
              </h3>
              <p>
                {query
                  ? "Prøv en anden titel."
                  : "Opret en film ovenfor, og find dine første indstillinger."}
              </p>
              {query && (
                <button
                  className="button secondary"
                  onClick={() => setQuery("")}
                >
                  Vis alle film
                </button>
              )}
            </div>
          )}
        </section>
        <footer className="library-footer">
          <span>
            <LockKeyhole size={13} /> Lokale film · dine egne materialer
          </span>
          <span>Dit set. Din fortælling.</span>
        </footer>
      </main>
      {busy && (
        <div className="toast working" role="status">
          <Sparkles size={16} />
          <span>{busy}</span>
        </div>
      )}
    </div>
  );
}
