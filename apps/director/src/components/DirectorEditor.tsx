"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Clapperboard,
  Film,
  Layers3,
  Users,
  MapPin,
  ChevronDown,
  Plus,
  Undo2,
  Redo2,
  Download,
  Check,
  CloudOff,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  Grid2X2,
  Move3D,
  Box,
  X,
  FileText,
  Upload,
  Settings2,
  Volume2,
  Music2,
  Image as ImageIcon,
  AlertTriangle,
  Copy,
  Trash2,
  FolderOpen,
  RefreshCw,
  CircleHelp,
  BookOpen,
  Save,
  LockKeyhole,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { usePersistentDocument, downloadFile } from "@tre/persistence";
import {
  createSampleProject,
  parseProject,
  orderedShots,
  totalFrames,
  timecode,
  timeline,
  sceneForShot,
  publishScene,
  reviseShot,
  moveShot,
  affectedShots,
  clone,
  newId,
  lookAtQuaternion,
  RENDERER_VERSION,
  rightsWarnings,
  type Project,
  type Shot,
  type Camera as CameraType,
  type SceneObject,
  type Vector,
} from "@tre/scene-format";
import { SceneViewport } from "./SceneViewport";
import { ShotFrame as Frame } from "./ShotFrame";
import { SequencePreview } from "./SequencePreview";
import { PreviewAudio } from "../lib/preview-audio";
import { renderFrame } from "../lib/scene-renderer";
import {
  exportPackage,
  importPackage,
  importMedia,
  importGlb,
  verifyMedia,
} from "../lib/project-files";

type Tab = "scene" | "storyboard" | "story";
type Modal = "export" | "import" | "help" | "versions" | null;
const formatSeconds = (frames: number) =>
  `${(frames / 24).toLocaleString("da-DK", { maximumFractionDigits: 2 })} sek.`;
function TextField({
  label,
  value,
  onCommit,
  multiline = false,
  type = "text",
  min,
  max,
  step,
  help,
}: {
  label: string;
  value: string | number;
  onCommit: (v: string) => void;
  multiline?: boolean;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== String(value)) onCommit(draft);
          }}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== String(value)) onCommit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
      {help && <small>{help}</small>}
    </label>
  );
}
function IconButton({
  title,
  onClick,
  children,
  disabled = false,
  className = "",
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`icon-button ${className}`}
    >
      {children}
    </button>
  );
}
export default function DirectorEditor({
  documentKey = "production",
  onOpenProductions,
}: {
  documentKey?: string;
  onOpenProductions?: (project: Project | null) => void;
}) {
  const storage = usePersistentDocument<Project>(
    "director",
    documentKey,
    createSampleProject,
    parseProject,
  );
  const p = storage.data;
  const [tab, setTab] = useState<Tab>("scene"),
    [modal, setModal] = useState<Modal>(null),
    [mode, setMode] = useState<"3d" | "2d">("3d"),
    [grid, setGrid] = useState(false),
    [selectedShot, setSelectedShot] = useState("shot_01_v1"),
    [selectedObject, setSelectedObject] = useState<string | null>(null),
    [inspector, setInspector] = useState<"camera" | "object" | "shot">(
      "camera",
    ),
    [cameraId, setCameraId] = useState("cam_01"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [playing, setPlaying] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [previewGraph, setPreviewGraph] = useState<PreviewAudio | null>(null),
    [playhead, setPlayhead] = useState(0),
    [rights, setRights] = useState<"owned" | "licensed" | "unknown">("owned"),
    [mediaTarget, setMediaTarget] = useState<
      "shot" | "voice" | "music" | "model"
    >("shot"),
    [renderJob, setRenderJob] = useState<{
      id: string;
      state: string;
      phase: string;
      error?: string;
      metadata?: {
        duration: number;
        width: number;
        height: number;
        fps: number;
        sha256: string;
      };
    } | null>(null),
    [capability, setCapability] = useState<boolean | null>(null);
  const history = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    [historyTick, setHistoryTick] = useState(0);
  const initialCapture = useRef(false);
  const previewGraphRef = useRef<PreviewAudio | null>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    mediaRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const current = useRef(p);
  current.current = p;
  const shots = orderedShots(p),
    shot = shots.find((s) => s.id === selectedShot) ?? shots[0],
    cam = p.draft.cameras.find((c) => c.id === cameraId) ?? p.draft.cameras[0],
    object = p.draft.objects.find((o) => o.id === selectedObject);
  const frames = totalFrames(p),
    affected = affectedShots(p);
  const activeShot = reviewing
    ? timeline(p)
        .filter((s) => s.startFrame <= playhead)
        .at(-1)
    : undefined;
  const commit = useCallback(
    (update: (value: Project) => Project, message?: string) => {
      try {
        const next = parseProject(update(clone(current.current)));
        history.current.push(current.current);
        if (history.current.length > 25) history.current.shift();
        future.current = [];
        storage.setData(next);
        setHistoryTick((t) => t + 1);
        setError("");
        if (message) setNotice(message);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Ændringen kunne ikke gemmes",
        );
      }
    },
    [storage.setData],
  );
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      future.current.push(current.current);
      storage.setData(prev);
      setHistoryTick((t) => t + 1);
      setNotice("Ændringen er fortrudt");
    }
  }, [storage.setData]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      history.current.push(current.current);
      storage.setData(next);
      setHistoryTick((t) => t + 1);
    }
  }, [storage.setData]);
  const resumeAudio = useCallback(() => {
    try {
      const graph = previewGraphRef.current ?? new PreviewAudio();
      previewGraphRef.current = graph;
      setPreviewGraph(graph);
      void graph
        .resume()
        .catch(() =>
          setError("Tryk Afspil igen for at aktivere browserens lyd."),
        );
    } catch {
      setError(
        "Browserens lydpreview kunne ikke åbnes. MP4-eksport er stadig mulig.",
      );
    }
  }, []);
  const togglePlayback = useCallback(() => {
    resumeAudio();
    setReviewing(true);
    setPlaying((v) => !v);
    setPlayhead((f) => (f >= frames - 1 ? 0 : f));
    setTab("scene");
  }, [resumeAudio, frames]);
  useEffect(() => {
    if (!playing) void previewGraphRef.current?.suspend();
  }, [playing]);
  useEffect(
    () => () => {
      previewGraphRef.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (modal) setPlaying(false);
  }, [modal]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const input =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !input) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (
        !input &&
        !modal &&
        frames > 0 &&
        e.target instanceof HTMLElement &&
        !["BUTTON", "A"].includes(e.target.tagName)
      ) {
        if (e.code === "Space") {
          e.preventDefault();
          togglePlayback();
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          setPlaying(false);
          setReviewing(true);
          setPlayhead((f) =>
            Math.max(
              0,
              Math.min(
                frames - 1,
                f + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 24 : 1),
              ),
            ),
          );
          setTab("scene");
        }
      }
      if (e.key === "Escape") {
        setModal(null);
        setPlaying(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, modal, frames, togglePlayback]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    el?.querySelector<HTMLElement>("button,input")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const all = [
        ...el.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        ),
      ];
      const first = all[0],
        last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prev?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const id =
      localStorage.getItem(`director-last-render:${documentKey}`) ??
      (documentKey === "production"
        ? localStorage.getItem("director-last-render")
        : null);
    if (id && /^[a-f0-9-]{36}$/.test(id))
      fetch(`/api/exports/${id}`)
        .then((r) => {
          if (!r.ok) throw Error("Eksporten er ikke tilgængelig");
          return r.json();
        })
        .then(setRenderJob)
        .catch(() => {});
    fetch("/api/exports")
      .then((r) => r.json())
      .then((v) => setCapability(v.available === true))
      .catch(() => setCapability(false));
  }, []);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(),
      from = playhead;
    let raf = 0;
    const tick = () => {
      const frame =
        from + Math.floor(((performance.now() - start) / 1000) * 24);
      if (frame >= frames) {
        setPlayhead(Math.max(0, frames - 1));
        setPlaying(false);
        return;
      }
      setPlayhead(frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames]);
  useEffect(() => {
    if (
      !renderJob ||
      ["succeeded", "failed", "cancelled"].includes(renderJob.state)
    )
      return;
    const interval = setInterval(() => {
      fetch(`/api/exports/${renderJob.id}`)
        .then((r) => {
          if (!r.ok) throw Error("Status kunne ikke hentes");
          return r.json();
        })
        .then(setRenderJob)
        .catch(() => setError("Eksportstatus kunne ikke hentes. Prøv igen."));
    }, 1200);
    return () => clearInterval(interval);
  }, [renderJob?.id, renderJob?.state]);
  const selectShot = (s: Shot) => {
    setSelectedShot(s.id);
    setCameraId(s.cameraId);
    setPlaying(false);
    setReviewing(false);
    setPlayhead(timeline(p).find((t) => t.id === s.id)?.startFrame ?? 0);
  };
  const patchCamera = (patch: Partial<CameraType>) =>
    commit((next) => {
      next.draft.cameras = next.draft.cameras.map((c) => {
        if (c.id !== cam.id) return c;
        const updated = { ...c, ...patch };
        updated.quaternion = lookAtQuaternion(updated.position, updated.target);
        return updated;
      });
      next.revision++;
      return next;
    });
  const patchObject = (patch: Partial<SceneObject>) =>
    commit((next) => {
      next.draft.objects = next.draft.objects.map((o) =>
        o.id === selectedObject
          ? { ...o, ...patch, assetVersion: o.assetVersion + 1 }
          : o,
      );
      next.revision++;
      return next;
    });
  const patchShot = (patch: Partial<Shot>) => {
    if (!shot) return;
    commit((next) => {
      const revised = reviseShot(next, shot.id, patch);
      setSelectedShot(revised.sequence[next.sequence.indexOf(shot.id)]);
      return revised;
    });
  };
  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Handlingen kunne ikke gennemføres",
      );
    } finally {
      setBusy("");
    }
  };
  const openProductions = () =>
    act("Gemmer filmen før skift …", async () => {
      setPlaying(false);
      await storage.flush();
      onOpenProductions?.(current.current);
    });
  const capture = async (all = false, missingOnly = false) =>
    act(all ? "Tager kameraframes …" : "Tager kameraframe …", async () => {
      const base = current.current;
      const target = all
        ? orderedShots(base).filter(
            (s) => !s.mediaId && (!missingOnly || !s.frame),
          )
        : shot
          ? [shot]
          : [];
      if (!target.length) {
        setNotice(
          "Der er ingen kameraframes at opdatere. Egne medier er bevaret.",
        );
        return;
      }
      const snapshot = clone(base);
      let next = missingOnly ? snapshot : publishScene(snapshot);
      const selectedIndex = next.sequence.indexOf(shot?.id ?? "");
      for (const [index, s] of target.entries()) {
        if (all)
          setBusy(`Tager kameraframe ${index + 1} af ${target.length} …`);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const scene = missingOnly ? sceneForShot(next, s) : next.draft;
        const camera = all
          ? (scene.cameras.find((c) => c.id === s.cameraId) ?? cam)
          : cam;
        const captured = await renderFrame(scene, camera, mode);
        next = reviseShot(next, s.id, {
          sceneVersionId: scene.id,
          cameraId: camera.id,
          frame: captured.frame,
          frameMode: captured.mode,
          frameRenderer: RENDERER_VERSION,
          mediaId: null,
          sourceIn: 0,
          clipAudio: false,
        });
      }
      if (
        current.current !== base &&
        JSON.stringify(current.current) !== JSON.stringify(base)
      )
        throw Error("Scenen ændrede sig under frame-optagelsen. Prøv igen.");
      if (selectedIndex >= 0) setSelectedShot(next.sequence[selectedIndex]);
      commit(
        () => next,
        all
          ? "Kameraframes er gemt som nye shotversioner. Egne medier er bevaret."
          : "Kameraframe og sceneversion er gemt.",
      );
    });
  useEffect(() => {
    if (!storage.ready || initialCapture.current) return;
    initialCapture.current = true;
    if (orderedShots(p).some((s) => !s.mediaId && !s.frame))
      void capture(true, true);
  }, [storage.ready]);
  const addShot = () =>
    commit((next) => {
      const published = publishScene(next);
      const fresh: Shot = {
        id: newId("shot"),
        version: 1,
        name: `Ny indstilling ${next.sequence.length + 1}`,
        sceneVersionId: published.draft.id,
        cameraId: cam.id,
        durationFrames: 120,
        dialogue: "",
        notes: "",
        frame: null,
        frameRenderer: null,
        frameMode: "3d",
        clipAudio: false,
        mediaId: null,
        sourceIn: 0,
        transitionFrames: 0,
        tags: ["Ny indstilling"],
      };
      published.shots.push(fresh);
      published.sequence.push(fresh.id);
      setSelectedShot(fresh.id);
      setInspector("shot");
      return published;
    }, "Et nyt shot er klar. Tag et kameraframe, når kompositionen sidder.");
  const addObject = (kind: SceneObject["kind"]) =>
    commit((next) => {
      const id = newId("object");
      next.draft.objects.push({
        id,
        name:
          kind === "person"
            ? "Ny karakter"
            : kind === "crate"
              ? "Ny kasse"
              : "Ny lampe",
        kind,
        color: kind === "person" ? "#708d8b" : "#b6926c",
        transform: {
          position: [0, 0, 1.5],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        assetVersion: 1,
        assetId: null,
        source: "Director · egen procedurel primitive",
        rights: "owned",
      });
      next.revision++;
      setSelectedObject(id);
      setInspector("object");
      return next;
    });
  const importProject = async (file: File) =>
    act("Åbner projektpakke …", async () => {
      if (file.size > 100 * 1024 * 1024)
        throw Error("Projektet må højst være 100 MB");
      const next = file.name.toLowerCase().endsWith(".zip")
        ? await importPackage(await file.arrayBuffer())
        : parseProject(JSON.parse(await file.text()));
      if (file.size > 100 * 1024 * 1024) throw Error("Projektet er for stort");
      await verifyMedia(next);
      commit(
        () => next,
        "Projektet er åbnet. Din tidligere version kan gendannes med Fortryd.",
      );
      setSelectedShot(next.sequence[0] ?? "");
      setCameraId(next.draft.cameras[0].id);
      setModal(null);
    });
  const mediaImport = async (file: File) =>
    act("Kontrollerer mediefil …", async () => {
      if (mediaTarget === "model") {
        const asset = await importGlb(file, rights);
        commit(
          (next) => {
            next.draft.assets.push(asset);
            const id = newId("object");
            next.draft.objects.push({
              id,
              name: file.name.slice(0, 100),
              kind: "glb",
              color: "#ffffff",
              assetId: asset.id,
              assetVersion: 1,
              transform: {
                position: [0, 0, 1],
                quaternion: [0, 0, 0, 1],
                scale: [1, 1, 1],
              },
              source: "Egen lokal GLB-fil",
              rights,
            });
            next.revision++;
            setSelectedObject(id);
            setInspector("object");
            return next;
          },
          `${asset.name} er importeret · ${asset.triangles.toLocaleString("da-DK")} trekanter`,
        );
        setModal(null);
        return;
      }
      const target = mediaTarget;
      const media = await importMedia(file, rights);
      commit((next) => {
        next.media.push(media);
        if (target === "shot") {
          if (!shot || media.kind === "audio")
            throw Error("Vælg et billede eller videoklip til et shot");
          const updated = reviseShot(next, shot.id, {
            mediaId: media.id,
            durationFrames:
              media.kind === "video"
                ? Math.min(media.durationFrames ?? 288, 288)
                : shot.durationFrames,
            sourceIn: 0,
          });
          setSelectedShot(updated.sequence[next.sequence.indexOf(shot.id)]);
          return updated;
        }
        if (media.kind !== "audio")
          throw Error("Vælg en lydfil til dette spor");
        next[target] = {
          mediaId: media.id,
          volume: mediaTarget === "music" ? 0.3 : 1,
          startFrame: 0,
          sourceIn: 0,
          fadeFrames: 24,
          duck: mediaTarget === "music",
        };
        next.revision++;
        return next;
      }, "Mediet er valideret og gemt lokalt.");
      setModal(null);
    });
  const exportFile = (kind: "json" | "zip" | "pdf") =>
    act("Forbereder eksport …", async () => {
      let unsavedCopy = false;
      await storage.flush().catch(() => {
        unsavedCopy = true;
      });
      const project = current.current;
      let exportWarning = "";
      const slug = project.title
        .toLocaleLowerCase("da-DK")
        .replace(/[^a-zæøå0-9]+/g, "-");
      if (kind === "json")
        downloadFile(
          `${slug}-v${project.revision}.json`,
          JSON.stringify(project, null, 2),
          "application/json",
        );
      if (kind === "zip")
        downloadFile(
          `${slug}-v${project.revision}.zip`,
          (await exportPackage(project)) as Uint8Array<ArrayBuffer>,
          "application/zip",
        );
      if (kind === "pdf") {
        const { storyboardPdf } = await import("../lib/storyboard-pdf");
        downloadFile(
          `${slug}-storyboard-v${project.revision}.pdf`,
          (await storyboardPdf(project, {
            onProgress: (done, total) =>
              setBusy(`Forbereder storyboard ${done} af ${total} …`),
            onWarning: (message) => {
              exportWarning = message;
            },
          })) as Uint8Array<ArrayBuffer>,
          "application/pdf",
        );
      }
      setNotice(
        unsavedCopy
          ? "Lagring fejlede. Din aktuelle kladde er hentet som en lokal kopi."
          : exportWarning
            ? `Din PDF er hentet. ${exportWarning}`
            : "Din eksport er klar til download.",
      );
    });
  const exportMovie = () =>
    act("Låser manifest og starter lokal render …", async () => {
      await storage.flush();
      if (!shots.length) throw Error("Tilføj mindst ét shot");
      if (shots.some((s) => !s.frame && !s.mediaId))
        throw Error("Tag kameraframes til alle shots før eksport");
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: current.current }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error ?? "Eksporten kunne ikke startes");
      setRenderJob(data);
      localStorage.setItem(`director-last-render:${documentKey}`, data.id);
    });
  if (!storage.ready)
    return (
      <main className="loading-screen">
        <Clapperboard size={42} />
        <h1>Director</h1>
        {storage.error ? (
          <>
            <p role="alert">{storage.error}</p>
            <button className="button primary" onClick={() => storage.reload()}>
              Prøv at åbne igen
            </button>
            {onOpenProductions && (
              <button
                className="button secondary"
                onClick={() => onOpenProductions(null)}
              >
                Åbn produktionsbibliotek
              </button>
            )}
            <p>
              Aktivér lokal browserlagring, eller åbn appen i en almindelig
              browserfane.
            </p>
          </>
        ) : (
          <p>Åbner dit filmværksted …</p>
        )}
      </main>
    );
  return (
    <div className="director-app" data-history={historyTick}>
      <aside className="app-rail" aria-label="Værktøjer" inert={Boolean(modal)}>
        <a href="/" className="brand-mark" aria-label="Director start">
          <Clapperboard size={24} />
        </a>
        <div className="rail-group">
          <IconButton
            title="Scene"
            onClick={() => setTab("scene")}
            className={tab === "scene" ? "is-active" : ""}
          >
            <Box />
          </IconButton>
          <IconButton
            title="Storyboard"
            onClick={() => setTab("storyboard")}
            className={tab === "storyboard" ? "is-active" : ""}
          >
            <Film />
          </IconButton>
          <IconButton
            title="Historie"
            onClick={() => setTab("story")}
            className={tab === "story" ? "is-active" : ""}
          >
            <BookOpen />
          </IconButton>
        </div>
        <div className="rail-bottom">
          <IconButton
            title="Åbn projekt"
            onClick={() => fileRef.current?.click()}
          >
            <FolderOpen />
          </IconButton>
          <IconButton title="Hjælp og genveje" onClick={() => setModal("help")}>
            <CircleHelp />
          </IconButton>
          <div className="avatar" title="Lokalt filmværksted">
            S
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={Boolean(modal)}>
        <header className="app-header">
          <button
            className="wordmark"
            aria-label="Director · produktioner"
            onClick={openProductions}
            disabled={!!busy || !onOpenProductions}
          >
            DIRECTOR<span>FILMVÆRKSTED</span>
          </button>
          <span className="header-divider" />
          <div className="breadcrumb">
            <button
              onClick={openProductions}
              disabled={!!busy || !onOpenProductions}
            >
              Produktioner
            </button>{" "}
            <ChevronRight size={12} />
            <strong>{p.title}</strong>
          </div>
          <div className="header-actions">
            <span className={`save-status ${storage.saveState}`}>
              <span className="status-dot" />
              {storage.saveState === "saved"
                ? "Gemt lokalt"
                : storage.saveState === "saving"
                  ? "Gemmer …"
                  : storage.saveState === "conflict"
                    ? "Versionskonflikt"
                    : "Lokal demo"}
            </span>
            <span className="history-actions">
              <IconButton
                title="Fortryd (⌘/Ctrl Z)"
                onClick={undo}
                disabled={!history.current.length}
              >
                <Undo2 size={16} />
              </IconButton>
              <IconButton
                title="Gentag (⌘/Ctrl Shift Z)"
                onClick={redo}
                disabled={!future.current.length}
              >
                <Redo2 size={16} />
              </IconButton>
            </span>
            <button
              className="button primary"
              onClick={() => setModal("export")}
            >
              <Download size={15} />
              <span>Eksportér</span>
            </button>
          </div>
        </header>
        {(storage.error || (!modal && error)) && (
          <div role="alert" className="error-banner">
            <AlertTriangle size={16} />
            <span>{error || storage.error}</span>
            {(storage.saveState === "conflict" ||
              storage.saveState === "error") && (
              <>
                <button onClick={() => exportFile("json")}>
                  Gem lokal kopi
                </button>
                <button onClick={() => storage.reload()}>
                  Genindlæs gemt version
                </button>
              </>
            )}
            {!storage.error && (
              <button aria-label="Luk fejl" onClick={() => setError("")}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="production-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-square" />{" "}
              {p.id === "station_07" ? "SAMPLEPRODUKTION" : "DIN PRODUKTION"}{" "}
              <span className="muted">/</span>{" "}
              {p.id === "station_07" ? "SCIENCE FICTION" : "FILMVÆRKSTED"}
            </div>
            <h1>
              {p.title}
              <span className="project-badge">LOKAL DEMO</span>
            </h1>
          </div>
          <div className="production-meta">
            <span>
              <Film size={14} /> {shots.length} shots
            </span>
            <span>16:9</span>
            <span>24 fps</span>
            <span className="time-pill">{timecode(frames)}</span>
          </div>
        </div>
        <nav className="view-tabs" aria-label="Produktionsvisning">
          <button
            className={tab === "scene" ? "selected" : ""}
            onClick={() => setTab("scene")}
          >
            <Box size={15} /> Scene
          </button>
          <button
            className={tab === "storyboard" ? "selected" : ""}
            onClick={() => setTab("storyboard")}
          >
            <Grid2X2 size={15} /> Storyboard
          </button>
          <button
            className={tab === "story" ? "selected" : ""}
            onClick={() => setTab("story")}
          >
            <BookOpen size={15} /> Historie
          </button>
          <button
            className="mobile-help"
            title="Hjælp og genveje"
            aria-label="Hjælp og genveje"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={16} />
          </button>
          <div className="view-tabs-right">
            <CloudOff size={13} />
            <span>Dit arbejde bliver på denne browser</span>
          </div>
        </nav>
        {tab === "scene" ? (
          <div className="editor-workspace">
            <aside className="scene-panel">
              <div className="section-heading">
                <span>SCENE</span>
                <button
                  onClick={() => setModal("versions")}
                  title="Sceneversioner"
                >
                  <Layers3 size={14} />
                </button>
              </div>
              <button
                className="location-card"
                onClick={() => {
                  setSelectedObject(null);
                  setInspector("camera");
                }}
              >
                <div className="location-icon">
                  <MapPin size={18} />
                </div>
                <span>
                  <strong>Observationsdæk</strong>
                  <small>Station 07 · scene v{p.draft.version}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              <div className="section-heading cast-heading">
                <span>
                  CAST & OBJEKTER <em>{p.draft.objects.length}</em>
                </span>
                <button
                  title="Tilføj karakter"
                  aria-label="Tilføj karakter"
                  onClick={() => addObject("person")}
                >
                  <Plus size={15} />
                </button>
              </div>
              <div className="object-list">
                {p.draft.objects.map((o) => (
                  <button
                    key={o.id}
                    className={`object-row ${selectedObject === o.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedObject(o.id);
                      setInspector("object");
                    }}
                  >
                    <span className="object-symbol" style={{ color: o.color }}>
                      {o.kind === "person" ? (
                        <Users size={16} />
                      ) : o.kind === "lamp" ? (
                        <Volume2 size={15} />
                      ) : (
                        <Box size={16} />
                      )}
                    </span>
                    <span>
                      {o.name}
                      <small>
                        {o.kind === "person"
                          ? "Karakter"
                          : o.kind === "console"
                            ? "Rekvisit"
                            : o.kind === "lamp"
                              ? "Lys"
                              : "Objekt"}{" "}
                        · v{o.assetVersion}
                      </small>
                    </span>
                    {selectedObject === o.id && (
                      <span className="object-selected-dot" />
                    )}
                  </button>
                ))}
              </div>
              <div className="object-add">
                <button
                  onClick={() => {
                    setMediaTarget("model");
                    setModal("import");
                  }}
                >
                  <Upload size={13} /> GLB
                </button>
                <button onClick={() => addObject("crate")}>
                  <Plus size={13} /> Kasse
                </button>
                <button onClick={() => addObject("lamp")}>
                  <Plus size={13} /> Lampe
                </button>
              </div>
              <div className="scene-panel-bottom">
                <div className="section-heading">
                  <span>LYS & STEMNING</span>
                  <span className="sun-icon">◉</span>
                </div>
                <label className="compact-select">
                  Lysfarve
                  <select
                    value={p.draft.light.warmth}
                    onChange={(e) =>
                      commit((next) => {
                        next.draft.light.warmth = e.target.value as
                          "amber" | "blue";
                        next.revision++;
                        return next;
                      })
                    }
                  >
                    <option value="amber">Gylden time</option>
                    <option value="blue">Blå time</option>
                  </select>
                </label>
                <label className="range-field">
                  <span>
                    Intensitet <b>{p.draft.light.intensity.toFixed(1)}</b>
                  </span>
                  <input
                    aria-label="Lysintensitet"
                    type="range"
                    min=".2"
                    max="3"
                    step=".1"
                    value={p.draft.light.intensity}
                    onChange={(e) =>
                      commit((next) => {
                        next.draft.light.intensity = Number(e.target.value);
                        next.revision++;
                        return next;
                      })
                    }
                  />
                </label>
                <button
                  className="button subtle save-scene"
                  onClick={() =>
                    commit(
                      publishScene,
                      "Scenen er gemt som en ny, låst version.",
                    )
                  }
                >
                  <Save size={14} /> Gem sceneversion
                </button>
                <p className="panel-note">
                  <LockKeyhole size={12} /> Eksisterende shots bevarer deres
                  version.
                </p>
              </div>
            </aside>
            <section className="stage-panel" aria-label="Scene og kamera">
              <div className="stage-topline">
                <span>
                  <span className="live-dot" />{" "}
                  {reviewing
                    ? "SEKVENSREVIEW"
                    : mode === "3d"
                      ? "KAMERAVISNING"
                      : "2D-PLAN"}
                </span>
                <select
                  aria-label="Vælg kamera"
                  value={cam.id}
                  onChange={(e) => {
                    setCameraId(e.target.value);
                    setPlaying(false);
                    setReviewing(false);
                  }}
                >
                  {p.draft.cameras.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Kamera {String(i + 1).padStart(2, "0")} · {c.name}
                    </option>
                  ))}
                </select>
                <span className="stage-resolution">16:9</span>
              </div>
              <div className="viewport-wrap">
                {reviewing && activeShot ? (
                  <SequencePreview
                    project={p}
                    frame={playhead}
                    playing={playing}
                    onError={setError}
                    onToggle={togglePlayback}
                    graph={previewGraph}
                  />
                ) : (
                  <SceneViewport
                    scene={p.draft}
                    camera={cam}
                    selectedId={selectedObject}
                    grid={grid}
                    mode={mode}
                    onMode={setMode}
                    onCamera={(position, target) =>
                      patchCamera({ position, target })
                    }
                    onSelect={(id) => {
                      setSelectedObject(id);
                      setInspector("object");
                    }}
                  />
                )}
                <div className="frame-corner tl" />
                <div className="frame-corner tr" />
                <div className="frame-corner bl" />
                <div className="frame-corner br" />
                <div className="viewport-shot">
                  <span>
                    {String(
                      shots.length
                        ? Math.max(
                            0,
                            reviewing
                              ? shots.findIndex((s) => s.id === activeShot?.id)
                              : shots.indexOf(shot),
                          ) + 1
                        : 0,
                    ).padStart(2, "0")}{" "}
                    / {String(shots.length).padStart(2, "0")}
                  </span>
                  <small>{reviewing ? activeShot?.name : cam.name}</small>
                </div>
              </div>
              <div className="stage-toolbar">
                <div className="segmented">
                  <button
                    onClick={() => {
                      setMode("3d");
                      setReviewing(false);
                      setPlaying(false);
                    }}
                    className={!reviewing && mode === "3d" ? "selected" : ""}
                  >
                    <Box size={13} /> 3D
                  </button>
                  <button
                    onClick={() => {
                      setMode("2d");
                      setReviewing(false);
                      setPlaying(false);
                    }}
                    className={!reviewing && mode === "2d" ? "selected" : ""}
                  >
                    <Grid2X2 size={13} /> 2D-plan
                  </button>
                </div>
                <IconButton
                  title="Vis eller skjul gitter"
                  onClick={() => setGrid(!grid)}
                  className={grid ? "is-active" : ""}
                >
                  <Grid2X2 size={15} />
                </IconButton>
                <span className="viewport-help">
                  Træk for at dreje · scroll for zoom
                </span>
                <button
                  className="button capture-button"
                  disabled={!!busy || !shot}
                  onClick={() => {
                    if (reviewing) {
                      setPlaying(false);
                      setReviewing(false);
                    } else void capture();
                  }}
                >
                  <Camera size={15} />
                  <span>
                    {reviewing
                      ? "Tilbage til scene"
                      : shot?.mediaId
                        ? "Erstat med kameraframe"
                        : "Gem indstilling"}
                  </span>
                </button>
              </div>
              <div className="scene-tip">
                <span className="tip-marker">INSTRUKTØRENS NOTE</span>
                <p>{shot?.notes || "Byg scenen. Find dit første billede."}</p>
              </div>
              {affected.length > 0 && (
                <button
                  className="continuity-note"
                  onClick={() => setModal("versions")}
                >
                  <AlertTriangle size={13} />
                  {affected.length} shots bruger en tidligere scene. Se
                  kontinuitet <ArrowRight size={13} />
                </button>
              )}
            </section>
            <aside className="inspector-panel">
              <div className="inspector-tabs">
                <button
                  className={inspector === "camera" ? "selected" : ""}
                  onClick={() => setInspector("camera")}
                >
                  Kamera
                </button>
                <button
                  className={inspector === "object" ? "selected" : ""}
                  onClick={() => setInspector("object")}
                >
                  Objekt
                </button>
                <button
                  className={inspector === "shot" ? "selected" : ""}
                  onClick={() => setInspector("shot")}
                >
                  Shot
                </button>
              </div>
              {inspector === "camera" ? (
                <>
                  <div className="inspector-title">
                    <Camera size={17} />
                    <strong>
                      Kamera{" "}
                      {String(p.draft.cameras.indexOf(cam) + 1).padStart(
                        2,
                        "0",
                      )}
                    </strong>
                    <span>Perspektiv</span>
                  </div>
                  <TextField
                    label="Navn"
                    value={cam.name}
                    onCommit={(v) => patchCamera({ name: v })}
                  />
                  <div className="control-divider" />
                  <label className="range-field lens-field">
                    <span>
                      Udsnit <b>{cam.verticalFov}°</b>
                    </span>
                    <input
                      aria-label="Kameraets synsfelt"
                      type="range"
                      min="15"
                      max="90"
                      value={cam.verticalFov}
                      onChange={(e) =>
                        patchCamera({ verticalFov: Number(e.target.value) })
                      }
                    />
                    <small>
                      <span>Tele</span>
                      <span>Vidvinkel</span>
                    </small>
                  </label>
                  <div className="field-label">
                    POSITION <span>m</span>
                  </div>
                  <div className="vector-fields">
                    {(["X", "Y", "Z"] as const).map((axis, i) => (
                      <TextField
                        key={axis}
                        label={axis}
                        value={Number(cam.position[i].toFixed(2))}
                        type="number"
                        min={-100}
                        max={100}
                        step={0.1}
                        onCommit={(v) => {
                          const position = [...cam.position] as Vector;
                          position[i] = Number(v);
                          patchCamera({ position });
                        }}
                      />
                    ))}
                  </div>
                  <div className="field-label">
                    SE MOD <span>m</span>
                  </div>
                  <div className="vector-fields">
                    {["X", "Y", "Z"].map((axis, i) => (
                      <TextField
                        key={axis}
                        label={axis}
                        value={Number(cam.target[i].toFixed(2))}
                        type="number"
                        step={0.1}
                        onCommit={(v) => {
                          const target = [...cam.target] as Vector;
                          target[i] = Number(v);
                          patchCamera({ target });
                        }}
                      />
                    ))}
                  </div>
                  <div className="camera-presets">
                    <span className="field-label">HURTIGT UDSNIT</span>
                    <div>
                      <button onClick={() => patchCamera({ verticalFov: 48 })}>
                        Total
                      </button>
                      <button onClick={() => patchCamera({ verticalFov: 34 })}>
                        Halvnær
                      </button>
                      <button onClick={() => patchCamera({ verticalFov: 22 })}>
                        Nær
                      </button>
                    </div>
                  </div>
                  <p className="panel-note">
                    Gem indstilling låser kamera, scene og frame til det valgte
                    shot.
                  </p>
                  <button
                    className="button subtle full-width"
                    onClick={() =>
                      commit((next) => {
                        const c = {
                          ...clone(cam),
                          id: newId("cam"),
                          name: `Kamera ${next.draft.cameras.length + 1}`,
                        };
                        next.draft.cameras.push(c);
                        next.revision++;
                        setCameraId(c.id);
                        return next;
                      }, "Kameraet er kopieret.")
                    }
                  >
                    <Plus size={14} /> Nyt kamera fra denne vinkel
                  </button>
                </>
              ) : inspector === "object" ? (
                object ? (
                  <>
                    <div className="inspector-title">
                      <Users size={17} />
                      <strong>{object.name}</strong>
                    </div>
                    <TextField
                      label="Navn"
                      value={object.name}
                      onCommit={(name) => patchObject({ name })}
                    />
                    <label className="color-field">
                      <span>Farve</span>
                      <input
                        type="color"
                        aria-label="Objektfarve"
                        value={object.color}
                        onChange={(e) => patchObject({ color: e.target.value })}
                      />
                      <code>{object.color}</code>
                    </label>
                    <div className="field-label">
                      POSITION <span>m</span>
                    </div>
                    <div className="vector-fields">
                      {["X", "Y", "Z"].map((axis, i) => (
                        <TextField
                          key={axis}
                          label={axis}
                          value={object.transform.position[i]}
                          type="number"
                          step={0.1}
                          onCommit={(v) => {
                            const transform = clone(object.transform);
                            transform.position[i] = Number(v);
                            patchObject({ transform });
                          }}
                        />
                      ))}
                    </div>
                    <TextField
                      label="Drejning (grader)"
                      value={Math.round(
                        (Math.atan2(
                          object.transform.quaternion[1],
                          object.transform.quaternion[3],
                        ) *
                          360) /
                          Math.PI,
                      )}
                      type="number"
                      step={15}
                      onCommit={(v) => {
                        const angle = (Number(v) * Math.PI) / 360;
                        patchObject({
                          transform: {
                            ...object.transform,
                            quaternion: [
                              0,
                              Math.sin(angle),
                              0,
                              Math.cos(angle),
                            ],
                          },
                        });
                      }}
                    />
                    <TextField
                      label="Størrelse"
                      value={object.transform.scale[0]}
                      type="number"
                      min={0.05}
                      max={20}
                      step={0.1}
                      onCommit={(v) =>
                        patchObject({
                          transform: {
                            ...object.transform,
                            scale: [Number(v), Number(v), Number(v)],
                          },
                        })
                      }
                    />
                    <div className="asset-provenance">
                      {object.rights === "unknown" ? (
                        <AlertTriangle size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      <span>
                        {object.kind === "glb"
                          ? "Importeret GLB-model"
                          : "Egen primitive"}
                        <small>
                          {object.rights === "unknown"
                            ? "Rettigheder mangler · privat kladde"
                            : "Rettigheder registreret"}{" "}
                          · v{object.assetVersion}
                        </small>
                      </span>
                    </div>
                    <button
                      className="button danger-outline full-width"
                      onClick={() =>
                        commit((next) => {
                          next.draft.objects = next.draft.objects.filter(
                            (o) => o.id !== object.id,
                          );
                          next.draft.assets = next.draft.assets.filter(
                            (asset) =>
                              next.draft.objects.some(
                                (o) => o.assetId === asset.id,
                              ),
                          );
                          next.revision++;
                          setSelectedObject(null);
                          return next;
                        }, "Objektet er fjernet fra kladden. Tidligere sceneversioner bevarer det.")
                      }
                    >
                      <Trash2 size={14} /> Fjern fra scene
                    </button>
                  </>
                ) : (
                  <div className="empty-inspector">
                    <Move3D size={30} />
                    <h3>Vælg et objekt</h3>
                    <p>
                      Klik i castlisten eller dobbeltklik på et objekt i scenen.
                    </p>
                  </div>
                )
              ) : shot ? (
                <>
                  <div className="inspector-title">
                    <Film size={17} />
                    <strong>
                      Shot {String(shots.indexOf(shot) + 1).padStart(2, "0")}
                    </strong>
                    <span>v{shot.version}</span>
                  </div>
                  <TextField
                    label="Titel"
                    value={shot.name}
                    onCommit={(name) => patchShot({ name })}
                  />
                  <TextField
                    label="Varighed i sekunder"
                    value={shot.durationFrames / 24}
                    type="number"
                    min={1 / 24}
                    max={120}
                    step={0.5}
                    onCommit={(v) =>
                      patchShot({ durationFrames: Math.round(Number(v) * 24) })
                    }
                  />
                  <TextField
                    label="Replik / voiceover"
                    value={shot.dialogue}
                    multiline
                    onCommit={(dialogue) => patchShot({ dialogue })}
                  />
                  <TextField
                    label="Instruktørnote"
                    value={shot.notes}
                    multiline
                    onCommit={(notes) => patchShot({ notes })}
                  />
                  <label className="field">
                    <span>Overgang ind i shot</span>
                    <select
                      value={shot.transitionFrames}
                      disabled={shots.indexOf(shot) === 0}
                      onChange={(e) =>
                        patchShot({ transitionFrames: Number(e.target.value) })
                      }
                    >
                      <option value="0">Rent klip</option>
                      <option value="12">Crossfade · 0,5 sek.</option>
                      <option value="24">Crossfade · 1 sek.</option>
                    </select>
                  </label>
                  {shot.mediaId &&
                    p.media.find((m) => m.id === shot.mediaId)?.kind ===
                      "video" && (
                      <TextField
                        label="Klipstart i sekunder"
                        type="number"
                        min={0}
                        step={0.1}
                        value={shot.sourceIn / 24}
                        onCommit={(v) =>
                          patchShot({ sourceIn: Math.round(Number(v) * 24) })
                        }
                      />
                    )}
                  {shot.mediaId &&
                    p.media.find((m) => m.id === shot.mediaId)?.kind ===
                      "video" && (
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={shot.clipAudio}
                          onChange={(e) =>
                            patchShot({ clipAudio: e.target.checked })
                          }
                        />
                        Brug klippets lyd
                      </label>
                    )}
                  <button
                    className="button subtle full-width"
                    onClick={() => {
                      setMediaTarget("shot");
                      setModal("import");
                    }}
                  >
                    <Upload size={14} /> Importér billede eller klip
                  </button>
                  <div className="reorder-buttons">
                    <button
                      onClick={() =>
                        commit((next) => moveShot(next, shot.id, -1))
                      }
                      disabled={shots.indexOf(shot) === 0}
                    >
                      <ArrowLeft size={14} /> Tidligere
                    </button>
                    <button
                      onClick={() =>
                        commit((next) => moveShot(next, shot.id, 1))
                      }
                      disabled={shots.indexOf(shot) === shots.length - 1}
                    >
                      Senere <ArrowRight size={14} />
                    </button>
                  </div>
                  <button
                    className="button danger-outline full-width"
                    onClick={() =>
                      commit((next) => {
                        next.sequence = next.sequence.filter(
                          (id) => id !== shot.id,
                        );
                        next.revision++;
                        if (next.sequence[0]) {
                          const first = next.shots.find(
                            (s) => s.id === next.sequence[0],
                          )!;
                          if (first.transitionFrames)
                            next = reviseShot(next, first.id, {
                              transitionFrames: 0,
                            });
                        }
                        return next;
                      })
                    }
                  >
                    <Trash2 size={14} /> Fjern shot fra sekvens
                  </button>
                </>
              ) : (
                <p>Tilføj dit første shot.</p>
              )}
            </aside>
          </div>
        ) : tab === "storyboard" ? (
          <section className="storyboard-page">
            <div className="storyboard-heading">
              <div>
                <span className="eyebrow">
                  DIN FORTÆLLING, BILLEDE FOR BILLEDE
                </span>
                <h2>Fra stilhed til signal.</h2>
                <p>Fem øjeblikke. Én sammenhængende verden.</p>
              </div>
              <button
                className="button dark-button"
                onClick={() => exportFile("pdf")}
              >
                <Download size={15} /> Storyboard PDF
              </button>
            </div>
            <div className="storyboard-grid">
              {shots.map((s, i) => (
                <article className="storyboard-card" key={s.id}>
                  <button
                    className="storyboard-image"
                    onClick={() => {
                      selectShot(s);
                      setTab("scene");
                    }}
                  >
                    <Frame project={p} shot={s} />
                    <span>{String(i + 1).padStart(2, "0")}</span>
                  </button>
                  <div className="storyboard-card-body">
                    <div className="storyboard-card-meta">
                      <span>{s.tags[0] ?? "INDSTILLING"}</span>
                      <span>{formatSeconds(s.durationFrames)}</span>
                    </div>
                    <h3>{s.name}</h3>
                    <p className="dialogue">
                      “{s.dialogue || "Tilføj en replik"}”
                    </p>
                    <p className="director-note">{s.notes}</p>
                    <div className="storyboard-card-footer">
                      <span>
                        Scene v{sceneForShot(p, s).version} · shot v{s.version}
                      </span>
                      <div>
                        <IconButton
                          title={`Flyt shot ${i + 1} tidligere`}
                          onClick={() =>
                            commit((next) => moveShot(next, s.id, -1))
                          }
                          disabled={i === 0}
                        >
                          <ArrowLeft size={14} />
                        </IconButton>
                        <IconButton
                          title={`Flyt shot ${i + 1} senere`}
                          onClick={() =>
                            commit((next) => moveShot(next, s.id, 1))
                          }
                          disabled={i === shots.length - 1}
                        >
                          <ArrowRight size={14} />
                        </IconButton>
                        <IconButton
                          title={`Redigér shot ${i + 1}`}
                          onClick={() => {
                            selectShot(s);
                            setTab("scene");
                            setInspector("shot");
                          }}
                        >
                          <Settings2 size={14} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              <button
                className="storyboard-add"
                onClick={() => {
                  addShot();
                  setTab("scene");
                }}
              >
                <Plus size={26} />
                <strong>Et nyt øjeblik</strong>
                <span>Tilføj en indstilling til historien</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="story-page">
            <div className="story-intro">
              <span className="eyebrow">PRODUKTIONENS KOMPAS</span>
              <h2>Hvad skal publikum føle?</h2>
              <p>
                En god film begynder med en klar idé. Hold brief, replikker og
                billedsprog tæt på dit set.
              </p>
              <div className="story-facts">
                <span>01 location</span>
                <span>
                  {p.draft.objects.filter((o) => o.kind === "person").length}{" "}
                  karakterer
                </span>
                <span>{formatSeconds(frames)}</span>
              </div>
            </div>
            <div className="story-form">
              <TextField
                label="Produktionens titel"
                value={p.title}
                onCommit={(title) =>
                  commit((next) => ({
                    ...next,
                    title,
                    revision: next.revision + 1,
                  }))
                }
              />
              <TextField
                label="Brief og tone"
                value={p.brief}
                multiline
                onCommit={(brief) =>
                  commit((next) => ({
                    ...next,
                    brief,
                    revision: next.revision + 1,
                  }))
                }
              />
              <h3>Manuskript</h3>
              {shots.map((s, i) => (
                <div className="script-line" key={s.id}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{s.name}</strong>
                    <TextField
                      label={`Replik til shot ${i + 1}`}
                      value={s.dialogue}
                      multiline
                      onCommit={(dialogue) =>
                        commit((next) => reviseShot(next, s.id, { dialogue }))
                      }
                    />
                  </div>
                  <small>{formatSeconds(s.durationFrames)}</small>
                </div>
              ))}
            </div>
          </section>
        )}
        {tab === "scene" && (
          <section className="shots-section">
            <div className="shots-heading">
              <div>
                <h2>Shots</h2>
                <span>
                  {shots.length} indstillinger <span className="muted">·</span>{" "}
                  {formatSeconds(frames)}
                </span>
              </div>
              <div>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => capture(true)}
                >
                  <RefreshCw size={13} /> Opdatér alle frames
                </button>
                <button className="text-button" onClick={addShot}>
                  <Plus size={14} /> Tilføj shot
                </button>
              </div>
            </div>
            <div className="shot-strip">
              {shots.length === 0 && (
                <div className="empty-shots">
                  <Film size={24} />
                  <div>
                    <strong>Dit første shot begynder her.</strong>
                    <p>
                      Find en kameravinkel, tilføj et shot og gem indstillingen.
                    </p>
                  </div>
                </div>
              )}
              {shots.map((s, i) => (
                <button
                  key={s.id}
                  className={`shot-card ${shot?.id === s.id ? "selected" : ""}`}
                  onClick={() => selectShot(s)}
                  onDoubleClick={() => setInspector("shot")}
                >
                  <div className="shot-thumbnail">
                    <Frame project={p} shot={s} />
                    <span className="shot-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="shot-duration">
                      {formatSeconds(s.durationFrames)}
                    </span>
                    {affected.some((a) => a.id === s.id) && (
                      <span className="shot-stale" title="Scenen er ændret">
                        ●
                      </span>
                    )}
                  </div>
                  <div className="shot-card-label">
                    <strong>{s.name}</strong>
                    <span>{s.tags[0] ?? "Indstilling"}</span>
                  </div>
                </button>
              ))}
              <button className="add-shot-card" onClick={addShot}>
                <Plus size={22} />
                <span>Nyt shot</span>
              </button>
            </div>
          </section>
        )}
        <section className="timeline-section" aria-label="Tidslinje">
          <div className="timeline-top">
            <div className="transport">
              <IconButton
                title="Til begyndelsen"
                onClick={() => {
                  setPlayhead(0);
                  setPlaying(false);
                }}
              >
                <SkipBack size={15} />
              </IconButton>
              <button
                className="play-button"
                title={playing ? "Pause" : "Afspil sekvens"}
                aria-label={playing ? "Pause" : "Afspil sekvens"}
                onClick={() => {
                  togglePlayback();
                }}
                disabled={!shots.length}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <span>
                {timecode(playhead)} <em>/ {timecode(frames)}</em>
              </span>
            </div>
            <div className="timeline-label">
              <span>SEKVENS 01</span>
              <span>24 FPS</span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setMediaTarget("voice");
                setModal("import");
              }}
            >
              <Volume2 size={13} />
              <span>Tilføj lyd</span>
            </button>
          </div>
          <label className="timeline-scrubber">
            <span className="sr-only">Afspilningsposition</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, frames - 1)}
              step={1}
              value={playhead}
              disabled={!frames}
              aria-valuetext={timecode(playhead)}
              onChange={(e) => {
                setPlayhead(Number(e.target.value));
                setPlaying(false);
                setReviewing(true);
                setTab("scene");
              }}
            />
          </label>
          <div className="timeline-body">
            <div className="track-labels">
              <span>
                <Film size={13} /> Billede
              </span>
              <span>
                <Volume2 size={13} /> Voiceover
              </span>
              <span>
                <Music2 size={13} /> Musik
              </span>
            </div>
            <div className="tracks">
              <div className="time-ruler">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i}>
                    {timecode(Math.round((frames * i) / 6)).slice(0, 5)}
                  </span>
                ))}
              </div>
              <div className="video-track">
                {shots.map((s, i) => (
                  <button
                    key={s.id}
                    style={{ flex: s.durationFrames - s.transitionFrames }}
                    className={shot?.id === s.id ? "selected" : ""}
                    onClick={() => {
                      selectShot(s);
                      setInspector("shot");
                    }}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <strong>{s.name}</strong>
                    {s.transitionFrames > 0 && (
                      <i title={`Crossfade ${s.transitionFrames} frames`}>⋈</i>
                    )}
                  </button>
                ))}
              </div>
              {(["voice", "music"] as const).map((track) => (
                <div
                  className={`audio-track ${p[track] ? "has-audio" : ""}`}
                  key={track}
                >
                  {p[track] ? (
                    <>
                      <button
                        className="audio-name"
                        onClick={() => {
                          setMediaTarget(track);
                          setModal("import");
                        }}
                      >
                        {track === "voice" ? (
                          <Volume2 size={13} />
                        ) : (
                          <Music2 size={13} />
                        )}{" "}
                        {p.media.find((m) => m.id === p[track]?.mediaId)?.name}
                      </button>
                      <label>
                        <span>Niveau</span>
                        <input
                          aria-label={`${track === "voice" ? "Voiceover" : "Musik"} niveau`}
                          type="range"
                          min="0"
                          max="1"
                          step=".05"
                          value={p[track]!.volume}
                          onChange={(e) =>
                            commit((next) => {
                              next[track]!.volume = Number(e.target.value);
                              next.revision++;
                              return next;
                            })
                          }
                        />
                      </label>
                      <button
                        title={`Fjern ${track}`}
                        aria-label={`Fjern ${track}`}
                        onClick={() =>
                          commit((next) => ({
                            ...next,
                            [track]: null,
                            revision: next.revision + 1,
                          }))
                        }
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setMediaTarget(track);
                        setModal("import");
                      }}
                    >
                      <Plus size={11} />{" "}
                      {track === "voice"
                        ? "Importér din egen voiceover"
                        : "Tilføj et musikspor"}
                    </button>
                  )}
                </div>
              ))}
              <input
                className="scrub-range"
                aria-label="Sekvensens afspilningsposition"
                type="range"
                min="0"
                max={Math.max(1, frames - 1)}
                value={Math.min(playhead, Math.max(0, frames - 1))}
                onChange={(e) => {
                  setPlayhead(Number(e.target.value));
                  setPlaying(false);
                }}
              />
            </div>
          </div>
          <footer className="timeline-footer">
            <span>
              <LockKeyhole size={11} /> Versionslåste shots · lokal lagring
            </span>
            <span>
              {p.music?.duck ? "Musik duckes under voiceover · " : ""}Animatic =
              timede stillbilleder og egne klip
            </span>
          </footer>
        </section>
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".json,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importProject(f);
          e.target.value = "";
        }}
      />
      <input
        ref={mediaRef}
        hidden
        type="file"
        accept={
          mediaTarget === "model"
            ? ".glb"
            : mediaTarget === "shot"
              ? "image/png,image/jpeg,video/mp4,video/webm"
              : "audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm"
        }
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void mediaImport(f);
          e.target.value = "";
        }}
      />
      {(notice || busy) && (
        <div className={`toast ${busy ? "working" : ""}`} role="status">
          {busy ? (
            <RefreshCw size={15} className="spin" />
          ) : (
            <Check size={15} />
          )}
          <span>{busy || notice}</span>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            ref={modalRef}
            className={`modal ${modal === "versions" ? "wide-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  DIRECTOR /{" "}
                  {modal === "export"
                    ? "EKSPORT"
                    : modal === "import"
                      ? "MEDIER"
                      : modal === "versions"
                        ? "KONTINUITET"
                        : "KOM GODT I GANG"}
                </span>
                <h2 id="modal-title">
                  {modal === "export"
                    ? "Giv fortællingen liv."
                    : modal === "import"
                      ? "Dit materiale. Din film."
                      : modal === "versions"
                        ? "En scene. Flere versioner."
                        : "Fra scene til fortælling."}
                </h2>
              </div>
              <IconButton title="Luk dialog" onClick={() => setModal(null)}>
                <X size={20} />
              </IconButton>
            </div>
            {error && (
              <div className="modal-error" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
                <IconButton title="Luk importfejl" onClick={() => setError("")}>
                  <X size={14} />
                </IconButton>
              </div>
            )}
            {modal === "export" ? (
              <>
                <div className="export-preview">
                  <div>{shot && <Frame project={p} shot={shot} />}</div>
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {shots.length} shots · {formatSeconds(frames)} · 16:9
                    </small>
                    <small>
                      Revision {p.revision} · {p.scenes.length} sceneversioner
                    </small>
                  </span>
                </div>
                <div className="export-options">
                  <button disabled={!!busy} onClick={() => exportFile("pdf")}>
                    <FileText size={22} />
                    <span>
                      <strong>Storyboard</strong>
                      <small>
                        PDF med frames, replikker og versionsreferencer
                      </small>
                    </span>
                    <Download size={16} />
                  </button>
                  <button disabled={!!busy} onClick={() => exportFile("zip")}>
                    <FolderOpen size={22} />
                    <span>
                      <strong>Komplet projektpakke</strong>
                      <small>
                        ZIP med scener, tidslinje og indlejrede medier
                      </small>
                    </span>
                    <Download size={16} />
                  </button>
                  <button disabled={!!busy} onClick={() => exportFile("json")}>
                    <Layers3 size={22} />
                    <span>
                      <strong>Projekt-JSON</strong>
                      <small>
                        Flyt dit arbejde til en anden browser eller maskine
                      </small>
                    </span>
                    <Download size={16} />
                  </button>
                </div>
                <div className="movie-export">
                  <div>
                    <Film size={23} />
                    <span>
                      <strong>720p animatic</strong>
                      <small>MP4 · H.264 · AAC · 24 fps · lokal render</small>
                    </span>
                    <span className="export-format">1280 × 720</span>
                  </div>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={p.captions}
                      onChange={(e) =>
                        commit((next) => ({
                          ...next,
                          captions: e.target.checked,
                          revision: next.revision + 1,
                        }))
                      }
                    />{" "}
                    Vis replikker som undertekster
                  </label>
                  <p>
                    En timet sekvens af kameraframes, egne klip og lyd.
                    Kamerabevægelsen i 3D-visningen indgår ikke som kontinuerlig
                    animation.
                  </p>
                  {renderJob ? (
                    <div className={`render-status ${renderJob.state}`}>
                      <strong>
                        {renderJob.state === "succeeded"
                          ? "Din film er klar"
                          : renderJob.state === "cancelled"
                            ? "Eksporten er annulleret"
                            : renderJob.state === "failed"
                              ? "Eksporten blev ikke færdig"
                              : "Filmen bliver samlet …"}
                      </strong>
                      <span>{renderJob.error ?? renderJob.phase}</span>
                      {renderJob.state === "succeeded" && (
                        <>
                          <small>
                            Verificeret: {renderJob.metadata?.width} ×{" "}
                            {renderJob.metadata?.height} ·{" "}
                            {renderJob.metadata?.fps} fps ·{" "}
                            {renderJob.metadata?.duration.toFixed(3)} sek.
                          </small>
                          <a
                            className="button primary"
                            href={`/api/exports/${renderJob.id}?download=1`}
                            download
                          >
                            <Download size={15} /> Hent MP4
                          </a>
                          <button
                            className="text-button"
                            onClick={() => setRenderJob(null)}
                          >
                            Lav en ny eksport
                          </button>
                        </>
                      )}
                      {["failed", "cancelled"].includes(renderJob.state) && (
                        <button onClick={() => setRenderJob(null)}>
                          Prøv med et nyt manifest
                        </button>
                      )}
                      {!["succeeded", "failed", "cancelled"].includes(
                        renderJob.state,
                      ) && (
                        <button
                          className="text-button"
                          onClick={() =>
                            act("Stopper eksport …", async () => {
                              const response = await fetch(
                                `/api/exports/${renderJob.id}`,
                                { method: "DELETE" },
                              );
                              if (!response.ok)
                                throw Error("Eksporten kunne ikke stoppes");
                              setRenderJob(await response.json());
                            })
                          }
                        >
                          Annullér eksport
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="button primary full-width"
                      onClick={exportMovie}
                      disabled={!!busy || !capability || !shots.length}
                    >
                      <Film size={15} />
                      {capability
                        ? "Eksportér animatic"
                        : "Lokal render er ikke aktiveret"}
                    </button>
                  )}
                  {!capability && (
                    <p className="capability-note">
                      Storyboard og projektpakke virker i browseren. MP4 kræver
                      den lokale renderworker med FFmpeg; cloud-render er ikke
                      tilkoblet.
                    </p>
                  )}
                </div>
                {rightsWarnings(p).length > 0 && (
                  <p className="rights-warning">
                    <AlertTriangle size={14} /> Rettigheder mangler for:{" "}
                    {rightsWarnings(p).join(", ")}. Afklar dem før offentlig
                    deling.
                  </p>
                )}
                <p className="modal-footnote">
                  0 DKK i eksternt forbrug. Spilletid er ikke det samme som
                  rendertid.
                </p>
              </>
            ) : modal === "import" ? (
              <>
                <p className="modal-intro">
                  Importér{" "}
                  {mediaTarget === "model"
                    ? "en statisk GLB-model til scenen"
                    : mediaTarget === "shot"
                      ? "et billede eller et videoklip til dit valgte shot"
                      : mediaTarget === "voice"
                        ? "en optagelse af din egen voiceover"
                        : "musik til fortællingen"}
                  . Filen gemmes i denne browser og følger med din projektpakke.
                </p>
                <div className="import-types">
                  <button
                    className={mediaTarget === "shot" ? "selected" : ""}
                    onClick={() => setMediaTarget("shot")}
                  >
                    <ImageIcon size={19} /> Billede / klip
                  </button>
                  <button
                    className={mediaTarget === "voice" ? "selected" : ""}
                    onClick={() => setMediaTarget("voice")}
                  >
                    <Volume2 size={19} /> Voiceover
                  </button>
                  <button
                    className={mediaTarget === "music" ? "selected" : ""}
                    onClick={() => setMediaTarget("music")}
                  >
                    <Music2 size={19} /> Musik
                  </button>
                  <button
                    className={mediaTarget === "model" ? "selected" : ""}
                    onClick={() => setMediaTarget("model")}
                  >
                    <Box size={19} /> 3D-model
                  </button>
                </div>
                <label className="field">
                  <span>Rettigheder til materialet</span>
                  <select
                    value={rights}
                    onChange={(e) => setRights(e.target.value as typeof rights)}
                  >
                    <option value="owned">Jeg har selv skabt materialet</option>
                    <option value="licensed">
                      Jeg har tilladelse eller en gyldig licens
                    </option>
                    <option value="unknown">
                      Ikke afklaret endnu (kun privat kladde)
                    </option>
                  </select>
                </label>
                <button
                  className="import-dropzone"
                  onClick={() => mediaRef.current?.click()}
                  disabled={!!busy}
                >
                  <Upload size={28} />
                  <strong>Vælg en fil fra din computer</strong>
                  <span>
                    {mediaTarget === "model"
                      ? "GLB · 100.000 trekanter · 2K teksturer"
                      : mediaTarget === "shot"
                        ? "PNG, JPEG, MP4 eller WebM"
                        : "WAV, MP3, M4A, OGG eller WebM"}{" "}
                    · maks. 50 MB
                  </span>
                </button>
                {mediaTarget === "model" && (
                  <p className="modal-footnote">
                    Statiske modeller med indlejret geometri og
                    PNG/JPEG-teksturer op til 2048 × 2048 pixels. Eksterne
                    filer, animation og rigs afvises i denne profil. Importen
                    ændrer først scenen, når valideringen er bestået.
                  </p>
                )}
                {(mediaTarget === "voice" || mediaTarget === "music") &&
                  p[mediaTarget] && (
                    <div className="audio-timing-fields">
                      <TextField
                        label="Start på tidslinje (sek.)"
                        type="number"
                        min={0}
                        max={120}
                        step={1 / 24}
                        value={p[mediaTarget]!.startFrame / 24}
                        onCommit={(v) =>
                          commit((next) => {
                            next[mediaTarget]!.startFrame = Math.round(
                              Number(v) * 24,
                            );
                            next.revision++;
                            return next;
                          })
                        }
                      />
                      <TextField
                        label="Start i lydfil (sek.)"
                        type="number"
                        min={0}
                        max={3600}
                        step={1 / 24}
                        value={p[mediaTarget]!.sourceIn / 24}
                        onCommit={(v) =>
                          commit((next) => {
                            next[mediaTarget]!.sourceIn = Math.round(
                              Number(v) * 24,
                            );
                            next.revision++;
                            return next;
                          })
                        }
                      />
                      <TextField
                        label="Fade ind/ud (sek.)"
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={p[mediaTarget]!.fadeFrames / 24}
                        onCommit={(v) =>
                          commit((next) => {
                            next[mediaTarget]!.fadeFrames = Math.round(
                              Number(v) * 24,
                            );
                            next.revision++;
                            return next;
                          })
                        }
                      />
                    </div>
                  )}
                {mediaTarget === "music" && p.music && (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={p.music.duck}
                      onChange={(e) =>
                        commit((next) => {
                          next.music!.duck = e.target.checked;
                          next.revision++;
                          return next;
                        })
                      }
                    />{" "}
                    Sænk musikken automatisk under voiceover
                  </label>
                )}
                <div className="adapter-status">
                  <Volume2 size={19} />
                  <div>
                    <strong>AI-stemme · ikke tilkoblet</strong>
                    <p>
                      Upload din egen optagelse, eller fortsæt uden lyd. Der
                      genereres ingen stemme uden en aktiveret adapter.
                    </p>
                  </div>
                </div>
              </>
            ) : modal === "versions" ? (
              <>
                <p className="modal-intro">
                  Shots låser deres sceneversion. Ændringer i cast, farver eller
                  placering flytter derfor aldrig dit tidligere godkendte
                  billede.
                </p>
                <div className="version-summary">
                  <span>
                    <strong>v{p.draft.version}</strong> Arbejdsscene
                  </span>
                  <span>
                    <strong>{p.scenes.length}</strong> Gemte versioner
                  </span>
                  <span>
                    <strong>{affected.length}</strong> Berørte shots
                  </span>
                </div>
                <div className="version-list">
                  {shots.map((s, i) => (
                    <div key={s.id}>
                      <span className="version-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          Scene v{sceneForShot(p, s).version} · shot v
                          {s.version} · {s.cameraId}
                        </small>
                      </span>
                      <span
                        className={
                          affected.some((a) => a.id === s.id)
                            ? "version-affected"
                            : "version-current"
                        }
                      >
                        {affected.some((a) => a.id === s.id)
                          ? "Tidligere scene"
                          : "Matcher scenen"}
                      </span>
                      <button
                        className="button subtle"
                        onClick={() => {
                          selectShot(s);
                          setModal(null);
                          setTab("scene");
                        }}
                      >
                        Åbn
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="button primary full-width"
                  onClick={() => {
                    setModal(null);
                    void capture(true);
                  }}
                  disabled={!!busy}
                >
                  <RefreshCw size={15} /> Optag alle shots fra den aktuelle
                  scene
                </button>
                <p className="modal-footnote">
                  Der oprettes nye versioner. Dine tidligere scener og shots
                  bevares i projektpakken.
                </p>
              </>
            ) : (
              <>
                <div className="help-steps">
                  {[
                    [
                      "Byg dit set",
                      "Vælg en karakter i venstre panel. Flyt, drej og farv den i Objekt.",
                    ],
                    [
                      "Find dine billeder",
                      "Træk i 3D-visningen, eller brug Kamera. Gem indstilling låser dit frame til et shot.",
                    ],
                    [
                      "Saml fortællingen",
                      "Vælg Shot for replik, varighed og overgang. Flyt shots i storyboardet eller med Tidligere / Senere.",
                    ],
                    [
                      "Tag filmen med",
                      "Eksportér storyboard, komplet projektpakke eller MP4, når lokal render er aktiv.",
                    ],
                  ].map(([title, body], i) => (
                    <div key={title}>
                      <b>{String(i + 1).padStart(2, "0")}</b>
                      <span>
                        <strong>{title}</strong>
                        <p>{body}</p>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="help-shortcuts">
                  <span>
                    <kbd>⌘/Ctrl Z</kbd> Fortryd
                  </span>
                  <span>
                    <kbd>Esc</kbd> Luk dialog
                  </span>
                  <span>
                    <kbd>Tab</kbd> Flyt fokus
                  </span>
                </div>
                <p className="modal-footnote">
                  Lokal demo med syntetisk sampleproduktion. Ingen cloudlagring,
                  deling, betaling eller AI-generation er tilkoblet. Eksportér
                  en projektpakke som backup.
                </p>
                <button
                  className="button subtle full-width"
                  onClick={() => {
                    fileRef.current?.click();
                    setModal(null);
                  }}
                >
                  <FolderOpen size={15} /> Åbn en gemt projektpakke
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
