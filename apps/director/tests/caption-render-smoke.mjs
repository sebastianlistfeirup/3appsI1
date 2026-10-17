/** Full dialogue must survive actual video pixels, subtitle files and the locked render manifest. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseProject, reviseShot, timeline } from "@tre/scene-format";
const captionModule = await import("../src/lib/captions.ts");
const { buildCaptionTrack, captionFile } =
  captionModule.default ?? captionModule;
const directory = await fs.mkdtemp("/tmp/director captions' test-");
process.env.DIRECTOR_RENDER_DIR = `${directory}/jobs`;
const fontModule = await import("../src/lib/server/render-profile.ts");
const { CAPTION_FONT } = fontModule.default ?? fontModule;
await fs.copyFile(CAPTION_FONT, `${directory}/reference-font.ttf`);
const renderModule = await import("../src/lib/server/local-render.ts");
const {
  createRender,
  executeRender,
  getRender,
  renderArtifact,
  validateMovie,
} = renderModule.default ?? renderModule;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const ffmpeg = (args, options = {}) =>
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-threads",
      "2",
      ...args,
    ],
    { timeout: 120000, maxBuffer: 24 * 1024 * 1024, ...options },
  );
const report = {
  ffmpeg: execFileSync("ffmpeg", ["-version"], { encoding: "utf8" }).split(
    "\n",
  )[0],
  ffprobe: execFileSync("ffprobe", ["-version"], { encoding: "utf8" }).split(
    "\n",
  )[0],
  checks: [],
  pixelChecks: [],
};
const watchdog = setTimeout(() => {
  console.error("Caption render exceeded 300 seconds");
  process.exit(1);
}, 300000);
try {
  const black = ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=black:s=1280x720",
    "-frames:v",
    "1",
    "-c:v",
    "png",
    "-threads",
    "1",
    "-f",
    "image2pipe",
    "-",
  ]);
  const wavPath = `${directory}/voice.wav`;
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=12",
    "-af",
    "volume=2.4",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
  const wav = await fs.readFile(wavPath);
  let project = parseProject(
    JSON.parse(
      await fs.readFile("fixtures/director-sample-render.json", "utf8"),
    ),
  );
  project.title = "Hele replikken · faktisk caption- og lydkontrol";
  project.sequence = project.sequence.slice(0, 2);
  project.sequenceVersions = [];
  project.media = [
    {
      id: "black",
      name: "Sort testbillede.png",
      kind: "image",
      mime: "image/png",
      dataUrl: `data:image/png;base64,${black.toString("base64")}`,
      sha256: sha(black),
      bytes: black.length,
      source: "Generated local original",
      rights: "owned",
    },
    {
      id: "voice",
      name: "Original tone.wav",
      kind: "audio",
      mime: "audio/wav",
      dataUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
      sha256: sha(wav),
      bytes: wav.length,
      durationFrames: 288,
      source: "Generated local original",
      rights: "owned",
    },
  ];
  project.voice = {
    mediaId: "voice",
    sourceIn: 0,
    startFrame: 0,
    volume: 0.7,
    fadeFrames: 6,
    duck: false,
  };
  project.music = null;
  const dialogue =
    "Først fortæller vi om rejsen gennem natten. Vi holder sammen, også når signalet forsvinder. " +
    "Hver eneste replik skal findes i den færdige film, og ingen skjult grænse må skære historien væk. " +
    "Ærlig tekst med Ελληνικά og Привет samt bogstavelige tegn: 100% {literal} \\n <b>ord</b>. " +
    "Vi ser tilbage på vores valg og lytter til den stemme, der stadig når os. Den sidste sætning er helt afgørende. SIDSTE REPLIK BEVARET.";
  project = reviseShot(project, project.sequence[0], {
    mediaId: "black",
    durationFrames: 240,
    transitionFrames: 0,
    dialogue,
  });
  project = reviseShot(project, project.sequence[1], {
    mediaId: "black",
    durationFrames: 48,
    transitionFrames: 12,
    dialogue: "ANDET SHOT. Hele slutningen er bevaret.",
  });
  project.captions = true;
  const track = buildCaptionTrack(project);
  assert.equal(track.errors.length, 0);
  assert.ok(track.cues.length > 4);
  assert.ok(track.warnings.length > 0);
  const original = JSON.stringify(project);
  const queued = await createRender(project);
  await executeRender(queued.id);
  const result = await getRender(queued.id),
    jobDir = `${directory}/jobs/${queued.id}`,
    film = `${jobDir}/film.mp4`;
  assert.equal(result.state, "succeeded", result.error);
  assert.equal(result.expectedFrames, 276);
  assert.equal(result.metadata.audioSampleRate, 48000);
  assert.equal(result.metadata.audioCodec, "aac");
  assert.equal(result.metadata.audioSilent, false);
  assert.ok(Number.isFinite(result.metadata.loudnessLufs));
  assert.ok(Number.isFinite(result.metadata.truePeakDbfs));
  assert.equal(JSON.stringify(project), original);
  const validation = JSON.parse(
    await renderArtifact(queued.id, "validation.json"),
  );
  assert.equal(validation.sha256, sha(await fs.readFile(film)));
  assert.equal(validation.manifestHash, queued.manifestHash);
  assert.equal(validation.rendererVersion, "director-animatic-3.1");
  const captions = JSON.parse(await renderArtifact(queued.id, "captions.json"));
  assert.equal(captions.sources[0].text, dialogue);
  assert.deepEqual(captions.cues, track.cues);
  for (const format of ["srt", "vtt"]) {
    const bytes = await renderArtifact(queued.id, `captions.${format}`);
    assert.equal(bytes.toString(), captionFile(project, format));
    assert.ok(bytes.toString().includes("SIDSTE REPLIK BEVARET."));
    await fs.writeFile(`reports/director/complete-dialogue.${format}`, bytes);
  }
  report.checks.push(
    "Actual 276-frame H.264/AAC output at 720p24/48kHz; full raw dialogue and every cue retained in hashed artifacts; subtitle files match the pinned project",
  );
  // Independently rasterize expected text, then compare decoded video glyph masks, not metadata.
  const timings = timeline(project);
  for (const [index, cue] of track.cues.entries()) {
    for (const frame of [
      ...new Set([
        cue.startFrame,
        Math.floor((cue.startFrame + cue.endFrame) / 2),
        cue.endFrame - 1,
      ]),
    ]) {
      const shotIndex = timings.findIndex((shot) => shot.id === cue.shotId),
        shot = timings[shotIndex],
        next = timings[shotIndex + 1];
      let opacity = 1;
      if (
        shot.transitionFrames &&
        frame < shot.startFrame + shot.transitionFrames
      )
        opacity = (frame - shot.startFrame) / shot.transitionFrames;
      if (next?.transitionFrames && frame >= next.startFrame)
        opacity = 1 - (frame - next.startFrame) / next.transitionFrames;
      const actual = ffmpeg([
        "-i",
        film,
        "-vf",
        `select=eq(n\\,${frame}),crop=1280:180:0:540`,
        "-frames:v",
        "1",
        "-pix_fmt",
        "gray",
        "-f",
        "rawvideo",
        "-",
      ]);
      const textFile = `${directory}/reference-${index}.txt`;
      await fs.writeFile(textFile, cue.text);
      const filter = `drawtext=fontfile=reference-font.ttf:textfile=reference-${index}.txt:expansion=none:fontsize=28:fontcolor=white@${opacity}:box=1:boxcolor=black@0.65:boxborderw=12:line_spacing=7:x=(w-text_w)/2:y=h-text_h-42,crop=1280:180:0:540`;
      const expected = ffmpeg(
        [
          "-f",
          "lavfi",
          "-i",
          "color=black:s=1280x720:r=24",
          "-vf",
          filter,
          "-frames:v",
          "1",
          "-pix_fmt",
          "gray",
          "-f",
          "rawvideo",
          "-",
        ],
        { cwd: directory },
      );
      assert.equal(actual.length, expected.length);
      let intersection = 0,
        union = 0;
      for (let at = 0; at < actual.length; at++) {
        const a = actual[at] > 96,
          b = expected[at] > 96;
        if (a && b) intersection++;
        if (a || b) union++;
      }
      const overlap = intersection / union;
      assert.ok(union > 100);
      assert.ok(
        overlap > 0.96,
        `Caption ${index + 1} actual glyph overlap ${overlap}`,
      );
      report.pixelChecks.push({
        cue: cue.id,
        frame,
        opacity,
        glyphOverlap: overlap,
        text: cue.text,
      });
    }
  }
  report.checks.push(
    "Every subtitle cue, including the previously truncated final sentence, is present in actual decoded MP4 pixels with >96% independent glyph-mask overlap",
  );
  const { spawnSync } = await import("node:child_process");
  const measured = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      film,
      "-vn",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", timeout: 120000 },
  );
  assert.equal(measured.status, 0);
  const loudness = Number(
      [...measured.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)[1],
    ),
    peak = Number(
      [...measured.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)[1],
    );
  assert.equal(loudness, result.metadata.loudnessLufs);
  assert.equal(peak, result.metadata.truePeakDbfs);
  report.measurement = {
    loudnessLufs: loudness,
    truePeakDbtp: peak,
    summary: measured.stderr.slice(-650),
  };
  report.checks.push(
    "An independent second EBU R128 scan of decoded AAC matches reported LUFS and true peak exactly",
  );
  const srtBefore = await fs.readFile(`${jobDir}/captions.srt`);
  await fs.appendFile(`${jobDir}/captions.srt`, "tampered");
  await assert.rejects(
    () => renderArtifact(queued.id, "captions.srt"),
    /checksum/,
  );
  await fs.writeFile(`${jobDir}/captions.srt`, srtBefore);
  await assert.rejects(
    () => renderArtifact(queued.id, "../manifest.json"),
    /Ukendt/,
  );
  const assemblyBefore = await fs.stat(`${jobDir}/assembly.mp4`);
  await executeRender(queued.id);
  assert.equal((await getRender(queued.id)).state, "succeeded");
  assert.equal((await getRender(queued.id)).reusedSegments, 2);
  assert.equal(
    (await fs.stat(`${jobDir}/assembly.mp4`)).mtimeMs,
    assemblyBefore.mtimeMs,
  );
  ffmpeg([
    "-i",
    `${jobDir}/assembly.mp4`,
    "-c",
    "copy",
    "-metadata",
    "comment=controlled changed assembly",
    `${jobDir}/changed.mp4`,
  ]);
  await fs.copyFile(`${jobDir}/changed.mp4`, `${jobDir}/assembly.mp4`);
  await validateMovie(`${jobDir}/assembly.mp4`, 276);
  assert.notEqual(
    sha(await fs.readFile(`${jobDir}/assembly.mp4`)),
    result.metadata.sha256,
  );
  await executeRender(queued.id);
  assert.equal((await getRender(queued.id)).state, "succeeded");
  assert.equal(
    (await getRender(queued.id)).metadata.sha256,
    result.metadata.sha256,
  );
  report.checks.push(
    "Validated unchanged intermediates are reused; a format-valid modified assembly is rejected by its recorded content hash and rebuilt; sidecar tampering and traversal requests are rejected",
  );
  await fs.copyFile(film, "reports/director/complete-dialogue-720p.mp4");
  const last = track.cues
    .filter((cue) => cue.shotId === project.sequence[0])
    .at(-1);
  ffmpeg([
    "-i",
    film,
    "-vf",
    `select=eq(n\\,${Math.floor((last.startFrame + last.endFrame) / 2)})`,
    "-frames:v",
    "1",
    "reports/director/complete-dialogue-last-frame.png",
  ]);
  let silent = structuredClone(project);
  silent.sequence = [silent.sequence[0]];
  silent = reviseShot(silent, silent.sequence[0], {
    durationFrames: 24,
    dialogue: "",
  });
  silent.voice = silent.music = null;
  const silentJob = await createRender(silent);
  await executeRender(silentJob.id);
  const silence = await getRender(silentJob.id);
  assert.equal(silence.state, "succeeded", silence.error);
  assert.equal(silence.metadata.audioSilent, true);
  assert.equal(silence.metadata.truePeakDbfs, undefined);
  assert.equal(silence.captions.cues, 0);
  assert.equal(silence.artifacts["captions.srt"], undefined);
  report.checks.push(
    "Actual silent AAC is reported as silence with -infinite true peak; an empty dialogue creates no misleading subtitle artifact",
  );
  report.result = result;
  report.verifiedAt = new Date().toISOString();
  await fs.writeFile(
    "reports/director/caption-render.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Complete caption and measured audio render passed",
    result.metadata,
  );
} finally {
  clearTimeout(watchdog);
}
