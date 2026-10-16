import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { initialDocument } from "../src/lib/document";
import { EXAMPLE_TEMPLATES } from "../src/lib/templates";

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
      const library = async () => {
        if (name === "mobile")
          await page
            .getByRole("button", { name: "Åbn navigation", exact: true })
            .click();
        await page
          .getByRole("button", { name: "Modelbibliotek", exact: true })
          .click();
      };
      const download = async (button: string) => {
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: button, exact: true }).click();
        return JSON.parse(
          await readFile((await (await pending).path())!, "utf8"),
        );
      };
      const doc = initialDocument();
      doc.scenarioName = "Mit tidligere eksperiment";
      doc.hypothesis = "Denne antagelse skal arkiveres før en ny skabelon.";
      doc.decision =
        "Min beslutningskladde skal bevares på tværs af skabeloner.";
      doc.scenario.resources[0].capacity = 5;
      await library();
      await page
        .getByLabel("Importér modelpakke", { exact: true })
        .setInputFiles({
          name: "draft.json",
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
      await library();
      const catalog = page.getByRole("region", {
        name: "Prøv en anden mekanisme.",
        exact: true,
      });
      await expect(catalog.getByRole("article")).toHaveCount(3);
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations.map((v: any) => ({
          id: v.id,
          targets: v.nodes.map((n: any) => n.target),
        })),
      );
      expect(violations).toEqual([]);
      const close = page.getByRole("button", {
        name: "Luk besked",
        exact: true,
      });
      if (await close.isVisible()) await close.click();
      await catalog
        .getByRole("heading", { name: "Prøv en anden mekanisme.", exact: true })
        .click();
      await catalog.screenshot({
        path: `reports/flowlab/${engine}-${name}-templates.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const summaries: unknown[] = [];
      for (const template of EXAMPLE_TEMPLATES) {
        await page
          .getByRole("button", {
            name: `Åbn skabelon: ${template.title}`,
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", {
            name: `${template.title}.`,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText("30 parrede replikationer", { exact: false }),
        ).toBeVisible();
        const scenarioNames = {
          routing: "Ét team pr. sagstype",
          rework: "Antaget 10 % genarbejde",
          calendar: "En time tidligere pause",
        };
        await expect(page.locator(".hypothesis-strip strong")).toHaveText(
          scenarioNames[template.id],
        );
        if (template.id === "routing") {
          await expect(
            page
              .locator(".resource-chart")
              .getByText("Fælles team", { exact: true }),
          ).toBeVisible();
          await expect(page.locator(".resource-label-change")).toHaveText(
            "Alternativ: Team til enkle sager",
          );
        }
        if (
          engine === "chromium" &&
          (name === "desktop" || template.id === "routing")
        ) {
          if (await close.isVisible()) await close.click();
          await page
            .getByRole("heading", { name: `${template.title}.`, exact: true })
            .click();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `reports/flowlab/${engine}-${name}-template-${template.id}-model.png`,
            fullPage: true,
          });
        }
        await page.getByRole("tab", { name: "Rapport", exact: true }).click();
        const report = await download("Hent JSON-grundlag"),
          comparison = report.comparison;
        expect(comparison.seeds).toHaveLength(30);
        expect(comparison.status).toBe("completed");
        expect(comparison.baseline.evidence).toBe("synthetic");
        expect(comparison.scenario.evidence).toBe("synthetic");
        expect(report.decision).toBe(doc.decision);
        expect(report.baseSeed).toBe(2026);
        const base = comparison.baselineRuns[0].metrics,
          alt = comparison.scenarioRuns[0].metrics;
        if (template.id === "routing") {
          expect([
            base.throughput,
            alt.throughput,
            base.backlog,
            alt.backlog,
          ]).toEqual([11, 9, 1, 3]);
          expect([base.leadTime.median, alt.leadTime.median]).toEqual([
            35 * 60000,
            10 * 60000,
          ]);
          expect([base.cost, alt.cost]).toEqual([1140, 1140]);
          expect(
            comparison.scenarioRuns[0].cases
              .filter((item: any) => item.completedAt === null)
              .every((item: any) => item.caseType === "kompleks"),
          ).toBe(true);
        } else if (template.id === "calendar") {
          expect([
            base.throughput,
            alt.throughput,
            base.cost,
            alt.cost,
          ]).toEqual([4, 4, 1995, 1995]);
          expect([base.leadTime.median, alt.leadTime.median]).toEqual([
            165 * 60000,
            195 * 60000,
          ]);
          expect(
            comparison.scenarioRuns[0].cases.map(
              (item: any) => item.completedAt,
            ),
          ).toEqual([90, 240, 330, 420].map((minutes) => minutes * 60000));
        } else {
          expect([
            base.throughput,
            alt.throughput,
            base.variableCost,
            alt.variableCost,
          ]).toEqual([20, 20, 120, 100]);
          expect([base.plannedWaitTime.mean, alt.plannedWaitTime.mean]).toEqual(
            [6 * 60000, 0],
          );
          expect([base.salaryCost, alt.salaryCost]).toEqual([3420, 3420]);
        }
        summaries.push({
          template: template.id,
          metrics: comparison.metrics,
          firstSeed: comparison.seeds[0],
        });
        await library();
      }
      const workspace = await download("Eksportér arbejdsrum");
      expect(workspace.versions).toHaveLength(3);
      const archived = workspace.versions.find(
        (version: any) => version.context?.scenarioName === doc.scenarioName,
      );
      expect(archived.scenario.resources[0].capacity).toBe(5);
      expect(archived.context.hypothesis).toBe(doc.hypothesis);
      expect(workspace.decision).toBe(doc.decision);
      expect(workspace.baseline.id).toBe("workday-break");
      await page.getByRole("tab", { name: "Model", exact: true }).click();
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Ansøgninger og genarbejde.",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Gentag ændring", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Arbejdsdag med pause.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", {
          name: "Arbejdsdag med pause.",
          exact: true,
        }),
      ).toBeVisible();
      await library();
      await page
        .getByRole("button", { name: "Åbn frisk skabelon", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Medlemsservice.", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      results.push({
        viewport: name,
        summaries,
        violations,
        checks: [
          "All three templates open and run actual 30-seed comparisons",
          "Routing exposes lower completed median alongside increased complex backlog",
          "Rework preserves unique cases while charging repeated visits and tracking planned wait",
          "Calendar moves lunch, preserves salary and resumes remaining work",
          "Previous experiment and decision preserved; undo/redo, durable reload and original template still work",
          "WCAG2AA/21AA zero, no errors or overflow",
        ],
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-templates-check.json`,
      JSON.stringify(
        { executedAt: new Date().toISOString(), results, errors },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({ browser: engine, viewports: results.length, errors }),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
