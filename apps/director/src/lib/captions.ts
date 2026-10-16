import { timeline, type Project } from "@tre/scene-format";

export type CaptionCue = {
  id: string;
  shotId: string;
  startFrame: number;
  endFrame: number;
  text: string;
};
export type CaptionTrack = {
  cues: CaptionCue[];
  warnings: { shotId: string; message: string }[];
  errors: string[];
};
const graphemes = new Intl.Segmenter("da", { granularity: "grapheme" });
const characters = (text: string) =>
  [...graphemes.segment(text)].map((part) => part.segment);

/** Wrap complete text without discarding words, punctuation or Unicode graphemes. */
export function captionLines(text: string, width = 42): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
    const parts = characters(word);
    if (line && characters(line).length + 1 + parts.length > width) {
      lines.push(line);
      line = "";
    }
    while (parts.length > width) {
      lines.push(parts.splice(0, width).join(""));
    }
    if (parts.length) line += (line ? " " : "") + parts.join("");
  }
  if (line) lines.push(line);
  return lines;
}

/** Captions hand over at the midpoint of a visual crossfade; all bounds are integer frames. */
export function buildCaptionTrack(project: Project): CaptionTrack {
  const shots = timeline(project),
    result: CaptionTrack = { cues: [], warnings: [], errors: [] };
  for (const [index, shot] of shots.entries()) {
    const lines = captionLines(shot.dialogue);
    if (!lines.length) continue;
    const start = shot.startFrame + Math.floor(shot.transitionFrames / 2),
      end =
        shot.endFrame -
        Math.ceil((shots[index + 1]?.transitionFrames ?? 0) / 2),
      frames = end - start;
    const texts: string[] = [];
    for (let at = 0; at < lines.length; at += 2)
      texts.push(lines.slice(at, at + 2).join("\n"));
    if (texts.length > frames) {
      result.errors.push(
        `“${shot.name}” har ${texts.length} tekstblokke, men kun ${frames} billedframes. Forlæng shottet eller slå indbrændte undertekster fra.`,
      );
      continue;
    }
    const weights = texts.map((text) => characters(text).length),
      total = weights.reduce((sum, weight) => sum + weight, 0);
    let offset = start,
      cumulative = 0,
      fast = 0;
    for (const [at, text] of texts.entries()) {
      cumulative += weights[at];
      const boundary = Math.min(
        end - (texts.length - at - 1),
        Math.max(offset + 1, start + Math.round((frames * cumulative) / total)),
      );
      if (
        boundary - offset < project.fps ||
        weights[at] / ((boundary - offset) / project.fps) > 20
      )
        fast++;
      result.cues.push({
        id: `${shot.id}_${at + 1}`,
        shotId: shot.id,
        startFrame: offset,
        endFrame: boundary,
        text,
      });
      offset = boundary;
    }
    if (fast)
      result.warnings.push({
        shotId: shot.id,
        message: `“${shot.name}”: ${fast} tekstblok${fast === 1 ? "" : "ke"} vises under ét sekund eller over 20 tegn/sek. Forlæng shottet for bedre læsbarhed.`,
      });
  }
  return result;
}
function timestamp(frame: number, fps: number, separator: string) {
  const ms = Math.round((frame / fps) * 1000),
    pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`;
}
function escapedText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export function captionFile(project: Project, format: "srt" | "vtt") {
  const track = buildCaptionTrack(project);
  if (track.errors.length) throw Error(track.errors.join(" "));
  const separator = format === "srt" ? "," : ".";
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    track.cues
      .map(
        (cue, index) =>
          `${format === "srt" ? index + 1 : cue.id}\n${timestamp(cue.startFrame, project.fps, separator)} --> ${timestamp(cue.endFrame, project.fps, separator)}\n${escapedText(cue.text)}\n`,
      )
      .join("\n")
  );
}
