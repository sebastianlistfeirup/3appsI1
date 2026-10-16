import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { initialDocument } from "../src/lib/document";
import { goldenModel } from "@tre/flow-engine";
async function main() {
  const engine = (process.env.FLOWLAB_BROWSER ?? "chromium") as
    "chromium" | "firefox" | "webkit";
  const browser = await { chromium, firefox, webkit }[engine].launch({
    ...(engine === "chromium"
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  const localRequire = createRequire(
      `${process.cwd()}/apps/flowlab/tests/data-history-check.ts`,
    ),
    axe = createRequire(localRequire.resolve("@axe-core/playwright"))(
      "axe-core",
    ).source;
  const doc = initialDocument();
  doc.baseline = goldenModel();
  doc.scenario = goldenModel();
  const csv =
    "case_id,arrived_at,activity,started_at,finished_at,event_id\na,0,Aktivitet,0,90,1\nb,60,Aktivitet,90,180,2\nc,120,Aktivitet,180,270,3";
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
      // Hold a real IndexedDB transaction open, so UI selection is observably
      // earlier than durable commit. No stored values or save events are faked.
      await page.addInitScript({
        content: `
        window.__flowlabHoldWrites = false;
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = original.apply(this, args);
          const hold = window.__flowlabHoldWrites;
          if (this.name === "documents" && hold) {
            const until = performance.now() + 15000;
            const keepOpen = () => {
              if (window.__flowlabHoldWrites && performance.now() < until)
                this.get("__flowlab_test_keep_transaction_open__")
                  .addEventListener("success", keepOpen);
            };
            keepOpen();
          }
          return request;
        };
      `,
      });
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
          name: "golden.json",
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
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      const prepare = async (version: number) => {
        await page.getByLabel("Vælg CSV-fil", { exact: true }).setInputFiles({
          name: `period-${version}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(
            version === 1
              ? csv
              : csv.replaceAll("Aktivitet", `Aktivitet-${version}`),
          ),
        });
        await page
          .getByRole("combobox", { name: "Tidsformat", exact: true })
          .selectOption("seconds");
        await page
          .getByRole("button", { name: "Kontrollér data", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Gem valideret datagrundlag",
            exact: true,
          }),
        ).toBeVisible();
      };
      const save = page.getByRole("button", {
        name: "Gem valideret datagrundlag",
        exact: true,
      });
      await prepare(1);
      await expect(
        page.getByRole("button", {
          name: "Brug median som fast varighed",
          exact: true,
        }),
      ).toBeDisabled();
      await save.click();
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
        page.getByText("Pilotmålet er nået for denne periode", { exact: true }),
      ).toBeVisible();
      for (const i of [2, 3, 4]) {
        await prepare(i);
        await save.click();
      }
      expect(
        await page.locator(".dataset-history .version-list > div").count(),
      ).toBe(3);
      await expect(
        page.getByText("Vurderingen nedenfor bygger på period-1.csv.", {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const reportDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const reportFile = await reportDownload,
        files = unzipSync(await readFile((await reportFile.path())!)),
        report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.holdoutDataset.name).toBe("period-1.csv");
      expect(report.holdoutDataset.id).toBe(report.holdout.source.id);
      expect(report.holdoutDataset.sha256).toBe(
        createHash("sha256").update(csv).digest("hex"),
      );
      expect(report.holdoutDataset.result.rows[0].activity).toBe("Aktivitet");
      expect(strFromU8(files["holdout-renset.csv"])).toContain('"Aktivitet"');
      if (name === "desktop")
        await reportFile.saveAs(
          `reports/flowlab/${engine}-archived-source-report.zip`,
        );
      await page
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      await prepare(5);
      await expect(save).toBeDisabled();
      const archiveDownload = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: "Eksportér arbejdsrum før oprydning",
          exact: true,
        })
        .click();
      const archive = JSON.parse(
        await readFile((await (await archiveDownload).path())!, "utf8"),
      );
      expect(
        archive.datasetHistory.map((dataset: any) => dataset.name),
      ).toEqual(["period-3.csv", "period-2.csv", "period-1.csv"]);
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations.map((violation: any) => ({
          id: violation.id,
          targets: violation.nodes.map((node: any) => node.target),
        })),
      );
      expect(violations).toEqual([]);
      const close = page.getByRole("button", {
        name: "Luk besked",
        exact: true,
      });
      if (await close.isVisible()) await close.click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `reports/flowlab/${engine}-${name}-data-history.png`,
        fullPage: true,
      });
      await page.locator(".dataset-history").screenshot({
        path: `reports/flowlab/${engine}-${name}-data-versions-detail.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page
        .getByRole("checkbox", {
          name: "Jeg vil fjerne period-1.csv",
          exact: false,
        })
        .check();
      await save.click();
      await expect(
        page.getByText("Gemt: period-5.csv", { exact: false }),
      ).toBeVisible();
      expect(
        await page
          .locator(".dataset-history .version-list > div")
          .filter({ hasText: "period-1.csv" })
          .count(),
      ).toBe(0);
      await expect(
        page.getByText(
          "Vurderingens rensede kildedata er fjernet fra arbejdsrummet.",
          { exact: false },
        ),
      ).toBeVisible();
      await page
        .getByRole("heading", {
          name: "Gode beslutninger starter her.",
          exact: true,
        })
        .click();
      await page.keyboard.press("Control+z");
      const firstVersion = page
        .locator(".dataset-history .version-list > div")
        .filter({ hasText: "period-1.csv" });
      await expect(firstVersion).toBeVisible();
      await page.evaluate(() => {
        (window as any).__flowlabHoldWrites = true;
      });
      await firstVersion
        .getByRole("button", { name: "Gendan data", exact: true })
        .click();
      await expect(
        page.getByText("Valgt: period-1.csv · Afventer lokal lagring", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Gemt: period-1.csv", { exact: false }),
      ).toHaveCount(0);
      await page.evaluate(() => {
        (window as any).__flowlabHoldWrites = false;
      });
      await expect(
        page.getByText("Gemt: period-1.csv", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      await expect(
        page.getByText("Gemt: period-1.csv", { exact: false }),
      ).toBeVisible();
      expect(
        await page.locator(".dataset-history .version-list > div").count(),
      ).toBe(3);
      await page.getByRole("tab", { name: "Model", exact: true }).click();
      if (name === "mobile")
        await page
          .getByRole("button", {
            name: "Vis eller skjul indstillinger",
            exact: true,
          })
          .click();
      await page.getByLabel("Antal medarbejdere", { exact: true }).fill("2");
      if (name === "mobile")
        await page
          .getByRole("button", { name: "Luk indstillinger", exact: true })
          .click();
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Hent rapportpakke", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText("Modellen er ændret. Kør sammenligningen igen,", {
          exact: false,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Hent rapportpakke", exact: true }),
      ).toBeEnabled();
      results.push({
        viewport: name,
        checks: [
          "Saved data required before manual calibration",
          "Four versions retain exact rows and source identity",
          "Report includes archived holdout source after three new imports",
          "Fifth version requires explicit removal and offers a working backup",
          "Retention removal can be undone; archived data can be restored and survives reload",
          "A delayed real IndexedDB transaction shows selected, not saved, until durable commit",
          "Stale model input blocks report until 30 paired reruns complete",
          "WCAG2AA/21AA zero violations; no overflow",
        ],
        violations,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/data-history-${engine}.json`,
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
