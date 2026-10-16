import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://localhost:3002";
const project = JSON.parse(
  await fs.readFile("fixtures/director-sample-render.json", "utf8"),
);
const post = await fetch(`${base}/api/exports`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ project }),
});
assert.equal(post.status, 202, await post.clone().text());
const job = await post.json();
const stop = await fetch(`${base}/api/exports/${job.id}`, { method: "DELETE" });
assert.equal(stop.status, 200);
const cancelled = await stop.json();
assert.equal(cancelled.state, "cancelled");
await new Promise((r) => setTimeout(r, 500));
const state = await (await fetch(`${base}/api/exports/${job.id}`)).json();
assert.equal(state.state, "cancelled");
const download = await fetch(`${base}/api/exports/${job.id}?download=1`);
assert.equal(download.status, 404);
const evidence = {
  test: "A running local export can be cancelled and never advertises a download",
  jobId: job.id,
  state: state.state,
  downloadStatus: download.status,
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(
  "reports/director/cancellation.json",
  JSON.stringify(evidence, null, 2),
);
console.log(evidence);
