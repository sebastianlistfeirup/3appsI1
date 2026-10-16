import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 20000 }),
  engine = process.env.LOCATION_ENGINE ?? "chromium";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const watchdog = setTimeout(() => {
  console.error(`Locations flow ${engine} exceeded 180 seconds`);
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  scans = [];
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(Error("IndexedDB read timeout")),
            10000,
          ),
          request = indexedDB.open("tre-apps-director-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            doc = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          doc.onsuccess = () => {
            clearTimeout(timeout);
            resolve(doc.result.data);
            db.close();
          };
          doc.onerror = () => reject(doc.error);
        };
      }),
  );
const open = () =>
  page.getByRole("button", { name: "Vælg set", exact: true }).click();
const close = () =>
  page.getByRole("button", { name: "Luk dialog", exact: true }).click();
const color = (label, value) =>
  page.getByLabel(label, { exact: true }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
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
const capture = async () => {
  await page
    .getByRole("button", { name: "Gem indstilling", exact: true })
    .click();
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
};
try {
  console.log("Locations flow", engine, "original and staged changes");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const original = await read();
  await open();
  await expect
    .poll(() =>
      page
        .locator(".location-preset img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: /^Lysstudie/ }).click();
  await page
    .getByRole("textbox", { name: "Navn på dit set" })
    .fill("Det lyse rum");
  await color("Gulvets farve", "#a9b4a8");
  await expect(page.getByText("#A9B4A8", { exact: true })).toBeVisible();
  await close();
  assert.equal(
    hash(await read()),
    hash(original),
    "closing the form does not apply unfinished choices",
  );
  await open();
  await page.getByRole("button", { name: /^Lysstudie/ }).click();
  await page
    .getByRole("textbox", { name: "Navn på dit set" })
    .fill("Det lyse rum");
  await color("Gulvets farve", "#a9b4a8");
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await scan(name + "-locations");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-locations.png`,
    });
  }
  await page
    .getByRole("button", { name: "Brug dette set", exact: true })
    .click();
  await saved();
  const studio = await read();
  assert.equal(studio.draft.name, "Det lyse rum");
  assert.equal(studio.draft.environment.preset, "studio");
  assert.equal(studio.draft.environment.groundColor, "#a9b4a8");
  assert.deepEqual(studio.draft.objects, original.draft.objects);
  assert.deepEqual(studio.draft.cameras, original.draft.cameras);
  assert.deepEqual(studio.scenes, original.scenes);
  assert.deepEqual(studio.shots, original.shots);
  assert.equal(
    await page.locator(".stage-toolbar").evaluate((toolbar) =>
      [...toolbar.querySelectorAll("button")].every((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }),
    ),
    true,
    "mobile camera tools stay reachable",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture();
  const captured = await read(),
    first = captured.shots.find((shot) => shot.id === captured.sequence[0]);
  assert.notEqual(
    first.frame,
    original.shots.find((shot) => shot.id === original.sequence[0]).frame,
  );
  assert.equal(
    captured.scenes.find((scene) => scene.id === first.sceneVersionId)
      .environment.preset,
    "studio",
  );
  if (engine === "chromium") assert.equal(first.frameMode, "3d");
  for (const index of [1, 2, 3, 4])
    assert.equal(captured.sequence[index], original.sequence[index]);
  await scan("studio-scene");
  await page.screenshot({
    path: `reports/director/${engine}-studio-scene.png`,
    fullPage: true,
  });
  console.log("Locations flow", engine, "courtyard and explicit 2D capture");
  await open();
  await page.getByRole("button", { name: /^Gårdrum/ }).click();
  await color("Himlens farve", "#b58a80");
  await page
    .getByRole("button", { name: "Nulstil farver", exact: true })
    .click();
  await expect(page.getByLabel("Himlens farve", { exact: true })).toHaveValue(
    "#8eafbb",
  );
  await page
    .getByRole("button", { name: "Brug dette set", exact: true })
    .click();
  await saved();
  await page.locator(".shot-card").nth(1).click();
  await capture();
  const courtyard = await read(),
    second = courtyard.shots.find((shot) => shot.id === courtyard.sequence[1]);
  assert.equal(
    courtyard.scenes.find((scene) => scene.id === second.sceneVersionId)
      .environment.preset,
    "courtyard",
  );
  assert.deepEqual(
    courtyard.shots.find((shot) => shot.id === first.id),
    first,
  );
  await scan("courtyard-scene");
  await page.screenshot({
    path: `reports/director/${engine}-courtyard-scene.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "2D-plan", exact: true }).click();
  await expect(
    page.getByRole("group", {
      name: "2D-plan af Gårdrum med objekter og kamera",
    }),
  ).toBeVisible();
  await expect(page.getByText("ÅBEN BUEGANG", { exact: true })).toBeVisible();
  const character = page.getByRole("button", {
    name: "Vælg Tekniker Noa",
    exact: true,
  });
  await character.focus();
  await page.keyboard.press("Space");
  await expect(character).toHaveAttribute("aria-pressed", "true");
  await scan("interactive-2d-plan");
  await page.locator(".shot-card").nth(2).click();
  await capture();
  const final = await read(),
    plan = final.shots.find((shot) => shot.id === final.sequence[2]);
  assert.equal(plan.frameMode, "plan");
  for (const scene of original.scenes)
    assert.deepEqual(
      final.scenes.find((s) => s.id === scene.id),
      scene,
    );
  await page.reload();
  await saved();
  assert.equal(hash(await read()), hash(final));
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Komplet projektpakke", exact: false })
    .click();
  const zip = await fs.readFile(await (await download).path());
  await close();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "locations.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  assert.equal(hash(await read()), hash(final));
  const bad = structuredClone(final);
  bad.draft.environment.preset = "remote-url";
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad-set.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
  await expect(page.locator(".error-banner")).toBeVisible();
  assert.equal(hash(await read()), hash(final));
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-locations-flow.json`,
    JSON.stringify(
      {
        engine,
        browserVersion: browser.version(),
        checks: [
          "real original preset thumbnails loaded",
          "unapplied choices leave project intact",
          "location and palette changes preserve all cast/camera transforms and old versions",
          "actual new immutable studio and courtyard camera frames",
          "explicit courtyard 2D plan and captured fallback",
          "color reset",
          "reload and ZIP retain environments",
          "invalid environment rejected without data loss",
        ],
        accessibility: scans,
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await fs.rm(`reports/director/${engine}-locations-failure.png`, {
    force: true,
  });
  console.log("Director locations flow passed", engine);
} catch (error) {
  console.error(
    await page.locator(".error-banner,.modal-error").allTextContents(),
  );
  await page
    .screenshot({
      path: `reports/director/${engine}-locations-failure.png`,
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
        timer = setTimeout(() => reject(Error("Browser close timeout")), 5000);
      }),
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
  }
}
