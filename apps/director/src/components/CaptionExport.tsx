"use client";
import { useMemo } from "react";
import { Download, Captions } from "lucide-react";
import type { Project } from "@tre/scene-format";
import { buildCaptionTrack } from "../lib/captions";

export function CaptionExport({
  project,
  busy,
  onExport,
}: {
  project: Project;
  busy: boolean;
  onExport: (format: "srt" | "vtt") => void;
}) {
  const track = useMemo(() => buildCaptionTrack(project), [project]);
  return (
    <details className="caption-export">
      <summary>
        <Captions size={18} />
        <span>
          Undertekster{" "}
          <small>
            {track.cues.length} tekstblokke ·{" "}
            {track.errors.length
              ? "Tilpas varighed"
              : track.warnings.length
                ? `${track.warnings.length} læseadvarsel${track.warnings.length === 1 ? "" : "er"}`
                : "SRT / VTT"}
          </small>
        </span>
      </summary>
      <div>
        <p>
          Hele replikken fordeles i højst to linjer ad gangen. Teksten skifter
          midt i et crossfade og følger den samme timing i preview og MP4. Tiden
          fordeles efter tekstlængde; tilpas shotvarigheden til talens rytme.
        </p>
        {track.errors.map((error) => (
          <p className="caption-warning" key={error}>
            {error}
          </p>
        ))}
        {track.warnings.map((warning) => (
          <p className="caption-warning" key={warning.shotId}>
            {warning.message}
          </p>
        ))}
        {!track.cues.length && !track.errors.length && (
          <p>Skriv en replik på et shot for at lave undertekster.</p>
        )}
        <div className="caption-downloads">
          <button
            className="button secondary"
            disabled={
              busy || !track.cues.length || Boolean(track.errors.length)
            }
            onClick={() => onExport("srt")}
          >
            <Download size={14} />
            Hent SRT
          </button>
          <button
            className="button secondary"
            disabled={
              busy || !track.cues.length || Boolean(track.errors.length)
            }
            onClick={() => onExport("vtt")}
          >
            <Download size={14} />
            Hent VTT
          </button>
        </div>
        <small>
          UTF-8 tekstfiler fra den aktuelle klipning. Kan bruges som valgbare
          undertekster i din videoplayer.
        </small>
      </div>
    </details>
  );
}
