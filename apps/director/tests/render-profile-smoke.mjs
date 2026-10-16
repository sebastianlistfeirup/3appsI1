import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const module = await import("../src/lib/server/render-profile.ts");
const { inspectRenderProfile, renderCapability } = module.default ?? module;
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "director-profile-test-"),
);
const originalTmpdir = process.env.TMPDIR;
process.env.TMPDIR = directory;
const before = (await fs.readdir(os.tmpdir()))
  .filter((name) => name.startsWith("director-profile-"))
  .sort();
const report = { checks: [], results: {} };
const start = Date.now();
const watchdog = setTimeout(() => process.exit(1), 90000);
try {
  const pending = renderCapability();
  const concurrent = Array.from({ length: 20 }, () => renderCapability(true));
  for (const promise of concurrent)
    assert.equal(
      promise,
      pending,
      "concurrent requests must share the actual process probe",
    );
  const healthy = await pending;
  assert.equal(healthy.available, true, healthy.reason);
  assert.equal(healthy.checks.length, 5);
  assert.match(healthy.fontSha256, /^[a-f0-9]{64}$/);
  assert.equal(await renderCapability(), healthy);
  assert.equal(
    await renderCapability(true),
    healthy,
    "repeated refresh must respect rate limit",
  );
  report.results.healthy = healthy;
  report.checks.push(
    "actual 30-frame H264/AAC encode, decode, FFprobe and EBU R128 passed",
    "21 concurrent callers share one probe; cached refresh is bounded",
  );
  const noPath = await inspectRenderProfile({
    env: { ...process.env, PATH: directory },
  });
  assert.equal(noPath.available, false);
  assert.match(noPath.reason, /ffmpeg.*PATH/);
  report.results.missingFfmpeg = noPath;
  const noFont = await inspectRenderProfile({
    fontPath: path.join(directory, "missing.ttf"),
  });
  assert.equal(noFont.available, false);
  assert.match(noFont.reason, /DejaVu Sans mangler/);
  report.results.missingFont = noFont;
  const invalidFont = path.join(directory, "invalid.ttf");
  await fs.writeFile(invalidFont, "This is not a font");
  const unreadableFont = await inspectRenderProfile({ fontPath: invalidFont });
  assert.equal(
    unreadableFont.available,
    false,
    "readable bytes are insufficient: FFmpeg must load the font",
  );
  report.results.invalidFont = unreadableFont;
  report.checks.push(
    "missing executable, missing font and invalid font fail with actual dependencies",
  );
  const filters = execFileSync("ffmpeg", ["-hide_banner", "-filters"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fake = `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);\nif(args.includes('-version'))console.log('ffmpeg test executable');else if(args.includes('-filters'))console.log(${JSON.stringify(filters)});\n`;
  await fs.writeFile(path.join(directory, "ffmpeg"), fake, { mode: 0o700 });
  const realProbe = execFileSync("sh", ["-c", "command -v ffprobe"], {
    encoding: "utf8",
  }).trim();
  await fs.symlink(realProbe, path.join(directory, "ffprobe"));
  const claimsOnly = await inspectRenderProfile({
    env: { ...process.env, PATH: directory },
  });
  assert.equal(
    claimsOnly.available,
    false,
    "exit zero and filter claims cannot replace an actual valid movie",
  );
  report.results.falseClaims = claimsOnly;
  report.checks.push(
    "executable claiming all filters and returning zero is rejected when no actual movie exists",
  );
  const pidFile = path.join(directory, "pid");
  await fs.writeFile(
    path.join(directory, "ffmpeg"),
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);\n`,
    { mode: 0o700 },
  );
  const timed = await inspectRenderProfile({
    env: { ...process.env, PATH: directory },
    timeoutMs: 500,
  });
  assert.equal(timed.available, false);
  assert.match(timed.reason, /tidsgrænse/);
  const pid = Number(await fs.readFile(pidFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.throws(
    () => process.kill(pid, 0),
    { code: "ESRCH" },
    "timed-out dependency must be killed",
  );
  report.results.timeout = timed;
  report.checks.push("deadline kills stalled native process");
  const after = (await fs.readdir(os.tmpdir()))
    .filter((name) => name.startsWith("director-profile-"))
    .sort();
  assert.deepEqual(
    after,
    before,
    "probe must remove every private temporary directory",
  );
  report.checks.push("all success/failure probe directories are removed");
  report.elapsedMs = Date.now() - start;
  await fs.writeFile(
    "reports/director/render-profile.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Director actual render-profile checks passed", report.checks);
} finally {
  clearTimeout(watchdog);
  if (originalTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmpdir;
  await fs.rm(directory, { recursive: true, force: true });
}
