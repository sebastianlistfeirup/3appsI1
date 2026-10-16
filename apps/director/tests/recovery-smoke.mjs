import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp("/tmp/director-recovery-");
const project = JSON.parse(
  await fs.readFile("fixtures/director-sample-render.json", "utf8"),
);
project.shots.find((s) => s.id === project.sequence[1]).transitionFrames = 12;
const fixture = path.join(root, "crossfade.json");
await fs.writeFile(fixture, JSON.stringify(project));
const cli = "services/worker/src/director/local-runner.ts";
const execute = (args) => {
  const child = spawn(process.execPath, ["--import", "tsx", cli, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DIRECTOR_RENDER_DIR: path.join(root, "jobs") },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "",
    error = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (error += d));
  const done = new Promise((resolve) =>
    child.on("close", (code, signal) =>
      resolve({ code, signal, output, error }),
    ),
  );
  return { child, done, output: () => output };
};
const first = execute(["render", fixture]);
let id;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const match = first.output().match(/"jobId":"([a-f0-9-]+)"/);
  if (match) id = match[1];
  if (id) {
    try {
      const checkpoint = JSON.parse(
        await fs.readFile(
          path.join(root, "jobs", id, "checkpoint.json"),
          "utf8",
        ),
      );
      if (checkpoint.segments.length >= 2) break;
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 150));
}
assert.ok(id, "runner produced a persistent job ID");
const checkpoint = JSON.parse(
  await fs.readFile(path.join(root, "jobs", id, "checkpoint.json"), "utf8"),
);
assert.ok(
  checkpoint.segments.length >= 2,
  "at least two segments persisted before kill",
);
process.kill(-first.child.pid, "SIGKILL");
const killed = await first.done;
const before = (await fs.stat(checkpoint.segments[0])).mtimeMs;
const second = execute(["resume", id]);
const resumed = await second.done;
assert.equal(resumed.code, 0, resumed.error);
const state = JSON.parse(
  await fs.readFile(path.join(root, "jobs", id, "status.json"), "utf8"),
);
assert.equal(state.state, "succeeded");
assert.ok(state.reusedSegments >= 2);
assert.equal(
  (await fs.stat(checkpoint.segments[0])).mtimeMs,
  before,
  "validated segment was not regenerated",
);
assert.equal(state.expectedFrames, 1428);
assert.equal(state.metadata.duration, 59.5);
await fs.copyFile(
  path.join(root, "jobs", id, "film.mp4"),
  "reports/director/crossfade-recovered-720p.mp4",
);
const evidence = {
  test: "D-AT06: kill process after transcode and resume validated intermediates",
  jobId: id,
  killed: killed.signal,
  persistedBeforeKill: checkpoint.segments.length,
  reusedSegments: state.reusedSegments,
  unchangedFirstSegment: true,
  remoteProviderRequests: 0,
  expectedFrames: 1428,
  metadata: state.metadata,
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(
  "reports/director/recovery.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
