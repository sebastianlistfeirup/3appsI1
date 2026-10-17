import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { parseProject } from "@tre/scene-format";
const engine = process.env.JSON_RECOVERY_ENGINE ?? "chromium",
  expect = baseExpect.configure({ timeout: 30000 });
const report = { engine, steps: [], errors: [], accessibility: [] };
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const output = `reports/director/${engine}-json-recovery-flow.json`;
const step = async (name) => {
  console.log("JSON recovery", engine, name);
  report.steps.push({ name, at: new Date().toISOString() });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
};
const watchdog = setTimeout(() => {
  console.error("JSON recovery exceeded 240 seconds");
  process.exit(1);
}, 240000);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "director-json-recovery-"));
const source = parseProject(
  JSON.parse(await fs.readFile("fixtures/director-sample-render.json", "utf8")),
);
source.title = "Min store, portable JSON-backup";
const bytes = Buffer.alloc(44 + 48000 * 30 * 2);
bytes.write("RIFF", 0);
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(48000, 24);
bytes.writeUInt32LE(96000, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(bytes.length - 44, 40);
for (let i = 0; i < (bytes.length - 44) / 2; i++)
  bytes.writeInt16LE(
    Math.round(Math.sin((i * 2 * Math.PI * 440) / 48000) * 4000),
    44 + i * 2,
  );
const originalHash = createHash("sha256").update(bytes).digest("hex"),
  dataUrl = `data:audio/wav;base64,${bytes.toString("base64")}`;
source.media = Array.from({ length: 28 }, (_, i) => ({
  id: `recovery_audio_${i}`,
  name: `Min egen original ${i}.wav`,
  kind: "audio",
  mime: "audio/wav",
  dataUrl,
  bytes: bytes.length,
  sha256: originalHash,
  durationFrames: 720,
  source:
    "Real synthetic PCM fixture repeated under independent media identities",
  rights: "owned",
}));
const sourcePath = path.join(dir, "large-backup.json");
await fs.writeFile(sourcePath, JSON.stringify(source));
report.inputBytes = (await fs.stat(sourcePath)).size;
assert(
  report.inputBytes > 100 * 1024 * 1024 &&
    report.inputBytes < 150 * 1024 * 1024,
);
const oversizeJson = path.join(dir, "too-large.json"),
  oversizeZip = path.join(dir, "too-large.zip");
for (const [file, size] of [
  [oversizeJson, 150 * 1024 * 1024 + 1],
  [oversizeZip, 100 * 1024 * 1024 + 1],
]) {
  await fs.writeFile(file, "");
  await fs.truncate(file, size);
}
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
report.browser = browser.version();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (e) => report.errors.push(e.message));
await page.addInitScript(() => {
  const Native = window.Worker,
    read = File.prototype.arrayBuffer;
  const probe = (window.jsonProbe = {
    created: 0,
    terminated: 0,
    requests: [],
    reads: [],
    hold: false,
    held: 0,
    block: false,
    ticks: 0,
    maxGap: 0,
  });
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    probe.maxGap = Math.max(probe.maxGap, now - last);
    last = now;
    probe.ticks++;
  }, 20);
  File.prototype.arrayBuffer = function () {
    probe.reads.push(this.name);
    return read.call(this);
  };
  window.Worker = class extends Native {
    constructor(...args) {
      if (probe.block) throw Error("Controlled worker-start failure");
      super(...args);
      probe.created++;
      this.didTerminate = false;
      this.held = [];
    }
    postMessage(request, ...args) {
      probe.requests.push(request.kind);
      return super.postMessage(request, ...args);
    }
    set onmessage(fn) {
      super.onmessage = (event) => {
        if (probe.hold && event.data?.type === "imported") {
          this.held.push(() => fn(event));
          probe.held++;
        } else fn(event);
      };
    }
    terminate() {
      if (!this.didTerminate) {
        this.didTerminate = true;
        probe.terminated++;
        probe.held -= this.held.length;
        this.held = [];
      }
      return super.terminate();
    }
  };
});
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const summary = (key = "production") =>
  page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(Error("IndexedDB timeout")),
            15000,
          ),
          req = indexedDB.open("tre-apps-director-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            q = db.transaction("documents").objectStore("documents").get(key);
          q.onerror = () => reject(q.error);
          q.onsuccess = () => {
            clearTimeout(timer);
            const p = q.result.data;
            db.close();
            resolve({
              id: p.id,
              title: p.title,
              revision: p.revision,
              media: p.media.map((m) => ({
                id: m.id,
                bytes: m.bytes,
                sha256: m.sha256,
                urlLength: m.dataUrl.length,
              })),
              sequence: p.sequence,
              shots: p.shots.map((s) => ({
                id: s.id,
                version: s.version,
                sceneVersionId: s.sceneVersionId,
              })),
            });
          };
        };
      }),
    key,
  );
try {
  await step("initial film and actual >100 MiB file");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5);
  await saved();
  const original = await summary();
  await page.evaluate(() => (window.jsonProbe.hold = true));
  await page.locator("input[type=file]").first().setInputFiles(sourcePath);
  await expect.poll(() => page.evaluate(() => window.jsonProbe.held)).toBe(1);
  assert(
    (await page.evaluate(() => window.jsonProbe.requests)).includes("json"),
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
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    );
    report.accessibility.push({ name, violations });
    assert.deepEqual(violations, []);
    await page.screenshot({
      path: `reports/director/${engine}-${name}-json-recovery.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page
    .getByRole("button", { name: "Afbryd projektpakke", exact: true })
    .click();
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  assert.deepEqual(await summary(), original);
  assert.equal(
    await page.evaluate(
      () => window.jsonProbe.created - window.jsonProbe.terminated,
    ),
    0,
  );
  await step(
    "cancel completed native parse/hash work before committing; current film retained",
  );
  await page.evaluate(() => {
    window.jsonProbe.hold = false;
    window.jsonProbe.maxGap = 0;
    window.jsonProbe.ticks = 0;
  });
  await page.locator("input[type=file]").first().setInputFiles(sourcePath);
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    source.title,
  );
  const imported = await summary();
  assert.equal(imported.media.length, 28);
  assert(
    imported.media.every(
      (m) => m.sha256 === originalHash && m.urlLength === dataUrl.length,
    ),
  );
  report.importResponsiveness = await page.evaluate(() => ({
    ticks: window.jsonProbe.ticks,
    maxGapMs: Math.round(window.jsonProbe.maxGap),
  }));
  assert(report.importResponsiveness.ticks > 2);
  await step(
    "download full editor JSON and independently verify every original",
  );
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Projekt-JSON", exact: false })
    .click();
  const file = await (await download).path();
  const roundtrip = parseProject(JSON.parse(await fs.readFile(file, "utf8")));
  assert.deepEqual(roundtrip, source);
  for (const item of roundtrip.media)
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(item.dataUrl.split(",")[1], "base64"))
        .digest("hex"),
      originalHash,
    );
  report.downloadBytes = (await fs.stat(file)).size;
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await step(
    "enforce each byte ceiling before File.arrayBuffer or worker creation",
  );
  for (const [file, label] of [
    [oversizeJson, "150 MiB"],
    [oversizeZip, "100 MiB"],
  ]) {
    const before = await page.evaluate(() => window.jsonProbe.created);
    await page.locator("input[type=file]").first().setInputFiles(file);
    await expect(page.locator(".error-banner")).toContainText(label);
    assert.equal(await page.evaluate(() => window.jsonProbe.created), before);
    assert.equal(
      (await page.evaluate(() => window.jsonProbe.reads)).includes(
        path.basename(file),
      ),
      false,
    );
    assert.deepEqual(await summary(), imported);
  }
  await step(
    "malformed JSON, bad media hash and unavailable worker keep the good project",
  );
  for (const [name, buffer, message] of [
    ["broken.json", Buffer.from('{"broken":'), "UTF-8 JSON"],
    [
      "bad-hash.json",
      Buffer.from(
        JSON.stringify({
          ...source,
          media: [{ ...source.media[0], sha256: "f".repeat(64) }],
        }),
      ),
      "checksum",
    ],
  ]) {
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({ name, mimeType: "application/json", buffer });
    await expect(page.locator(".error-banner")).toContainText(message);
    assert.deepEqual(await summary(), imported);
  }
  await page.evaluate(() => (window.jsonProbe.block = true));
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "blocked.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...source, media: [] })),
    });
  await expect(page.locator(".error-banner")).toContainText(
    "kunne ikke starte projektarbejdet i baggrunden",
  );
  await page.evaluate(() => (window.jsonProbe.block = false));
  assert.deepEqual(await summary(), imported);
  await step("library imports the same large backup as an independent film");
  await page.getByRole("button", { name: "Produktioner", exact: true }).click();
  await expect(page.locator(".production-card")).toHaveCount(1);
  await page.locator("input[type=file]").setInputFiles(sourcePath);
  await saved();
  const key = await page.evaluate(() =>
    localStorage.getItem("director-active-production"),
  );
  assert(
    key && key !== "production",
    "library creates a new document identity",
  );
  const copied = await summary(key);
  assert.notEqual(copied.id, imported.id);
  assert.deepEqual(copied.media, imported.media);
  assert.deepEqual(await summary(), imported);
  report.worker = await page.evaluate(() => ({
    created: window.jsonProbe.created,
    terminated: window.jsonProbe.terminated,
    requests: window.jsonProbe.requests,
    reads: window.jsonProbe.reads,
  }));
  assert.equal(report.worker.created, report.worker.terminated);
  assert(report.worker.requests.filter((kind) => kind === "json").length >= 4);
  await page.reload();
  await saved();
  assert.deepEqual(await summary(key), copied);
  assert.deepEqual(report.errors, []);
  report.checks = [
    ">100 MiB raw JSON accepted in editor and library within 150 MiB budget",
    "native worker parse/hash result cancelled before commit without data loss",
    "actual JSON download exactly restores all semantic project fields and binary hashes",
    "JSON and ZIP limits enforced before file reads",
    "invalid JSON/hash and worker failure retain the previous film",
    "separate library identity preserves the original",
    "reload retains every media reference",
  ];
  await step("passed");
} catch (error) {
  report.failure = error.stack;
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  await page
    .screenshot({
      path: `reports/director/${engine}-json-recovery-failure.png`,
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
    await fs.rm(dir, { recursive: true, force: true });
  }
}
