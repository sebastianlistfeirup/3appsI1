import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const engine = process.env.CONTINUITY_ENGINE ?? "chromium",
  expect = baseExpect.configure({ timeout: 20000 });
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const watchdog = setTimeout(() => {
  console.error("Continuity flow exceeded 240 seconds", engine);
  process.exit(1);
}, 240000);
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  }),
  page = await context.newPage();
const report = {
  engine,
  browser: browser.version(),
  stages: [],
  scans: [],
  errors: [],
  checks: [],
};
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => report.errors.push(error.message));
const stage = async (name) => {
  console.log("Continuity", engine, name);
  report.stages.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-continuity-flow.json`,
    JSON.stringify(report, null, 2),
  );
};
await page.addInitScript(() => {
  const state = (window.reviewResources = {
    contexts: [],
    bitmaps: [],
    urls: new Set(),
    held: [],
    holdNext: 0,
    failNextCanvas: 0,
  });
  const getContext = HTMLCanvasElement.prototype.getContext,
    toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const result = getContext.call(this, type, ...args);
    if (result && type.includes("webgl") && !state.contexts.includes(result))
      state.contexts.push(result);
    return result;
  };
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    if (state.failNextCanvas) {
      state.failNextCanvas--;
      throw Error("Kontrolleret frame-fejl i browserprøven");
    }
    return toDataURL.apply(this, args);
  };
  const bitmap = window.createImageBitmap.bind(window);
  window.createImageBitmap = async (...args) => {
    const image = await bitmap(...args),
      item = { image, closed: false };
    state.bitmaps.push(item);
    const close = image.close.bind(image);
    image.close = () => {
      item.closed = true;
      close();
    };
    if (state.holdNext > 0) {
      state.holdNext--;
      await new Promise((resolve) => state.held.push(resolve));
    }
    return image;
  };
  const createUrl = URL.createObjectURL.bind(URL),
    revokeUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = createUrl(blob);
    state.urls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    state.urls.delete(url);
    revokeUrl(url);
  };
});
const saved = (target = page) =>
  expect(target.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = (target = page) =>
  target.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(Error("IndexedDB read timeout")),
            10000,
          ),
          open = indexedDB.open("tre-apps-director-v1", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          request.onsuccess = () => {
            clearTimeout(timeout);
            resolve(request.result.data);
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
const open = (target = page) =>
  target.getByRole("button", { name: "Sceneversioner", exact: true }).click();
const close = (target = page) =>
  target.getByRole("button", { name: "Luk dialog", exact: true }).click();
const compare = async (number = 1, target = page) => {
  await target
    .getByRole("button", { name: new RegExp(`^Sammenlign shot ${number}:`) })
    .click();
  if (target === page)
    await target
      .getByRole("group", { name: "Kandidatens visning" })
      .getByRole("button", { name: "Kamerabillede", exact: true })
      .click();
};
const candidate = (target = page) =>
  target.locator(".continuity-frame-pair figure").nth(1).locator("img");
const ready = async (target = page) => {
  await expect(candidate(target)).toBeVisible();
  await expect
    .poll(() =>
      candidate(target).evaluate(
        (image) =>
          image.complete &&
          image.naturalWidth === 1280 &&
          image.naturalHeight === 720,
      ),
    )
    .toBe(true);
};
const apply = (target = page) =>
  target.getByRole("button", {
    name: "Brug arbejdsscenen til dette shot",
    exact: true,
  });
const resources = () =>
  page.evaluate(() => ({
    liveContexts: window.reviewResources.contexts.filter(
      (context) => !context.isContextLost(),
    ).length,
    openBitmaps: window.reviewResources.bitmaps.filter((item) => !item.closed)
      .length,
    urls: window.reviewResources.urls.size,
    held: window.reviewResources.held.length,
  }));
const release = () =>
  page.evaluate(() => {
    window.reviewResources.held.splice(0).forEach((resolve) => resolve());
  });
const unchanged = async (project) =>
  assert.equal(hash(await read()), hash(project), "comparison is read-only");
const scan = async (name) => {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
      })
    ).violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  );
  report.scans.push({ name, violations });
  assert.deepEqual(violations, []);
};
const editObject = async (target, value) => {
  await target.getByRole("button", { name: /^Kaptajn Liv Karakter/ }).click();
  await target
    .locator(".inspector-panel")
    .getByRole("spinbutton", { name: "X", exact: true })
    .fill(String(value));
  await target
    .locator(".inspector-panel")
    .getByRole("spinbutton", { name: "X", exact: true })
    .press("Tab");
  await saved(target);
};
try {
  await stage(
    "locked frame and rendered candidate with no persistence side effect",
  );
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const original = await read();
  await editObject(page, 3.4);
  const changed = await read();
  await open();
  await compare();
  await page
    .getByRole("group", { name: "Kandidatens visning" })
    .getByRole("button", { name: "Kamerabillede", exact: true })
    .click();
  await ready();
  const native3d = await page
    .getByText("Kamerabillede · ikke gemt til shot", { exact: true })
    .isVisible();
  report.native3d = native3d;
  await unchanged(changed);
  assert.equal(
    await page
      .locator(".continuity-frame-pair figure")
      .first()
      .locator("img")
      .getAttribute("src"),
    original.shots.find((shot) => shot.id === original.sequence[0]).frame,
  );
  const firstCandidate = await candidate().getAttribute("src");
  assert.notEqual(
    firstCandidate,
    original.shots.find((shot) => shot.id === original.sequence[0]).frame,
  );
  await expect(page.locator(".continuity-changes")).toContainText(
    "3,4 / 0 / 0 m",
  );
  await expect
    .poll(async () => (await resources()).liveContexts)
    .toBeLessThanOrEqual(1);
  await expect(page.locator(".toast:not(.working)")).toHaveCount(0);
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".continuity-comparison h3").scrollIntoViewIfNeeded();
    await scan(name);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-continuity.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Luk sammenligning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Sammenlign shot 1:/ }),
  ).toBeFocused();
  await unchanged(changed);
  await stage(
    "native canvas failure preserves locked frame; retry cleans GPU context",
  );
  await compare();
  await ready();
  await page
    .getByRole("group", { name: "Kandidatens visning" })
    .getByRole("button", { name: "2D-plan", exact: true })
    .click();
  await ready();
  await page.evaluate(() => {
    window.reviewResources.failNextCanvas = 1;
  });
  await page
    .getByRole("group", { name: "Kandidatens visning" })
    .getByRole("button", { name: "Kamerabillede", exact: true })
    .click();
  await expect(
    page.locator(".continuity-comparison").getByRole("alert"),
  ).toContainText("Kontrolleret frame-fejl");
  await expect(apply()).toBeDisabled();
  await unchanged(changed);
  await page
    .getByRole("button", { name: "Prøv forhåndsvisning igen", exact: true })
    .click();
  await ready();
  await expect
    .poll(async () => (await resources()).liveContexts)
    .toBeLessThanOrEqual(1);
  await stage("approve only reviewed shot and preserve every previous version");
  const reviewed = await candidate().getAttribute("src");
  await apply().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
  const accepted = await read();
  const latest = accepted.shots.find(
    (shot) => shot.id === accepted.sequence[0],
  );
  assert.equal(
    hash(latest.frame),
    hash(reviewed),
    "approved frame bytes must match the actual new shot",
  );
  report.accepted = {
    mode: latest.frameMode,
    renderer: latest.frameRenderer,
    previewSha256: hash(reviewed),
    acceptedSha256: hash(latest.frame),
    priorShot: changed.sequence[0],
    nextShot: latest.id,
  };
  assert.equal(latest.previousShotId, changed.sequence[0]);
  assert.deepEqual(accepted.sequence.slice(1), changed.sequence.slice(1));
  assert.equal(accepted.scenes.length, changed.scenes.length + 1);
  for (const old of changed.shots)
    assert.deepEqual(
      accepted.shots.find((shot) => shot.id === old.id),
      old,
    );
  for (const old of changed.scenes)
    assert.deepEqual(
      accepted.scenes.find((scene) => scene.id === old.id),
      old,
    );
  await stage("chosen preview mode is used for the actual committed frame");
  await open();
  await compare(2);
  await ready();
  await page
    .getByRole("group", { name: "Kandidatens visning" })
    .getByRole("button", { name: "2D-plan", exact: true })
    .click();
  await ready();
  if (
    original.shots.find((shot) => shot.id === original.sequence[1])
      .frameMode !== "plan"
  )
    await expect(page.locator(".continuity-type-note")).toBeVisible();
  else await expect(page.locator(".continuity-type-note")).toHaveCount(0);
  await apply().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  const plan = await read();
  assert.equal(
    plan.shots.find((shot) => shot.id === plan.sequence[1]).frameMode,
    "plan",
  );
  assert.equal(
    plan.shots.find((shot) => shot.id === plan.sequence[1]).frameRenderer,
    "director-plan-2.0",
  );
  await stage(
    native3d
      ? "real textured GLB preview cancellation and late resource disposal"
      : "textured GLB scene rendered in explicit 2D fallback",
  );
  await page.getByRole("button", { name: "GLB", exact: true }).click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles("fixtures/director-textured-crate.glb");
  await expect(page.locator(".object-row")).toHaveCount(6);
  await saved();
  await expect.poll(async () => (await resources()).urls).toBe(0);
  await expect
    .poll(async () => {
      const current = await resources(),
        editorHas3D = await page.locator("canvas.scene-canvas").isVisible();
      return (
        current.openBitmaps === (editorHas3D ? 1 : 0) &&
        current.liveContexts <= 1 &&
        current.urls === 0
      );
    })
    .toBe(true);
  const baselineResources = await resources();
  assert.equal(baselineResources.held, 0);
  assert.equal(baselineResources.urls, 0);
  assert.ok(baselineResources.liveContexts <= 1);
  report.editorResourceBaseline = baselineResources;
  const modelProject = await read();
  if (native3d) {
    await open();
    await page.evaluate(() => {
      window.reviewResources.holdNext = 1;
    });
    await compare();
    await expect.poll(async () => (await resources()).held).toBe(1);
    await expect(apply()).toBeDisabled();
    await unchanged(modelProject);
    await page
      .getByRole("button", { name: "Afbryd forhåndsvisning", exact: true })
      .click();
    await expect(
      page.locator(".continuity-comparison").getByRole("alert"),
    ).toContainText("afbrudt");
    await release();
    await expect.poll(resources).toEqual(baselineResources);
    await unchanged(modelProject);
    await page.evaluate(() => {
      window.reviewResources.holdNext = 1;
    });
    await page
      .getByRole("button", { name: "Prøv forhåndsvisning igen", exact: true })
      .click();
    await expect.poll(async () => (await resources()).held).toBe(1);
    await close();
    await release();
    await expect.poll(resources).toEqual(baselineResources);
    await unchanged(modelProject);
  } else {
    await open();
    await compare();
    await ready();
    await expect(
      page.getByText("2D-plan · ikke gemt til shot", { exact: true }),
    ).toBeVisible();
    await unchanged(modelProject);
    await close();
    await expect.poll(resources).toEqual(baselineResources);
  }
  await stage("a late candidate cannot replace a newer cross-tab scene");
  const other = await context.newPage();
  other.setDefaultTimeout(20000);
  await other.goto(directorUrl);
  await expect(other.locator(".object-row")).toHaveCount(6);
  await saved(other);
  await open();
  if (native3d)
    await page.evaluate(() => {
      window.reviewResources.holdNext = 1;
    });
  await compare();
  if (native3d) await expect.poll(async () => (await resources()).held).toBe(1);
  else await ready();
  await editObject(other, -4.2);
  const updated = await read(other);
  await expect(page.locator(".continuity-storage-note")).toContainText(
    "nyere version",
  );
  await expect(apply()).toBeDisabled();
  await scan("conflict");
  await page.locator(".continuity-storage-note").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `reports/director/${engine}-conflict-continuity.png`,
  });
  // Recovery export must retain this tab's local project, even while persistence is conflicted.
  const pendingDownload = page.waitForEvent("download");
  await page
    .locator(".continuity-storage-note")
    .getByRole("button", { name: "Gem lokal kopi", exact: true })
    .click();
  const recovery = await pendingDownload,
    recoveryPath = await recovery.path();
  assert.equal(
    hash(JSON.parse(await fs.readFile(recoveryPath, "utf8"))),
    hash(modelProject),
  );
  await page
    .locator(".continuity-storage-note")
    .getByRole("button", { name: "Genindlæs gemt version", exact: true })
    .click();
  await expect(page.locator(".continuity-storage-note")).toHaveCount(0);
  await expect(page.locator(".continuity-changes")).toContainText(
    "-4,2 / 0 / 0 m",
  );
  await ready();
  const newest = await candidate().getAttribute("src");
  await release();
  await expect.poll(resources).toEqual(baselineResources);
  assert.equal(hash(await candidate().getAttribute("src")), hash(newest));
  await unchanged(updated);
  await apply().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
  const crossTabAccepted = await read();
  assert.equal(
    hash(
      crossTabAccepted.shots.find(
        (shot) => shot.id === crossTabAccepted.sequence[0],
      ).frame,
    ),
    hash(newest),
  );
  report.crossTabAccepted = {
    previewSha256: hash(newest),
    acceptedSha256: hash(
      crossTabAccepted.shots.find(
        (shot) => shot.id === crossTabAccepted.sequence[0],
      ).frame,
    ),
  };
  await other.close();
  await stage("without WebGL the candidate is explicitly a 2D plan");
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  fallback.setDefaultTimeout(20000);
  fallback.on("pageerror", (error) => report.errors.push(error.message));
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes("webgl")
        ? null
        : getContext.call(this, type, ...args);
    };
  });
  await fallback.goto(directorUrl);
  await expect(fallback.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved(fallback);
  const fallbackOriginal = await read(fallback);
  await open(fallback);
  await compare(1, fallback);
  await ready(fallback);
  await expect(
    fallback.getByText("2D-plan · ikke gemt til shot", { exact: true }),
  ).toBeVisible();
  assert.equal(hash(await read(fallback)), hash(fallbackOriginal));
  await fallback.screenshot({
    path: `reports/director/${engine}-fallback-continuity.png`,
  });
  await close(fallback);
  await stage(
    "missing draft camera preserves the locked image and blocks approval",
  );
  const missing = structuredClone(fallbackOriginal);
  missing.draft.cameras.shift();
  missing.revision++;
  await fallback
    .locator("input[type=file]")
    .nth(0)
    .setInputFiles({
      name: "missing-draft-camera.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(missing)),
    });
  await saved(fallback);
  await expect
    .poll(async () => (await read(fallback)).draft.cameras.length)
    .toBe(4);
  await open(fallback);
  await compare(1, fallback);
  await expect(fallback.locator(".continuity-preview-status")).toContainText(
    "Kameraet mangler",
  );
  await expect(apply(fallback)).toBeDisabled();
  assert.equal(hash(await read(fallback)), hash(missing));
  assert.equal(
    await fallback
      .locator(".continuity-frame-pair figure")
      .first()
      .locator("img")
      .getAttribute("src"),
    fallbackOriginal.shots.find(
      (shot) => shot.id === fallbackOriginal.sequence[0],
    ).frame,
  );
  await fallback.close();
  assert.deepEqual(report.errors, []);
  report.resources = await resources();
  report.checks = [
    "actual before/after rendered pixels",
    "no persistence during preview",
    "three responsive axe scans plus storage-conflict scan",
    "native canvas failure/retry",
    `exact approved ${report.accepted.mode === "3d" ? "3D" : "2D"} frame committed`,
    "only selected shot revised",
    "chosen 2D mode preserved",
    native3d
      ? "textured GLB cancel/close releases native resources"
      : "GLB-containing scene renders an explicit 2D fallback without unused GPU/bitmap allocations",
    native3d
      ? "late actual decoder cannot override explicitly reloaded cross-tab scene"
      : "conflict blocks plan approval until explicit reload",
    "recovery JSON contains the current tab snapshot",
    "honest WebGL fallback",
    "missing camera preserves existing frame and blocks approval",
  ];
  await stage("passed");
} catch (error) {
  report.failure = String(error);
  await fs.writeFile(
    `reports/director/${engine}-continuity-flow.json`,
    JSON.stringify(report, null, 2),
  );
  await page
    .screenshot({
      path: `reports/director/${engine}-continuity-failure.png`,
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  let timeout;
  await Promise.race([
    browser.close(),
    new Promise((resolve) => {
      timeout = setTimeout(resolve, 10000);
    }),
  ]);
  clearTimeout(timeout);
  clearTimeout(watchdog);
}
