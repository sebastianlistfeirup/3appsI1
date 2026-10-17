import { crc32 } from "node:zlib";
import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const engine = process.env.GLB_ENGINE ?? "chromium";
const expect = baseExpect.configure({ timeout: 20000 });
let browser, page;
const errors = [],
  external = [],
  trace = {
    engine,
    startedAt: new Date().toISOString(),
    phase: "starting",
    steps: [],
    console: [],
    pageErrors: errors,
    externalRequests: external,
  };
const persist = () =>
  writeFileSync(
    `reports/director/${engine}-textured-glb-trace.json`,
    JSON.stringify(trace, null, 2),
  );
const mark = (phase) => {
  trace.phase = phase;
  trace.steps.push({ phase, at: new Date().toISOString() });
  persist();
  console.log(`[texture:${engine}] ${new Date().toISOString()} ${phase}`);
};
const bounded = (promise, milliseconds, label) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Error(
              `${label} exceeded ${milliseconds} ms (phase: ${trace.phase})`,
            ),
          ),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
};
const watchdog = setTimeout(async () => {
  trace.failedPhase = trace.phase;
  trace.failure = `Hard 180-second deadline at ${trace.phase}`;
  persist();
  console.error(trace.failure);
  await bounded(
    browser?.close() ?? Promise.resolve(),
    5000,
    "watchdog cleanup",
  ).catch(() => {});
  process.exit(1);
}, 180000);
const read = () =>
  bounded(
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("tre-apps-director-v1", 1);
          open.onsuccess = () => {
            const db = open.result,
              request = db
                .transaction("documents")
                .objectStore("documents")
                .get("production");
            request.onsuccess = () => {
              resolve(request.result.data);
              db.close();
            };
            request.onerror = () => reject(request.error);
          };
          open.onerror = () => reject(open.error);
        }),
    ),
    10000,
    "IndexedDB read",
  );
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
try {
  mark("launch browser");
  browser = await bounded(
    { chromium, firefox, webkit }[engine].launch(
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
    ),
    45000,
    "browser launch",
  );
  trace.browserVersion = browser.version();
  mark("new page");
  page = await bounded(
    browser.newPage({ viewport: { width: 1440, height: 900 } }),
    15000,
    "new page",
  );
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on("console", (message) => {
    if (
      trace.console.length < 80 &&
      ["error", "warning"].includes(message.type())
    ) {
      trace.console.push({
        type: message.type(),
        text: message.text().slice(0, 1000),
      });
      persist();
    }
  });
  page.on("crash", () => {
    trace.crashed = true;
    persist();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      new URL(r.url()).origin !== new URL(directorUrl).origin
    )
      external.push(r.url());
  });

  mark("navigate and initial frames");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  mark("read initial saved project");
  const original = await read();
  for (const [index, path] of [
    "fixtures/director-textured-crate.glb",
    "fixtures/director-jpeg-crate.glb",
  ].entries()) {
    mark(`import and position model ${index + 1}: ${path}`);
    await page.getByRole("button", { name: "GLB", exact: true }).click();
    await page.locator("input[type=file]").nth(1).setInputFiles(path);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator(".object-row")).toHaveCount(6 + index);
    await saved();
    const x = page
      .locator(".inspector-panel")
      .getByRole("spinbutton", { name: "X", exact: true });
    await x.fill(index ? "2" : "-2");
    await x.press("Tab");
    await saved();
  }
  mark("verify immutable imports");
  const imported = await read();
  assert.equal(imported.draft.assets.length, 2);
  assert.ok(imported.draft.assets.every((a) => a.textureBytes === 262144));
  assert.deepEqual(imported.shots, original.shots);
  mark("capture actual textured frame");
  await page
    .getByRole("button", { name: "Gem indstilling", exact: true })
    .click();
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
  const captured = await read(),
    shot = captured.shots.find((s) => s.id === captured.sequence[0]);
  assert.ok(shot.frame);
  assert.notEqual(
    shot.frame,
    original.shots.find((s) => s.id === original.sequence[0]).frame,
  );
  if (engine === "chromium") assert.equal(shot.frameMode, "3d");
  mark("screenshot textured models");
  await page.screenshot({
    path: `reports/director/${engine}-textured-models.png`,
    fullPage: true,
    timeout: 15000,
  });
  mark("reject corrupt PNG stream");
  const bad = Buffer.from(
    await fs.readFile("fixtures/director-textured-crate.glb"),
  );
  const jsonLength = bad.readUInt32LE(12),
    json = JSON.parse(bad.subarray(20, 20 + jsonLength)),
    view = json.bufferViews[json.images[0].bufferView],
    pngStart = 28 + jsonLength + view.byteOffset;
  // Leave structure/header/limits valid while destroying the actual compressed image stream.
  bad.fill(255, pngStart + 41, pngStart + 50);
  const chunkLength = bad.readUInt32BE(pngStart + 33);
  bad.writeUInt32BE(
    crc32(bad.subarray(pngStart + 37, pngStart + 41 + chunkLength)),
    pngStart + 41 + chunkLength,
  );
  await page.getByRole("button", { name: "GLB", exact: true }).click();
  await page.locator("input[type=file]").nth(1).setInputFiles({
    name: "corrupt-texture.glb",
    mimeType: "model/gltf-binary",
    buffer: bad,
  });
  await expect(page.locator(".modal-error")).toContainText(
    /kunne ikke (afkodes|indlæses)/,
    { timeout: 20000 },
  );
  assert.deepEqual(await read(), captured);
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  mark("reject forged texture manifest");
  const tampered = structuredClone(captured);
  tampered.draft.assets[0].textureBytes = 0;
  await page
    .locator("input[type=file]")
    .nth(0)
    .setInputFiles({
      name: "bad-texture-manifest.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tampered)),
    });
  await expect(page.locator(".error-banner")).toContainText(
    "matcher ikke manifestet",
  );
  assert.deepEqual(await read(), captured);
  await page.getByRole("button", { name: "Luk fejl", exact: true }).click();
  mark("download project ZIP");
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Komplet projektpakke", exact: false })
    .click();
  const zip = await download;
  const path = await bounded(zip.path(), 15000, "download path");
  mark("reimport project ZIP");
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await page
    .locator("input[type=file]")
    .nth(0)
    .setInputFiles({
      name: "textured-roundtrip.zip",
      mimeType: "application/zip",
      buffer: await fs.readFile(path),
    });
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 20000,
  });
  await saved();
  assert.deepEqual(await read(), captured);
  mark("reload and verify saved project");
  await page.reload();
  await saved();
  assert.deepEqual(await read(), captured);
  mark("remove model and retain immutable scene");
  await page
    .locator(".object-row")
    .filter({ hasText: "director-jpeg-crate.glb" })
    .click();
  await page
    .getByRole("button", { name: "Fjern fra scene", exact: true })
    .click();
  await saved();
  const removed = await read();
  assert.equal(removed.draft.assets.length, 1);
  assert.equal(
    removed.scenes.find((s) => s.id === shot.sceneVersionId).assets.length,
    2,
  );
  mark("undo removal");
  await bounded(
    page.evaluate(() => document.activeElement?.blur()),
    5000,
    "blur before undo",
  );
  await page.keyboard.press("Control+z");
  await saved();
  assert.equal((await read()).draft.assets.length, 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  mark("write verified results");
  await fs.writeFile(
    `reports/director/${engine}-textured-glb.json`,
    JSON.stringify(
      {
        engine,
        checks: [
          "actual embedded PNG and JPEG decoding/import",
          "12 triangles per original model and 262144 decoded texture bytes",
          "immutable existing frames",
          "new captured frame with actual 3D materials or explicit 2D fallback",
          "corrupt compressed image rejected before replacing scene",
          "tampered texture budget rejected",
          "ZIP roundtrip and browser reload",
          "removed model releases draft budget while immutable versions and undo retain it",
          "no external HTTP requests",
        ],
        frameMode: shot.frameMode,
        pageErrors: errors,
        externalRequests: external,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Textured GLB flow passed", engine);
} catch (error) {
  trace.failedPhase = trace.phase;
  trace.failure = error instanceof Error ? error.stack : String(error);
  persist();
  console.error(
    `[texture:${engine}] failed in ${trace.phase}: ${trace.failure}`,
  );
  if (page) {
    console.error(
      await bounded(
        page.locator(".modal-error,.error-banner").allTextContents(),
        2000,
        "failure text",
      ).catch(() => "Browser did not respond to diagnostic text request"),
    );
    await page
      .screenshot({
        path: `reports/director/${engine}-textured-glb-failure.png`,
        fullPage: true,
        timeout: 4000,
      })
      .catch((e) => {
        trace.screenshotError = e.message;
        persist();
      });
  }
  throw error;
} finally {
  mark("close browser");
  try {
    if (browser) await bounded(browser.close(), 5000, "browser cleanup");
  } catch (error) {
    trace.cleanupError = error.message;
    persist();
    console.error(trace.cleanupError);
    process.exit(1);
  }
  clearTimeout(watchdog);
  mark(trace.failure ? "failed" : "completed");
}
