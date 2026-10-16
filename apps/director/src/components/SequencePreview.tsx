"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  previewLayers,
  previewAudio,
  type Project,
  type Media,
} from "@tre/scene-format";
import { PreviewAudio } from "../lib/preview-audio";
import { buildCaptionTrack } from "../lib/captions";

function ClockedMedia({
  media,
  sourceFrame,
  playing,
  active,
  gain,
  graph,
  channel,
  kind,
  onError,
}: {
  media: Media;
  sourceFrame: number;
  playing: boolean;
  active: boolean;
  gain: number;
  graph: PreviewAudio | null;
  channel: string;
  kind: "voice" | "music" | "clip";
  onError: (s: string) => void;
}) {
  const ref = useRef<HTMLMediaElement | null>(null),
    rejected = useRef(false),
    [loaded, setLoaded] = useState(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    const el = ref.current;
    if (!el || !graph) return;
    return graph.register(channel, el, kind);
  }, [graph, channel, kind]);
  useEffect(() => {
    rejected.current = false;
  }, [playing]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    graph?.gain(channel, active ? gain : 0);
    if (!active) {
      el.pause();
      return;
    }
    const time = sourceFrame / 24;
    if (loaded && Math.abs(el.currentTime - time) > (playing ? 0.16 : 0.005)) {
      try {
        el.currentTime = time;
      } catch {}
    }
    if (!graph) {
      el.pause();
      return;
    }
    if (playing) {
      if (el.paused && !rejected.current)
        void el.play().catch(() => {
          rejected.current = true;
          errorRef.current(
            "Browseren kunne ikke afspille mediet. Prøv afspilning igen, eller se MP4-eksporten.",
          );
        });
    } else el.pause();
  }, [sourceFrame, playing, active, gain, graph, channel, loaded]);
  useEffect(() => () => ref.current?.pause(), []);
  const props = {
    ref: (el: HTMLMediaElement | null) => {
      ref.current = el;
    },
    src: media.dataUrl,
    preload: "auto",
    onLoadedMetadata: () => setLoaded(true),
    onError: () =>
      errorRef.current(
        `Browseren kan ikke afspille ${media.name}. Projektet er bevaret.`,
      ),
    "data-preview-channel": channel,
  };
  return kind === "clip" ? (
    <video
      {...props}
      playsInline
      muted={!graph || gain === 0}
      aria-label={`Klip: ${media.name}`}
    />
  ) : (
    <audio {...props} />
  );
}

export function SequencePreview({
  project,
  frame,
  playing,
  onError,
  onToggle,
  graph,
}: {
  project: Project;
  frame: number;
  playing: boolean;
  onError: (s: string) => void;
  onToggle: () => void;
  graph: PreviewAudio | null;
}) {
  const [level, setLevel] = useState(0);
  const captions = useMemo(() => buildCaptionTrack(project), [project]);
  const caption = project.captions
    ? captions.cues.find(
        (cue) => frame >= cue.startFrame && frame < cue.endFrame,
      )
    : undefined;
  useEffect(() => {
    if (!graph) return;
    let id = 0,
      last = 0;
    const sample = (time: number) => {
      if (time - last > 40) {
        last = time;
        setLevel(playing ? graph.sample(Boolean(project.music?.duck)) : 0);
      }
      id = requestAnimationFrame(sample);
    };
    id = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(id);
  }, [graph, playing, project.music?.duck]);
  const layers = previewLayers(project, frame);
  return (
    <div className="playback-frame" data-review-frame={frame}>
      {layers.map((layer) => {
        const media = project.media.find((m) => m.id === layer.mediaId);
        return (
          <div
            className="review-layer"
            key={layer.id}
            style={{ opacity: layer.opacity }}
            data-shot-id={layer.id}
          >
            {media?.kind === "video" ? (
              <ClockedMedia
                media={media}
                sourceFrame={layer.sourceFrame}
                playing={playing}
                active
                graph={graph}
                gain={layer.clipAudio ? layer.audioGain : 0}
                channel={layer.id}
                kind="clip"
                onError={onError}
              />
            ) : media?.kind === "image" || layer.frame ? (
              <img
                src={media?.kind === "image" ? media.dataUrl : layer.frame!}
                alt={`Shot: ${layer.name}`}
              />
            ) : (
              <div className="frame-placeholder">
                Intet kameraframe · {layer.name}
              </div>
            )}
          </div>
        );
      })}
      {(["voice", "music"] as const).map((key) => {
        const audio = previewAudio(project, key, frame);
        return audio ? (
          <ClockedMedia
            key={audio.media.id}
            media={audio.media}
            sourceFrame={audio.sourceFrame}
            active={audio.active}
            playing={playing}
            gain={audio.gain}
            graph={graph}
            channel={key}
            kind={key}
            onError={onError}
          />
        ) : null;
      })}
      {caption && (
        <div className="playback-caption" data-caption-id={caption.id}>
          {caption.text}
        </div>
      )}
      <span className="preview-label">
        {playing ? "AFSPILNING" : "PAUSE"} ·{" "}
        {layers.length > 1 ? "CROSSFADE · " : ""}24 FPS
      </span>
      <button
        className="review-toggle"
        onClick={onToggle}
        aria-label={playing ? "Pause preview" : "Afspil preview"}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <meter
        className="preview-meter"
        aria-label="Lydniveau"
        min={0}
        max={0.5}
        value={level}
        data-audio-context={graph?.context.state ?? "unavailable"}
        data-duck-gain={graph?.duckLevel() ?? 1}
      />
    </div>
  );
}
