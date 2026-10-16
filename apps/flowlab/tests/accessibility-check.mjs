import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const axe = createRequire(require.resolve("@axe-core/playwright"))(
  "axe-core",
).source;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const summary = [];
await mkdir("reports/flowlab/a11y", { recursive: true });
for (const [viewport, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
  await page
    .getByText("30 parrede replikationer", { exact: false })
    .first()
    .waitFor();
  await page.addScriptTag({ content: axe });
  for (const tab of [
    "Model",
    "Scenarier",
    "Resultater",
    "Dataværksted",
    "Rapport",
    "Modelbibliotek",
  ]) {
    if (tab === "Modelbibliotek" && viewport === "mobile")
      await page
        .getByRole("button", { name: "Åbn navigation", exact: true })
        .click();
    await page
      .getByRole(tab === "Modelbibliotek" ? "button" : "tab", {
        name: tab,
        exact: tab !== "Scenarier",
      })
      .click();
    const result = await page.evaluate(() =>
      axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
        resultTypes: ["violations"],
      }),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    const entry = {
      viewport,
      tab,
      overflow,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    };
    summary.push(entry);
    console.log(JSON.stringify(entry));
    await writeFile(
      `reports/flowlab/a11y/${viewport}-${tab.toLowerCase()}.json`,
      JSON.stringify(result, null, 2),
    );
  }
  await context.close();
}
await browser.close();
await writeFile(
  "reports/flowlab/accessibility.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      standard: ["WCAG 2.0 AA", "WCAG 2.1 AA"],
      checks: summary,
    },
    null,
    2,
  ),
);
if (summary.some((s) => s.overflow || s.violations.length))
  process.exitCode = 1;
