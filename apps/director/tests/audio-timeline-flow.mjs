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
const engine = process.env.AUDIO_TIMELINE_ENGINE ?? "chromium";
const expect = baseExpect.configure({ timeout: 20000 });
const require = createRequire(import.meta.url);
const axe = createRequire(require.resolve("@axe-core/playwright"))(
  "axe-core",
).source;
const watchdog = setTimeout(() => {
  console.error("Audio timeline exceeded 180 seconds");
  process.exit(1);
}, 180000);
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
const errors = [],
  scans = [],
  measurements = [];
page.on("pageerror", (e) => errors.push(e.message));
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(Error("IndexedDB timeout")),
            10000,
          ),
          req = indexedDB.open("tre-apps-director-v1", 1);
        req.onerror = () => {
          clearTimeout(timer);
          reject(req.error);
        };
        req.onsuccess = () => {
          const db = req.result,
            doc = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          doc.onerror = () => {
            clearTimeout(timer);
            db.close();
            reject(doc.error);
          };
          doc.onsuccess = () => {
            clearTimeout(timer);
            db.close();
            resolve(doc.result.data);
          };
        };
      }),
  );
const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function media(id, seconds, hz) {
  const rate = 12000,
    samples = rate * seconds,
    bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(
      Math.round(4000 * Math.sin((i * 2 * Math.PI * hz) / rate)),
      44 + 2 * i,
    );
  return {
    id,
    name: id === "voice" ? "Min fortællerstemme.wav" : "Mit eget musikspor.wav",
    kind: "audio",
    mime: "audio/wav",
    dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    durationFrames: seconds * 24,
    source: "Synthetic PCM verification fixture",
    rights: "owned",
  };
}
const scan = async (name) => {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  scans.push({ name, violations });
  assert.deepEqual(violations, []);
};
const bar = (kind) => page.locator(`[data-audio-kind="${kind}"]`);
const measure = async (kind, start, end) => {
  const actual = await bar(kind).evaluate((el) => {
    const parent = el.getBoundingClientRect(),
      span = el.querySelector(".audio-interval"),
      box = span?.getBoundingClientRect();
    return box
      ? {
          left: (box.left - parent.left) / parent.width,
          width: box.width / parent.width,
          path: span.querySelector("path").getAttribute("d"),
        }
      : null;
  });
  assert(actual);
  assert(
    Math.abs(actual.left - start / 456) < 0.0015,
    `actual ${kind} left matches timeline frame`,
  );
  assert(
    Math.abs(actual.width - (end - start) / 456) < 0.0015,
    `actual ${kind} width matches audible duration`,
  );
  measurements.push({ kind, start, end, ...actual });
  return actual;
};
const edit = async (label, value) => {
  const input = page.getByRole("spinbutton", { name: label, exact: true });
  await input.fill(value);
  await input.press("Tab");
  await saved();
};
const openVoice = () => page.locator(".audio-name").first().click();
const close = () =>
  page.getByRole("button", { name: "Luk dialog", exact: true }).click();
try {
  console.log(
    "Audio timeline",
    engine,
    "real PCM, source trim and crossfade timing",
  );
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const project = await read();
  project.title = "Lyd med præcis placering";
  project.sequence = project.sequence.slice(0, 2);
  for (const [index, id] of project.sequence.entries()) {
    const shot = project.shots.find((s) => s.id === id);
    shot.durationFrames = 240;
    shot.transitionFrames = index ? 24 : 0;
  }
  project.media.push(media("voice", 8, 440), media("music", 12, 220));
  project.voice = {
    mediaId: "voice",
    volume: 0.8,
    startFrame: 72,
    sourceIn: 48,
    fadeFrames: 24,
    duck: false,
  };
  project.music = {
    mediaId: "music",
    volume: 0.5,
    startFrame: 408,
    sourceIn: 0,
    fadeFrames: 120,
    duck: true,
  };
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "precise-audio.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  await expect(page.locator(".audio-name").first()).toContainText(
    "00:03:00 – 00:09:00",
  );
  await expect(page.locator(".audio-name").last()).toContainText(
    "00:17:00 – 00:19:00",
  );
  const original = await read();
  assert.equal(
    (await measure("voice", 72, 216)).path,
    "M 0 13 L 24 2 L 120 2 L 144 13",
  );
  assert.equal(
    (await measure("music", 408, 456)).path,
    "M 0 13 L 24 2 L 24 2 L 48 13",
  );
  await page
    .getByRole("slider", { name: "Afspilningsposition", exact: true })
    .evaluate((el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(el, "96");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(page.locator(".playback-frame")).toHaveAttribute(
    "data-review-frame",
    "96",
  );
  await expect
    .poll(() =>
      page
        .locator('audio[data-preview-channel="voice"]')
        .evaluate((el) => el.currentTime),
    )
    .toBe(3);
  const audioDuration = await page
    .locator('audio[data-preview-channel="voice"]')
    .evaluate((el) => el.duration);
  assert.equal(
    audioDuration,
    8,
    "native browser decoded the actual source WAV",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".timeline-section").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await measure("voice", 72, 216);
    await measure("music", 408, 456);
    await scan(name);
    await expect(page.locator(".toast:not(.working)")).toHaveCount(0);
    await page.screenshot({
      path: `reports/director/${engine}-${name}-audio-timeline.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openVoice();
  await edit("Start i lydfil (sek.)", "7");
  await close();
  await expect(page.locator(".audio-name").first()).toContainText(
    "00:03:00 – 00:04:00",
  );
  assert.equal(
    (await measure("voice", 72, 96)).path,
    "M 0 13 L 12 2 L 12 2 L 24 13",
  );
  await openVoice();
  await edit("Start på tidslinje (sek.)", "20");
  await close();
  await expect(page.locator(".audio-name").first()).toContainText(
    "Ligger efter filmens slutning",
  );
  await expect(bar("voice").locator(".audio-interval")).toHaveCount(0);
  await expect(bar("voice")).toHaveAttribute(
    "aria-label",
    /Sporet høres ikke i denne klipning/,
  );
  await scan("outside-film");
  const outside = await read();
  assert.equal(outside.voice.startFrame, 480);
  assert.equal(
    outside.media.find((m) => m.id === "voice").sha256,
    project.media.find((m) => m.id === "voice").sha256,
  );
  await openVoice();
  await edit("Start på tidslinje (sek.)", "3");
  await close();
  await measure("voice", 72, 96);
  await page
    .getByRole("slider", { name: "Voiceover niveau", exact: true })
    .focus();
  await page.keyboard.press("Home");
  await saved();
  await expect(page.locator(".audio-name").first()).toContainText("lydløs");
  await page.getByRole("button", { name: "Fjern voice", exact: true }).click();
  await saved();
  await expect(bar("voice")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fortryd (⌘/Ctrl Z)", exact: true })
    .click();
  await saved();
  await measure("voice", 72, 96);
  const final = await read();
  assert.equal(hash(final.scenes), hash(original.scenes));
  assert.equal(hash(final.shots), hash(original.shots));
  assert.equal(hash(final.sequenceVersions), hash(original.sequenceVersions));
  await page.reload();
  await saved();
  assert.equal(hash(await read()), hash(final));
  await measure("voice", 72, 96);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-audio-timeline-flow.json`,
    JSON.stringify(
      {
        engine,
        browser: browser.version(),
        nativeWavDuration: audioDuration,
        filmFrames: 456,
        measurements,
        scans,
        errors,
        checks: [
          "actual CSS placement matches trimmed audio interval at all three widths",
          "actual native WAV decode and source seek match the visible interval",
          "crossfade-shortened film end and symmetric fade clamp",
          "out-of-film track stays editable and has no fake segment",
          "zero gain is labeled",
          "remove and undo restore the track",
          "saved immutable scene/shot/sequence history stays intact",
          "reload retains exact project",
        ],
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Audio timeline passed", engine);
} catch (error) {
  await page
    .screenshot({
      path: `reports/director/${engine}-audio-timeline-failure.png`,
      timeout: 4000,
    })
    .catch(() => {});
  throw error;
} finally {
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Browser cleanup timeout")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
  }
}
