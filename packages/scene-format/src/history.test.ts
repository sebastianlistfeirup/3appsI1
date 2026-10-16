import { describe, it, expect } from "vitest";
import {
  createSampleProject,
  parseProject,
  reviseShot,
  saveSequenceVersion,
  restoreSequenceVersion,
  matchingSequenceVersion,
  shotVersionHistory,
  restoreShotVersion,
  duplicateShot,
  affectedShots,
  totalFrames,
  moveShot,
  removeShot,
} from "./index";

describe("Immutable shot lineage and complete saved cuts", () => {
  it("repairs impossible crossfades after reorder/removal with new versions while a saved cut remains intact", () => {
    let p = createSampleProject();
    p.sequence = p.sequence.slice(0, 3);
    p.shots[0].durationFrames = 12;
    p.shots[1].durationFrames = 48;
    p.shots[1].transitionFrames = 6;
    p.shots[2].durationFrames = 48;
    p.shots[2].transitionFrames = 24;
    p = saveSequenceVersion(parseProject(p), "Original med tre shots");
    const before = structuredClone(p),
      last = p.shots[2],
      removed = removeShot(p, p.sequence[1]);
    expect(
      removed.shots.find((s) => s.id === removed.sequence[1])?.transitionFrames,
    ).toBe(11);
    expect(removed.shots.find((s) => s.id === last.id)).toEqual(last);
    expect(totalFrames(removed)).toBe(49);
    expect(removed.sequenceVersions).toEqual(before.sequenceVersions);
    const reordered = moveShot(p, p.sequence[1], -1);
    expect(
      reordered.shots.find((s) => s.id === reordered.sequence[0])
        ?.transitionFrames,
    ).toBe(0);
    expect(
      reordered.shots.find((s) => s.id === reordered.sequence[2])
        ?.transitionFrames,
    ).toBe(11);
    expect(totalFrames(reordered)).toBe(97);
    expect(p).toEqual(before);
    expect(
      restoreSequenceVersion(removed, p.sequenceVersions[0].id).sequence,
    ).toEqual(p.sequence);
  });
  it("migrates earlier project files without inventing historical relationships", () => {
    const legacy = JSON.parse(JSON.stringify(createSampleProject()));
    delete legacy.sequenceVersions;
    for (const shot of legacy.shots) delete shot.previousShotId;
    const p = parseProject(legacy);
    expect(p.sequenceVersions).toEqual([]);
    expect(shotVersionHistory(p, p.sequence[0])).toHaveLength(1);
    expect(p.shots.every((s) => s.previousShotId === null)).toBe(true);
  });
  it("keeps every old shot intact when editing and restoring a previous version", () => {
    const original = createSampleProject(),
      id = original.sequence[0],
      old = structuredClone(original.shots[0]);
    const edited = reviseShot(original, id, {
      dialogue: "Ny replik",
      durationFrames: 144,
    });
    const restored = restoreShotVersion(edited, edited.sequence[0], id);
    expect(
      shotVersionHistory(restored, restored.sequence[0]).map((s) => s.version),
    ).toEqual([3, 2, 1]);
    expect(restored.shots.find((s) => s.id === id)).toEqual(old);
    expect(restored.shots.at(-1)?.dialogue).toBe(old.dialogue);
    expect(restored.shots.at(-1)?.durationFrames).toBe(288);
    expect(original.shots[0]).toEqual(old);
    expect(() =>
      restoreShotVersion(edited, edited.sequence[0], edited.sequence[1]),
    ).toThrow("tilhører ikke");
  });
  it("saves ordered immutable shot references with audio/captions and keeps an unsaved cut before restoration", () => {
    let p = createSampleProject();
    p.media.push({
      id: "voice",
      name: "Egen stemme",
      kind: "audio",
      mime: "audio/wav",
      dataUrl: "data:audio/wav;base64,AA==",
      bytes: 1,
      sha256: "0".repeat(64),
      source: "Egen",
      rights: "owned",
      durationFrames: 1000,
    });
    p.voice = {
      mediaId: "voice",
      startFrame: 24,
      sourceIn: 48,
      fadeFrames: 12,
      volume: 0.8,
      duck: false,
    };
    p = saveSequenceVersion(p, "Første klipning");
    const first = structuredClone(p.sequenceVersions[0]),
      oldShots = structuredClone(p.shots),
      scene = structuredClone(p.draft);
    p = reviseShot(p, p.sequence[1], {
      durationFrames: 120,
      transitionFrames: 12,
    });
    p.voice!.volume = 0.4;
    p.captions = false;
    const unsaved = structuredClone(p),
      restored = restoreSequenceVersion(p, first.id);
    expect(restored.sequenceVersions).toHaveLength(2);
    expect(restored.sequenceVersions[0]).toEqual(first);
    expect(restored.sequence).toEqual(first.sequence);
    expect(restored.voice).toEqual(first.voice);
    expect(restored.captions).toBe(true);
    expect(restored.draft).toEqual(scene);
    expect(restored.shots.slice(0, 5)).toEqual(oldShots);
    expect(matchingSequenceVersion(restored)?.id).toBe(first.id);
    const back = restoreSequenceVersion(
      restored,
      restored.sequenceVersions[1].id,
    );
    expect(back.sequence).toEqual(unsaved.sequence);
    expect(back.voice).toEqual(unsaved.voice);
    expect(back.captions).toBe(false);
    expect(totalFrames(back)).toBe(totalFrames(unsaved));
    expect(back.sequenceVersions).toHaveLength(2);
  });
  it("validates inactive saved cuts, source trims and predecessor links on import", () => {
    const saved = saveSequenceVersion(createSampleProject(), "Bevar mig");
    let bad = structuredClone(saved);
    bad.sequenceVersions[0].sequence[0] = "missing";
    expect(() => parseProject(bad)).toThrow("manglende shot");
    bad = structuredClone(saved);
    bad.sequenceVersions[0].sequence[1] = bad.sequenceVersions[0].sequence[0];
    expect(() => parseProject(bad)).toThrow("én gang");
    bad = structuredClone(saved);
    bad.sequenceVersions[0].voice = {
      mediaId: "missing",
      volume: 1,
      startFrame: 0,
      sourceIn: 0,
      fadeFrames: 0,
      duck: false,
    };
    expect(() => parseProject(bad)).toThrow("Lydmedie mangler");
    bad = structuredClone(saved);
    bad.shots[0].previousShotId = bad.shots[0].id;
    expect(() => parseProject(bad)).toThrow("forgænger");
    bad = structuredClone(saved);
    bad.sequenceVersions.push({ ...bad.sequenceVersions[0], id: "new_id" });
    expect(() => parseProject(bad)).toThrow("sekvensversionsnummer");
  });
  it("duplicates a shot as an independent lineage and excludes own media from scene continuity", () => {
    let p = createSampleProject();
    p = reviseShot(p, p.sequence[0], { durationFrames: 48 });
    const originalId = p.sequence[0],
      copy = duplicateShot(p, originalId),
      duplicate = copy.shots.find((s) => s.id === copy.sequence[1])!;
    expect(duplicate.previousShotId).toBeNull();
    expect(duplicate.version).toBe(1);
    expect(duplicate.sceneVersionId).toBe(p.shots.at(-1)!.sceneVersionId);
    expect(copy.sequence[0]).toBe(originalId);
    p.draft.objects[0].color = "#ffffff";
    p.media.push({
      id: "image",
      name: "Eget billede",
      kind: "image",
      mime: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,AA==",
      sha256: "0".repeat(64),
      bytes: 1,
      source: "Eget",
      rights: "owned",
    });
    p = reviseShot(p, p.sequence[0], { mediaId: "image" });
    expect(affectedShots(p)).toHaveLength(4);
    expect(affectedShots(p).some((s) => s.mediaId)).toBe(false);
  });
  it("refuses missing or over-capacity history without mutating any existing cut", () => {
    let p = createSampleProject();
    for (let i = 0; i < 40; i++) p = saveSequenceVersion(p, `Klipning ${i}`);
    const before = structuredClone(p);
    expect(() => saveSequenceVersion(p, "For mange")).toThrow("40");
    expect(() => restoreSequenceVersion(p, "missing")).toThrow("findes ikke");
    expect(p).toEqual(before);
  });
});
