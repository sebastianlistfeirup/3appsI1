import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = await fs.mkdtemp("/tmp/director-clip-audio-");
const run = (cmd, args, env = {}) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { env: { ...process.env, ...env } }),
      out = [],
      err = [];
    c.stdout.on("data", (v) => out.push(v));
    c.stderr.on("data", (v) => err.push(v));
    c.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(Error(Buffer.concat(err).toString())),
    );
  });
await run("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=teal:size=320x180:rate=30:duration=3",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=880:sample_rate=48000:duration=3",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  `${root}/clip.mp4`,
]);
const p = JSON.parse(
  await fs.readFile("fixtures/director-sample-render.json", "utf8"),
);
p.sequence = p.sequence.slice(0, 1);
const shot = p.shots.find((s) => s.id === p.sequence[0]);
shot.durationFrames = 48;
shot.sourceIn = 24;
shot.mediaId = "clip";
const bytes = await fs.readFile(`${root}/clip.mp4`);
p.media.push({
  id: "clip",
  kind: "video",
  name: "Original testtone",
  mime: "video/mp4",
  dataUrl: `data:video/mp4;base64,${bytes.toString("base64")}`,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  durationFrames: 72,
  source: "Original synthetic880Hz testtone",
  rights: "owned",
});
p.voice = null;
p.music = null;
const results = [];
for (const enabled of [true, false]) {
  shot.clipAudio = enabled;
  const file = `${root}/${enabled}.json`;
  await fs.writeFile(file, JSON.stringify(p));
  const out = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "services/worker/src/director/local-runner.ts",
      "render",
      file,
    ],
    { DIRECTOR_RENDER_DIR: `${root}/jobs` },
  );
  const { jobId } = JSON.parse(out.toString().split("\n")[0]);
  const status = JSON.parse(
    await fs.readFile(`${root}/jobs/${jobId}/status.json`, "utf8"),
  );
  assert.equal(status.state, "succeeded");
  const pcm = await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    `${root}/jobs/${jobId}/film.mp4`,
    "-vn",
    "-f",
    "f32le",
    "-ac",
    "1",
    "pipe:1",
  ]);
  let square = 0;
  for (let i = 0; i < pcm.length; i += 4) {
    const n = pcm.readFloatLE(i);
    square += n * n;
  }
  const rms = Math.sqrt(square / (pcm.length / 4));
  assert.ok(enabled ? rms > 0.01 : rms < 0.000001, `Unexpected RMS ${rms}`);
  results.push({ clipAudio: enabled, rms, metadata: status.metadata });
  if (enabled)
    await fs.copyFile(
      `${root}/jobs/${jobId}/film.mp4`,
      "reports/director/clip-original-audio.mp4",
    );
}
await fs.writeFile(
  "reports/director/clip-audio.json",
  JSON.stringify(
    {
      checks: [
        "originalclip audio survives trimmed export",
        "disabledclipaudio is real silence",
      ],
      results,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(results);
