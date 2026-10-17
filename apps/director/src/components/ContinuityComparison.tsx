"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  sceneForShot,
  type Project,
  type SceneVersion,
  type Shot,
} from "@tre/scene-format";
import { continuityChanges } from "../lib/continuity";
import { renderFrame } from "../lib/scene-renderer";
import { ShotFrame } from "./ShotFrame";

type Preview = {
  scene: SceneVersion;
  cameraId: string;
  attempt: number;
  sceneVersion: number;
  mode: "3d" | "2d";
} & (
  | { state: "done"; result: Awaited<ReturnType<typeof renderFrame>> }
  | { state: "error"; error: string }
);
export function ContinuityComparison({
  project,
  shot,
  busy,
  blocked,
  onClose,
  onCapture,
}: {
  project: Project;
  shot: Shot;
  busy: boolean;
  blocked: boolean;
  onClose: () => void;
  onCapture: (
    ids: string[],
    reviewedScene?: SceneVersion,
    reviewedMode?: "3d" | "2d",
  ) => void;
}) {
  const [mode, setMode] = useState<"3d" | "2d">(
    shot.frameMode === "plan" ? "2d" : "3d",
  );
  const [attempt, setAttempt] = useState(0),
    [preview, setPreview] = useState<Preview | null>(null);
  const controllerRef = useRef<AbortController | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const scene = project.draft,
    camera = scene.cameras.find((item) => item.id === shot.cameraId),
    oldScene = sceneForShot(project, shot);
  const sceneVersion =
    Math.max(...project.scenes.map((version) => version.version)) + 1;
  const current =
    preview?.scene === scene &&
    preview.cameraId === shot.cameraId &&
    preview.attempt === attempt &&
    preview.sceneVersion === sceneVersion &&
    preview.mode === mode
      ? preview
      : null;
  const changes = continuityChanges(project, shot);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [shot.id]);
  useEffect(() => {
    if (!camera || shot.mediaId || blocked) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let mounted = true;
    const timeout = setTimeout(
      () =>
        controller.abort(
          Error(
            "Forhåndsvisningen overskred 20 sekunder. Prøv igen eller brug 2D-plan.",
          ),
        ),
      20000,
    );
    // A task boundary paints the loading state before creating the offscreen renderer.
    const start = setTimeout(() => {
      void renderFrame(
        { ...scene, version: sceneVersion },
        camera,
        mode,
        controller.signal,
      )
        .then((result) => {
          if (mounted)
            setPreview({
              scene,
              cameraId: camera.id,
              attempt,
              sceneVersion,
              mode,
              state: "done",
              result,
            });
        })
        .catch((error: unknown) => {
          if (mounted)
            setPreview({
              scene,
              cameraId: camera.id,
              attempt,
              sceneVersion,
              mode,
              state: "error",
              error:
                controller.signal.aborted &&
                controller.signal.reason?.name === "AbortError"
                  ? "Forhåndsvisningen er afbrudt. Dit låste shot er bevaret."
                  : error instanceof Error
                    ? error.message
                    : "Forhåndsvisningen kunne ikke tegnes.",
            });
        })
        .finally(() => {
          clearTimeout(timeout);
          if (controllerRef.current === controller)
            controllerRef.current = null;
        });
    }, 0);
    return () => {
      mounted = false;
      clearTimeout(start);
      clearTimeout(timeout);
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [scene, camera, shot.mediaId, attempt, mode, blocked, sceneVersion]);
  const loading = !!camera && !shot.mediaId && !current && !blocked;
  return (
    <section
      className="continuity-comparison"
      aria-label={`Visuel sammenligning af ${shot.name}`}
    >
      <header>
        <div>
          <span className="section-kicker">KONTINUITET FØR DU OPDATERER</span>
          <h3 ref={heading} tabIndex={-1}>
            {shot.name}
          </h3>
        </div>
        <button
          className="icon-button"
          aria-label="Luk sammenligning"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="continuity-frame-pair">
        <figure>
          <div className="continuity-frame">
            <ShotFrame project={project} shot={shot} />
          </div>
          <figcaption>
            <strong>Dit låste shot · v{shot.version}</strong>
            <span>
              Scene v{oldScene.version} ·{" "}
              {shot.frameMode === "plan" ? "2D-plan" : "kamerabillede"}
            </span>
          </figcaption>
        </figure>
        <figure>
          <div className="continuity-frame" aria-busy={loading}>
            {current?.state === "done" ? (
              <img
                src={current.result.frame}
                alt={`Arbejdsscenens ${current.result.mode === "plan" ? "2D-plan" : "kamerabillede"}: ${shot.name}`}
                draggable={false}
              />
            ) : (
              <div className="continuity-preview-status">
                {blocked ? (
                  <p>
                    Forhåndsvisningen afventer, at lagringsfejlen er håndteret.
                  </p>
                ) : !camera ? (
                  <p>
                    Kameraet mangler i arbejdsscenen. Dit låste billede er
                    bevaret.
                  </p>
                ) : current?.state === "error" ? (
                  <>
                    <p role="alert">{current.error}</p>
                    <button
                      className="button subtle"
                      onClick={() => setAttempt((value) => value + 1)}
                    >
                      Prøv forhåndsvisning igen
                    </button>
                  </>
                ) : (
                  <>
                    <RefreshCw size={22} />
                    <p role="status">Tegner arbejdsscenens billede …</p>
                    <button
                      className="button subtle"
                      onClick={() => controllerRef.current?.abort()}
                    >
                      Afbryd forhåndsvisning
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <figcaption>
            <strong>Arbejdsscenens kandidat</strong>
            <span>
              {current?.state === "done"
                ? current.result.mode === "plan"
                  ? "2D-plan · ikke gemt til shot"
                  : "Kamerabillede · ikke gemt til shot"
                : "Forhåndsvisning ændrer ikke filmen"}
            </span>
          </figcaption>
        </figure>
      </div>
      {current?.state === "done" &&
        (shot.frameMode === "plan") !== (current.result.mode === "plan") && (
          <p className="continuity-type-note">
            Billederne bruger forskellige visninger. Det låste frame bevares,
            mens kandidaten vises som{" "}
            {current.result.mode === "plan" ? "2D-plan" : "kamerabillede"}.
          </p>
        )}
      <div
        className="continuity-preview-options"
        role="group"
        aria-label="Kandidatens visning"
      >
        <button
          aria-pressed={mode === "3d"}
          onClick={() => setMode("3d")}
          disabled={!camera || busy}
        >
          Kamerabillede
        </button>
        <button
          aria-pressed={mode === "2d"}
          onClick={() => setMode("2d")}
          disabled={!camera || busy}
        >
          2D-plan
        </button>
        <span>Kun forhåndsvisning</span>
      </div>
      <div className="continuity-changes">
        <h4>
          {changes.length
            ? `${changes.length} ${changes.length === 1 ? "ændret del" : "ændrede dele"} af scenen`
            : "Scenen matcher denne indstilling"}
        </h4>
        {changes.length ? (
          <ul>
            {changes.map((change) => (
              <li key={change.id}>
                <strong>{change.title}</strong>
                <span>{change.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Objekter, set, lys og dette kamera er uændrede.</p>
        )}
      </div>
      <button
        className="button primary full-width"
        disabled={busy || blocked || !camera || current?.state !== "done"}
        onClick={() => {
          if (current?.state === "done")
            onCapture(
              [shot.id],
              current.scene,
              current.result.mode === "plan" ? "2d" : "3d",
            );
        }}
      >
        Brug arbejdsscenen til dette shot
      </button>
      <p className="modal-footnote">
        Gemmer en ny scene- og shotversion. De andre shots og alle tidligere
        versioner bevares. Du kan gendanne det tidligere shot under
        Shotversioner.
      </p>
    </section>
  );
}
