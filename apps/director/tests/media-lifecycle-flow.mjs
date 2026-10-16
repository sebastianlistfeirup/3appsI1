import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const expect = baseExpect.configure({ timeout: 20000 });
const engine = process.env.LIFECYCLE_ENGINE ?? "chromium";
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "director-lifecycle-"),
);
const report = { engine, phases: [], checks: [], scans: [], errors: [] };
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-media-lifecycle.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("Director media lifecycle:", engine, name);
};
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=640x360:r=24:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-threads",
    "2",
    "-t",
    "2",
    `${directory}/clip.mp4`,
  ],
  { timeout: 20000 },
);
const watchdog = setTimeout(() => process.exit(1), 240000);
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
await page.addInitScript(() => {
  const state = (window.__mediaResources = {
    elements: [],
    readers: [],
    images: [],
    urls: new Set(),
    bitmaps: [],
    contexts: [],
    held: [],
    holdMetadata: false,
    holdBitmaps: false,
    metadataSuppressed: 0,
    filesAborted: 0,
  });
  const create = document.createElement.bind(document);
  document.createElement = function (tag, ...args) {
    const element = create(tag, ...args);
    if (["video", "audio"].includes(String(tag).toLowerCase())) {
      state.elements.push(element);
      element.addEventListener(
        "loadedmetadata",
        (event) => {
          if (
            state.holdMetadata &&
            element.getAttribute("src")?.startsWith("blob:")
          ) {
            state.metadataSuppressed++;
            event.stopImmediatePropagation();
          }
        },
        true,
      );
    }
    return element;
  };
  const NativeReader = window.FileReader;
  window.FileReader = class extends NativeReader {
    constructor() {
      super();
      state.readers.push(this);
    }
    abort() {
      state.filesAborted++;
      super.abort();
    }
  };
  const NativeImage = window.Image;
  window.Image = function (...args) {
    const element = new NativeImage(...args);
    state.images.push(element);
    return element;
  };
  window.Image.prototype = NativeImage.prototype;
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
    if (state.holdBitmaps)
      await new Promise((resolve) => state.held.push(resolve));
    return image;
  };
  const NativeAudio = window.AudioContext;
  window.AudioContext = class extends NativeAudio {
    constructor(...args) {
      super(...args);
      state.contexts.push(this);
    }
  };
});
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = () =>
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
  );
const resources = () =>
  page.evaluate(() => {
    const r = window.__mediaResources;
    return {
      media: r.elements.length,
      detachedSources: r.elements
        .filter(
          (element) => !element.isConnected && element.getAttribute("src"),
        )
        .map((element) => ({
          type: element.tagName,
          source: element.getAttribute("src").slice(0, 50),
          state: element.readyState,
        })),
      detachedPlaying: r.elements.filter(
        (element) => !element.isConnected && !element.paused,
      ).length,
      liveUrls: [...r.urls],
      loadingFiles: r.readers.filter(
        (reader) => reader.readyState === FileReader.LOADING,
      ).length,
      retainedImages: r.images.filter((image) => image.getAttribute("src"))
        .length,
      bitmaps: r.bitmaps.length,
      openBitmaps: r.bitmaps.filter((item) => !item.closed).length,
      audioContexts: r.contexts.map((context) => context.state),
      metadataSuppressed: r.metadataSuppressed,
    };
  });
try {
  await phase(
    "load editor and cancel an actual decoded clip before metadata admission",
  );
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const original = await read();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Shot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importér billede eller klip", exact: true })
    .click();
  await page.evaluate(() => {
    window.__mediaResources.holdMetadata = true;
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${directory}/clip.mp4`);
  await expect
    .poll(async () => (await resources()).metadataSuppressed)
    .toBeGreaterThan(0);
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Afbryd medieimport", exact: true }),
    ).toBeVisible();
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          iframes: false,
        })
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((node) => node.target),
      })),
    );
    report.scans.push({ name, violations });
    assert.deepEqual(violations, []);
    await page.screenshot({
      path: `reports/director/${engine}-media-cancel-${name}.png`,
    });
  }
  await page.getByRole("button", { name: "Luk dialog", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Afbryd medieimport", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Medieimporten er afbrudt. Projektet er bevaret.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(resources).toMatchObject({
    detachedSources: [],
    detachedPlaying: 0,
    liveUrls: [],
    loadingFiles: 0,
  });
  assert.deepEqual(await read(), original);
  report.checks.push(
    "cancel after actual native metadata decode releases source/object URL and preserves exact project",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await phase(
    "timeout releases native decoder and successful retry remains possible",
  );
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${directory}/clip.mp4`);
  await expect(
    page.getByText("Mediet kunne ikke aflæses inden 10 sekunder", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect
    .poll(resources)
    .toMatchObject({ detachedSources: [], liveUrls: [], loadingFiles: 0 });
  assert.deepEqual(await read(), original);
  await page.evaluate(() => {
    window.__mediaResources.holdMetadata = false;
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${directory}/clip.mp4`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".shot-thumbnail video")).toHaveCount(1);
  await saved();
  await expect
    .poll(resources)
    .toMatchObject({ detachedSources: [], liveUrls: [], loadingFiles: 0 });
  report.checks.push(
    "ten-second native timeout releases decoder; same file imports successfully afterwards",
  );
  await phase(
    "cancel delayed native GLB ImageBitmap and dispose the late parse result",
  );
  const beforeGlb = await read();
  await page.getByRole("button", { name: "GLB", exact: true }).click();
  await page.evaluate(() => {
    window.__mediaResources.holdBitmaps = true;
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles("fixtures/director-textured-crate.glb");
  await expect
    .poll(() => page.evaluate(() => window.__mediaResources.held.length))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Afbryd medieimport", exact: true })
    .click();
  await expect(
    page.getByText("Medieimporten er afbrudt. Projektet er bevaret.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    const state = window.__mediaResources;
    state.holdBitmaps = false;
    state.held.splice(0).forEach((release) => release());
  });
  await expect
    .poll(resources)
    .toMatchObject({ openBitmaps: 0, liveUrls: [], retainedImages: 0 });
  assert.deepEqual(await read(), beforeGlb);
  report.checks.push(
    "late actual GLB parse after cancellation closes ImageBitmap and URLs without adding an asset",
  );
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await phase(
    "repeated native preview mount/unmount releases retired media and closes audio graph",
  );
  for (let repeat = 0; repeat < 4; repeat++) {
    await page
      .getByRole("button", { name: "Afspil sekvens", exact: true })
      .click();
    await expect(page.locator(".playback-frame")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".playback-frame video")
          .evaluateAll((videos) => videos.some((video) => !video.paused)),
      )
      .toBe(true);
    await page.locator(".shot-card").nth(1).click();
    await expect(page.locator(".playback-frame")).toHaveCount(0);
    await expect
      .poll(resources)
      .toMatchObject({ detachedSources: [], detachedPlaying: 0 });
    await page.locator(".shot-card").first().click();
  }
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".production-library")).toBeVisible();
  await expect.poll(resources).toMatchObject({
    detachedSources: [],
    detachedPlaying: 0,
    liveUrls: [],
    loadingFiles: 0,
    retainedImages: 0,
    openBitmaps: 0,
    audioContexts: ["closed"],
  });
  report.resources = await resources();
  report.checks.push(
    "four actual video/audio previews leave no detached sources/playing media; navigation closes AudioContext",
  );
  assert.deepEqual(report.errors, []);
  await phase("passed");
} catch (error) {
  report.failure = String(error.stack ?? error);
  report.resources = await resources().catch(() => null);
  await page
    .screenshot({
      path: `reports/director/${engine}-media-lifecycle-failure.png`,
    })
    .catch(() => {});
  await phase("failed");
  throw error;
} finally {
  clearTimeout(watchdog);
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await fs.rm(directory, { recursive: true, force: true });
}
