"use client";
import { useRef, useState } from "react";
import { ContinuityComparison } from "./ContinuityComparison";
import {
  ArrowRight,
  Check,
  Film,
  Layers3,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  affectedShots,
  matchingSequenceVersion,
  orderedShots,
  sceneForShot,
  shotVersionHistory,
  timecode,
  totalFrames,
  type Project,
  type Shot,
  type SceneVersion,
} from "@tre/scene-format";
import { ShotFrame } from "./ShotFrame";

export function ContinuityPanel({
  project,
  busy,
  onCapture,
  onOpen,
  saveIssue,
  onCopy,
  onReload,
}: {
  project: Project;
  busy: boolean;
  saveIssue: string | null;
  onCopy: () => void;
  onReload: () => void;
  onCapture: (
    ids: string[],
    reviewedScene?: SceneVersion,
    reviewedMode?: "3d" | "2d",
  ) => void;
  onOpen: (shot: Shot) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null),
    previewTrigger = useRef<HTMLButtonElement | null>(null);
  const previewShot = project.shots.find(
    (shot) => shot.id === previewId && project.sequence.includes(shot.id),
  );
  const shots = orderedShots(project),
    affected = affectedShots(project),
    eligible = (shot: Shot) =>
      !shot.mediaId &&
      project.draft.cameras.some((camera) => camera.id === shot.cameraId),
    [selected, setSelected] = useState(() =>
      affected.filter(eligible).map((shot) => shot.id),
    ),
    chosen = selected.filter((id) =>
      shots.some((shot) => shot.id === id && eligible(shot)),
    );
  return (
    <>
      <p className="modal-intro">
        Hvert kamerashot beholder sit godkendte billede og sin sceneversion.
        Vælg de indstillinger, der skal følge arbejdsscenen. Egne billeder og
        klip følger deres mediekilde.
      </p>
      {saveIssue && (
        <div className="continuity-storage-note" role="alert">
          <strong>Din lokale scene er bevaret</strong>
          <p>{saveIssue}</p>
          <div>
            <button className="button subtle" onClick={onCopy} disabled={busy}>
              Gem lokal kopi
            </button>
            <button
              className="button subtle"
              onClick={onReload}
              disabled={busy}
            >
              Genindlæs gemt version
            </button>
          </div>
        </div>
      )}
      {previewShot && (
        <ContinuityComparison
          key={previewShot.id}
          project={project}
          shot={previewShot}
          busy={busy}
          blocked={!!saveIssue}
          onCapture={onCapture}
          onClose={() => {
            setPreviewId(null);
            previewTrigger.current?.focus();
          }}
        />
      )}
      <div className="version-summary">
        <span>
          <strong>v{project.draft.version}</strong>Arbejdsscene
        </span>
        <span>
          <strong>{project.scenes.length}</strong>Gemte scener
        </span>
        <span>
          <strong>{affected.length}</strong>Berørte kamerashots
        </span>
      </div>
      <div className="version-selection-actions">
        <button
          className="text-button"
          onClick={() =>
            setSelected(affected.filter(eligible).map((shot) => shot.id))
          }
        >
          Vælg berørte shots
        </button>
        <button className="text-button" onClick={() => setSelected([])}>
          Fravælg alle
        </button>
        <span>{chosen.length} valgt</span>
      </div>
      <div className="version-list continuity-list">
        {shots.map((shot, index) => (
          <div key={shot.id}>
            <label className="continuity-choice">
              <input
                type="checkbox"
                checked={chosen.includes(shot.id)}
                disabled={!eligible(shot) || busy || !!saveIssue}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, shot.id]
                      : ids.filter((id) => id !== shot.id),
                  )
                }
                aria-label={`Opdatér shot ${index + 1}: ${shot.name}`}
              />
              <span className="version-index">
                {String(index + 1).padStart(2, "0")}
              </span>
            </label>
            <span className="continuity-shot-info">
              <strong>{shot.name}</strong>
              <small>
                Scene v{sceneForShot(project, shot).version} · shot v
                {shot.version} · {shot.cameraId}
              </small>
              {!shot.mediaId && !eligible(shot) && (
                <small>Kameraet findes kun i den tidligere scene.</small>
              )}
            </span>
            <span
              className={
                affected.some((old) => old.id === shot.id)
                  ? "version-affected"
                  : "version-current"
              }
            >
              {shot.mediaId
                ? "Eget medie"
                : affected.some((old) => old.id === shot.id)
                  ? "Tidligere scene"
                  : "Matcher scenen"}
            </span>
            <div className="continuity-row-actions">
              {!shot.mediaId && (
                <button
                  className="button subtle"
                  aria-label={`Sammenlign shot ${index + 1}: ${shot.name}`}
                  aria-pressed={previewId === shot.id}
                  onClick={(event) => {
                    previewTrigger.current = event.currentTarget;
                    setPreviewId(shot.id);
                  }}
                >
                  Sammenlign
                </button>
              )}
              <button className="button subtle" onClick={() => onOpen(shot)}>
                Åbn
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="button primary full-width"
        onClick={() => onCapture(chosen)}
        disabled={!chosen.length || busy || !!saveIssue}
      >
        <RefreshCw size={15} />
        Opdatér {chosen.length} valgte kamerashots
      </button>
      <p className="modal-footnote">
        Nye shots låses til én ny sceneversion. Tidligere versioner, fravalgte
        indstillinger og egne medier bevares.
      </p>
    </>
  );
}

export function SequenceHistoryPanel({
  project,
  busy,
  onSave,
  onRestore,
}: {
  project: Project;
  busy: boolean;
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
}) {
  const [name, setName] = useState(""),
    current = matchingSequenceVersion(project);
  return (
    <>
      <p className="modal-intro">
        Gem en klipning, før du prøver en ny retning. En sekvensversion låser
        rækkefølge, shotversioner, trim, overgange, lydspor og undertekster.
      </p>
      <div className="sequence-save-panel">
        <div>
          <span className="section-kicker">DIN AKTUELLE KLIPNING</span>
          <strong>{timecode(totalFrames(project))}</strong>
          <p>
            {project.sequence.length} shots ·{" "}
            {current
              ? `matcher v${current.version} · ${current.name}`
              : "ændringer siden seneste gemte version"}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(name || `Klipning ${project.sequenceVersions.length + 1}`);
            setName("");
          }}
        >
          <label className="field">
            <span>Navn på sekvensversion</span>
            <input
              value={name}
              maxLength={100}
              placeholder={`Klipning ${project.sequenceVersions.length + 1}`}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={
              !project.sequence.length ||
              busy ||
              project.sequenceVersions.length >= 40
            }
          >
            <Save size={14} />
            Gem sekvensversion
          </button>
        </form>
      </div>
      {project.sequenceVersions.length === 0 ? (
        <div className="version-empty">
          <Layers3 size={25} />
          <h3>Prøv noget. Behold det gode.</h3>
          <p>Din første gemte klipning bliver her, mens du arbejder videre.</p>
        </div>
      ) : (
        <div className="sequence-versions">
          {[...project.sequenceVersions].reverse().map((version) => {
            const shots = version.sequence.map((id) =>
              project.shots.find((shot) => shot.id === id)!,
            );
            return (
              <article
                className={`sequence-version-card ${current?.id === version.id ? "is-current" : ""}`}
                key={version.id}
              >
                <div className="sequence-version-heading">
                  <span className="sequence-version-number">
                    v{version.version}
                  </span>
                  <div>
                    <h3>{version.name}</h3>
                    <p>
                      {new Date(version.createdAt).toLocaleString("da-DK", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      · {shots.length} shots ·{" "}
                      {timecode(
                        shots.reduce(
                          (frames, shot) =>
                            frames +
                            shot.durationFrames -
                            shot.transitionFrames,
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  {current?.id === version.id && (
                    <span className="sequence-current">
                      <Check size={12} />
                      Aktuel
                    </span>
                  )}
                </div>
                <details>
                  <summary>Shots, lyd og varighed</summary>
                  <ol>
                    {shots.map((shot) => (
                      <li key={shot.id}>
                        <span>
                          {shot.name}
                          <small>
                            Shot v{shot.version} · scene v
                            {sceneForShot(project, shot).version}
                          </small>
                        </span>
                        <span>
                          {timecode(shot.durationFrames)}
                          {shot.transitionFrames > 0 && (
                            <small>
                              Overlap {shot.transitionFrames} frames
                            </small>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p>
                    Voiceover:{" "}
                    {version.voice
                      ? project.media.find(
                          (m) => m.id === version.voice!.mediaId,
                        )?.name
                      : "ingen"}{" "}
                    · Musik:{" "}
                    {version.music
                      ? project.media.find(
                          (m) => m.id === version.music!.mediaId,
                        )?.name
                      : "ingen"}{" "}
                    · Undertekster: {version.captions ? "til" : "fra"}
                  </p>
                </details>
                <button
                  className="button subtle"
                  disabled={busy || current?.id === version.id}
                  onClick={() => onRestore(version.id)}
                >
                  Brug denne klipning
                  <ArrowRight size={13} />
                </button>
              </article>
            );
          })}
        </div>
      )}
      <p className="modal-footnote">
        Før gendannelse gemmes din nuværende klipning automatisk, hvis den ikke
        allerede findes i historikken. Dit arbejdssæt ændres ikke. Op til 40
        sekvensversioner pr. projekt.
      </p>
    </>
  );
}

export function ShotHistoryPanel({
  project,
  shot,
  busy,
  onRestore,
}: {
  project: Project;
  shot: Shot;
  busy: boolean;
  onRestore: (id: string) => void;
}) {
  const history = shotVersionHistory(project, shot.id),
    [selected, setSelected] = useState(history[1]?.id ?? shot.id),
    previous = history.find((version) => version.id === selected) ?? shot;
  const info = (version: Shot) => (
    <>
      <span className="history-frame-meta">
        Shot v{version.version} · scene v
        {sceneForShot(project, version).version}
      </span>
      <h3>{version.name}</h3>
      <p>
        {timecode(version.durationFrames)} ·{" "}
        {version.mediaId
          ? `Eget medie · kilde fra ${timecode(version.sourceIn)}`
          : version.cameraId}
      </p>
      <p>{version.dialogue || "Ingen replik"}</p>
      <p className="history-note">{version.notes || "Ingen note"}</p>
    </>
  );
  return (
    <>
      <p className="modal-intro">
        Sammenlign med det tidligere resultat. Brug af en ældre indstilling
        skaber en ny shotversion og bevarer hele rækken.
      </p>
      <label className="field">
        <span>Tidligere shotversion</span>
        <select
          value={previous.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {history.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.version} · {version.name}
              {version.id === shot.id ? " · aktuel" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="shot-history-compare">
        <article>
          <span className="history-comparison-label">AKTUEL INDSTILLING</span>
          <div className="history-frame">
            <ShotFrame project={project} shot={shot} />
          </div>
          {info(shot)}
        </article>
        <article>
          <span className="history-comparison-label">
            VALGT TIDLIGERE VERSION
          </span>
          <div className="history-frame">
            <ShotFrame project={project} shot={previous} />
          </div>
          {info(previous)}
        </article>
      </div>
      {history.length === 1 && (
        <p className="modal-footnote">
          Her vises versioner, som er gemt med versionskæden. Ældre projektfiler
          uden denne kæde beholder stadig alle deres shots i projektpakken.
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={busy || previous.id === shot.id}
        onClick={() => onRestore(previous.id)}
      >
        <Film size={15} />
        Brug v{previous.version} som en ny shotversion
      </button>
    </>
  );
}
