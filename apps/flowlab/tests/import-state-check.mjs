import { existsSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit, expect } from "@playwright/test";
const engine = process.env.FLOWLAB_BROWSER ?? "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch({
  ...(engine === "chromium"
    ? {
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        args: ["--no-sandbox"],
      }
    : {}),
});
const results = [],
  errors = [];
const numericCsv =
  "case_id,activity,started_at,finished_at,event_id\nfirst,Step,0,1,first\nsecond,Step,1,3,second";
const largeCsv =
  "case_id,activity,started_at,finished_at,event_id\n" +
  Array.from(
    { length: 100000 },
    (_, i) => `large-${i}-${"x".repeat(24)},Step,0,60,event-${i}`,
  ).join("\n");
const boundedCsv =
  "case_id,activity,started_at,finished_at,event_id\n" +
  Array.from(
    { length: 1000 },
    (_, i) =>
      `case-${i},Activity-${String(i).padStart(4, "0")},0,60,event-${i}`,
  ).join("\n");
const csv = (name, text) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});
const sha = (text) => createHash("sha256").update(text).digest("hex");
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
    const upload = page.getByLabel("Vælg CSV-fil", { exact: true }),
      analyze = page.getByRole("button", {
        name: "Kontrollér data",
        exact: true,
      }),
      save = page.getByRole("button", {
        name: "Gem valideret datagrundlag",
        exact: true,
      }),
      unit = page.getByRole("combobox", { name: "Tidsformat", exact: true });
    await upload.setInputFiles(csv("unit-proof.csv", numericCsv));
    await unit.selectOption("seconds");
    await analyze.click();
    await expect(save).toBeVisible();
    await unit.selectOption("minutes");
    await expect(save).toHaveCount(0);
    await expect(
      page.getByText("Kontrolleret forhåndsvisning", { exact: true }),
    ).toHaveCount(0);
    await analyze.click();
    await expect(save).toBeVisible();
    await expect(
      page.getByText("positive aktivitetsvarigheder · median 1,5 min", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "finished_at", exact: true })
      .selectOption("");
    await expect(save).toHaveCount(0);
    await analyze.click();
    await expect(save).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Brug median som fast varighed",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("combobox", { name: "finished_at", exact: true })
      .selectOption("finished_at");
    await unit.selectOption("seconds");
    await analyze.click();
    await save.click();
    await expect(
      page.getByText("Gemt: unit-proof.csv", { exact: false }),
    ).toBeVisible();
    const qualityDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Kvalitetstjek", exact: true })
      .click();
    const quality = await qualityDownload;
    const qualityData = JSON.parse(
      await readFile(await quality.path(), "utf8"),
    );
    expect(qualityData.source).toEqual({
      name: "unit-proof.csv",
      sha256: sha(numericCsv),
      unit: "seconds",
    });
    results.push({
      viewport: name,
      test: "Changing units or mapping invalidates preview; quality export records exact source hash and unit",
      passed: true,
    });
    await upload.setInputFiles(csv("unit-proof.csv", numericCsv));
    await expect(analyze).toBeVisible();
    await analyze.click();
    await expect(save).toBeVisible();
    results.push({
      viewport: name,
      test: "The same file can be selected again",
      passed: true,
    });
    await upload.setInputFiles(csv("large-cancel.csv", largeCsv));
    await expect(
      page.getByRole("button", { name: "large-cancel.csv", exact: false }),
    ).toBeVisible();
    await analyze.click();
    await page.getByRole("button", { name: "Afbryd", exact: true }).click();
    await expect(
      page.getByText(
        "Importen er afbrudt. Dit gemte datagrundlag er bevaret.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(save).toHaveCount(0);
    // A terminated worker must never post an eventual result or replace the saved source.
    await page.waitForTimeout(1000);
    await expect(save).toHaveCount(0);
    await expect(
      page.getByText("Gemt: unit-proof.csv", { exact: false }),
    ).toBeVisible();
    results.push({
      viewport: name,
      test: "Cancel a real 100,000-row worker import immediately; saved dataset survives without late result",
      passed: true,
      bytes: Buffer.byteLength(largeCsv),
    });
    await analyze.click();
    await upload.setInputFiles(csv("replacement.csv", boundedCsv));
    await expect(
      page.getByRole("button", { name: "replacement.csv", exact: false }),
    ).toBeVisible();
    await analyze.click();
    await expect(save).toBeVisible();
    await save.click();
    await expect(
      page.getByText("Gemt: replacement.csv", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText(sha(boundedCsv), { exact: true }),
    ).toBeVisible();
    const picker = page.getByRole("combobox", {
      name: "Observeret aktivitet",
      exact: false,
    });
    expect(
      await page.locator("datalist").first().locator("option").count(),
    ).toBe(200);
    await picker.fill("Activity-0999");
    await expect(
      page.getByRole("button", {
        name: "Brug median som fast varighed",
        exact: true,
      }),
    ).toBeEnabled();
    expect(
      await page.locator("datalist").first().locator("option").count(),
    ).toBe(1);
    results.push({
      viewport: name,
      test: "Replacing an active large import keeps new source; native activity suggestions stay bounded and searchable",
      passed: true,
    });
    await page
      .getByRole("checkbox", {
        name: "Denne periode er uafhængig",
        exact: false,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "Alle ankomster, aktivitetsbesøg",
        exact: false,
      })
      .check();
    await upload.setInputFiles(csv("reset-confirmations.csv", numericCsv));
    await analyze.click();
    await save.click();
    await expect(
      page.getByRole("checkbox", {
        name: "Denne periode er uafhængig",
        exact: false,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: "Alle ankomster, aktivitetsbesøg",
        exact: false,
      }),
    ).not.toBeChecked();
    results.push({
      viewport: name,
      test: "Holdout confirmations reset for a different saved dataset",
      passed: true,
    });
    const close = page.getByRole("button", { name: "Luk besked", exact: true });
    if (await close.isVisible()) await close.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `reports/flowlab/${engine}-${name}-import-state.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await context.close();
  }
  expect(errors).toEqual([]);
  await writeFile(
    `reports/flowlab/import-state-${engine}.json`,
    JSON.stringify(
      { executedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      browser: engine,
      passed: results.length,
      pageErrors: errors.length,
    }),
  );
} finally {
  await browser.close();
}
