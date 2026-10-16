/** A passing gate for the intentionally failing production-HTTP fixture. */
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
const report = "reports/backend/http-proof-failure-probe.json";
await rm(report, { force: true });
const child = spawn(
  process.execPath,
  ["--import", "tsx", "tools/backend/http-proof.ts", "--failure-probe"],
  { stdio: "inherit", env: process.env },
);
const code = await new Promise<number | null>((resolve, reject) => {
  const deadline = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("HTTP negative probe exceeded sixty seconds."));
  }, 60000);
  child.once("error", (error) => {
    clearTimeout(deadline);
    reject(error);
  });
  child.once("close", (code) => {
    clearTimeout(deadline);
    resolve(code);
  });
});
assert.equal(
  code,
  1,
  "The intentionally failed HTTP fixture must preserve exit code 1.",
);
const result = JSON.parse(await readFile(report, "utf8"));
assert.equal(result.failureProbe, true);
assert.equal(result.status, "failed");
assert.equal(
  result.failureReason,
  "Intentional failure after real services became ready.",
);
assert.equal(result.cleanup, "completed");
assert.equal(result.poolErrors, 0);
assert.equal(result.cloudConnected, false);
console.log(
  "HTTP failure-exit gate passed: intended error, nonzero exit, complete cleanup and no cloud connection.",
);
