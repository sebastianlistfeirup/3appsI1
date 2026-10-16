import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const log = [];
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
await expect(
  page.getByText("30 parrede replikationer", { exact: false }),
).toBeVisible();
log.push("Initial comparison completed from engine with 30 paired seeds.");
await page.getByLabel("Antal medarbejdere", { exact: true }).fill("5");
await expect(
  page.getByText("Modellen, det fælles seed eller motoren er opdateret.", { exact: false }),
).toBeVisible();
await page
  .getByRole("heading", { name: "Medlemsservice.", exact: true })
  .click();
await page.keyboard.press("Control+z");
await expect(
  page.getByLabel("Antal medarbejdere", { exact: true }),
).toHaveValue("4");
log.push("Capacity edit marks prior result stale; keyboard undo restores 4.");
await page.getByLabel("Antal medarbejdere", { exact: true }).fill("5");
await page
  .getByRole("button", { name: "Kør sammenligning", exact: true })
  .click();
await expect(
  page.getByRole("button", { name: "Kør sammenligning", exact: true }),
).toBeVisible();
await expect(
  page.getByText("Modellen, det fælles seed eller motoren er opdateret.", { exact: false }),
).toHaveCount(0);
await page.getByRole("button", { name: "Gem version", exact: true }).click();
await page.getByRole("button", { name: "Modelbibliotek", exact: true }).click();
await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
log.push("Edited model reruns; immutable version saved and listed.");
await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
await page.getByLabel("Vælg CSV-fil", { exact: true }).setInputFiles({
  name: "syntetisk-kvalitet.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    "case_id,started_at,finished_at,event_id\nsample-a,10,5,a\nsample-b,10,20,b\nsample-c,20,40,c",
  ),
});
await page
  .getByRole("combobox", { name: "Tidsformat", exact: true })
  .selectOption("seconds");
await page
  .getByRole("button", { name: "Kontrollér data", exact: true })
  .click();
await expect(
  page.getByText("Række 2 · finished_at", { exact: true }),
).toBeVisible();
await expect(
  page.getByRole("button", { name: "Gem valideret datagrundlag", exact: true }),
).toBeDisabled();
await page.getByRole("checkbox").check();
await page
  .getByRole("button", { name: "Gem valideret datagrundlag", exact: true })
  .click();
await expect(
  page.getByText("Gemt: syntetisk-kvalitet.csv", { exact: false }),
).toBeVisible();
await page.screenshot({
  path: "reports/flowlab/desktop-data-quality.png",
  fullPage: true,
});
log.push(
  "CSV negative duration rejected at exact row; explicit exclusion required; cleaned data persisted.",
);
await page
  .getByRole("button", { name: "Brug median som fast varighed", exact: true })
  .click();
await expect(
  page.getByText("Modellen, det fælles seed eller motoren er opdateret.", { exact: false }),
).toBeVisible();
await page.getByRole("tab", { name: "Model", exact: true }).click();
await expect(
  page.getByRole("combobox", { name: "Varighedsfordeling", exact: true }),
).toHaveValue("fixed");
await expect(
  page.getByLabel("Varighed (minutter)", { exact: true }),
).toHaveValue("0.25");
log.push(
  "Explicit data-to-model transfer uses actual 15-second observed median, remains uncalibrated.",
);
await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
const second = await context.newPage();
await second.goto("http://localhost:3001", { waitUntil: "networkidle" });
await second.getByRole("tab", { name: "Scenarier", exact: false }).click();
await page
  .getByRole("textbox", { name: "Din hypotese", exact: true })
  .fill("Ændret i fane A. Skal give en synlig konflikt i fane B.");
await expect(
  second.getByText("En nyere version er gemt i en anden fane.", {
    exact: false,
  }),
).toBeVisible();
await second
  .getByRole("button", { name: "Hent gemt version", exact: true })
  .click();
await expect(
  second.getByRole("textbox", { name: "Din hypotese", exact: true }),
).toHaveValue("Ændret i fane A. Skal give en synlig konflikt i fane B.");
await second.close();
log.push(
  "Two-tab revision conflict is visible and reload resolves it without silent overwrite.",
);
await page
  .getByRole("button", { name: "Kør sammenligning", exact: true })
  .click();
await expect(
  page.getByRole("button", { name: "Kør sammenligning", exact: true }),
).toBeVisible();
await page.getByRole("tab", { name: "Rapport", exact: true }).click();
await page
  .getByLabel("Din beslutning til rapporten")
  .fill(
    "Pilotér ændringen, og mål faktisk ventetid før en permanent beslutning.",
  );
const downloadPromise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Hent rapportpakke", exact: true })
  .click();
const download = await downloadPromise;
await download.saveAs("reports/flowlab/verified-report.zip");
const files = unzipSync(await readFile("reports/flowlab/verified-report.zip"));
const report = JSON.parse(strFromU8(files["report.json"]));
await writeFile("reports/flowlab/verified-report.pdf", files["rapport.pdf"]);
const text = execFileSync(
  "pdftotext",
  ["-layout", "reports/flowlab/verified-report.pdf", "-"],
  { encoding: "utf8" },
);
const fmt = (key, n) =>
  n === null
    ? "—"
    : key === "leadTime" || key === "queueTime"
      ? `${new Intl.NumberFormat("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 60000)} min`
      : key === "utilization" || key === "slaCompleted"
        ? `${new Intl.NumberFormat("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n * 100)} %`
        : key === "cost"
          ? `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n)} kr.`
          : new Intl.NumberFormat("da-DK", {
              maximumFractionDigits: n % 1 ? 1 : 0,
              minimumFractionDigits: n % 1 ? 1 : 0,
            }).format(n);
for (const metric of report.comparison.metrics)
  for (const field of ["baseline", "scenario"]) {
    const expected = fmt(metric.key, metric[field]);
    if (!text.includes(expected))
      throw new Error(`PDF mismatch: ${metric.key}.${field} = ${expected}`);
  }
expect(report.comparison.seeds).toHaveLength(30);
expect(report.comparison.baselineRuns.map((r) => r.seed)).toEqual(
  report.comparison.scenarioRuns.map((r) => r.seed),
);
log.push(
  "FL-AT12: every rendered PDF baseline/scenario KPI matches underlying JSON run_metrics; ZIP includes same 30 seeds.",
);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Rapport", exact: true }).click();
await expect(page.getByLabel("Din beslutning til rapporten")).toHaveValue(
  "Pilotér ændringen, og mål faktisk ventetid før en permanent beslutning.",
);
log.push("Report decision survives browser reload.");
await context.close();
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  const c = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:3001", { waitUntil: "networkidle" });
  await expect(
    p.getByText("30 parrede replikationer", { exact: false }),
  ).toBeVisible();
  if (name === "mobile")
    await p
      .getByRole("button", { name: "Åbn navigation", exact: true })
      .click();
  await p.getByRole("button", { name: "Modelbibliotek", exact: true }).click();
  await p.screenshot({
    path: `reports/flowlab/${name}-empty-versions.png`,
    fullPage: true,
  });
  await p.getByRole("tab", { name: "Model", exact: true }).click();
  if (
    await p
      .getByRole("button", { name: "Vis listeeditor", exact: true })
      .isVisible()
  )
    await p
      .getByRole("button", { name: "Vis listeeditor", exact: true })
      .click();
  await p.getByRole("button", { name: /Beslutning Kvalitetstjek/ }).click();
  const probability = p
    .getByLabel("Sandsynlighed (%)", { exact: true })
    .first();
  await probability.fill("20");
  await p
    .getByRole("button", { name: "Kør sammenligning", exact: true })
    .click();
  await expect(p.getByRole("alert").first()).toContainText("100 %");
  await p.screenshot({
    path: `reports/flowlab/${name}-invalid-routing.png`,
    fullPage: true,
  });
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error(`${name}: horizontal overflow`);
  await c.close();
}
log.push(
  "Empty versions and validation error states inspected at desktop, tablet and mobile; no horizontal overflow.",
);
await writeFile(
  "reports/flowlab/journey-check.json",
  JSON.stringify(
    { checkedAt: new Date().toISOString(), checks: log, errors },
    null,
    2,
  ),
);
await browser.close();
console.log(JSON.stringify({ checks: log.length, errors }));
if (errors.length) process.exitCode = 1;
