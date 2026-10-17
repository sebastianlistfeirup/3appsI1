import { describe, it, expect } from "vitest";
import { createSampleProject } from "./index";
import {
  previewLayers,
  previewAudio,
  audioInterval,
  duckGain,
} from "./playback";
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
  it("clips the visible audio range to the actual crossfaded film and keeps fades within it", () => {
    const p = createSampleProject();
    p.sequence = p.sequence.slice(0, 2);
    p.shots[0].durationFrames = 96;
    p.shots[1].durationFrames = 96;
    p.shots[1].transitionFrames = 24; // film ends at frame 168
    p.media.push({
      id: "voice",
      name: "Voice",
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
      volume: 1,
      startFrame: 144,
      sourceIn: 24,
      fadeFrames: 120,
      duck: false,
    };
    expect(audioInterval(p, "voice")).toMatchObject({
      startFrame: 144,
      endFrame: 168,
      durationFrames: 24,
      sourceEndFrame: 48,
      fadeFrames: 12,
    });
    expect(previewAudio(p, "voice", 143)?.active).toBe(false);
    expect(previewAudio(p, "voice", 150)?.gain).toBe(0.5);
    expect(previewAudio(p, "voice", 156)?.gain).toBe(1);
    expect(previewAudio(p, "voice", 168)?.active).toBe(false);
    p.voice.startFrame = 24;
    p.voice.sourceIn = 120;
    expect(audioInterval(p, "voice")).toMatchObject({
      startFrame: 24,
      endFrame: 48,
      durationFrames: 24,
      sourceEndFrame: 144,
      fadeFrames: 12,
    });
  });
  it("keeps an out-of-cut track available for editing while giving it no visible or audible duration", () => {
    const p = createSampleProject();
    p.media.push({
      id: "music",
      name: "Music",
      kind: "audio",
      mime: "audio/wav",
      dataUrl: "data:audio/wav;base64,AA==",
      bytes: 1,
      sha256: "0".repeat(64),
      durationFrames: 144,
      source: "fixture",
      rights: "owned",
    });
    p.music = {
      mediaId: "music",
      volume: 0.6,
      startFrame: 1440,
      sourceIn: 0,
      fadeFrames: 24,
      duck: true,
    };
    expect(audioInterval(p, "music")).toMatchObject({
      durationFrames: 0,
      fadeFrames: 0,
      endFrame: 1440,
    });
    expect(previewAudio(p, "music", 1440)?.active).toBe(false);
    p.sequence = [];
    expect(audioInterval(p, "music")?.durationFrames).toBe(0);
    expect(audioInterval(p, "voice")).toBeNull();
  });
  it("reduces music from actual voice energy only above threshold", () => {
    expect(duckGain(0)).toBe(1);
    expect(duckGain(0.04)).toBe(1);
    expect(duckGain(0.2)).toBeCloseTo(0.2615, 3);
    expect(duckGain(1)).toBeLessThan(0.1);
  });
});
