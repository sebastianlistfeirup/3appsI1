import { chromium, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { execFileSync } from "node:child_process";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    reducedMotion: "reduce",
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
await expect(
  page.getByText("30 parrede replikationer", { exact: false }),
).toBeVisible();
const card = page.locator(".metric-card").filter({ hasText: "Gennemløbstid" }),
  baseline = await card.locator(".metric-baseline").innerText();
await page.getByLabel("Antal medarbejdere", { exact: true }).fill("0");
await page
  .getByRole("button", { name: "Kør sammenligning", exact: true })
  .click();
await expect(
  page.getByRole("button", { name: "Kør sammenligning", exact: true }),
).toBeVisible();
await expect(card.locator(".metric-baseline")).toHaveText(baseline);
await expect(
  card.getByText("Ingen par med begge målinger", { exact: true }),
).toBeVisible();
await page.getByRole("tab", { name: "Resultater", exact: true }).click();
await expect(
  page.getByText("Mindst én ressourcepool har nul kapacitet.", {
    exact: false,
  }),
).toBeVisible();
if (
  await page
    .getByRole("button", { name: "Luk besked", exact: true })
    .isVisible()
)
  await page.getByRole("button", { name: "Luk besked", exact: true }).click();
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({
  path: "reports/flowlab/desktop-zero-capacity.png",
  fullPage: true,
});
await page.getByRole("tab", { name: "Rapport", exact: true }).click();
const promise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Hent rapportpakke", exact: true })
  .click();
await (await promise).saveAs("reports/flowlab/zero-capacity-report.zip");
const files = unzipSync(
    await readFile("reports/flowlab/zero-capacity-report.zip"),
  ),
  report = JSON.parse(strFromU8(files["report.json"])),
  lead = report.comparison.metrics.find((metric) => metric.key === "leadTime");
expect(lead.baseline).toBeGreaterThan(0);
expect(lead.scenario).toBe(null);
expect(lead.pairs).toBe(0);
expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
  "zero_capacity",
);
await writeFile(
  "reports/flowlab/zero-capacity-report.pdf",
  files["rapport.pdf"],
);
const pdfText = execFileSync(
  "pdftotext",
  ["-layout", "reports/flowlab/zero-capacity-report.pdf", "-"],
  { encoding: "utf8" },
);
expect(pdfText).toContain("Mindst én ressourcepool har nul kapacitet.");
await writeFile(
  "reports/flowlab/edge-results-check.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      baselinePreserved: baseline,
      scenario: lead.scenario,
      pairedLeadMetrics: lead.pairs,
      checks: [
        "Known baseline survives unavailable alternative.",
        "No paired delta fabricated.",
        "Zero capacity explained in UI and actual PDF.",
      ],
      errors,
    },
    null,
    2,
  ),
);
expect(errors).toEqual([]);
await browser.close();
console.log(JSON.stringify({ errors }));
