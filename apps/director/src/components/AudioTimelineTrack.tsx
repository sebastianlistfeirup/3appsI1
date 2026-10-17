"use client";
import { Music2, Plus, Volume2, X } from "lucide-react";
import {
  audioInterval,
  timecode,
  totalFrames,
  type Project,
} from "@tre/scene-format";

export function AudioTimelineTrack({
  project,
  kind,
  onOpen,
  onVolume,
  onRemove,
}: {
  project: Project;
  kind: "voice" | "music";
  onOpen: () => void;
  onVolume: (volume: number) => void;
  onRemove: () => void;
}) {
  const interval = audioInterval(project, kind),
    filmFrames = totalFrames(project),
    name = kind === "voice" ? "Voiceover" : "Musik";
  if (!interval)
    return (
      <div className="audio-track audio-timed-track">
        <button onClick={onOpen}>
          <Plus size={13} />
          {kind === "voice"
            ? "Importér din egen voiceover"
            : "Tilføj et musikspor"}
        </button>
      </div>
    );
  const { track, media, startFrame, endFrame, durationFrames, fadeFrames } =
    interval;
  const range = durationFrames
    ? `${timecode(startFrame)} – ${timecode(endFrame)}`
    : "Ligger efter filmens slutning";
  const description = durationFrames
    ? `${name}: ${range}. Kilde fra ${timecode(track.sourceIn)}. Fade ${fadeFrames / 24} sekunder. ${track.volume === 0 ? "Lydløs: niveau er 0." : ""}`
    : `${name}: starter ${timecode(startFrame)}, efter filmens slutning ${timecode(filmFrames)}. Sporet høres ikke i denne klipning.`;
  return (
    <div
      className={`audio-track audio-timed-track has-audio ${durationFrames ? "" : "outside-film"}`}
    >
      <div className="audio-track-controls">
        <button
          className="audio-name"
          onClick={onOpen}
          title={`${media.name} · ${description}`}
        >
          {kind === "voice" ? <Volume2 size={14} /> : <Music2 size={14} />}
          <span>
            <strong>{media.name}</strong>
            <small>
              {range}
              {track.volume === 0 ? " · lydløs" : ""}
            </small>
          </span>
        </button>
        <label>
          <span>Niveau</span>
          <input
            aria-label={`${name} niveau`}
            type="range"
            min="0"
            max="1"
            step=".05"
            value={track.volume}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
        </label>
        <button
          aria-label={`Fjern ${kind}`}
          title={`Fjern ${name.toLowerCase()}`}
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>
      <div
        className="audio-placement"
        role="img"
        aria-label={description}
        data-audio-kind={kind}
      >
        {durationFrames > 0 && (
          <span
            className="audio-interval"
            style={{
              left: `${(100 * startFrame) / filmFrames}%`,
              width: `${(100 * durationFrames) / filmFrames}%`,
            }}
          >
            <svg
              viewBox={`0 0 ${durationFrames} 14`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={`M 0 13 L ${fadeFrames} 2 L ${durationFrames - fadeFrames} 2 L ${durationFrames} 13`}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
