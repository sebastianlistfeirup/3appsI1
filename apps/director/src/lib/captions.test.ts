import { describe, expect, it } from "vitest";
import { createSampleProject, reviseShot } from "@tre/scene-format";
import { buildCaptionTrack, captionFile, captionLines } from "./captions";

describe("Complete frame-based subtitle tracks", () => {
  it("retains the end of long multilingual dialogue and whole graphemes in two-line cues", () => {
    const project = createSampleProject();
    project.sequence = [project.sequence[0]];
    const text =
      "Ærlige ord Ελληνικά Привет e\u0301 og kaffe. ".repeat(20) +
      "Sidste udeladte sætning.";
    project.shots.find((shot) => shot.id === project.sequence[0])!.dialogue =
      text;
    const result = buildCaptionTrack(project);
    expect(result.errors).toEqual([]);
    expect(result.cues.length).toBeGreaterThan(3);
    expect(
      result.cues
        .map((cue) => cue.text)
        .join("")
        .replace(/\s/gu, ""),
    ).toBe(text.replace(/\s/gu, ""));
    expect(result.cues.at(-1)!.text).toContain("Sidste udeladte sætning.");
    expect(result.cues.every((cue) => cue.text.split("\n").length <= 2)).toBe(
      true,
    );
    expect(result.cues.at(-1)!.endFrame).toBe(288);
    expect(result.warnings).toHaveLength(1);
  });
  it("wraps long tokens without dropping characters or splitting a combining character", () => {
    const text = "e\u0301".repeat(90);
    const lines = captionLines(text);
    expect(lines).toHaveLength(3);
    expect(lines.join("")).toBe(text);
    expect(lines.every((line) => !line.startsWith("\u0301"))).toBe(true);
  });
  it("hands over at the same integer midpoint for odd and even crossfades", () => {
    for (const overlap of [5, 12]) {
      let project = createSampleProject();
      project.sequence = project.sequence.slice(0, 2);
      project = reviseShot(project, project.sequence[1], {
        transitionFrames: overlap,
      });
      const { cues } = buildCaptionTrack(project);
      const first = cues.filter((cue) => cue.shotId === project.sequence[0]),
        second = cues.filter((cue) => cue.shotId === project.sequence[1]);
      expect(first.at(-1)!.endFrame).toBe(second[0].startFrame);
      expect(second[0].startFrame).toBe(288 - Math.ceil(overlap / 2));
      expect(second.at(-1)!.endFrame).toBe(576 - overlap);
    }
  });
  it("rejects impossible complete captions instead of silently losing text", () => {
    let project = createSampleProject();
    project.sequence = [project.sequence[0]];
    project = reviseShot(project, project.sequence[0], {
      durationFrames: 1,
      dialogue: "Lange replikker skal bevares. ".repeat(20),
    });
    expect(buildCaptionTrack(project).errors[0]).toContain(
      "kun 1 billedframes",
    );
    expect(() => captionFile(project, "srt")).toThrow("Forlæng shottet");
  });
  it("escapes subtitle markup, preserves text and converts time within half a millisecond", () => {
    let project = createSampleProject();
    project.sequence = [project.sequence[0]];
    project = reviseShot(project, project.sequence[0], {
      durationFrames: 25,
      dialogue: "<b>Ærlig</b> & {tekst} \\n 100%",
    });
    const srt = captionFile(project, "srt"),
      vtt = captionFile(project, "vtt");
    expect(srt).toContain("00:00:00,000 --> 00:00:01,042");
    expect(srt).toContain("&lt;b&gt;Ærlig&lt;/b&gt; &amp; {tekst} \\n 100%");
    expect(vtt).toMatch(/^WEBVTT\n\n/);
    expect(vtt).toContain("00:00:01.042");
  });
  it("does not mutate a project or create captions for empty dialogue", () => {
    const project = createSampleProject(),
      before = JSON.stringify(project);
    buildCaptionTrack(project);
    expect(JSON.stringify(project)).toBe(before);
    for (const shot of project.shots) shot.dialogue = "  \n ";
    expect(buildCaptionTrack(project)).toEqual({
      cues: [],
      errors: [],
      warnings: [],
    });
  });
});
