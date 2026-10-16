import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
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
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      const load = async (doc: ReturnType<typeof initialDocument>) => {
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
            name: "resources.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(doc)),
          });
        await expect(
          page.getByText("Modellen er importeret;", { exact: false }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        if (doc.baseline.maxEvents === 1)
          await expect(
            page.getByRole("button", {
              name: "Hent partial JSON",
              exact: true,
            }),
          ).toBeVisible();
        else
          await expect(
            page.getByText("30 parrede replikationer", { exact: false }),
          ).toBeVisible();
      };
      const open = async () => {
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Administrér ressourcepuljer",
            exact: true,
          })
          .click();
      };
      const report = async () => {
        await page
          .getByRole("button", { name: "Kør sammenligning", exact: true })
          .click();
        await expect(page.locator(".stale-notice")).toHaveCount(0);
        await page.getByRole("tab", { name: "Rapport", exact: true }).click();
        const download = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Hent JSON-grundlag", exact: true })
          .click();
        return JSON.parse(
          await readFile((await (await download).path())!, "utf8"),
        );
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.baseline.observationStart = 120000;
      doc.scenario = structuredClone(doc.baseline);
      doc.scenario.resources.push({
        id: "unused",
        label: "Ubrugt team",
        capacity: 2,
        hourlyCost: 300,
        calendar: [],
      });
      await load(doc);
      await open();
      const dialog = page.getByRole("dialog", {
          name: "Kapacitet med en tydelig pris",
          exact: true,
        }),
        apply = dialog.getByRole("button", {
          name: "Anvend ressourcer",
          exact: true,
        }),
        select = dialog.getByRole("combobox", {
          name: "Vælg ressourcepulje",
          exact: true,
        }),
        remove = dialog.getByRole("button", {
          name: "Fjern denne pulje fra kladden",
          exact: true,
        });
      await expect(dialog.locator(".resource-overview")).toContainText(
        "35,00 kr.",
      );
      await expect(dialog.locator(".resource-overview")).toContainText(
        "1 af 2 puljer",
      );
      await expect(remove).toBeDisabled();
      await dialog.getByLabel("Medarbejdere", { exact: true }).fill("");
      await apply.click();
      await expect(dialog.getByRole("alert")).toContainText("heltal");
      await dialog.getByLabel("Medarbejdere", { exact: true }).fill("1");
      await select.selectOption("unused");
      await expect(dialog.locator(".resource-plan")).toContainText("30,00 kr.");
      await remove.click();
      await dialog
        .getByRole("button", { name: "Luk uden at anvende", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Administrér ressourcepuljer",
          exact: true,
        }),
      ).toBeFocused();
      await open();
      await expect(select.locator("option")).toHaveCount(2);
      await select.selectOption("unused");
      await remove.click();
      await apply.click();
      await expect(page.locator(".stale-notice")).toBeVisible();
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Gentag ændring", exact: true })
        .click();
      const cleaned = await report();
      expect(cleaned.comparison.scenario.resources).toHaveLength(1);
      expect(cleaned.comparison.scenarioRuns[0].metrics.salaryCost).toBe(5);
      expect(cleaned.comparison.scenarioRuns[0].cases).toEqual(
        cleaned.comparison.baselineRuns[0].cases,
      );
      await open();
      await dialog
        .getByRole("button", { name: "Ny pulje", exact: true })
        .click();
      await dialog
        .getByLabel("Puljens navn", { exact: true })
        .fill("Ekstra team");
      await dialog.getByLabel("Medarbejdere", { exact: true }).fill("2");
      await dialog
        .getByLabel("Timeløn pr. medarbejder (kr.)", { exact: true })
        .fill("600");
      await expect(dialog.locator(".resource-overview")).toContainText(
        "65,00 kr.",
      );
      await apply.click();
      const listToggle = page.getByRole("button", {
        name: "Vis listeeditor",
        exact: true,
      });
      if (await listToggle.count()) await listToggle.click();
      await page
        .locator(".node-list-item")
        .filter({ hasText: "Aktivitet" })
        .click();
      await page
        .getByRole("combobox", { name: "Ressourcepool", exact: true })
        .selectOption({ label: "Ekstra team" });
      await open();
      await select.selectOption("r");
      await expect(remove).toBeEnabled();
      await remove.click();
      await apply.click();
      const reassigned = await report();
      expect(reassigned.comparison.scenario.resources).toHaveLength(1);
      expect(
        reassigned.comparison.scenario.nodes.find(
          (node: any) => node.id === "a",
        ).resourceId,
      ).toBe(reassigned.comparison.scenario.resources[0].id);
      expect(reassigned.comparison.scenarioRuns[0].metrics.salaryCost).toBe(60);
      expect(
        reassigned.comparison.scenarioRuns[0].metrics.leadTime.median,
      ).toBe(90000);
      const paused = initialDocument();
      paused.baseline = goldenModel();
      paused.baseline.horizon = 200000;
      paused.baseline.arrivals = {
        type: "explicit",
        cases: [{ id: "one", time: 0, caseType: "standard" }],
      };
      paused.scenario = structuredClone(paused.baseline);
      await load(paused);
      await open();
      const addInterval = dialog.getByRole("button", {
        name: "Tilføj arbejdsinterval",
        exact: true,
      });
      await addInterval.click();
      await dialog
        .getByLabel("Arbejdstid 1, fra (minutter)", { exact: true })
        .fill("2");
      await dialog
        .getByLabel("Arbejdstid 1, til (minutter)", { exact: true })
        .fill(String(200000 / 60000));
      await addInterval.click();
      await dialog
        .getByLabel("Arbejdstid 2, fra (minutter)", { exact: true })
        .fill("0");
      await dialog
        .getByLabel("Arbejdstid 2, til (minutter)", { exact: true })
        .fill("2.5");
      await apply.click();
      await expect(dialog.getByRole("alert")).toContainText("overlapper");
      await dialog
        .getByLabel("Arbejdstid 2, til (minutter)", { exact: true })
        .fill("1");
      await expect(dialog.locator(".resource-plan")).toContainText("3,89 kr.");
      await page.evaluate(axe);
      const audit = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      expect(audit.violations).toEqual([]);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await dialog
        .getByRole("heading", {
          name: "Kapacitet med en tydelig pris",
          exact: true,
        })
        .click();
      await dialog.screenshot({
        path: `reports/flowlab/${engine}-${name}-resource-editor.png`,
      });
      await dialog
        .locator(".resource-calendar-actions")
        .scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: `reports/flowlab/${engine}-${name}-resource-calendar.png`,
      });
      await apply.click();
      const calendar = await report();
      expect(calendar.comparison.scenario.resources[0].calendar).toEqual([
        { start: 0, end: 60000 },
        { start: 120000, end: 200000 },
      ]);
      expect(calendar.comparison.scenarioRuns[0].cases[0].completedAt).toBe(
        150000,
      );
      expect(calendar.comparison.scenarioRuns[0].resources[0]).toMatchObject({
        availableTime: 140000,
        busyTime: 90000,
      });
      expect(calendar.comparison.scenarioRuns[0].metrics.salaryCost).toBe(
        (140000 / 3600000) * 100,
      );
      await page.reload({ waitUntil: "networkidle" });
      await open();
      await expect(dialog.locator(".resource-calendar-row")).toHaveCount(2);
      await dialog
        .getByRole("button", {
          name: "Nulstil til åben hele perioden",
          exact: true,
        })
        .click();
      await expect(dialog.locator(".resource-calendar-row")).toHaveCount(0);
      await expect(dialog.locator(".resource-plan")).toContainText("5,56 kr.");
      await dialog
        .getByRole("button", { name: "Luk uden at anvende", exact: true })
        .click();
      const large = initialDocument();
      large.baseline = goldenModel();
      large.baseline.maxEvents = 1;
      large.baseline.resources[0].calendar = Array.from(
        { length: 1000 },
        (_, index) => ({ start: index * 120000, end: index * 120000 + 60000 }),
      );
      large.baseline.resources.push(
        ...Array.from({ length: 49 }, (_, index) => ({
          id: `unused-${index}`,
          label: `Ubrugt ${index}`,
          capacity: 0,
          hourlyCost: 0,
          calendar: [],
        })),
      );
      large.scenario = structuredClone(large.baseline);
      await load(large);
      await open();
      await expect(
        dialog.getByRole("button", { name: "Ny pulje", exact: true }),
      ).toBeDisabled();
      await expect(dialog.locator(".resource-calendar-row")).toHaveCount(20);
      await expect(addInterval).toBeDisabled();
      await dialog
        .getByLabel("Side med arbejdsintervaller", { exact: true })
        .fill("50");
      await expect(dialog.locator(".resource-calendar-row")).toHaveCount(20);
      await dialog
        .getByLabel("Arbejdstid 1000, til (minutter)", { exact: true })
        .fill("1999.001");
      await select.selectOption("unused-48");
      await remove.click();
      await dialog
        .getByRole("button", { name: "Ny pulje", exact: true })
        .click();
      await dialog
        .getByLabel("Puljens navn", { exact: true })
        .fill("Ny efter oprydning");
      await apply.click();
      await page.reload({ waitUntil: "networkidle" });
      await open();
      await expect(select.locator("option")).toHaveCount(50);
      await select.selectOption("r");
      await dialog
        .getByLabel("Side med arbejdsintervaller", { exact: true })
        .fill("50");
      await expect(
        dialog.getByLabel("Arbejdstid 1000, til (minutter)", { exact: true }),
      ).toHaveValue("1999.001");
      expect(await select.locator("option").allTextContents()).toContain(
        "Ny efter oprydning · uden trin",
      );
      results.push({
        name,
        width,
        height,
        checks: [
          "Reserved salary includes unreferenced pools and observation-window capacity",
          "Referenced pool cannot be removed; invalid drafts cannot apply",
          "Cancel, focus return, undo and redo preserve pool state",
          "Removing unused pool changes salary 35 to 5 with identical actual cases",
          "Creating and reassigning a pool preserves references and yields exact salary 60",
          "Overlapping calendar rejected; sorted valid calendar pauses 90s job until 150s",
          "Reload preserves calendar; empty schedule explicitly restores full opening",
          "1000 intervals render 20 at a time and edit persists across pool switches/reload",
          "50-pool budget can be recovered by removing an unused pool",
        ],
        calendarMetrics: calendar.comparison.scenarioRuns[0].resources[0],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-resource-editor-check.json`,
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
      `${engine}: reserved costs, pool cleanup/references, exact calendars and budgets pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
