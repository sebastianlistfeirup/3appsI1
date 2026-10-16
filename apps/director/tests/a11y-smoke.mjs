import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
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
const summary = [];
try {
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto("http://localhost:3002");
    await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
      timeout: 30000,
    });
    const scan = async (name) => {
      await page.addScriptTag({ content: axe });
      const result = await page.evaluate(() =>
        axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          iframes: false,
          resultTypes: ["violations"],
        }),
      );
      await fs.mkdir("reports/director/a11y", { recursive: true });
      await fs.writeFile(
        `reports/director/a11y/${device}-${name}.json`,
        JSON.stringify(result, null, 2),
      );
      const item = {
        device,
        name,
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      };
      summary.push(item);
      console.log(JSON.stringify(item));
    };
    await scan("scene");
    await page
      .getByRole("navigation", { name: "Produktionsvisning" })
      .getByRole("button", { name: "Storyboard", exact: true })
      .click();
    await scan("storyboard");
    await page
      .getByRole("navigation", { name: "Produktionsvisning" })
      .getByRole("button", { name: "Historie", exact: true })
      .click();
    await scan("story");
    await page.getByRole("button", { name: "Eksportér", exact: true }).click();
    await scan("export");
    await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Produktionsvisning" })
      .getByRole("button", { name: "Scene", exact: true })
      .click();
    await page.getByRole("button", { name: "GLB", exact: true }).click();
    await scan("import");
    await page.close();
  }
  await fs.writeFile(
    "reports/director/a11y/summary.json",
    JSON.stringify(summary, null, 2),
  );
} finally {
  await browser.close();
}
if (summary.some((s) => s.violations.length)) process.exitCode = 1;
