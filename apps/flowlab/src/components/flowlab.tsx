"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  FileText,
  FlaskConical,
  FolderOpen,
  GitBranch,
  History,
  LayoutGrid,
  List,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Redo2,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Undo2,
  Upload,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  ENGINE_VERSION,
  describeEngineCode,
  assembleComparison,
  seedList,
  inputDiff,
  modelSchema,
  validateModel,
  type Comparison,
  type SimulationResult,
  type FlowModel,
  type FlowNode,
  type MetricKey,
} from "@tre/flow-engine";
import { downloadFile, usePersistentDocument } from "@tre/persistence";
import {
  comparisonMatches,
  formatMetric,
  formatNumber,
  initialDocument,
  validateDocument,
  type FlowDocument,
} from "../lib/document";
import { createReport, reportPdf, reportZip } from "../lib/report";
import Inspector from "./inspector";
import { nodeIcons, nodeLabels } from "./model-canvas";
import {
  MetricCards,
  QueueChart,
  ResourceChart,
  ResultsPanel,
} from "./results";
import DataWorkshop from "./data-workshop";
const ModelCanvas = dynamic(() => import("./model-canvas"), {
  ssr: false,
  loading: () => (
    <div className="canvas-loading">
      <LoaderCircle className="spin" size={22} />
      Åbner modelværkstedet…
    </div>
  ),
});
type Tab = "model" | "scenarios" | "results" | "data" | "report" | "library";
const navigation: { id: Tab; label: string; icon: typeof Network }[] = [
  { id: "model", label: "Modelværksted", icon: Network },
  { id: "scenarios", label: "Scenarier", icon: GitBranch },
  { id: "results", label: "Resultater", icon: Activity },
  { id: "data", label: "Dataværksted", icon: Database },
  { id: "report", label: "Beslutningsrapport", icon: FileText },
];
export default function FlowLab() {
  const {
    data: doc,
    setData,
    ready,
    saveState,
    savedAt,
    error: storageError,
    reload,
  } = usePersistentDocument(
    "flowlab",
    "workspace",
    initialDocument,
    validateDocument,
  );
  const [tab, setTab] = useState<Tab>("model"),
    [variant, setVariant] = useState<"baseline" | "scenario">("scenario"),
    [selected, setSelected] = useState("process"),
    [listMode, setListMode] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(true),
    [mobileNav, setMobileNav] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [running, setRunning] = useState(false),
    [exporting, setExporting] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 30 }),
    [partial, setPartial] = useState<Comparison | null>(null),
    [showPalette, setShowPalette] = useState(false),
    [showHelp, setShowHelp] = useState(false),
    [seed, setSeed] = useState(2026),
    [historyCount, setHistoryCount] = useState(0);
  const pendingRun = useRef<{
    baseline: FlowModel;
    scenario: FlowModel;
    seeds: number[];
    baselineRuns: SimulationResult[];
    scenarioRuns: SimulationResult[];
  } | null>(null);
  const worker = useRef<Worker | null>(null),
    currentDoc = useRef(doc),
    autoRan = useRef(false),
    undo = useRef<FlowDocument[]>([]),
    redo = useRef<FlowDocument[]>([]),
    importInput = useRef<HTMLInputElement>(null),
    modalRef = useRef<HTMLDialogElement>(null);
  currentDoc.current = doc;
  const model = doc[variant],
    comparison = doc.comparison,
    stale = comparison && !comparisonMatches(doc),
    issues = validateModel(model);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setListMode(true);
      setInspectorOpen(false);
    }
  }, []);
  useEffect(() => {
    if (showHelp) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [showHelp]);
  const update = useCallback(
    (next: FlowDocument, record = true) => {
      try {
        const checked = validateDocument(next);
        if (record) {
          undo.current.push(currentDoc.current);
          if (undo.current.length > 40) undo.current.shift();
          redo.current = [];
          setHistoryCount((n) => n + 1);
        }
        setData(checked);
        setError("");
      } catch (e) {
        setError(
          e instanceof Error
            ? `Ændringen kunne ikke gemmes: ${e.message}`
            : "Ugyldig ændring.",
        );
      }
    },
    [setData],
  );
  const changeModel = useCallback(
    (next: FlowModel) => {
      const prior = currentDoc.current;
      update({
        ...prior,
        [variant]: { ...next, revision: prior[variant].revision + 1 },
      });
    },
    [update, variant],
  );
  const doUndo = useCallback(() => {
    const previous = undo.current.pop();
    if (!previous) return;
    redo.current.push(currentDoc.current);
    setData(previous);
    setHistoryCount((n) => n + 1);
    notify("Ændringen er fortrudt.");
  }, [setData]);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(currentDoc.current);
    setData(next);
    setHistoryCount((n) => n + 1);
  }, [setData]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        (event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      )
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [doUndo, doRedo]);
  const run = useCallback(
    (count = 30) => {
      if (worker.current) return;
      const snapshot = structuredClone(currentDoc.current),
        allIssues = [
          ...validateModel(snapshot.baseline),
          ...validateModel(snapshot.scenario),
        ];
      if (allIssues.length) {
        setError(allIssues.map((i) => i.message).join(" "));
        return;
      }
      setError("");
      setPartial(null);
      setRunning(true);
      setProgress({ done: 0, total: count });
      pendingRun.current = {
        baseline: snapshot.baseline,
        scenario: snapshot.scenario,
        seeds: seedList(seed, count),
        baselineRuns: [],
        scenarioRuns: [],
      };
      const w = new Worker(
        new URL("../workers/simulation.worker.ts", import.meta.url),
      );
      worker.current = w;
      w.onmessage = (event) => {
        if (worker.current !== w) return;
        const message = event.data;
        if (message.type === "pair") {
          pendingRun.current?.baselineRuns.push(message.baseline);
          pendingRun.current?.scenarioRuns.push(message.scenario);
        } else if (message.type === "progress")
          setProgress({ done: message.done, total: message.total });
        else {
          setRunning(false);
          w.terminate();
          worker.current = null;
          if (message.type === "result") {
            const result = message.result as Comparison;
            if (result.status === "completed") {
              const latest = currentDoc.current;
              setData({ ...latest, comparison: result });
              notify(
                `${result.seeds.length} parrede kørsler er færdige. Resultatet er gemt lokalt.`,
              );
            } else {
              setPartial(result);
              setError(
                `Kørslen blev ${result.status === "partial" ? "afbrudt" : "stoppet med fejl"}. ${result.seeds.length} af ${result.requestedSeeds.length} par er beregnet. Seneste fuldførte resultat er bevaret. ${[...new Set([...result.baselineRuns, ...result.scenarioRuns].flatMap((r) => r.warningCodes))].map(describeEngineCode).join(" ")}`,
              );
            }
          } else setError(message.message);
        }
      };
      w.onerror = () => {
        if (worker.current !== w) return;
        setRunning(false);
        setError(
          "Beregningsprocessen kunne ikke gennemføres. Seneste resultat er bevaret.",
        );
        w.terminate();
        worker.current = null;
      };
      w.postMessage({
        type: "run",
        baseline: snapshot.baseline,
        scenario: snapshot.scenario,
        seed,
        count,
      });
    },
    [seed, setData],
  );
  const cancelRun = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    const pending = pendingRun.current;
    if (pending) {
      const cancelled = assembleComparison(
        pending.baseline,
        pending.scenario,
        pending.seeds,
        pending.baselineRuns,
        pending.scenarioRuns,
      );
      cancelled.status = "partial";
      setPartial(cancelled);
      setError(
        `Kørslen er afbrudt. ${cancelled.seeds.length} fuldførte par er bevaret som partial. Det igangværende par er kasseret, og seneste fuldførte sammenligning er bevaret.`,
      );
    }
  };
  useEffect(() => {
    if (ready && !doc.comparison && !autoRan.current) {
      autoRan.current = true;
      run(30);
    }
  }, [ready, doc.comparison, run]);
  const go = (next: Tab) => {
    setTab(next);
    setMobileNav(false);
  };
  const exportReport = async (kind: "pdf" | "zip" | "json") => {
    if (exporting) return;
    setExporting(true);
    try {
      const report = createReport(doc);
      if (kind === "pdf")
        downloadFile(
          "FlowLab-beslutningsrapport.pdf",
          (await reportPdf(report)) as BlobPart,
          "application/pdf",
        );
      else if (kind === "zip")
        downloadFile(
          "FlowLab-beslutningspakke.zip",
          (await reportZip(report)) as BlobPart,
          "application/zip",
        );
      else
        downloadFile("FlowLab-rapport.json", JSON.stringify(report, null, 2));
      notify("Rapporten er klar i dine downloads.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Rapporten kunne ikke eksporteres.",
      );
    } finally {
      setExporting(false);
    }
  };
  const saveVersion = () => {
    const snapshot = {
      id: crypto.randomUUID(),
      label: `Version ${doc.versions.length + 1}`,
      savedAt: new Date().toISOString(),
      baseline: structuredClone(doc.baseline),
      scenario: structuredClone(doc.scenario),
    };
    update({ ...doc, versions: [snapshot, ...doc.versions].slice(0, 30) });
    notify(`${snapshot.label} er gemt som et uforanderligt snapshot.`);
  };
  const addNode = (kind: FlowNode["kind"]) => {
    const id = crypto.randomUUID(),
      node: FlowNode = {
        id,
        kind,
        label: `Ny ${nodeLabels[kind].toLowerCase()}`,
        position: { x: 280 + model.nodes.length * 30, y: 340 },
        variableCost: 0,
        maxVisits: 20,
        ...(["activity", "wait"].includes(kind)
          ? { duration: { type: "fixed" as const, value: 600000 } }
          : {}),
        ...(kind === "activity" ? { resourceId: model.resources[0]?.id } : {}),
      };
    const previous = model.nodes.find((n) => n.id === selected);
    const outgoing = model.edges.filter((e) => e.source === selected);
    const insert = kind !== "sink" && previous && outgoing.length === 1;
    if (previous)
      node.position = {
        x: previous.position.x + 80,
        y: previous.position.y + 190,
      };
    changeModel({
      ...model,
      nodes: [...model.nodes, node],
      edges: insert
        ? [
            ...model.edges.map((e) =>
              e.id === outgoing[0].id ? { ...e, target: id } : e,
            ),
            {
              id: crypto.randomUUID(),
              source: id,
              target: outgoing[0].target,
              ...(kind === "decision" ? { weight: 1 } : {}),
            },
          ]
        : model.edges,
    });
    setSelected(id);
    setInspectorOpen(true);
    setShowPalette(false);
  };
  const importDocument = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Modelpakken må højst være 20 MB.");
      const parsed = validateDocument(JSON.parse(await file.text()));
      worker.current?.terminate();
      worker.current = null;
      pendingRun.current = null;
      setRunning(false);
      setPartial(null);
      update({ ...parsed, comparison: null, holdout: null });
      autoRan.current = false;
      notify(
        "Modellen er importeret; resultater genberegnes fra input. Dit tidligere arbejde kan gendannes med Fortryd.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Modelpakken kunne ikke læses.",
      );
    }
  };
  const comparisonReady =
    !!comparison &&
    comparison.status === "completed" &&
    comparison.seeds.length >= 30;
  const diff = inputDiff(doc.baseline, doc.scenario).filter(
    (d) =>
      !["revision", "id"].includes(d.path) && !d.path.includes(".position."),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Gå til indhold
      </a>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a className="brand" href="/" aria-label="FlowLab forside">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <strong>
            flowlab<span>®</span>
          </strong>
        </a>
        <div className="workspace-pill">
          <span className="workspace-avatar">S</span>
          <span>
            Sebastians laboratorium<small>Personligt · Lokal demo</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">ARBEJDSRUM</div>
        <nav aria-label="Hovednavigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${tab === id ? "active" : ""}`}
              onClick={() => go(id)}
              key={id}
            >
              <Icon size={19} strokeWidth={1.7} />
              {label}
              {id === "scenarios" && <span className="nav-count">2</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-separator" />
        <button
          className={`nav-item ${tab === "library" ? "active" : ""}`}
          onClick={() => go("library")}
        >
          <FolderOpen size={19} strokeWidth={1.7} />
          Modelbibliotek
        </button>
        <button className="nav-item" onClick={() => setShowHelp(true)}>
          <BookOpen size={19} strokeWidth={1.7} />
          Sådan virker FlowLab
        </button>
        <div className="sidebar-bottom">
          <div className="lab-note">
            <span className="tiny-leaf">✳</span>
            <strong>Plads til bedre idéer.</strong>
            <p>Test en tanke, før du ændrer hverdagen.</p>
            <button onClick={() => setShowHelp(true)}>
              Kom godt i gang
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="local-indicator">
            <span className="status-dot" />
            <span>
              Lokalt. Privat. Dit.<small>Ingen cloud er tilkoblet</small>
            </span>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Luk navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Åbn navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-root">Mit arbejdsrum</span>
            <ChevronRight size={13} />
            <span>{doc.baseline.name}</span>
            <ChevronDown size={12} />
          </div>
          <div className="topbar-actions">
            <span
              className={`save-indicator ${saveState === "error" || saveState === "conflict" ? "error-text" : ""}`}
            >
              {saveState === "saving" ? (
                <LoaderCircle size={13} className="spin" />
              ) : saveState === "saved" ? (
                <Check size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>
                {saveState === "saved"
                  ? "Gemt lokalt"
                  : saveState === "saving"
                    ? "Gemmer…"
                    : saveState === "loading"
                      ? "Åbner…"
                      : "Kræver opmærksomhed"}
              </span>
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Åbn hjælp"
              onClick={() => setShowHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <span className="user-avatar" title="Personligt lokalt arbejdsrum">
              SL
            </span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="heading-kicker">
                <span className="eyebrow">DIT BESLUTNINGSLABORATORIUM</span>
                <span className="demo-badge">
                  <span />
                  {model.evidence === "synthetic"
                    ? "Eksempeldata"
                    : "Importerede data · Ikke kalibreret"}
                </span>
              </div>
              <h1>
                {tab === "library" ? "Dit modelbibliotek" : doc.baseline.name}
                <span className="title-dot">.</span>
              </h1>
              <p>Byg processen. Afprøv ændringen. Forstå konsekvensen.</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary export-button"
                disabled={!comparisonReady || exporting}
                onClick={() => exportReport("pdf")}
              >
                <ArrowDownToLine size={16} />
                <span>
                  {exporting ? "Forbereder rapport…" : "Eksportér rapport"}
                </span>
              </button>
              {running ? (
                <button className="button primary" onClick={cancelRun}>
                  <Square size={14} fill="currentColor" />
                  Afbryd · {progress.done}/{progress.total}
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!ready}
                  onClick={() => run(30)}
                >
                  <Play size={15} fill="currentColor" />
                  Kør sammenligning
                </button>
              )}
            </div>
          </div>
          {storageError && (
            <div className="error-box" role="alert">
              <AlertTriangle size={18} />
              <span>{storageError}</span>
              <button className="text-button" onClick={() => void reload()}>
                Hent gemt version
              </button>
              <button
                className="text-button"
                onClick={() =>
                  downloadFile(
                    "FlowLab-arbejdskopi.json",
                    JSON.stringify(doc, null, 2),
                  )
                }
              >
                Eksportér min kopi
              </button>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              {partial && (
                <button
                  className="text-button"
                  onClick={() =>
                    downloadFile(
                      "FlowLab-ufuldstaendigt-resultat.json",
                      JSON.stringify(partial, null, 2),
                    )
                  }
                >
                  Hent partial JSON
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Luk fejlbesked"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready && !storageError ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={28} />
              <h2>Åbner dit laboratorium…</h2>
              <p>Vi henter den seneste model fra denne browser.</p>
            </div>
          ) : (
            <>
              <div
                className="page-tabs"
                role="tablist"
                aria-label="Arbejdsvisning"
              >
                {navigation.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    tabIndex={
                      tab === id ||
                      (!navigation.some((item) => item.id === tab) &&
                        id === "model")
                        ? 0
                        : -1
                    }
                    onKeyDown={(event) => {
                      const index = navigation.findIndex(
                        (item) => item.id === id,
                      );
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % navigation.length
                          : event.key === "ArrowLeft"
                            ? (index + navigation.length - 1) %
                              navigation.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? navigation.length - 1
                                : -1;
                      if (next < 0) return;
                      event.preventDefault();
                      go(navigation[next].id);
                      const buttons =
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          '[role="tab"]',
                        );
                      buttons?.[next]?.focus();
                    }}
                    onClick={() => go(id)}
                  >
                    <Icon size={15} />
                    {id === "model"
                      ? "Model"
                      : id === "report"
                        ? "Rapport"
                        : label}
                    {id === "scenarios" && <span>2</span>}
                  </button>
                ))}
              </div>
              {running && (
                <div className="run-progress" role="status">
                  <LoaderCircle size={15} className="spin" />
                  <span>
                    Motoren sammenligner dine scenarier…{" "}
                    <strong>
                      {progress.done} af {progress.total} par
                    </strong>
                  </span>
                  <progress value={progress.done} max={progress.total} />
                </div>
              )}
              {stale && (
                <div className="notice stale-notice">
                  <History size={17} />
                  <p>
                    Modellen eller motoren er opdateret. Resultater og rapport
                    viser det senest fuldførte snapshot. Kør igen for at se
                    effekten af dine nye antagelser.
                  </p>
                </div>
              )}
              {tab === "model" && (
                <>
                  <div className="hypothesis-strip">
                    <span className="idea-icon">
                      <Sparkles size={20} strokeWidth={1.5} />
                    </span>
                    <div>
                      <strong>Hvad nu, hvis teamet fik en ekstra hånd?</strong>
                      <p>
                        Én ændring. To scenarier. Et bedre beslutningsgrundlag.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("scenarios")}
                    >
                      Se antagelser
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {model.resources[0] && (
                    <div className="mobile-quick-control">
                      <div>
                        <strong>
                          {variant === "baseline" ? "Baseline" : "Alternativ"} ·{" "}
                          {model.resources[0].label}
                        </strong>
                        <p>Afprøv en ændring i kapaciteten</p>
                      </div>
                      <div className="stepper">
                        <button
                          aria-label="Færre medarbejdere"
                          disabled={model.resources[0].capacity === 0}
                          onClick={() =>
                            changeModel({
                              ...model,
                              resources: model.resources.map((r, i) =>
                                i === 0
                                  ? { ...r, capacity: r.capacity - 1 }
                                  : r,
                              ),
                            })
                          }
                        >
                          −
                        </button>
                        <input
                          aria-label="Hurtig ændring af medarbejdere"
                          type="number"
                          min={0}
                          max={1000}
                          value={model.resources[0].capacity}
                          onChange={(e) =>
                            changeModel({
                              ...model,
                              resources: model.resources.map((r, i) =>
                                i === 0
                                  ? {
                                      ...r,
                                      capacity: Math.max(
                                        0,
                                        Math.min(
                                          1000,
                                          Math.round(Number(e.target.value)),
                                        ),
                                      ),
                                    }
                                  : r,
                              ),
                            })
                          }
                        />
                        <button
                          aria-label="Flere medarbejdere"
                          onClick={() =>
                            changeModel({
                              ...model,
                              resources: model.resources.map((r, i) =>
                                i === 0
                                  ? {
                                      ...r,
                                      capacity: Math.min(1000, r.capacity + 1),
                                    }
                                  : r,
                              ),
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                  <section
                    className={`editor-panel ${inspectorOpen ? "with-inspector" : ""}`}
                    aria-label="Modelværksted"
                  >
                    <div className="canvas-area">
                      <div className="canvas-toolbar">
                        <div className="scenario-switch">
                          <button
                            className={variant === "baseline" ? "selected" : ""}
                            onClick={() => setVariant("baseline")}
                          >
                            <i className="dot baseline" />
                            Baseline
                          </button>
                          <button
                            className={variant === "scenario" ? "selected" : ""}
                            onClick={() => setVariant("scenario")}
                          >
                            <i className="dot scenario" />
                            Alternativ
                          </button>
                        </div>
                        <div className="canvas-tools">
                          <button
                            className="icon-button"
                            onClick={doUndo}
                            disabled={!undo.current.length}
                            aria-label="Fortryd ændring"
                          >
                            <Undo2 size={16} />
                          </button>
                          <button
                            className="icon-button"
                            onClick={doRedo}
                            disabled={!redo.current.length}
                            aria-label="Gentag ændring"
                          >
                            <Redo2 size={16} />
                          </button>
                          <span className="tool-divider" />
                          <button
                            className={`icon-button ${listMode ? "selected" : ""}`}
                            onClick={() => setListMode(!listMode)}
                            aria-label={
                              listMode ? "Vis canvas" : "Vis listeeditor"
                            }
                          >
                            {listMode ? (
                              <Network size={17} />
                            ) : (
                              <List size={17} />
                            )}
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => setInspectorOpen(!inspectorOpen)}
                            aria-label="Vis eller skjul indstillinger"
                          >
                            <Settings2 size={17} />
                          </button>
                        </div>
                      </div>
                      <div className="canvas-subheader">
                        <span>
                          {model.nodes.length} trin <b>·</b>{" "}
                          {model.resources.length} ressourcepools <b>·</b>{" "}
                          {model.horizon / 3600000} timers model
                        </span>
                        <span>v{model.revision}</span>
                      </div>
                      <div
                        className={`canvas-stage ${listMode ? "as-list" : ""}`}
                      >
                        {listMode ? (
                          <div className="node-list">
                            {model.nodes.map((node, i) => {
                              const Icon = nodeIcons[node.kind];
                              return (
                                <button
                                  key={node.id}
                                  className={`node-list-item ${selected === node.id ? "selected" : ""}`}
                                  onClick={() => {
                                    setSelected(node.id);
                                    setInspectorOpen(true);
                                  }}
                                >
                                  <span
                                    className={`list-node-icon kind-${node.kind}`}
                                  >
                                    <Icon size={20} />
                                  </span>
                                  <span>
                                    <small>
                                      {String(i + 1).padStart(2, "0")} ·{" "}
                                      {nodeLabels[node.kind]}
                                    </small>
                                    <strong>{node.label}</strong>
                                  </span>
                                  <ChevronRight size={17} />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <ModelCanvas
                            model={model}
                            selected={selected}
                            onSelect={(id) => {
                              setSelected(id);
                              setInspectorOpen(true);
                            }}
                            onMove={(id, position) =>
                              changeModel({
                                ...model,
                                nodes: model.nodes.map((n) =>
                                  n.id === id ? { ...n, position } : n,
                                ),
                              })
                            }
                            onConnect={(c) => {
                              if (c.source && c.target)
                                changeModel({
                                  ...model,
                                  edges: [
                                    ...model.edges,
                                    {
                                      id: crypto.randomUUID(),
                                      source: c.source,
                                      target: c.target,
                                      ...(model.nodes.find(
                                        (n) => n.id === c.source,
                                      )?.kind === "decision"
                                        ? { weight: 0 }
                                        : {}),
                                    },
                                  ],
                                });
                            }}
                          />
                        )}
                      </div>
                      <div className="canvas-footer">
                        <div className="palette-anchor">
                          <button
                            className="button small secondary"
                            onClick={() => setShowPalette(!showPalette)}
                            aria-expanded={showPalette}
                          >
                            <Plus size={15} />
                            Tilføj trin
                          </button>
                          {showPalette && (
                            <div className="node-palette">
                              {(
                                [
                                  "activity",
                                  "decision",
                                  "wait",
                                  "rework",
                                  "sink",
                                ] as const
                              ).map((kind) => {
                                const Icon = nodeIcons[kind];
                                return (
                                  <button
                                    key={kind}
                                    onClick={() => addNode(kind)}
                                  >
                                    <Icon size={16} />
                                    {nodeLabels[kind]}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <span>
                          <span className="status-dot" />
                          {issues.length
                            ? `${issues.length} ting skal rettes`
                            : "Modellen er klar til at blive kørt"}
                        </span>
                        <button className="text-button" onClick={saveVersion}>
                          <Save size={14} />
                          <span>Gem version</span>
                        </button>
                      </div>
                      {issues.length > 0 && (
                        <div className="validation-list" role="alert">
                          {issues.slice(0, 6).map((issue, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                if (issue.nodeId) setSelected(issue.nodeId);
                                setInspectorOpen(true);
                              }}
                            >
                              <AlertTriangle size={14} />
                              {issue.message}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {inspectorOpen && (
                      <Inspector
                        model={model}
                        selected={selected}
                        variant={
                          variant === "baseline" ? "Baseline" : "Alternativ"
                        }
                        onChange={changeModel}
                        onClose={() => setInspectorOpen(false)}
                      />
                    )}
                  </section>
                  <div className="results-heading">
                    <h2>
                      En ændring, der kan mærkes<span>.</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => go("results")}
                    >
                      Se hele analysen
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <MetricCards comparison={comparison} />
                  {comparison && (
                    <div className="charts-grid">
                      <QueueChart comparison={comparison} />
                      <ResourceChart comparison={comparison} />
                    </div>
                  )}
                  <p className="result-caveat">
                    <InfoDot />
                    {comparison
                      ? `${comparison.seeds.length} parrede replikationer · Middel af run-resultater · ${ENGINE_VERSION}`
                      : "Resultater beregnes af motoren. Ingen illustrative tal."}{" "}
                    · Simuleret effekt, ikke realiseret gevinst.
                  </p>
                </>
              )}
              {tab === "results" && <ResultsPanel comparison={comparison} />}
              {tab === "scenarios" && (
                <div className="scenarios-view">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        KONTROLLEREDE EKSPERIMENTER
                      </span>
                      <h2>Hvad vil du ændre?</h2>
                      <p>
                        Baseline er dit udgangspunkt. Alternativet er din
                        hypotese.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => {
                        update({
                          ...doc,
                          scenario: structuredClone(doc.baseline),
                        });
                        notify("Alternativet er kopieret fra baseline.");
                      }}
                    >
                      <Copy size={16} />
                      Kopiér baseline
                    </button>
                  </div>
                  <div className="scenario-cards">
                    {(["baseline", "scenario"] as const).map((v, i) => (
                      <button
                        className={`scenario-card ${variant === v ? "selected" : ""}`}
                        key={v}
                        onClick={() => {
                          setVariant(v);
                          go("model");
                        }}
                      >
                        <div>
                          <span
                            className={`dot ${v === "baseline" ? "baseline" : "scenario"}`}
                          />
                          <span className="eyebrow">
                            {i === 0
                              ? "SCENARIO A · BASELINE"
                              : "SCENARIO B · ALTERNATIV"}
                          </span>
                          <ArrowUpRight size={18} />
                        </div>
                        <h3>
                          {i === 0 ? "Som vi arbejder i dag" : doc.scenarioName}
                        </h3>
                        <p>
                          {doc[v].resources
                            .map(
                              (r) => `${r.capacity} ${r.label.toLowerCase()}`,
                            )
                            .join(" · ")}
                        </p>
                        <span>
                          {doc[v].horizon / 3600000} timer · Version{" "}
                          {doc[v].revision} ·{" "}
                          {i === 0
                            ? "Udgangspunkt"
                            : `${diff.length} ændrede antagelser`}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="scenario-form-grid">
                    <section className="panel">
                      <h3>Giv din idé en retning</h3>
                      <label>
                        Navn på alternativ
                        <input
                          value={doc.scenarioName}
                          onChange={(e) =>
                            update({ ...doc, scenarioName: e.target.value })
                          }
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Din hypotese
                        <textarea
                          value={doc.hypothesis}
                          onChange={(e) =>
                            update({ ...doc, hypothesis: e.target.value })
                          }
                          rows={4}
                          maxLength={4000}
                        />
                      </label>
                      <div className="double-fields">
                        <label>
                          Fælles seed
                          <input
                            type="number"
                            min={0}
                            max={4294967295}
                            value={seed}
                            onChange={(e) =>
                              setSeed(
                                Math.max(
                                  0,
                                  Math.min(
                                    4294967295,
                                    Math.round(Number(e.target.value)),
                                  ),
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Replikationer
                          <input value="30 parrede kørsler" readOnly />
                        </label>
                      </div>
                      <p className="field-hint">
                        Samme seedliste for begge scenarier. Separate
                        tilfældighedsstrømme for ankomst, routing og hver
                        aktivitet.
                      </p>
                    </section>
                    <section className="panel">
                      <div className="section-title">
                        <h3>Præcis dét er ændret</h3>
                        <span className="small-badge">{diff.length} input</span>
                      </div>
                      {diff.length ? (
                        <div className="diff-list">
                          {diff.map((d, i) => (
                            <div key={i}>
                              <code>{humanPath(d.path, doc.baseline)}</code>
                              <span>
                                <b>{formatDiffValue(d.before)}</b>
                                <ArrowRight size={14} />
                                <b>{formatDiffValue(d.after)}</b>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state compact">
                          <GitBranch size={27} />
                          <h3>Et rent udgangspunkt.</h3>
                          <p>
                            Der er endnu ingen ændrede antagelser. Justér fx
                            antallet af medarbejdere i alternativet.
                          </p>
                        </div>
                      )}
                      <button
                        className="button primary full"
                        disabled={running}
                        onClick={() => run(30)}
                      >
                        <Play size={14} fill="currentColor" />
                        Afprøv hypotesen
                      </button>
                    </section>
                  </div>
                </div>
              )}
              {tab === "data" && (
                <DataWorkshop
                  dataset={doc.dataset}
                  model={doc.scenario}
                  baseline={doc.baseline}
                  comparison={doc.comparison}
                  assessment={doc.holdout}
                  trainingDataHashes={doc.trainingDataHashes}
                  onHoldout={(holdout) => {
                    update({ ...doc, holdout });
                    notify(
                      "Holdout-vurderingen er gemt med den præcise baseline og dataperiode.",
                    );
                  }}
                  onSave={(dataset) => {
                    update({ ...doc, dataset });
                    notify(
                      "Validerede data er gemt lokalt. Modellen er fortsat ikke kalibreret.",
                    );
                  }}
                  onCalibrate={(nodeId, duration, sourceHash) => {
                    update({
                      ...doc,
                      trainingDataHashes: [
                        ...new Set([...doc.trainingDataHashes, sourceHash]),
                      ].slice(-100),
                      scenario: {
                        ...doc.scenario,
                        revision: doc.scenario.revision + 1,
                        evidence: "imported",
                        nodes: doc.scenario.nodes.map((n) =>
                          n.id === nodeId
                            ? {
                                ...n,
                                duration: { type: "fixed", value: duration },
                              }
                            : n,
                        ),
                      },
                    });
                    notify(
                      "Medianen er overført til alternativets varighed. Kør igen for at se effekten.",
                    );
                  }}
                />
              )}
              {tab === "report" && (
                <div className="report-view">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">FRA INDSIGT TIL HANDLING</span>
                      <h2>En beslutning, du kan stå på mål for.</h2>
                      <p>
                        Tag modellen, antagelserne og usikkerheden med ind i
                        samtalen.
                      </p>
                    </div>
                    <span className="small-badge">
                      PDF + reproducerbare data
                    </span>
                  </div>
                  <div className="report-layout">
                    <article className="report-paper">
                      <div className="report-brand">
                        flowlab<span> / BESLUTNINGSRAPPORT</span>
                      </div>
                      <span className="eyebrow">
                        {doc.baseline.evidence === "synthetic"
                          ? "SYNTETISK GRUNDLAG · IKKE KALIBRERET"
                          : "IMPORTERET GRUNDLAG · IKKE KALIBRERET"}
                      </span>
                      <h2>{comparison?.baseline.name ?? doc.baseline.name}</h2>
                      <p className="report-subtitle">
                        Baseline vs. {doc.scenarioName}
                      </p>
                      <div className="report-hypothesis">
                        <span className="eyebrow">HYPOTESE</span>
                        <p>{doc.hypothesis}</p>
                      </div>
                      {comparison ? (
                        <>
                          <h3>Det peger simulationen på</h3>
                          <div className="report-findings">
                            {comparison.metrics
                              .filter((m) =>
                                [
                                  "throughput",
                                  "leadTime",
                                  "backlog",
                                  "cost",
                                ].includes(m.key),
                              )
                              .map((m) => (
                                <div key={m.key}>
                                  <span>
                                    {
                                      (
                                        {
                                          throughput: "Afsluttede sager",
                                          leadTime: "Gennemløbstid",
                                          backlog: "Restkø",
                                          cost: "Omkostning",
                                        } as Partial<Record<MetricKey, string>>
                                      )[m.key]
                                    }
                                  </span>
                                  <strong>
                                    {formatMetric(m.key, m.baseline)}
                                    <ArrowRight size={16} />
                                    {formatMetric(m.key, m.scenario)}
                                  </strong>
                                </div>
                              ))}
                          </div>
                          <p className="notice-text">
                            {comparison.seeds.length} parrede kørsler. Rapporten
                            indeholder simulationsspredning og fuld inputdiff.
                            Uafsluttede sager indgår ikke i gennemløbstiden.
                          </p>
                        </>
                      ) : (
                        <div className="empty-state compact">
                          <FileText size={30} />
                          <p>
                            En fuld sammenligning giver din rapport et
                            verificerbart talgrundlag.
                          </p>
                        </div>
                      )}
                      <h3>Din beslutning</h3>
                      <label className="sr-only" htmlFor="decision">
                        Din beslutning til rapporten
                      </label>
                      <textarea
                        id="decision"
                        rows={4}
                        placeholder="Hvad vil du gøre på baggrund af analysen? Hvilke antagelser skal undersøges først?"
                        value={doc.decision}
                        onChange={(e) =>
                          update({ ...doc, decision: e.target.value })
                        }
                        maxLength={10000}
                      />
                      <div className="report-footer">
                        <ShieldCheck size={17} />
                        <p>
                          Simuleret gevinst er ikke realiseret gevinst. Brug
                          rapporten som grundlag for en afprøvning, ikke som et
                          løfte.
                        </p>
                      </div>
                    </article>
                    <aside className="report-sidebar panel">
                      <span className="eyebrow">KLAR TIL SAMTALEN</span>
                      <h3>Del hele begrundelsen.</h3>
                      <p>
                        Rapporten samler formål, resultat, ændringer og
                        begrænsninger.
                      </p>
                      <ul className="check-list">
                        <li>
                          <Check size={15} />
                          PDF med antagelser og bilag
                        </li>
                        <li>
                          <Check size={15} />
                          Fuld model og inputdiff
                        </li>
                        <li>
                          <Check size={15} />
                          Seeds og motorversion
                        </li>
                        <li>
                          <Check size={15} />
                          Metrics som JSON og CSV
                        </li>
                      </ul>
                      <button
                        className="button primary full"
                        disabled={!comparisonReady || exporting}
                        onClick={() => exportReport("zip")}
                      >
                        <ArrowDownToLine size={16} />
                        Hent rapportpakke
                      </button>
                      <button
                        className="button secondary full"
                        disabled={!comparisonReady || exporting}
                        onClick={() => exportReport("pdf")}
                      >
                        Hent kun PDF
                      </button>
                      <button
                        className="text-button"
                        disabled={!comparisonReady || exporting}
                        onClick={() => exportReport("json")}
                      >
                        Hent JSON-grundlag
                        <ArrowRight size={14} />
                      </button>
                      <p className="field-hint">
                        {comparisonReady
                          ? `${comparison!.seeds.length} fuldførte par · ${comparison!.engineVersion}`
                          : "En komplet rapport kræver mindst 30 fuldførte, parrede kørsler."}
                      </p>
                    </aside>
                  </div>
                </div>
              )}
              {tab === "library" && (
                <div className="library-view">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">MODELLER & VERSIONER</span>
                      <h2>Et sikkert sted for dine næste idéer.</h2>
                      <p>
                        Gem versionssnapshots, og behold dit
                        beslutningsgrundlag.
                      </p>
                    </div>
                    <button className="button secondary" onClick={saveVersion}>
                      <Plus size={16} />
                      Gem ny version
                    </button>
                  </div>
                  <section className="template-card">
                    <div className="template-visual">
                      <Network size={56} strokeWidth={1} />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div>
                      <span className="eyebrow">
                        SKABELON · SYNTETISKE DATA
                      </span>
                      <h3>Medlemsservice</h3>
                      <p>
                        Et serviceteam, omkring 100 henvendelser om dagen og én
                        vigtig kapacitetsbeslutning. Et godt sted at begynde.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => {
                          update(initialDocument());
                          autoRan.current = false;
                          setSelected("process");
                          go("model");
                          notify(
                            "Skabelonen er åbnet. Dit tidligere arbejde kan gendannes med Fortryd.",
                          );
                        }}
                      >
                        Åbn frisk skabelon
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                  <div className="data-actions">
                    <button
                      className="button secondary"
                      onClick={() =>
                        downloadFile(
                          "FlowLab-modelpakke.json",
                          JSON.stringify(doc, null, 2),
                        )
                      }
                    >
                      <ArrowDownToLine size={15} />
                      Eksportér arbejdsrum
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => importInput.current?.click()}
                    >
                      <Upload size={15} />
                      Importér modelpakke
                    </button>
                    <input
                      type="file"
                      accept=".json,application/json"
                      ref={importInput}
                      className="sr-only"
                      aria-label="Importér modelpakke"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importDocument(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <section className="panel">
                    <div className="section-title">
                      <h3>Gemte versioner</h3>
                      <span className="small-badge">
                        {doc.versions.length} / 30
                      </span>
                    </div>
                    {doc.versions.length ? (
                      <div className="version-list">
                        {doc.versions.map((v) => (
                          <div key={v.id}>
                            <span className="version-icon">
                              <History size={20} />
                            </span>
                            <span>
                              <strong>{v.label}</strong>
                              <small>
                                {new Date(v.savedAt).toLocaleString("da-DK")} ·{" "}
                                {v.baseline.nodes.length} trin
                              </small>
                            </span>
                            <button
                              className="text-button"
                              onClick={() => {
                                update({
                                  ...doc,
                                  baseline: structuredClone(v.baseline),
                                  scenario: structuredClone(v.scenario),
                                });
                                notify(
                                  `${v.label} er indlæst. Fortryd er tilgængelig.`,
                                );
                              }}
                            >
                              Gendan
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state compact">
                        <History size={28} />
                        <h3>Bevar et godt udgangspunkt.</h3>
                        <p>
                          Gem en version før næste eksperiment. De seneste 30
                          snapshots bevares lokalt.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              )}
              <footer className="app-footer">
                <span>
                  <span className="status-dot" />
                  Lokal demo ·{" "}
                  {savedAt
                    ? `Sidst gemt ${new Date(savedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`
                    : "Ikke gemt endnu"}
                </span>
                <span>
                  Byg processen. Forstå forskellen.
                  <span className="footer-mark">✳</span>
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button"
            aria-label="Luk besked"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        ref={modalRef}
        onCancel={() => setShowHelp(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowHelp(false);
        }}
        className="help-dialog"
      >
        <button
          className="icon-button dialog-close"
          aria-label="Luk hjælp"
          onClick={() => setShowHelp(false)}
        >
          <X size={20} />
        </button>
        <span className="idea-icon">
          <FlaskConical size={26} />
        </span>
        <span className="eyebrow">VELKOMMEN TIL FLOWLAB</span>
        <h2>
          Et lille eksperiment.
          <br />
          En bedre beslutning.
        </h2>
        <p>
          Du behøver ikke være simulationsekspert. Begynd med det spørgsmål, dit
          team står med.
        </p>
        <ol className="onboarding-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Forstå dit udgangspunkt</strong>
              <p>
                Åbn baseline. Gennemgå ankomster, varigheder og medarbejdere.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Ændr én antagelse</strong>
              <p>
                Vælg alternativet og tilføj fx én sagsbehandler. Begge scenarier
                bruger de samme seeds.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Se hele konsekvensen</strong>
              <p>
                Vurder kø, tid, omkostning og simulationsspredning. Gem din
                beslutning i rapporten.
              </p>
            </div>
          </li>
        </ol>
        <div className="notice">
          <ShieldCheck size={20} />
          <p>
            Alt foregår lokalt med syntetiske data. Rydning af browserdata
            sletter også dine modeller. Eksportér en modelpakke som
            sikkerhedskopi.
          </p>
        </div>
        <button
          className="button primary full"
          onClick={() => setShowHelp(false)}
        >
          Lad os undersøge det
          <ArrowRight size={16} />
        </button>
      </dialog>
    </div>
  );
}
function InfoDot() {
  return <span className="info-dot">i</span>;
}
function formatDiffValue(value: unknown) {
  if (typeof value === "number")
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
function humanPath(path: string, model: FlowModel) {
  const r = /^resources\.(\d+)\.(.+)$/.exec(path);
  if (r)
    return `${model.resources[Number(r[1])]?.label ?? "Ressource"} · ${{ capacity: "medarbejdere", hourlyCost: "timeløn", calendar: "arbejdsplan" }[r[2]] ?? r[2]}`;
  const n = /^nodes\.(\d+)\.(.+)$/.exec(path);
  if (n) return `${model.nodes[Number(n[1])]?.label ?? "Node"} · ${n[2]}`;
  return path;
}
