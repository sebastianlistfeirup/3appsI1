import type { Project } from "./index";
import { timeline, totalFrames } from "./index";
export function previewLayers(project: Project, frame: number) {
  const shots = timeline(project);
  return shots
    .filter((s) => frame >= s.startFrame && frame < s.endFrame)
    .map((shot) => {
      const next = shots[shots.indexOf(shot) + 1];
      const localFrame = frame - shot.startFrame;
      const incoming = shot.transitionFrames
        ? Math.min(1, localFrame / shot.transitionFrames)
        : 1;
      const outgoing = next?.transitionFrames
        ? Math.min(1, (shot.endFrame - frame) / next.transitionFrames)
        : 1;
      return {
        ...shot,
        sourceFrame: shot.sourceIn + localFrame,
        opacity: incoming,
        audioGain: Math.min(incoming, outgoing),
      };
    });
}
export function previewAudio(
  project: Project,
  key: "voice" | "music",
  frame: number,
) {
  const track = project[key];
  if (!track) return null;
  const media = project.media.find((m) => m.id === track.mediaId);
  if (!media) return null;
  const available = Math.max(
    0,
    Math.min(
      totalFrames(project) - track.startFrame,
      (media.durationFrames ?? totalFrames(project)) - track.sourceIn,
    ),
  );
  const elapsed = frame - track.startFrame,
    fade = Math.min(track.fadeFrames, available / 2);
  return {
    media,
    track,
    active: elapsed >= 0 && elapsed < available,
    sourceFrame: track.sourceIn + Math.max(0, elapsed),
    gain:
      elapsed < 0 || elapsed >= available
        ? 0
        : track.volume *
          (fade
            ? Math.min(1, elapsed / fade, (available - elapsed) / fade)
            : 1),
  };
}
/** Threshold/ratio match the export profile; smoothing is applied by Web Audio. */
export function duckGain(rms: number) {
  return rms <= 0.04
    ? 1
    : Math.min(1, (0.04 * Math.pow(rms / 0.04, 1 / 6)) / rms);
}
