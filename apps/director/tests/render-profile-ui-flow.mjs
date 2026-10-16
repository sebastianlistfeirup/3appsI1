import { chromiumExecutable } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const axe = createRequire(require.resolve("@axe-core/playwright"))(
  "axe-core",
).source;
const nextBin = require.resolve("next/dist/bin/next");
const engine = process.env.PROFILE_ENGINE ?? "chromium";
const port = Number(process.env.DIRECTOR_PROFILE_TEST_PORT ?? 3107);
const url = `http://localhost:${port}`;
const expect = baseExpect.configure({ timeout: 20000 });
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "director-profile-ui-"),
);
const report = {
  engine,
  phases: [],
  checks: [],
  scans: [],
  errors: [],
  serverLogs: [],
};
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-render-profile-flow.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("Director render profile:", engine, name);
};
let server;
async function stop() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise((resolve) => {
    const deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(deadline);
      resolve();
    });
    child.kill("SIGTERM");
  });
  server = undefined;
}
async function start(missing) {
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: path.resolve("apps/director"),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DIRECTOR_LOCAL_RENDER: "1",
        NEXT_TELEMETRY_DISABLED: "1",
        DIRECTOR_RENDER_DIR: path.join(directory, "jobs"),
        ...(missing ? { PATH: directory } : {}),
      },
    },
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (value) =>
      report.serverLogs.push(value.toString().slice(-2000)),
    );
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null)
      throw Error(`Isolated server exited: ${report.serverLogs.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("Isolated server did not start");
}
const watchdog = setTimeout(() => {
  server?.kill("SIGKILL");
  process.exit(1);
}, 180000);
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => report.errors.push(error.message));
try {
  await phase("start isolated production server with missing FFmpeg");
  await start(true);
  const profile = await (await fetch(`${url}/api/exports`)).json();
  assert.equal(profile.available, false);
  assert.match(profile.reason, /ffmpeg.*PATH/);
  const submit = await fetch(`${url}/api/exports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(submit.status, 503);
  const blocked = await (
    await fetch(`${url}/api/exports?refresh=1`, {
      headers: {
        Origin: "https://outside.example",
        "Sec-Fetch-Site": "cross-site",
      },
    })
  ).json();
  assert.equal(blocked.available, false);
  assert.equal(
    blocked.checks,
    undefined,
    "cross-site requests cannot start or disclose a profile probe",
  );
  report.checks.push(
    "actual missing executable disables GET and returns POST 503; cross-site gate runs before profile",
  );
  await page.goto(url);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Lokal render er ikke klar",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".capability-note")).toContainText(
    "ffmpeg er ikke installeret",
  );
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /^Storyboard/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /^Projekt-JSON/ }),
  ).toBeEnabled();
  await page.screenshot({
    path: `reports/director/${engine}-render-profile-missing.png`,
  });
  report.checks.push(
    "UI explains actual missing tool while browser exports remain enabled",
  );
  await phase(
    "repair server environment and recheck from existing open editor",
  );
  await stop();
  await start(false);
  await page
    .getByRole("button", { name: "Kontrollér render igen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Eksportér animatic", exact: true }),
  ).toBeEnabled({ timeout: 35000 });
  report.profile = await (await fetch(`${url}/api/exports`)).json();
  assert.equal(report.profile.available, true, report.profile.reason);
  assert.equal(report.profile.checks.length, 5);
  report.checks.push(
    "same editor recovers after server repair via actual synthetic encode/decode",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          iframes: false,
        })
      ).violations.map((item) => ({
        id: item.id,
        targets: item.nodes.map((node) => node.target),
      })),
    );
    report.scans.push({ name, violations });
    assert.deepEqual(violations, []);
    await page.screenshot({
      path: `reports/director/${engine}-render-profile-${name}.png`,
    });
  }
  assert.deepEqual(report.errors, []);
  await phase("passed");
} catch (error) {
  report.failure = String(error.stack ?? error);
  await page
    .screenshot({
      path: `reports/director/${engine}-render-profile-failure.png`,
    })
    .catch(() => {});
  await phase("failed");
  throw error;
} finally {
  clearTimeout(watchdog);
  await stop();
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await fs.rm(directory, { recursive: true, force: true });
}
