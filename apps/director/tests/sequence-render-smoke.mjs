/** Actual FFmpeg export from an immutable saved cut while the caller edits its next cut. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseProject,
  reviseShot,
  saveSequenceVersion,
} from "@tre/scene-format";
const directory = await fs.mkdtemp("/tmp/director-sequence-render-");
process.env.DIRECTOR_RENDER_DIR = `${directory}/jobs`;
const module = await import("../src/lib/server/local-render.ts");
const { createRender, executeRender, getRender } = module.default ?? module;
const sha = (value) => createHash("sha256").update(value).digest("hex");
let project = parseProject(
  JSON.parse(await fs.readFile("fixtures/director-sample-render.json", "utf8")),
);
project.sequence = project.sequence.slice(0, 2);
project.sequenceVersions = [];
project.voice = project.music = null;
for (const id of project.sequence)
  project = reviseShot(project, id, {
    durationFrames: 48,
    transitionFrames: 0,
  });
project = reviseShot(project, project.sequence[1], { transitionFrames: 12 });
project = saveSequenceVersion(project, "Godkendt klipning til eksport");
const frozen = structuredClone(project),
  saved = frozen.sequenceVersions[0];
const queued = await createRender(project);
assert.deepEqual(queued.sequenceVersion, {
  id: saved.id,
  version: saved.version,
  name: saved.name,
});
assert.equal(queued.expectedFrames, 84);
// Edit the actual object originally passed to the renderer after its durable manifest is committed.
project.sequence.reverse();
project.sequenceVersions[0].name = "En anden version i editoren";
project.shots.find((shot) => shot.id === project.sequence[0]).durationFrames =
  120;
const manifestPath = `${directory}/jobs/${queued.id}/manifest.json`;
const manifestBefore = await fs.readFile(manifestPath, "utf8");
assert.deepEqual(JSON.parse(manifestBefore), frozen);
assert.equal(sha(manifestBefore), queued.manifestHash);
await executeRender(queued.id);
const result = await getRender(queued.id);
assert.equal(result.state, "succeeded", result.error);
assert.equal(result.metadata.width, 1280);
assert.equal(result.metadata.height, 720);
assert.equal(result.metadata.fps, 24);
assert.ok(Math.abs(result.metadata.duration - 3.5) <= 1 / 24);
assert.deepEqual(result.sequenceVersion, queued.sequenceVersion);
assert.equal(result.manifestHash, queued.manifestHash);
assert.equal(await fs.readFile(manifestPath, "utf8"), manifestBefore);
await fs.copyFile(
  `${directory}/jobs/${queued.id}/film.mp4`,
  "reports/director/locked-sequence-720p.mp4",
);
await fs.writeFile(
  "reports/director/locked-sequence-render.json",
  JSON.stringify(
    {
      checks: [
        "named saved cut recorded in render status",
        "caller edits do not mutate durable manifest",
        "shot order, duration and 12-frame crossfade preserved",
        "actual H.264/AAC 720p24 output matches 84 frames",
        "manifest SHA remains unchanged after encoding",
      ],
      result,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log("Immutable saved sequence render passed", result.metadata);
