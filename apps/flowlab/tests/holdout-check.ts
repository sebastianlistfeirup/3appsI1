import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile, readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { initialDocument } from "../src/lib/document";
import { goldenModel } from "../../../packages/flow-engine/src/index";
async function main() {
  const localRequire = createRequire(
      `${process.cwd()}/apps/flowlab/tests/holdout-check.ts`,
    ),
    axe = createRequire(localRequire.resolve("@axe-core/playwright"))(
      "axe-core",
    ).source;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const outcomes: unknown[] = [];
  const doc = initialDocument();
  doc.baseline = goldenModel();
  doc.scenario = goldenModel();
  doc.scenarioName = "Samme proces som kontrol";
  const csv =
    "case_id,arrived_at,activity,started_at,finished_at,event_id\na,0,Aktivitet,0,90,1\nb,60,Aktivitet,90,180,2\nc,120,Aktivitet,180,270,3";
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
    await expect(
      page.getByText("30 parrede replikationer", { exact: false }),
    ).toBeVisible();
    if (name === "mobile")
      await page
        .getByRole("button", { name: "Åbn navigation", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Modelbibliotek", exact: true })
      .click();
    await page
      .getByLabel("Importér modelpakke", { exact: true })
      .setInputFiles({
        name: "holdout-model.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(doc)),
      });
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "FL-AT01.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("30 parrede replikationer", { exact: false }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
    await page.getByLabel("Vælg CSV-fil", { exact: true }).setInputFiles({
      name: "uafhaengig-periode.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page
      .getByRole("combobox", { name: "Tidsformat", exact: true })
      .selectOption("seconds");
    await page
      .getByRole("button", { name: "Kontrollér data", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Gem valideret datagrundlag", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Vurdér baseline mod holdout", exact: true })
      .click();
    await expect(
      page.getByText("Datagrundlaget er ikke tilstrækkeligt", { exact: true }),
    ).toBeVisible();
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
    await page
      .getByRole("button", { name: "Vurdér baseline mod holdout", exact: true })
      .click();
    await expect(
      page.getByText("Pilotmålet er nået for denne periode", { exact: true }),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", { name: "Luk besked", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Luk besked", exact: true })
        .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `reports/flowlab/${name}-holdout.png`,
      fullPage: true,
    });
    await page.addScriptTag({ content: axe });
    const a11y = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
        resultTypes: ["violations"],
      });
      return result.violations.map((v: any) => ({
        id: v.id,
        nodes: v.nodes.map((n: any) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      }));
    });
    expect(a11y).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
    await expect(
      page.getByText("Pilotmålet er nået for denne periode", { exact: true }),
    ).toBeVisible();
    if (name === "desktop") {
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      await (
        await downloadPromise
      ).saveAs("reports/flowlab/holdout-report.zip");
      const files = unzipSync(
        await readFile("reports/flowlab/holdout-report.zip"),
      );
      const report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.holdoutMatchesBaseline).toBe(true);
      expect(report.holdout.metrics.throughput.observed).toBe(3);
      expect(report.holdout.metrics.leadTime.observed).toBe(120000);
      expect(report.holdout.seeds).toHaveLength(30);
      expect(report.holdoutDataset.result.rows).toHaveLength(3);
      expect(files["holdout-renset.csv"]).toBeDefined();
      await writeFile(
        "reports/flowlab/holdout-report.pdf",
        files["rapport.pdf"],
      );
      await page
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Brug median som fast varighed",
          exact: true,
        })
        .click();
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
      await page
        .getByRole("button", {
          name: "Vurdér baseline mod holdout",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Den samme kildefil er allerede brugt", {
          exact: false,
        }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
    outcomes.push({
      viewport: name,
      checks: [
        "Explicit independent and complete window confirmations required.",
        "Exact golden observed throughput, lead time, waiting and backlog.",
        "Holdout preserved across reload.",
        "No page errors or overflow.",
        "Axe WCAG2AA/21AA zero violations.",
      ],
      a11y,
      errors,
    });
    await context.close();
  }
  await browser.close();
  await writeFile(
    "reports/flowlab/holdout-check.json",
    JSON.stringify({ checkedAt: new Date().toISOString(), outcomes }, null, 2),
  );
  console.log(JSON.stringify(outcomes));
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
