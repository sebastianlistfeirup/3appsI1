import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import {
  initialDocument,
  formatDifference,
  formatMetric,
} from "../src/lib/document";
import {
  compareModels,
  goldenModel,
  metricDefinitions,
  type MetricKey,
} from "@tre/flow-engine";
import { pairedRunValues, runDistribution } from "../src/lib/run-distribution";
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
    ).source;
  const doc = initialDocument(),
    comparison = await compareModels(doc.baseline, doc.scenario),
    expected = runDistribution(pairedRunValues(comparison, "leadTime"));
  const results: unknown[] = [],
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
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
      const panel = page.locator(".run-distribution");
      await expect(panel.locator(".distribution-summary strong")).toHaveText([
        String(expected.lower),
        String(expected.equal),
        String(expected.higher),
      ]);
      expect(await panel.locator(".histogram-bar b").allTextContents()).toEqual(
        expected.bins.map((bin) => String(bin.rows.length)),
      );
      await expect(panel.locator(".distribution-quantiles b")).toHaveText([
        formatDifference("leadTime", expected.p10),
        formatDifference("leadTime", expected.median),
        formatDifference("leadTime", expected.p90),
      ]);
      const bin = expected.bins.findIndex((value) => value.rows.length > 1),
        button = panel.locator(".histogram-bin").nth(bin);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(panel.locator(".distribution-filter")).toContainText(
        `${expected.bins[bin].rows.length} par`,
      );
      await expect(
        panel
          .getByRole("combobox", { name: "Undersøg et seedpar", exact: false })
          .locator("option"),
      ).toHaveCount(expected.bins[bin].rows.length);
      const chosen = expected.bins[bin].rows.at(-1)!;
      await panel
        .getByRole("combobox", { name: "Undersøg et seedpar", exact: false })
        .selectOption(String(chosen.seed));
      await expect(
        panel.locator(".distribution-pair-detail strong"),
      ).toHaveText([
        formatMetric("leadTime", chosen.baseline),
        formatMetric("leadTime", chosen.scenario),
        formatDifference("leadTime", chosen.delta),
      ]);
      const downloadPromise = page.waitForEvent("download");
      await panel
        .getByRole("button", { name: "Hent kørsler som CSV", exact: true })
        .click();
      const download = await downloadPromise,
        csv = (await readFile((await download.path())!)).toString();
      expect(csv.split("\n")[0]).toBe(
        "seed,metric,unit,baseline,scenario,delta",
      );
      expect(
        csv
          .split("\n")
          .slice(1)
          .map((line) => line.split(",")),
      ).toEqual(
        pairedRunValues(comparison, "leadTime").map((row) => [
          String(row.seed),
          "leadTime",
          "ms",
          String(row.baseline),
          String(row.scenario),
          String(row.delta),
        ]),
      );
      await writeFile(`reports/flowlab/${engine}-${name}-paired-runs.csv`, csv);
      await page.addScriptTag({ content: axe });
      const a11y = await page.evaluate(
        async () =>
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      );
      expect(a11y.violations).toEqual([]);
      await panel
        .getByRole("heading", {
          name: "Hvordan varierer effekten?",
          exact: true,
        })
        .click();
      await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
      await panel.screenshot({
        path: `reports/flowlab/${engine}-${name}-run-distribution.png`,
      });
      for (const key of Object.keys(metricDefinitions) as MetricKey[]) {
        await panel
          .getByRole("combobox", { name: "Vælg måling", exact: false })
          .selectOption(key);
        const checked = runDistribution(pairedRunValues(comparison, key));
        await expect(panel.locator(".distribution-summary strong")).toHaveText([
          String(checked.lower),
          String(checked.equal),
          String(checked.higher),
        ]);
      }
      const library = async () => {
        if (name === "mobile")
          await page
            .getByRole("button", { name: "Åbn navigation", exact: true })
            .click();
        await page
          .getByRole("button", { name: "Modelbibliotek", exact: true })
          .click();
      };
      const load = async (input: ReturnType<typeof initialDocument>) => {
        await library();
        await page
          .getByLabel("Importér modelpakke", { exact: true })
          .setInputFiles({
            name: "distribution.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(input)),
          });
        await expect(
          page.getByText("Modellen er importeret;", { exact: false }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        await expect(
          page.getByText("30 parrede replikationer", { exact: false }),
        ).toBeVisible();
        await page
          .getByRole("tab", { name: "Resultater", exact: true })
          .click();
      };
      const constant = initialDocument();
      constant.baseline = goldenModel();
      constant.scenario = goldenModel();
      constant.scenario.resources[0].capacity = 2;
      await load(constant);
      await panel
        .getByRole("combobox", { name: "Vælg måling", exact: false })
        .selectOption("queueTime");
      await expect(panel.locator(".histogram-bin")).toHaveCount(1);
      await expect(panel.locator(".histogram-bar b")).toHaveText("30");
      await expect(panel.locator(".distribution-summary strong")).toHaveText([
        "30",
        "0",
        "0",
      ]);
      constant.scenario.resources[0].capacity = 0;
      await load(constant);
      await expect(panel.locator(".histogram-bin")).toHaveCount(0);
      await expect(panel.locator(".distribution-empty")).toContainText(
        "Ingen par har begge målinger",
      );
      await expect(
        panel.locator(".distribution-pair-detail strong"),
      ).toHaveText(["2,0 min", "—", "—"]);
      await panel.locator("summary").click();
      await expect(panel.locator("tbody tr")).toHaveCount(30);
      results.push({
        name,
        width,
        height,
        checks: [
          "Actual bucket counts and engine percentiles agree for 30 runs",
          "Keyboard interval selection filters exact seed list",
          "Selected pair and CSV preserve actual per-seed values and units",
          "All seven metrics match numerical distribution",
          "Constant golden deltas use one real bin",
          "Missing alternative values remain unavailable in chart and 30-row table",
          "WCAG2AA/21AA violations 0; no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-run-distribution-check.json`,
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          browser: engine,
          results,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      `${engine}: actual paired distributions, keyboard, CSV, constant and unavailable outcomes passed at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
