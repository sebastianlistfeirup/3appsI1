import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp("/tmp/director-media-");
const run = (command, args, env = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    p.stdout.on("data", (v) => (out += v));
    p.stderr.on("data", (v) => (err += v));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(Error(err || out)),
    );
  });
await run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=30:duration=4",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  path.join(root, "clip.mp4"),
]);
await run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000:duration=3",
  "-c:a",
  "pcm_s16le",
  path.join(root, "voice.wav"),
]);
await run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=220:sample_rate=48000:duration=6",
  "-c:a",
  "pcm_s16le",
  path.join(root, "music.wav"),
]);
const p = JSON.parse(
  await fs.readFile("fixtures/director-sample-render.json", "utf8"),
);
p.title = "Teknisk medieprøve";
p.sequence = p.sequence.slice(0, 3);
for (const s of p.shots) {
  s.durationFrames = 48;
  s.transitionFrames = 0;
}
p.shots.find((s) => s.id === p.sequence[1]).transitionFrames = 12;
for (const [id, kind, mime, filename, frames] of [
  ["clip", "video", "video/mp4", "clip.mp4", 96],
  ["voice", "audio", "audio/wav", "voice.wav", 72],
  ["music", "audio", "audio/wav", "music.wav", 144],
]) {
  const bytes = await fs.readFile(path.join(root, filename));
  p.media.push({
    id,
    name: filename,
    kind,
    mime,
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    durationFrames: frames,
    source: "Syntetisk lokal testtone / testmønster",
    rights: "owned",
  });
}
const first = p.shots.find((s) => s.id === p.sequence[0]);
first.mediaId = "clip";
first.sourceIn = 24;
p.voice = {
  mediaId: "voice",
  volume: 0.8,
  startFrame: 24,
  sourceIn: 0,
  fadeFrames: 12,
  duck: false,
};
p.music = {
  mediaId: "music",
  volume: 0.3,
  startFrame: 0,
  sourceIn: 0,
  fadeFrames: 12,
  duck: true,
};
const file = path.join(root, "project.json");
await fs.writeFile(file, JSON.stringify(p));
const result = await run(
  process.execPath,
  [
    "--import",
    "tsx",
    "services/worker/src/director/local-runner.ts",
    "render",
    file,
  ],
  { DIRECTOR_RENDER_DIR: path.join(root, "jobs") },
);
const id = JSON.parse(result.split("\n")[0]).jobId;
const state = JSON.parse(
  await fs.readFile(path.join(root, "jobs", id, "status.json"), "utf8"),
);
assert.equal(state.state, "succeeded");
assert.equal(state.expectedFrames, 132);
assert.equal(state.metadata.duration, 5.5);
assert.equal(state.metadata.audioSampleRate, 48000);
assert.ok(state.metadata.loudnessLufs > -60);
assert.ok(state.metadata.truePeakDbfs <= -1);
await fs.copyFile(
  path.join(root, "jobs", id, "film.mp4"),
  "reports/director/media-pipeline-test.mp4",
);
const evidence = {
  test: "Own 30fps clip trimmed at 1s, normalized to24fps, 12-frame crossfade, voice+music gain/fade/duck, actual measured audio",
  metadata: state.metadata,
  expectedFrames: 132,
  syntheticAudio: true,
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(
  "reports/director/media-pipeline.json",
  JSON.stringify(evidence, null, 2),
);
console.log(evidence);
