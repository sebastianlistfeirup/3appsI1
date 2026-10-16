import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const expect = baseExpect.configure({ timeout: 20000 });
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const engine = process.env.LIBRARY_ENGINE ?? "chromium";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  scans = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errors.push(e.message));
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = (key) =>
  page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            req = db.transaction("documents").objectStore("documents").get(key);
          req.onsuccess = () => {
            resolve(req.result?.data);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
    key,
  );
const active = () =>
  page.evaluate(
    () => localStorage.getItem("director-active-production") ?? "production",
  );
const library = async (count) => {
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".production-library")).toBeVisible();
  await expect(page.locator(".production-card")).toHaveCount(count);
  await expect(page.locator(".library-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
};
const scan = async (name) => {
  await page.addScriptTag({ content: axe });
  const result = await page.evaluate(
    async () =>
      (
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          iframes: false,
        })
      ).violations,
  );
  const violations = result.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  scans.push({ name, violations });
  assert.deepEqual(violations, []);
};
const rename = async (title) => {
  await page
    .getByRole("navigation", { name: "Produktionsvisning" })
    .getByRole("button", { name: "Historie", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Produktionens titel",
    exact: true,
  });
  await field.fill(title);
  await field.press("Tab");
};
const quota = () =>
  page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restoreLibraryPut = () => (IDBObjectStore.prototype.put = put);
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException("Synthetic storage full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
try {
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const original = await read("production");
  await library(1);
  await scan("initial-library");
  await page
    .getByRole("textbox", { name: "Filmens titel", exact: true })
    .fill("Min nye fortælling");
  await page.getByRole("button", { name: "Opret film", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Min nye fortælling",
  );
  await saved();
  const firstKey = await active();
  assert.notEqual(firstKey, "production");
  assert.equal((await read(firstKey)).sequence.length, 0);
  assert.equal((await read(firstKey)).draft.objects.length, 0);
  await page
    .getByRole("button", { name: "Tilføj karakter", exact: true })
    .click();
  await page.getByRole("button", { name: "Tilføj shot", exact: true }).click();
  await page
    .getByRole("button", { name: "Gem indstilling", exact: true })
    .click();
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(1, {
    timeout: 30000,
  });
  await saved();
  const first = await read(firstKey);
  assert.deepEqual(await read("production"), original);
  await library(2);
  await page
    .getByRole("button", { name: "Duplikér Min nye fortælling", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Min nye fortælling · kopi",
  );
  await saved();
  const copyKey = await active(),
    copy = await read(copyKey);
  assert.notEqual(copyKey, firstKey);
  assert.notEqual(copy.id, first.id);
  assert.deepEqual(copy.sequence, first.sequence);
  assert.deepEqual(copy.shots, first.shots);
  await rename("Min nye fortælling · alternativ");
  await saved();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Min nye fortælling · alternativ",
  );
  await saved();
  assert.deepEqual(await read(firstKey), first);
  assert.deepEqual(await read("production"), original);
  await library(3);
  await page
    .getByRole("textbox", { name: "Filmens titel", exact: true })
    .fill("En anden stjerne");
  await page
    .getByRole("combobox", { name: "Udgangspunkt", exact: true })
    .selectOption("sample");
  await page.getByRole("button", { name: "Opret film", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "En anden stjerne",
  );
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const sampleKey = await active();
  assert.equal((await read(sampleKey)).sequence.length, 5);
  await library(4);
  await page
    .getByRole("button", { name: "Importér projekt som ny film", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 99 })),
  });
  await expect(page.locator(".library-error")).toBeVisible();
  await expect(page.locator(".production-card")).toHaveCount(4);
  await page.locator("input[type=file]").setInputFiles({
    name: "existing-film.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Det sidste signal",
  );
  await saved();
  const importedKey = await active();
  assert.notEqual(importedKey, "production");
  assert.notEqual((await read(importedKey)).id, original.id);
  assert.deepEqual((await read(importedKey)).shots, original.shots);
  assert.deepEqual(await read("production"), original);
  await library(5);
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("documents", "readwrite");
          tx.objectStore("documents").put({
            schemaVersion: 1,
            key: "production_" + "f".repeat(32),
            revision: 1,
            updatedAt: new Date().toISOString(),
            data: {
              schemaVersion: 99,
              title: "Fremtidig film · bevar mig",
              precious: "Do not lose",
            },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page
    .getByRole("button", { name: "Opdatér produktionsbibliotek", exact: true })
    .click();
  await expect(page.locator(".production-card")).toHaveCount(6);
  await expect(
    page.getByRole("button", {
      name: "Åbn Fremtidig film · bevar mig",
      exact: true,
    }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Hent sikkerhedskopi af Fremtidig film · bevar mig",
      exact: true,
    })
    .click();
  const backup = JSON.parse(
    await fs.readFile(await (await download).path(), "utf8"),
  );
  assert.equal(backup.schemaVersion, 99);
  assert.equal(backup.precious, "Do not lose");
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await scan(name + "-library");
    await page.screenshot({
      path: `reports/director/${engine}-${name}-library.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("searchbox", { name: "Søg i produktioner" })
    .fill("intet matcher xyz");
  await expect(page.locator(".production-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Ingen film matcher din søgning" }),
  ).toBeVisible();
  await scan("mobile-no-results");
  await page.screenshot({
    path: `reports/director/${engine}-mobile-library-empty.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Vis alle film", exact: true })
    .click();
  await quota();
  await page
    .getByRole("textbox", { name: "Filmens titel", exact: true })
    .fill("Må ikke erstatte mine film");
  await page.getByRole("button", { name: "Opret film", exact: true }).click();
  await expect(page.locator(".library-error")).toContainText("lager er fuldt");
  await expect(page.locator(".production-card")).toHaveCount(6);
  await scan("mobile-quota-error");
  await page.evaluate(() => window.restoreLibraryPut());
  await page.getByRole("button", { name: "Prøv igen", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const ownImage = structuredClone(original),
    originalShot = original.shots.find((s) => s.id === original.sequence[0]),
    imageBytes = Buffer.from(originalShot.frame.split(",")[1], "base64");
  ownImage.title = "Mit eget billede";
  ownImage.shots = [
    {
      ...originalShot,
      previousShotId: null,
      frame: null,
      frameRenderer: null,
      mediaId: "own_image",
      sourceIn: 0,
      clipAudio: false,
      durationFrames: 48,
      transitionFrames: 0,
    },
  ];
  ownImage.sequence = [originalShot.id];
  ownImage.media = [
    {
      id: "own_image",
      name: "Eget billede.jpg",
      kind: "image",
      mime: "image/jpeg",
      dataUrl: originalShot.frame,
      sha256: createHash("sha256").update(imageBytes).digest("hex"),
      bytes: imageBytes.length,
      source: "Eget billede",
      rights: "owned",
    },
  ];
  ownImage.voice = null;
  ownImage.music = null;
  await page.locator("input[type=file]").setInputFiles({
    name: "own-image-film.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(ownImage)),
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Mit eget billede",
  );
  await saved();
  const imageKey = await active(),
    storedImage = await read(imageKey);
  assert.equal(storedImage.shots[0].mediaId, "own_image");
  assert.equal(storedImage.shots[0].frame, null);
  await page.reload();
  await saved();
  assert.deepEqual(await read(imageKey), storedImage);
  await page
    .getByRole("button", { name: "Opdatér alle frames", exact: true })
    .click();
  await expect(
    page.getByText(
      "Der er ingen kameraframes at opdatere. Egne medier er bevaret.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.deepEqual(await read(imageKey), storedImage);
  await expect(
    page.getByRole("button", { name: "Erstat med kameraframe", exact: true }),
  ).toBeVisible();
  await library(7);
  await page
    .getByRole("button", { name: "Åbn Min nye fortælling", exact: true })
    .click();
  await saved();
  await quota();
  await rename("Bevar min ikke-gemte kladde");
  await expect(
    page.getByRole("button", { name: "Gem lokal kopi", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".director-app")).toBeVisible();
  await expect(page.locator(".production-library")).toHaveCount(0);
  const safety = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Gem lokal kopi", exact: true })
    .click();
  const unsaved = JSON.parse(
    await fs.readFile(await (await safety).path(), "utf8"),
  );
  assert.equal(unsaved.title, "Bevar min ikke-gemte kladde");
  assert.deepEqual(await read(firstKey), first);
  await page.evaluate(() => window.restoreLibraryPut());
  await page
    .getByRole("button", { name: "Genindlæs gemt version", exact: true })
    .click();
  await saved();
  assert.deepEqual(await read("production"), original);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-library-flow.json`,
    JSON.stringify(
      {
        engine,
        checks: [
          "new independent empty production with first real character/captured shot",
          "original film unchanged",
          "deep duplicate with new project identity and pinned shot references",
          "last project restored after reload",
          "new sample gets five actual frames",
          "malformed import preserves library; valid project import creates independent new film",
          "future schema retained for raw backup",
          "search empty and responsive layouts",
          "quota during creation preserves every existing project",
          "own-media-only film retains its media and null camera frame on import, reload and bulk camera capture",
          "rejecting flush prevents project switch and allows unsaved-copy download",
        ],
        accessibility: scans,
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Director library flow passed", engine);
} catch (error) {
  console.error(
    await page
      .locator(".library-error,.error-banner,.modal-error")
      .allTextContents(),
  );
  await page.screenshot({
    path: `/tmp/director-${engine}-library-failure.png`,
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
