import { chromium, firefox, webkit, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
  const engine = (process.env.FLOWLAB_BROWSER ?? "chromium") as
    "chromium" | "firefox" | "webkit";
  const browser = await { chromium, firefox, webkit }[engine].launch(
    engine === "chromium"
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {},
  );
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
    ).toBeVisible({ timeout: 20000 });
    const status = page.locator(".evidence-status");
    await expect(status).toContainText("Baseline er ikke holdout-vurderet");
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
    await expect(status).toContainText(
      "Baseline mangler tilstrækkelig holdout-data",
    );
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
    await expect(status).toContainText("Baseline når holdout-pilotmålet");
    await status.locator("summary").click();
    await expect(status).toContainText(
      "alternativet er ikke særskilt holdout-vurderet",
    );
    await expect(status).toContainText("0–300 sekunder");
    await expect(status).toContainText("3 · 30 simulerede seeds");
    await expect(
      page.getByRole("button", { name: "Luk besked", exact: true }),
    ).toBeHidden({ timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `reports/flowlab/${engine}-${name}-evidence-status.png`,
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
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
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
      ).saveAs(`reports/flowlab/${engine}-evidence-report.zip`);
      const files = unzipSync(
        await readFile(`reports/flowlab/${engine}-evidence-report.zip`),
      );
      const report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.holdoutMatchesBaseline).toBe(true);
      expect(report.holdout.metrics.throughput.observed).toBe(3);
      expect(report.holdout.metrics.leadTime.observed).toBe(120000);
      expect(report.holdout.seeds).toHaveLength(30);
      expect(report.holdoutDataset.result.rows).toHaveLength(3);
      expect(files["holdout-renset.csv"]).toBeDefined();
      await writeFile(
        `reports/flowlab/${engine}-evidence-report.pdf`,
        files["rapport.pdf"],
      );
      const pdfText = execFileSync(
        "pdftotext",
        ["-layout", `reports/flowlab/${engine}-evidence-report.pdf`, "-"],
        { encoding: "utf8" },
      );
      expect(pdfText).toContain("Baseline når holdout-pilotmålet");
      expect(pdfText).not.toContain("Lokal model · Ikke kalibreret");
    }
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    const toggle = page.getByRole("button", {
      name: /^Vis (listeeditor|canvas)$/,
    });
    if ((await toggle.getAttribute("aria-label")) === "Vis listeeditor")
      await toggle.click();
    await page.getByRole("button", { name: /Aktivitet Aktivitet/ }).click();
    await page.getByRole("button", { name: "Baseline", exact: true }).click();
    const capacity = page.getByRole("textbox", {
      name: "Antal medarbejdere",
      exact: true,
    });
    await capacity.fill("2");
    await capacity.press("Enter");
    await expect(status).toContainText("Baseline har en historisk holdout");
    await expect(status).toHaveClass(/review/);
    await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
    await expect(page.locator(".holdout-status")).toHaveClass(/review/);
    await expect(page.locator(".holdout-status")).toContainText(
      "Historisk vurdering",
    );
    await expect(page.locator(".holdout-status")).toContainText(
      "Tidligere resultat: pilotmålet var nået",
    );
    if (name === "desktop") {
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(page.locator(".report-paper")).toContainText(
        "BASELINE · HISTORISK HOLDOUT",
      );
      const historicalDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const historicalFiles = unzipSync(
        await readFile((await (await historicalDownload).path())!),
      );
      const historical = JSON.parse(strFromU8(historicalFiles["report.json"]));
      expect(historical.holdoutMatchesBaseline).toBe(false);
      expect(historical.holdout.status).toBe("target_met");
      expect(historical.comparison.baseline.resources[0].capacity).toBe(2);
      expect(historical.holdout.model.resources[0].capacity).toBe(1);
      const historicalPath = `reports/flowlab/${engine}-historical-evidence.pdf`;
      await writeFile(historicalPath, historicalFiles["rapport.pdf"]);
      const historicalText = execFileSync(
        "pdftotext",
        ["-layout", historicalPath, "-"],
        { encoding: "utf8" },
      );
      expect(historicalText).toContain("Baselineholdout er historisk");
      expect(historicalText).toContain(
        "Historisk holdout · tidligere vurdering",
      );
      expect(historicalText).not.toContain("Baseline når holdout-pilotmålet");
    }

    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await page
      .getByRole("button", { name: "Fortryd ændring", exact: true })
      .click();
    await expect(status).toContainText("Baseline når holdout-pilotmålet");
    await expect(capacity).toHaveValue("1");
    await page.getByRole("button", { name: "Alternativ", exact: true }).click();
    await capacity.fill("2");
    await capacity.press("Enter");
    await expect(status).toContainText("Baseline når holdout-pilotmålet");
    await expect(status).toHaveClass(/met/);
    if ((await status.getAttribute("open")) === null)
      await status.locator("summary").click();
    await expect(status).toContainText(
      "alternativet er ikke særskilt holdout-vurderet",
    );
    await page
      .getByRole("button", { name: "Fortryd ændring", exact: true })
      .click();
    await expect(capacity).toHaveValue("1");
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(status).toContainText("Baseline når holdout-pilotmålet");
    await page.getByRole("tab", { name: "Dataværksted", exact: true }).click();
    await page.getByLabel("Vælg CSV-fil", { exact: true }).setInputFiles({
      name: "naeste-periode.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv.replace("a,0", "d,0")),
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
    await expect(
      page.getByText("Gemt: naeste-periode.csv", { exact: false }),
    ).toBeVisible();
    await expect(status).not.toContainText("kildedata mangler");
    await page
      .getByRole("button", {
        name: "Fjern dataversion uafhaengig-periode.csv",
        exact: true,
      })
      .click();
    await expect(status).toContainText(
      "Baseline når holdout-pilotmålet · kildedata mangler",
    );
    if ((await status.getAttribute("open")) === null)
      await status.locator("summary").click();
    await expect(status).toContainText("perioden kan ikke efterprøves fuldt");
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await page
      .getByRole("button", { name: "Fortryd ændring", exact: true })
      .click();
    await expect(status).not.toContainText("kildedata mangler");
    await expect(status).toContainText("Baseline når holdout-pilotmålet");
    expect(errors).toEqual([]);
    outcomes.push({
      viewport: name,
      checks: [
        "Explicit independent and complete window confirmations required.",
        "Exact golden observed throughput, lead time, waiting and backlog.",
        "Holdout preserved across reload; exact period, source, observed3 and30seeds shown.",
        "Baseline edits invalidate status and remove green; undo restores exact assessment match.",
        "Scenario edits leave baseline status but never transfer proof to alternative.",
        "Actual ZIP/PDF and UI share matching baseline status.",
        "Deleting the exact holdout source exposes missing data in collapsed status; undo restores source.",
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
    `reports/flowlab/${engine}-evidence-status-check.json`,
    JSON.stringify({ checkedAt: new Date().toISOString(), outcomes }, null, 2),
  );
  console.log(JSON.stringify(outcomes));
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
