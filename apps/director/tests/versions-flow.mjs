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
const expect = baseExpect.configure({ timeout: 20000 }),
  engine = process.env.VERSIONS_ENGINE ?? "chromium";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
const watchdog = setTimeout(() => {
  console.error(`Versions flow ${engine} exceeded its 240-second deadline`);
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  scans = [];
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (e) => errors.push(e.message));
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1),
          timeout = setTimeout(
            () => reject(Error("Test IndexedDB read timed out")),
            10000,
          );
        open.onsuccess = () => {
          const db = open.result,
            req = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          req.onsuccess = () => {
            clearTimeout(timeout);
            resolve(req.result.data);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
const close = () =>
  page.getByRole("button", { name: "Luk dialog", exact: true }).click();
const edit = async (label, value) => {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
  await saved();
};
const number = async (label, value) => {
  const field = page.getByRole("spinbutton", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
  await saved();
};
const history = () =>
  page.getByRole("button", { name: "Sekvensversioner", exact: true }).click();
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
const retain = (p, before) => {
  for (const shot of before.shots)
    assert.equal(
      hash(p.shots.find((s) => s.id === shot.id)),
      hash(shot),
      `immutable shot ${shot.id}`,
    );
  for (const scene of before.scenes)
    assert.equal(
      hash(p.scenes.find((s) => s.id === scene.id)),
      hash(scene),
      `immutable scene ${scene.id}`,
    );
};
try {
  console.log("Versions flow", engine, "initial film and own image");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const imported = await read(),
    fifth = imported.shots.find((s) => s.id === imported.sequence[4]),
    bytes = Buffer.from(fifth.frame.split(",")[1], "base64");
  imported.media.push({
    id: "own_image",
    kind: "image",
    name: "Mit eget billede.jpg",
    mime: "image/jpeg",
    dataUrl: fifth.frame,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    source: "Eget billede",
    rights: "owned",
  });
  fifth.mediaId = "own_image";
  fifth.frame = null;
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "with-own-image.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(imported)),
    });
  await saved();
  await expect
    .poll(
      async () => (await read()).shots.find((s) => s.id === fifth.id).mediaId,
    )
    .toBe("own_image");
  const original = await read(),
    oldSecondId = original.sequence[1];
  await page
    .getByRole("button", { name: "Kaptajn Liv Karakter · v1", exact: true })
    .click();
  const x = page
    .locator(".inspector-panel")
    .getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("-2.4");
  await x.press("Tab");
  await saved();
  await page
    .getByRole("button", { name: "Sceneversioner", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(5);
  await expect(
    page.getByRole("dialog").getByRole("checkbox").nth(4),
  ).toBeDisabled();
  await expect(
    page.getByRole("dialog").locator('input[type="checkbox"]:checked'),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Fravælg alle", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Opdatér shot 2: Noget derude",
      exact: true,
    })
    .check();
  await scan("selective-continuity");
  await page.screenshot({
    path: `reports/director/${engine}-selective-continuity.png`,
    fullPage: false,
  });
  console.log("Versions flow", engine, "capture exactly one selected camera");
  await page
    .getByRole("button", { name: "Opdatér 1 valgte kamerashots", exact: true })
    .click();
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
  const captured = await read();
  retain(captured, original);
  assert.notEqual(captured.sequence[1], oldSecondId);
  for (const index of [0, 2, 3, 4])
    assert.equal(captured.sequence[index], original.sequence[index]);
  assert.equal(
    captured.shots.find((s) => s.id === captured.sequence[1]).sceneVersionId,
    captured.draft.id,
  );
  assert.equal(
    captured.shots.find((s) => s.id === fifth.id).mediaId,
    "own_image",
  );
  await history();
  await scan("empty-sequence-history");
  await page
    .getByRole("textbox", { name: "Navn på sekvensversion" })
    .fill("Første klipning");
  await page
    .getByRole("button", { name: "Gem sekvensversion", exact: true })
    .click();
  await saved();
  await expect.poll(async () => (await read()).sequenceVersions.length).toBe(1);
  const savedCut = (await read()).sequenceVersions[0];
  assert.deepEqual(savedCut.sequence, captured.sequence);
  await close();
  await page.locator(".shot-card").nth(1).click();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Shot", exact: true })
    .click();
  await number("Varighed i sekunder", "6");
  await edit("Replik / voiceover", "En anden klipning med en ny replik.");
  await page.getByLabel("Overgang ind i shot").selectOption("12");
  await saved();
  const wav = Buffer.alloc(44 + 48000 * 2 * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < 96000; i++)
    wav.writeInt16LE(
      Math.round(3200 * Math.sin((i * 2 * Math.PI * 220) / 48000)),
      44 + i * 2,
    );
  await page
    .getByRole("button", { name: "Tilføj et musikspor", exact: false })
    .click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({ name: "Musik.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved();
  await page
    .getByRole("button", { name: "Duplikér shot", exact: true })
    .click();
  await saved();
  await expect(page.locator(".shot-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Tidligere", exact: true }).click();
  await saved();
  const alternative = await read();
  assert.ok(alternative.music);
  assert.equal(
    alternative.shots.find((s) => s.id === alternative.sequence[1])
      .previousShotId,
    null,
  );
  console.log("Versions flow", engine, "restore with automatic preservation");
  await history();
  await page
    .getByRole("button", { name: "Brug denne klipning", exact: true })
    .click();
  await saved();
  await expect.poll(async () => (await read()).sequenceVersions.length).toBe(2);
  const restored = await read();
  assert.deepEqual(restored.sequence, savedCut.sequence);
  assert.equal(restored.music, null);
  retain(restored, alternative);
  assert.deepEqual(restored.sequenceVersions[1].sequence, alternative.sequence);
  assert.deepEqual(restored.sequenceVersions[1].music, alternative.music);
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await scan(name + "-saved-cuts");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-sequence-history.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator(".sequence-version-card")
    .first()
    .getByRole("button", { name: "Brug denne klipning", exact: true })
    .click();
  await saved();
  const back = await read();
  assert.deepEqual(back.sequence, alternative.sequence);
  assert.deepEqual(back.music, alternative.music);
  assert.equal(back.sequenceVersions.length, 2);
  await close();
  await page.locator(".shot-card").nth(2).click();
  await page
    .getByRole("button", { name: "Shotversioner", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tidligere shotversion" })
    .selectOption(oldSecondId);
  await scan("shot-comparison");
  await page.screenshot({
    path: `reports/director/${engine}-shot-history.png`,
    fullPage: false,
  });
  const activeOld = back.shots.find((s) => s.id === back.sequence[2]);
  await page
    .getByRole("button", { name: "Brug v2 som en ny shotversion", exact: true })
    .click();
  await saved();
  const result = await read(),
    current = result.shots.find((s) => s.id === result.sequence[2]);
  assert.equal(current.version, activeOld.version + 1);
  assert.equal(current.previousShotId, activeOld.id);
  assert.equal(
    current.frame,
    original.shots.find((s) => s.id === oldSecondId).frame,
  );
  assert.equal(current.durationFrames, 288);
  retain(result, back);
  await close();
  await page.reload();
  await saved();
  assert.equal(hash(await read()), hash(result));
  console.log(
    "Versions flow",
    engine,
    "portable history and malformed imports",
  );
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Komplet projektpakke", exact: false })
    .click();
  const zip = await fs.readFile(await (await download).path());
  await close();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "versions-roundtrip.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".toast.working")).toHaveCount(0);
  await saved();
  assert.equal(hash(await read()), hash(result));
  for (const kind of ["lineage", "sequence"]) {
    const bad = structuredClone(result);
    if (kind === "lineage")
      bad.shots.find((s) => s.id === current.id).previousShotId = "missing";
    else bad.sequenceVersions[0].sequence[0] = "missing";
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "bad-history.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(bad)),
      });
    await expect(page.locator(".error-banner")).toBeVisible();
    assert.equal(hash(await read()), hash(result));
    await page.getByRole("button", { name: "Luk fejl", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-versions-flow.json`,
    JSON.stringify(
      {
        engine,
        checks: [
          "own image excluded from continuity changes",
          "only selected camera gets a new shot and shared immutable scene reference",
          "all previous scenes/shots unchanged",
          "named cut pins order, versions, crossfade and audio",
          "restoration automatically preserves current unsaved cut and restores it exactly",
          "independent shot duplicate",
          "previous shot result restored as a new linked version",
          "reload and portable ZIP preserve the complete history",
          "malformed predecessor and inactive saved-sequence references reject without changing film",
        ],
        accessibility: scans,
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Director versions flow passed", engine);
} catch (error) {
  console.error(
    await page.locator(".modal-error,.error-banner").allTextContents(),
  );
  await page
    .screenshot({
      path: `reports/director/${engine}-versions-failure.png`,
      fullPage: false,
      timeout: 5000,
    })
    .catch(() => {});
  throw error;
} finally {
  let cleanupTimer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        cleanupTimer = setTimeout(
          () => reject(Error("Browser cleanup exceeded five seconds")),
          5000,
        );
      }),
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    clearTimeout(cleanupTimer);
    clearTimeout(watchdog);
  }
}
