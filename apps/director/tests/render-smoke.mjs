import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.DIRECTOR_TEST_URL ?? "http://localhost:3002";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await expect(
  page.getByRole("heading", { name: "Det sidste signal" }),
).toBeVisible();
await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
  timeout: 30000,
});
await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
await page.getByRole("button", { name: "Eksportér", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Eksportér animatic", exact: true }),
).toBeEnabled({ timeout: 10000 });
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Projekt-JSON", exact: false }).click();
const download = await downloadPromise;
await download.saveAs("fixtures/director-sample-render.json");
const pdfPromise = page.waitForEvent("download");
await page.locator(".export-options button").first().click();
await (await pdfPromise).saveAs("reports/director/sample-storyboard.pdf");
const zipPromise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Komplet projektpakke", exact: false })
  .click();
await (await zipPromise).saveAs("reports/director/sample-project.zip");
await page
  .getByRole("button", { name: "Eksportér animatic", exact: true })
  .click();
await expect(page.getByText("Din film er klar", { exact: true })).toBeVisible({
  timeout: 240000,
});
await page.screenshot({
  path: "reports/director/export-complete.png",
  fullPage: false,
});
const result = await page.locator(".render-status").innerText();
console.log(result);
const moviePromise = page.waitForEvent("download");
await page.getByRole("link", { name: "Hent MP4" }).click();
await (
  await moviePromise
).saveAs("reports/director/det-sidste-signal-720p.mp4");
await fs.writeFile(
  "reports/director/render-browser.json",
  JSON.stringify(
    { result, errors, verifiedAt: new Date().toISOString() },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
