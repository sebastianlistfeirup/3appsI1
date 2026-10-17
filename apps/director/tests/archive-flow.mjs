import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 25000 });
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const engine = process.env.ARCHIVE_ENGINE ?? "chromium",
  report = {
    engine,
    phases: [],
    checks: [],
    accessibility: [],
    pageErrors: [],
  };
const output = `reports/director/${engine}-archive-flow.json`;
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log("Director archive:", engine, name);
};
const watchdog = setTimeout(() => {
  console.error("Archive flow exceeded 240 seconds");
  process.exit(1);
}, 240000);
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
page.setDefaultTimeout(25000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
await page.addInitScript(() => {
  const NativeWorker = window.Worker;
  window.archiveProbe = {
    hold: false,
    fail: false,
    created: 0,
    terminated: 0,
    live: 0,
    workerRequests: [],
    heartbeats: 0,
    maxGap: 0,
  };
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      if (window.archiveProbe.fail)
        throw Error("Kontrolleret fejl ved start af baggrundsarbejde");
      super(...args);
      this.closed = false;
      window.archiveProbe.created++;
      window.archiveProbe.live++;
    }
    postMessage(request, transfer) {
      window.archiveProbe.workerRequests.push(request.kind);
      if (window.archiveProbe.hold) return;
      super.postMessage(request, transfer);
    }
    terminate() {
      if (!this.closed) {
        this.closed = true;
        window.archiveProbe.terminated++;
        window.archiveProbe.live--;
      }
      return super.terminate();
    }
  };
  let prior = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (window.archiveProbe.measure) {
      window.archiveProbe.heartbeats++;
      window.archiveProbe.maxGap = Math.max(
        window.archiveProbe.maxGap,
        now - prior,
      );
    }
    prior = now;
  }, 16);
});
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const digest = (key = "production", normalize = false) =>
  page.evaluate(
    async ({ key, normalize }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("tre-apps-director-v1", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const value = await new Promise((resolve, reject) => {
        const r = db.transaction("documents").objectStore("documents").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      const project = value.data;
      if (normalize) {
        project.id = "identity";
        project.revision = 0;
      }
      const sorted = (value) =>
        Array.isArray(value)
          ? value.map(sorted)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((key) => [key, sorted(value[key])]),
              )
            : value;
      return [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(sorted(project))),
          ),
        ),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    { key, normalize },
  );
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
      targets: v.nodes.map((n) => n.target),
    })),
  );
  report.accessibility.push({ name, violations });
  assert.deepEqual(violations, []);
};
try {
  await phase("seed real original media and immutable history");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const glb = await fs.readFile("fixtures/director-textured-crate.glb");
  report.sources = await page.evaluate(
    async (model) => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open("tre-apps-director-v1", 1);
        r.onsuccess = () => resolve(r.result);
      });
      const record = await new Promise((resolve) => {
        const r = db
          .transaction("documents")
          .objectStore("documents")
          .get("production");
        r.onsuccess = () => resolve(r.result);
      });
      const p = record.data;
      p.title = "Store originaler · bevar versionerne";
      p.media = [];
      const stats = [];
      for (let index = 0; index < 2; index++) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1536;
        const context = canvas.getContext("2d"),
          pixels = context.createImageData(1536, 1536);
        let seed = 0x12345678 + index;
        for (let at = 0; at < pixels.data.length; at++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels.data[at] = at % 4 === 3 ? 255 : seed & 255;
        }
        context.putImageData(pixels, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        canvas.width = canvas.height = 0;
        const binary = atob(dataUrl.split(",")[1]),
          bytes = new Uint8Array(binary.length);
        for (let at = 0; at < bytes.length; at++)
          bytes[at] = binary.charCodeAt(at);
        const sha256 = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        p.media.push({
          id: `original_${index}`,
          kind: "image",
          name: `Original ${index + 1}.png`,
          mime: "image/png",
          dataUrl,
          sha256,
          bytes: bytes.length,
          source: "Seeded original test pattern",
          rights: "owned",
        });
        p.shots.find((shot) => shot.id === p.sequence[index]).mediaId =
          `original_${index}`;
        stats.push({ bytes: bytes.length, sha256 });
      }
      const sharedFrame = p.shots.find(
        (shot) => shot.id === p.sequence[0],
      ).frame;
      for (const shot of p.shots) shot.frame = sharedFrame;
      const asset = {
        id: "portable_model",
        name: "Original textured crate.glb",
        dataUrl: model.dataUrl,
        sha256: model.sha256,
        bytes: model.bytes,
        triangles: 12,
        textureBytes: 262144,
        source: "Original fixture",
        rights: "owned",
      };
      for (const scene of [...p.scenes, p.draft])
        scene.assets = [structuredClone(asset)];
      p.scenes.push({
        ...structuredClone(p.scenes[0]),
        id: "portable_scene",
        version: 3,
      });
      p.sequenceVersions = [
        {
          id: "portable_cut",
          version: 1,
          name: "Mit godkendte klip",
          createdAt: "2026-10-16T12:00:00.000Z",
          sequence: [...p.sequence],
          voice: p.voice,
          music: p.music,
          captions: p.captions,
        },
      ];
      record.revision++;
      await new Promise((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return stats;
    },
    {
      dataUrl: "data:model/gltf-binary;base64," + glb.toString("base64"),
      sha256: createHash("sha256").update(glb).digest("hex"),
      bytes: glb.length,
    },
  );
  assert.ok(
    report.sources.reduce((sum, item) => sum + item.bytes, 0) > 15_000_000,
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Store originaler",
  );
  await saved();
  const before = await digest(),
    normalizedBefore = await digest("production", true);
  await phase("cancel a pending real worker and retain the whole film");
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  await page.evaluate(() => {
    window.archiveProbe.hold = true;
  });
  await page.getByRole("button", { name: /Komplet projektpakke/ }).click();
  await expect(
    page.getByRole("button", { name: "Afbryd projektpakke", exact: true }),
  ).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await scan(name + "-pending-archive");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-archive-progress.png`,
      fullPage: false,
    });
  }
  await page
    .getByRole("button", { name: "Afbryd projektpakke", exact: true })
    .click();
  await expect(
    page.getByText("Projektpakken er afbrudt. Din film er bevaret.", {
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => window.archiveProbe.live), 0);
  assert.equal(await digest(), before);
  await page.setViewportSize({ width: 1440, height: 900 });
  await phase("export more than 15 MB through the actual bundled worker");
  await page.evaluate(() => {
    window.archiveProbe.hold = false;
    window.archiveProbe.measure = true;
    window.archiveProbe.heartbeats = 0;
    window.archiveProbe.maxGap = 0;
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Komplet projektpakke/ }).click();
  const zip = await fs.readFile(await (await download).path());
  report.performance = await page.evaluate(() => {
    window.archiveProbe.measure = false;
    return {
      heartbeats: window.archiveProbe.heartbeats,
      maxGapMs: window.archiveProbe.maxGap,
    };
  });
  assert.ok(report.performance.heartbeats > 0);
  assert.ok(zip.length > 10 * 1024 * 1024);
  const files = unzipSync(zip),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.blobs.length, 4);
  for (const blob of manifest.blobs) {
    const bytes = files[`assets/${blob.sha256}`];
    assert.equal(bytes.length, blob.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), blob.sha256);
  }
  report.archive = {
    bytes: zip.length,
    expandedBytes: manifest.expandedBytes,
    uniqueOriginals: manifest.blobs.length,
  };
  assert.equal(await digest(), before);
  report.checks.push(
    "A real bundled worker exports >10 MiB of original media, with four unique content-addressed files; repeated GLB/frame versions are stored once; project data stays unchanged; event-loop heartbeats continue",
  );
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".library-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await phase(
    "import v2 as an independent film and compare every semantic field",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "originals-v2.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Store originaler",
  );
  await saved();
  const importedKey = await page.evaluate(() =>
    localStorage.getItem("director-active-production"),
  );
  assert.notEqual(importedKey, "production");
  assert.equal(await digest(importedKey, true), normalizedBefore);
  assert.equal(await digest(), before);
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".library-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await phase(
    "reject corrupt bytes and worker startup failure without losing either film",
  );
  files[`assets/${manifest.blobs[0].sha256}`][0] ^= 1;
  await page.locator("input[type=file]").setInputFiles({
    name: "corrupted.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files, { level: 0 })),
  });
  await expect(page.locator(".library-error")).toContainText("checksum");
  await expect(page.locator(".production-card")).toHaveCount(2);
  assert.equal(await digest(), before);
  assert.equal(await digest(importedKey, true), normalizedBefore);
  await page.evaluate(() => {
    window.archiveProbe.fail = true;
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "worker-blocked.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".library-error")).toContainText(
    "kunne ikke starte projektarbejdet i baggrunden",
  );
  await expect(page.locator(".production-card")).toHaveCount(2);
  await page.evaluate(() => {
    window.archiveProbe.fail = false;
  });
  await phase("import the original v1 archive format");
  const legacy = JSON.parse(
    await fs.readFile("fixtures/director-sample-render.json", "utf8"),
  );
  legacy.title = "Tidligere projektpakke v1";
  const data = strToU8(JSON.stringify(legacy));
  const v1 = zipSync({
    "project.json": data,
    "manifest.json": strToU8(
      JSON.stringify({
        format: "director-project-package",
        version: 1,
        project: "project.json",
        sha256: createHash("sha256").update(data).digest("hex"),
      }),
    ),
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "original-v1.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(v1),
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    legacy.title,
  );
  await saved();
  assert.equal(await digest(), before);
  assert.equal(await digest(importedKey, true), normalizedBefore);
  report.worker = await page.evaluate(() => ({
    created: window.archiveProbe.created,
    terminated: window.archiveProbe.terminated,
    live: window.archiveProbe.live,
    requests: window.archiveProbe.workerRequests,
  }));
  assert.equal(report.worker.live, 0);
  assert.equal(report.worker.created, report.worker.terminated);
  assert.deepEqual(report.pageErrors, []);
  report.checks.push(
    "Cancellation terminates its actual worker without mutation; malformed bytes and controlled worker startup failure retain both films; v2 roundtrip preserves all semantic fields except independent project identity/revision; legacy v1 imports successfully",
  );
  report.verifiedAt = new Date().toISOString();
  await phase("passed");
  await fs.rm(`reports/director/${engine}-archive-failure.png`, {
    force: true,
  });
} catch (error) {
  report.error = String(error);
  await phase("failed");
  await page
    .screenshot({
      timeout: 4000,
      path: `reports/director/${engine}-archive-failure.png`,
      fullPage: false,
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
          () => reject(Error("Browser cleanup exceeded 5 seconds")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
  }
}
