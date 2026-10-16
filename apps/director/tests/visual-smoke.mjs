import { chromiumExecutable, directorUrl } from "./browser.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutable,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const log = [];
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `reports/director/${name}-scene.png`,
    fullPage: true,
  });
  log.push({
    name,
    width,
    height,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    errors,
    layout: await page
      .locator(
        ".editor-workspace,.viewport-wrap,.inspector-panel,.shots-section,.timeline-section",
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          class: el.className,
          height: el.getBoundingClientRect().height,
          width: el.getBoundingClientRect().width,
        })),
      ),
  });
  await page
    .getByRole("navigation", { name: "Produktionsvisning" })
    .getByRole("button", { name: "Storyboard", exact: true })
    .click();
  await page.screenshot({
    path: `reports/director/${name}-storyboard.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Produktionsvisning" })
    .getByRole("button", { name: "Scene", exact: true })
    .click();
  await page.getByRole("button", { name: "2D-plan", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "2D-plan af observationsdækket med objekter og kamera",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `reports/director/${name}-2d.png`,
    fullPage: true,
  });
  await page.close();
}
await fs.writeFile(
  "reports/director/visual-inspection.json",
  JSON.stringify(log, null, 2),
);
console.log(log);
await browser.close();
