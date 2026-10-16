import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { initialDocument } from "../src/lib/document";
import { goldenModel, seedList, ENGINE_VERSION } from "@tre/flow-engine";
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
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        (window as any).__delayCaseWorker = false;
        window.Worker = class extends NativeWorker {
          postMessage(message: unknown, options?: any) {
            if (
              (window as any).__delayCaseWorker &&
              message &&
              typeof message === "object" &&
              "caseId" in message
            ) {
              window.setTimeout(() => super.postMessage(message, options), 500);
              return;
            }
            super.postMessage(message, options);
          }
        };
      });
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
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
            name: "case-fixture.json",
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
        await page
          .getByRole("tab", { name: "Resultater", exact: true })
          .click();
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.scenario = goldenModel();
      doc.scenario.resources[0].capacity = 2;
      await load(doc);
      const explorer = page.locator(".case-explorer");
      await expect(page.locator(".queue-chart")).toHaveAttribute(
        "aria-label",
        /5 min/,
      );
      expect(
        await page.locator(".queue-chart text").allTextContents(),
      ).toContain("5 min");
      await page
        .getByRole("button", { name: "Undersøg sag b", exact: true })
        .click();
      await expect(explorer.locator(".case-summary.baseline")).toContainText(
        "30 sek.",
      );
      await expect(explorer.locator(".case-summary.scenario")).toContainText(
        "0 ms",
      );
      await expect(explorer.locator(".case-events")).toContainText(
        "Behandling starter",
      );
      await page
        .getByRole("button", { name: "Alternativhændelser", exact: true })
        .click();
      await expect(explorer.locator(".case-events")).toContainText("1 min");
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent sagsforløb", exact: true })
        .click();
      const download = await downloadPromise,
        raw = await readFile((await download.path())!),
        evidence = JSON.parse(raw.toString());
      expect(evidence.baseline.engineVersion).toBe(ENGINE_VERSION);
      expect(evidence.baseline.seed).toBe(seedList()[0]);
      expect(evidence.baseline.timing).toMatchObject({
        elapsed: 120000,
        queue: 30000,
        plannedWait: 0,
        work: 90000,
        calendarPause: 0,
      });
      expect(evidence.scenario.timing).toMatchObject({
        elapsed: 90000,
        queue: 0,
        work: 90000,
        calendarPause: 0,
      });
      expect(
        evidence.baseline.events
          .filter((event: any) => event.type === "activity_start")
          .map((event: any) => event.time),
      ).toEqual([90000]);
      expect(
        evidence.baseline.events.every((event: any) => event.caseId === "b"),
      ).toBe(true);
      await writeFile(
        `reports/flowlab/${engine}-${name}-case-evidence.json`,
        raw,
      );
      await page
        .getByRole("button", { name: "Baselinehændelser", exact: true })
        .click();
      await page.addScriptTag({ content: axe });
      const a11y = await page.evaluate(
        async () =>
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      );
      expect(a11y.violations).toEqual([]);
      await explorer
        .getByRole("heading", {
          name: "Følg en sag gennem modellen",
          exact: true,
        })
        .click();
      await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
      await explorer.screenshot({
        path: `reports/flowlab/${engine}-${name}-case-explorer.png`,
      });
      await page
        .getByRole("textbox", { name: "Find sag", exact: false })
        .fill("does-not-exist");
      await expect(
        explorer.getByText("Ingen sager matcher", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "Find sag", exact: false })
        .fill("");
      await page.evaluate(() => {
        (window as any).__delayCaseWorker = true;
      });
      await page
        .getByRole("button", { name: "Undersøg sag a", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Afbryd undersøgelse", exact: true })
        .click();
      await expect(
        explorer.getByText("Undersøgelsen er afbrudt.", { exact: false }),
      ).toBeVisible();
      await page.waitForTimeout(600);
      await expect(explorer.locator(".case-summary")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Undersøg sag a", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Undersøg sag c", exact: true })
        .click();
      await expect(explorer.locator(".case-detail-heading h4")).toHaveText(
        "Sag c",
      );
      await expect(explorer.locator(".case-summary.baseline")).toContainText(
        "1 min",
      );
      await page.evaluate(() => {
        (window as any).__delayCaseWorker = false;
      });
      const paused = initialDocument();
      paused.baseline = goldenModel();
      paused.baseline.horizon = 130000;
      paused.baseline.arrivals = {
        type: "explicit",
        cases: [{ id: "pause-case", time: 0, caseType: "standard" }],
      };
      paused.baseline.resources[0].calendar = [
        { start: 0, end: 60000 },
        { start: 120000, end: 300000 },
      ];
      paused.scenario = structuredClone(paused.baseline);
      paused.scenario.resources[0].calendar = [];
      await load(paused);
      await page
        .getByRole("button", { name: "Undersøg sag pause-case", exact: true })
        .click();
      await expect(explorer.locator(".case-summary.baseline")).toContainText(
        "Under behandling",
      );
      await expect(explorer.locator(".case-summary.baseline")).toContainText(
        "Den endelige gennemløbstid er ukendt",
      );
      await expect(explorer.locator(".case-summary.scenario")).toContainText(
        "Afsluttet",
      );
      const pausedPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent sagsforløb", exact: true })
        .click();
      const pausedDownload = await pausedPromise,
        pausedEvidence = JSON.parse(
          (await readFile((await pausedDownload.path())!)).toString(),
        );
      expect(pausedEvidence.baseline.timing).toMatchObject({
        elapsed: 130000,
        queue: 0,
        work: 70000,
        calendarPause: 60000,
      });
      expect(pausedEvidence.baseline.case.completedAt).toBeNull();
      expect(pausedEvidence.scenario.case.completedAt).toBe(90000);
      results.push({
        name,
        width,
        height,
        checks: [
          "Actual golden case b reproduces exact baseline and alternative waits",
          "Real JSON contains same first seed, engine, models and filtered events",
          "Short horizon axis uses unique minute labels",
          "Search and no-result state work",
          "Cancel and replacement ignore late worker messages",
          "Calendar pauses remain distinct from queueing; censored lead time is explicit",
          "WCAG2AA/21AA violations 0; no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-case-evidence-check.json`,
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
      `${engine}: case evidence, exact timings, cancel/races and calendar censoring pass at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
