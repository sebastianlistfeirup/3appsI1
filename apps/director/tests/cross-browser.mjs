import { chromium, firefox, webkit, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const results = [];
for (const [name, engine] of Object.entries({
  chromium,
  firefox,
  webkit,
}).filter(
  ([name]) => !process.env.BROWSER_NAME || process.env.BROWSER_NAME === name,
)) {
  const browser = await engine.launch(
    name === "chromium"
      ? {
          headless: true,
          executablePath: "/usr/bin/chromium",
          args: [
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : { headless: true },
  );
  try {
    for (const disabled of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      if (disabled)
        await context.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return String(type).includes("webgl")
              ? null
              : original.call(this, type, ...args);
          };
        });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const read = () =>
        page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const r = indexedDB.open("tre-apps-director-v1", 1);
              r.onsuccess = () => {
                const db = r.result;
                const q = db
                  .transaction("documents")
                  .objectStore("documents")
                  .get("production");
                q.onsuccess = () => {
                  db.close();
                  resolve(q.result?.data);
                };
                q.onerror = () => reject(q.error);
              };
              r.onerror = () => reject(r.error);
            }),
        );
      await page.goto("http://localhost:3002");
      await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
        timeout: 30000,
      });
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      if (disabled) {
        await expect(
          page.getByRole("img", {
            name: "2D-plan af observationsdækket med objekter og kamera",
          }),
        ).toBeVisible();
        assert.equal(
          (await read()).shots
            .filter((s) => s.frame)
            .every((s) => s.frameMode === "plan"),
          true,
        );
      }
      const initial = await read();
      await page
        .getByRole("button", { name: "Kaptajn Liv Karakter · v1", exact: true })
        .click();
      await page
        .locator(".inspector-panel")
        .getByRole("spinbutton", { name: "X", exact: true })
        .fill("-3");
      await page
        .locator(".inspector-panel")
        .getByRole("spinbutton", { name: "X", exact: true })
        .press("Tab");
      await expect
        .poll(async () => (await read()).draft.objects[0].transform.position[0])
        .toBe(-3);
      assert.equal(
        (await read()).scenes[0].objects[0].transform.position[0],
        -1.2,
      );
      await page
        .getByRole("button", { name: "Fortryd (⌘/Ctrl Z)", exact: true })
        .click();
      await expect
        .poll(async () => (await read()).draft.objects[0].transform.position[0])
        .toBe(-1.2);
      await page.getByRole("button", { name: "GLB", exact: true }).click();
      await page
        .locator("input[type=file]")
        .nth(1)
        .setInputFiles("fixtures/director-relay.glb");
      await expect(page.locator(".object-row")).toHaveCount(6, {
        timeout: 15000,
      });
      await page
        .getByRole("button", { name: "Gem indstilling", exact: true })
        .click();
      await expect
        .poll(
          async () => {
            const p = await read();
            return (
              p.shots.find((s) => s.id === p.sequence[0])?.frame !==
              initial.shots.find((s) => s.id === initial.sequence[0])?.frame
            );
          },
          { timeout: 30000 },
        )
        .toBe(true);
      await page.reload();
      await expect(page.locator(".object-row")).toHaveCount(6);
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      const p = await read();
      assert.equal(p.draft.assets[0].triangles, 12);
      await page
        .getByRole("button", { name: "Eksportér", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("[role=dialog]")),
        ),
        true,
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Produktionsvisning" })
        .getByRole("button", { name: "Storyboard", exact: true })
        .click();
      await expect(page.locator(".storyboard-card")).toHaveCount(5);
      await page.screenshot({
        path: `reports/director/${name}-${disabled ? "no-webgl" : "native"}-storyboard.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false);
      assert.deepEqual(errors, []);
      results.push({
        browser: name,
        webglDisabled: disabled,
        frameModes: [
          ...new Set(p.shots.filter((s) => s.frame).map((s) => s.frameMode)),
        ],
        checks: [
          "initial five frames",
          "immutable edit",
          "undo",
          "GLB import and actual capture",
          "reload",
          "modal keyboard trap/Escape",
          "storyboard",
          "no overflow/page errors",
        ],
        pageErrors: errors,
      });
      console.log(name, disabled ? "without WebGL" : "native", "passed");
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
await fs.writeFile(
  "reports/director/cross-browser.json",
  JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2),
);
