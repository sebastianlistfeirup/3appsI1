import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { parseProject } from "@tre/scene-format";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-history-"));
process.env.DIRECTOR_RENDER_DIR = directory;
const module = await import("../src/lib/server/local-render.ts");
const { createRender, executeRender, getRender, renderHistory, movieFile } =
  module.default ?? module;
const report = { checks: [] },
  watchdog = setTimeout(() => process.exit(1), 120000);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  let project = parseProject(
    JSON.parse(
      await fs.readFile("fixtures/director-sample-render.json", "utf8"),
    ),
  );
  project.id = "archive_primary";
  project.sequence = project.sequence.slice(0, 1);
  project.sequenceVersions = [];
  const activeShot = project.shots.find(
    (shot) => shot.id === project.sequence[0],
  );
  activeShot.durationFrames = 24;
  activeShot.dialogue = "Første klipning";
  project.revision = 1;
  const first = await createRender(project);
  await executeRender(first.id);
  const firstState = await getRender(first.id);
  assert.equal(firstState.state, "succeeded", firstState.error);
  const firstHash = sha(await movieFile(first.id));
  project = structuredClone(project);
  project.revision = 2;
  project.shots.find((shot) => shot.id === project.sequence[0]).dialogue =
    "Anden klipning";
  const second = await createRender(project);
  await executeRender(second.id);
  assert.equal((await getRender(second.id)).state, "succeeded");
  const third = await createRender({ ...project, id: "archive_other" });
  await executeRender(third.id);
  assert.equal((await getRender(third.id)).state, "succeeded");
  const history = await renderHistory(project.id);
  assert.deepEqual(
    history.jobs.map((job) => job.id),
    [second.id, first.id],
  );
  assert.equal(history.jobs[1].source.revision, 1);
  assert.equal(sha(await movieFile(first.id)), firstHash);
  assert.notEqual(sha(await movieFile(second.id)), firstHash);
  assert.deepEqual(
    (await renderHistory("archive_other")).jobs.map((job) => job.id),
    [third.id],
  );
  report.checks.push(
    "three actual MP4 renders; project-filtered newest-first history preserves distinct earlier movie hash",
  );
  const fake = async (contents) => {
    const id = randomUUID();
    await fs.mkdir(path.join(directory, id));
    await fs.writeFile(
      path.join(directory, id, "status.json"),
      typeof contents === "function" ? contents(id) : contents,
    );
    return id;
  };
  await fake((id) => JSON.stringify({ ...firstState, id, source: undefined }));
  await fake("invalid json");
  await fake("x".repeat(128 * 1024 + 1));
  await fake(() => JSON.stringify(firstState));
  const linked = randomUUID();
  await fs.mkdir(path.join(directory, linked));
  await fs.symlink(
    path.join(directory, first.id, "status.json"),
    path.join(directory, linked, "status.json"),
  );
  const malformed = await renderHistory(project.id);
  assert.equal(malformed.jobs.length, 2);
  assert.equal(malformed.legacyJobs, 1);
  assert.equal(malformed.unreadableJobs, 4);
  assert.equal(malformed.storage.automaticDeletion, false);
  assert.equal(malformed.storage.maxJobs, 100);
  assert.equal(malformed.storage.minimumFreeBytes, 512 * 1024 * 1024);
  await assert.rejects(renderHistory("../not-a-project"), /projekt-id/);
  await assert.rejects(getRender(linked));
  report.checks.push(
    "legacy statuses stay unlinked; corrupt, oversized, swapped-ID and symlink statuses are excluded; directory traversal rejected",
  );
  await fs.appendFile(path.join(directory, first.id, "film.mp4"), "tamper");
  await assert.rejects(movieFile(first.id), /checksum/);
  report.checks.push(
    "archived film still requires its original SHA-256 on every download",
  );
  report.history = {
    ...malformed,
    jobs: malformed.jobs.map((job) => ({
      id: job.id,
      source: job.source,
      manifestHash: job.manifestHash,
      movieHash: job.metadata.sha256,
    })),
  };
  await fs.writeFile(
    "reports/director/render-history.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Director render history checks passed", report.checks);
} finally {
  clearTimeout(watchdog);
  await fs.rm(directory, { recursive: true, force: true });
}
