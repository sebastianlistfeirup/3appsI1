import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { goldenModel } from "@tre/flow-engine";
import { initialDocument } from "../src/lib/document";
async function main() {
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
  const require = createRequire(import.meta.url),
    axe = createRequire(require.resolve("@axe-core/playwright"))(
      "axe-core",
    ).source,
    results: unknown[] = [],
    errors: string[] = [];
  try {
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["tablet", 1024, 768],
      ["mobile", 390, 844],
    ] as const) {
      const context = await browser.newContext({
          viewport: { width, height },
          acceptDownloads: true,
          reducedMotion: "reduce",
        }),
        page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      // Hold only the first request, never manufacture a result: importing
      // while the initial simulation is pending must start the imported model.
      await page.addInitScript(() => {
        const original = Worker.prototype.postMessage;
        let firstSimulation = !sessionStorage.getItem("held-first-simulation");
        Worker.prototype.postMessage = function (message, ...args: any[]) {
          if (firstSimulation && message?.type === "run") {
            firstSimulation = false;
            sessionStorage.setItem("held-first-simulation", "yes");
            return;
          }
          return original.call(this, message, ...args);
        };
      });
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      const library = async () => {
        if (name === "mobile")
          await page
            .getByRole("button", { name: "Åbn navigation", exact: true })
            .click();
        await page
          .getByRole("button", { name: "Modelbibliotek", exact: true })
          .click();
      };
      const load = async (doc: ReturnType<typeof initialDocument>) => {
        await library();
        await page
          .getByLabel("Importér modelpakke", { exact: true })
          .setInputFiles({
            name: "frames.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(doc)),
          });
        await expect(
          page.getByText("Modellen er importeret;", { exact: false }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        await expect(
          page.getByText("30 parrede replikationer", { exact: false }),
        ).toBeVisible();
      };
      const scenarios = async () =>
        page.getByRole("tab", { name: "Scenarier", exact: false }).click();
      const fixture = initialDocument();
      fixture.baseline = goldenModel();
      fixture.scenario = goldenModel();
      fixture.scenario.resources[0].capacity = 2;
      await load(fixture);
      await scenarios();
      const panel = page.getByRole("region", {
          name: "Forsøgets rammer",
          exact: true,
        }),
        apply = panel.getByRole("button", {
          name: "Anvend fælles rammer",
          exact: true,
        }),
        horizon = panel.getByLabel("Fælles simulationshorisont (timer)", {
          exact: true,
        }),
        start = panel.getByLabel("Fælles målestart (timer)", { exact: true }),
        limit = panel.getByLabel("Hændelsesloft pr. kørsel", { exact: true }),
        baseCost = panel.getByLabel("Fast automation, baseline (kr.)", {
          exact: true,
        }),
        altCost = panel.getByLabel("Fast automation, alternativ (kr.)", {
          exact: true,
        });
      await expect(apply).toBeDisabled();
      await limit.fill("");
      await apply.click();
      await expect(panel.getByRole("alert")).toContainText("Udfyld alle fem");
      await limit.fill("10000");
      await start.fill("1");
      await apply.click();
      await expect(panel.getByRole("alert")).toContainText(
        "Målestart skal ligge",
      );
      await start.fill("0");
      await altCost.fill("1e308");
      await apply.click();
      await expect(panel.getByRole("alert")).toContainText("1.000.000.000.000");
      await start.fill(String(120000 / 3600000));
      await baseCost.fill("100");
      await altCost.fill("250");
      await apply.click();
      await expect(page.locator(".stale-notice")).toBeVisible();
      await expect(apply).toBeDisabled();
      await panel
        .getByRole("heading", { name: "Forsøgets rammer", exact: true })
        .click();
      await page.keyboard.press("Control+z");
      await expect(start).toHaveValue("0");
      await expect(baseCost).toHaveValue("0");
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.keyboard.press("Control+Shift+z");
      await expect(start).toHaveValue(String(120000 / 3600000));
      await expect(baseCost).toHaveValue("100");
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Hent rapportpakke", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const files = unzipSync(await readFile((await (await download).path())!)),
        report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.comparison.baseline).toMatchObject({
        horizon: 300000,
        observationStart: 120000,
        maxEvents: 10000,
        fixedAutomationCost: 100,
      });
      expect(report.comparison.scenario).toMatchObject({
        horizon: 300000,
        observationStart: 120000,
        maxEvents: 10000,
        fixedAutomationCost: 250,
      });
      expect(report.comparison.baselineRuns[0].metrics).toMatchObject({
        throughput: 2,
        completedBeforeWindow: 1,
        cost: 105,
        salaryCost: 5,
        leadTime: { median: 135000, p90: 147000, count: 2 },
      });
      expect(report.comparison.scenarioRuns[0].metrics.cost).toBe(260);
      await writeFile(
        `reports/flowlab/${engine}-${name}-experiment-frame.json`,
        JSON.stringify(
          {
            baseline: report.comparison.baseline,
            scenario: report.comparison.scenario,
            seeds: report.comparison.seeds,
            status: report.comparison.status,
            metrics: report.comparison.metrics,
            firstBaseline: report.comparison.baselineRuns[0].metrics,
            firstScenario: report.comparison.scenarioRuns[0].metrics,
          },
          null,
          2,
        ),
      );
      await page.reload({ waitUntil: "networkidle" });
      await scenarios();
      await expect(start).toHaveValue(String(120000 / 3600000));
      await expect(altCost).toHaveValue("250");
      await limit.fill("1");
      await apply.click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Hent partial JSON", exact: true }),
      ).toBeVisible();
      const partialDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent partial JSON", exact: true })
        .click();
      const partial = JSON.parse(
        await readFile((await (await partialDownload).path())!, "utf8"),
      );
      expect(partial.status).toBe("partial");
      expect(partial.requestedSeeds).toHaveLength(30);
      expect(partial.seeds).toHaveLength(1);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Hent rapportpakke", exact: true }),
      ).toBeDisabled();
      await scenarios();
      await limit.fill("10000");
      await altCost.fill("1000000000000");
      await apply.click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const largeDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const largeFiles = unzipSync(
        await readFile((await (await largeDownload).path())!),
      );
      const pdfPath = `reports/flowlab/${engine}-${name}-large-cost.pdf`;
      await writeFile(pdfPath, largeFiles["rapport.pdf"]);
      const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
        encoding: "utf8",
      });
      expect(pdfText).toContain("1.000,0 mia. kr.");
      expect(pdfText).toContain("5 min");
      const large = JSON.parse(strFromU8(largeFiles["report.json"]));
      expect(
        Number.isFinite(
          large.comparison.metrics.find((metric: any) => metric.key === "cost")
            .scenario,
        ),
      ).toBe(true);
      expect(large.comparison.scenarioRuns[0].metrics.cost).toBe(1000000000010);
      await scenarios();
      await page.evaluate(axe);
      const audit = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      expect(audit.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Luk besked", exact: true }),
      ).toHaveCount(0, { timeout: 10000 });
      await panel
        .getByRole("heading", { name: "Forsøgets rammer", exact: true })
        .click();
      await panel.screenshot({
        path: `reports/flowlab/${engine}-${name}-experiment-settings.png`,
      });
      await load(initialDocument());
      if (
        await page
          .getByRole("button", { name: "Vis listeeditor", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Vis listeeditor", exact: true })
          .click();
      await page
        .locator(".node-list-item")
        .filter({ hasText: "Nye henvendelser" })
        .click();
      await expect(
        page.getByLabel("Forventede nye ankomster i perioden", { exact: true }),
      ).toHaveValue("100");
      await page.getByLabel("Loft for nye sager", { exact: true }).fill("400");
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.reload({ waitUntil: "networkidle" });
      if (
        await page
          .getByRole("button", { name: "Vis listeeditor", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Vis listeeditor", exact: true })
          .click();
      await page
        .locator(".node-list-item")
        .filter({ hasText: "Nye henvendelser" })
        .click();
      await expect(
        page.getByLabel("Loft for nye sager", { exact: true }),
      ).toHaveValue("400");
      results.push({
        name,
        width,
        height,
        checks: [
          "Import before the first simulation completes starts a real fresh comparison",
          "Draft validation rejects empty, invalid window and overflowing cost without mutation",
          "Shared frame applies atomically with undo/redo and stale-report gate",
          "Real warmup cohort gives 2 completions, one pre-window completion and exact costs 105/260",
          "Reload preserves frames and the Poisson arrival cap",
          "Event limit produces real partial JSON and blocks complete report",
          "Recovering the budget enables a fresh complete report",
          "Maximum fixed cost stays finite and PDF retains readable units",
          "WCAG2AA/21AA violations 0; no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-experiment-settings-check.json`,
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          browser: engine,
          results,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `${engine}: experiment frames, warmup, bounded costs, real partial and recovery pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
