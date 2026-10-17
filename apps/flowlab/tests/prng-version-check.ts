import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { ENGINE_VERSION, PRNG_VERSION } from "@tre/flow-engine";
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
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      // Deliberately alter provenance only in an actual persisted run. Metrics remain actual worker output.
      const metrics = await page.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const request = indexedDB.open("tre-apps-flowlab-v1", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction("documents", "readwrite"),
                store = tx.objectStore("documents");
              const get = store.get("workspace");
              let result: unknown;
              get.onsuccess = () => {
                const envelope = get.result;
                envelope.data.comparison.baselineRuns[29].prngVersion =
                  "unknown-prng";
                envelope.revision++;
                envelope.updatedAt = new Date().toISOString();
                result = envelope.data.comparison.metrics;
                store.put(envelope);
              };
              tx.oncomplete = () => {
                db.close();
                resolve(result);
              };
              tx.onabort = () => {
                db.close();
                reject(tx.error);
              };
            };
          }),
      );
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".stale-notice")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Eksportér rapport", exact: true }),
      )
        .toBeDisabled()
        .catch(async (error) => {
          await page.screenshot({
            path: `reports/flowlab/${engine}-${name}-prng-failure.png`,
            fullPage: true,
          });
          await writeFile(
            `reports/flowlab/${engine}-${name}-prng-failure.txt`,
            await page.locator("body").innerText(),
          );
          throw error;
        });
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
      const explorer = page.locator(".case-explorer");
      await expect(explorer).toContainText("motorversion eller PRNG-version");
      await expect(
        explorer.getByRole("button", { name: /^Undersøg sag/ }),
      ).toHaveCount(0);
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations.map((v: any) => v.id),
      );
      expect(violations).toEqual([]);
      await expect(
        page.getByRole("button", { name: "Luk besked", exact: true }),
      ).toBeHidden({ timeout: 10000 });
      await explorer.screenshot({
        path: `reports/flowlab/${engine}-${name}-prng-version.png`,
      });
      await page
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      await page.getByLabel("Vælg CSV-fil", { exact: true }).setInputFiles({
        name: "version-check.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "case_id,arrived_at,activity,started_at,finished_at\na,0,Aktivitet,0,90",
        ),
      });
      await page
        .getByRole("combobox", { name: "Tidsformat", exact: true })
        .selectOption("seconds");
      await page
        .getByRole("button", { name: "Kontrollér data", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Gem valideret datagrundlag",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Vurdér baseline mod holdout",
          exact: true,
        })
        .click();
      await expect(page.locator(".holdout-panel .error-box")).toContainText(
        "aktuelle motor- og PRNG-version",
      );
      await expect(page.locator(".holdout-status")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Eksportér rapport", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", {
          name: "Vurdér baseline mod holdout",
          exact: true,
        })
        .click();
      await expect(page.locator(".holdout-panel .error-box")).toHaveCount(0);
      await expect(page.locator(".holdout-status")).toContainText(
        "Datagrundlaget er ikke tilstrækkeligt",
      );
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const files = unzipSync(await readFile((await (await pending).path())!));
      const report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.comparison.metrics).toEqual(metrics);
      expect(report.comparison.seeds).toHaveLength(30);
      expect(
        [
          ...report.comparison.baselineRuns,
          ...report.comparison.scenarioRuns,
        ].every(
          (run) =>
            run.prngVersion === PRNG_VERSION &&
            run.engineVersion === ENGINE_VERSION,
        ),
      ).toBe(true);
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
      await explorer
        .getByRole("button", { name: /^Undersøg sag/ })
        .first()
        .click();
      const evidencePending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent sagsforløb", exact: true })
        .click();
      const evidence = JSON.parse(
        await readFile((await (await evidencePending).path())!, "utf8"),
      );
      expect(evidence.baseline.prngVersion).toBe(PRNG_VERSION);
      expect(evidence.scenario.prngVersion).toBe(PRNG_VERSION);
      expect(evidence.baseline.events.length).toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      results.push({
        name,
        checks: [
          "Actual persisted30-pair run with one unknownPRNG stays historical and readable",
          "Report and case replay blocked; holdout refuses unknownPRNG before assessment",
          "Actual recomputation preserves metrics and restores30-pair report, correctPRNG and real case replay",
        ],
        axeViolations: violations.length,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-prng-version-check.json`,
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
      `${engine}: PRNG provenance rejection and actual recomputation passed all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
