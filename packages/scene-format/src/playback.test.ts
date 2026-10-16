import { describe, it, expect } from "vitest";
import { createSampleProject } from "./index";
import { previewLayers, previewAudio, duckGain } from "./playback";
describe("Frame based browser review", () => {
  it("shows both immutable shots during overlap with continuous incoming opacity", () => {
    const p = createSampleProject();
    p.shots[1].transitionFrames = 12;
    expect(previewLayers(p, 275).map((s) => s.id)).toEqual([p.sequence[0]]);
    const start = previewLayers(p, 276);
    expect(start.map((s) => s.id)).toEqual(p.sequence.slice(0, 2));
    expect(start[1].opacity).toBe(0);
    const middle = previewLayers(p, 282);
    expect(middle[1].opacity).toBe(0.5);
    expect(middle[0].audioGain).toBe(0.5);
    expect(previewLayers(p, 288).map((s) => s.id)).toEqual([p.sequence[1]]);
  });
  it("seeks own video at source trim plus sequence position", () => {
    const p = createSampleProject();
    p.shots[1].sourceIn = 48;
    expect(previewLayers(p, 300)[0].sourceFrame).toBe(60);
  });
  it("aligns trimmed audio, gain and symmetric fades to integer timeline frames", () => {
    const p = createSampleProject();
    p.media.push({
      id: "voice",
      name: "Egen lyd",
      kind: "audio",
      mime: "audio/wav",
      dataUrl: "data:audio/wav;base64,AA==",
      bytes: 1,
      sha256: "0".repeat(64),
      durationFrames: 144,
      source: "fixture",
      rights: "owned",
    });
    p.voice = {
      mediaId: "voice",
      volume: 0.8,
      startFrame: 24,
      sourceIn: 24,
      fadeFrames: 24,
      duck: false,
    };
    expect(previewAudio(p, "voice", 23)?.active).toBe(false);
    expect(previewAudio(p, "voice", 24)?.gain).toBe(0);
    expect(previewAudio(p, "voice", 36)?.gain).toBe(0.4);
    expect(previewAudio(p, "voice", 48)?.sourceFrame).toBe(48);
    expect(previewAudio(p, "voice", 132)?.gain).toBe(0.4);
    expect(previewAudio(p, "voice", 144)?.active).toBe(false);
  });
  it("reduces music from actual voice energy only above threshold", () => {
    expect(duckGain(0)).toBe(1);
    expect(duckGain(0.04)).toBe(1);
    expect(duckGain(0.2)).toBeCloseTo(0.2615, 3);
    expect(duckGain(1)).toBeLessThan(0.1);
  });
});
