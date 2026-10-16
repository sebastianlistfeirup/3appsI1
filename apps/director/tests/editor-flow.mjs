import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1);
        open.onsuccess = () => {
          const db = open.result;
          const req = db
            .transaction("documents")
            .objectStore("documents")
            .get("production");
          req.onsuccess = () => {
            db.close();
            resolve(req.result.data);
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
const saved = async () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
await page.goto("http://localhost:3002");
await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
  timeout: 30000,
});
await saved();
const original = await read();
await page
  .getByRole("button", { name: "Kaptajn Liv Karakter · v1", exact: true })
  .click();
await page
  .locator(".inspector-panel")
  .getByRole("spinbutton", { name: "X", exact: true })
  .fill("-2.2");
await page
  .locator(".inspector-panel")
  .getByRole("spinbutton", { name: "X", exact: true })
  .press("Tab");
await expect
  .poll(async () => (await read()).draft.objects[0].transform.position[0])
  .toBe(-2.2);
let changed = await read();
assert.equal(changed.scenes[0].objects[0].transform.position[0], -1.2);
assert.deepEqual(changed.sequence, original.sequence);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Control+z");
await expect
  .poll(async () => (await read()).draft.objects[0].transform.position[0])
  .toBe(-1.2);
await page.getByRole("button", { name: "GLB", exact: true }).click();
await page
  .locator("input[type=file]")
  .nth(1)
  .setInputFiles("fixtures/director-relay.glb");
await expect(page.locator(".object-row")).toHaveCount(6, { timeout: 15000 });
await expect.poll(async () => (await read()).draft.assets.length).toBe(1);
await page.waitForTimeout(300);
assert.equal((await read()).draft.assets[0].triangles, 12);
await page.screenshot({
  path: "reports/director/glb-imported.png",
  fullPage: false,
});
await page
  .getByRole("button", { name: "Gem indstilling", exact: true })
  .click();
await expect(page.locator(".toast.working")).toHaveCount(0, { timeout: 30000 });
await saved();
changed = await read();
const first = changed.shots.find((s) => s.id === changed.sequence[0]);
assert.ok(
  changed.scenes.find((s) => s.id === first.sceneVersionId).assets.length === 1,
);
assert.notEqual(
  first.frame,
  original.shots.find((s) => s.id === original.sequence[0]).frame,
);
await page.getByRole("button", { name: "GLB", exact: true }).click();
const beforeBad = await read();
await page
  .locator("input[type=file]")
  .nth(1)
  .setInputFiles({
    name: "malformed.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from([0, 1, 2, 3]),
  });
await expect(page.locator(".modal-error")).toContainText("GLB-header mangler");
assert.deepEqual(await read(), beforeBad);
await page.screenshot({
  path: "reports/director/glb-rejected.png",
  fullPage: false,
});
await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
await page.locator(".shot-card").nth(1).click();
await page
  .locator(".inspector-tabs")
  .getByRole("button", { name: "Shot", exact: true })
  .click();
await page
  .getByRole("spinbutton", { name: "Varighed i sekunder" })
  .fill("13.5");
await page
  .getByRole("spinbutton", { name: "Varighed i sekunder" })
  .press("Tab");
await page.getByLabel("Overgang ind i shot").selectOption("12");
await expect
  .poll(async () => {
    const p = await read();
    return p.sequence.reduce((n, id) => {
      const s = p.shots.find((s) => s.id === id);
      return n + s.durationFrames - s.transitionFrames;
    }, 0);
  })
  .toBe(1464);
await page.getByRole("button", { name: "Tidligere", exact: true }).click();
await expect
  .poll(async () => {
    const p = await read();
    return p.shots.find((s) => s.id === p.sequence[0]).name;
  })
  .toBe("Noget derude");
changed = await read();
assert.equal(
  changed.shots.find((s) => s.id === changed.sequence[0]).transitionFrames,
  0,
);
await page.reload();
await saved();
assert.deepEqual((await read()).sequence, changed.sequence);
assert.equal(
  (await read()).draft.assets[0].sha256,
  changed.draft.assets[0].sha256,
);
await page.getByRole("button", { name: "Eksportér", exact: true }).click();
const zipEvent = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Komplet projektpakke", exact: false })
  .click();
const zip = await zipEvent;
await zip.saveAs("reports/director/edited-project-with-glb.zip");
await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
// Real ZIP re-import must leave every persisted scene, frame, shot, GLB hash and timeline intact.
await page
  .locator("input[type=file]")
  .nth(0)
  .setInputFiles("reports/director/edited-project-with-glb.zip");
await expect(page.locator(".toast.working")).toHaveCount(0, { timeout: 20000 });
await saved();
assert.deepEqual(await read(), changed);
// Empty and failed states at all required sizes, without destroying the previous saved file.
const empty = { ...changed, sequence: [], title: "En ny fortælling" };
await page
  .locator("input[type=file]")
  .nth(0)
  .setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(empty)),
  });
await expect(page.locator(".shot-card")).toHaveCount(0);
await expect(page.getByText("Dit første shot begynder her.")).toBeVisible();
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `reports/director/${name}-empty.png`,
    fullPage: true,
  });
}
const beforeInvalid = await read();
await page
  .locator("input[type=file]")
  .nth(0)
  .setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
await expect(page.locator(".error-banner")).toContainText(
  "Ugyldigt projektfelt",
);
assert.deepEqual(await read(), beforeInvalid);
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `reports/director/${name}-error.png`,
    fullPage: true,
  });
}
await fs.writeFile(
  "reports/director/editor-flow.json",
  JSON.stringify(
    {
      checks: [
        "object transform immutable scene",
        "keyboard undo",
        "real GLB import and actual rendered frame",
        "malformed GLB preserves state with visible error",
        "duration/crossfade arithmetic",
        "reorder without invalid first overlap",
        "reload persistence",
        "ZIP including GLB roundtrip",
        "empty and failed import states at three sizes",
      ],
      pageErrors: errors,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
assert.equal(errors.length, 0, errors.join("\n"));
await browser.close();
console.log("Director editor flow passed");
