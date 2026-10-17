import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { initialDocument } from "../src/lib/document";
import { goldenModel, seedList } from "@tre/flow-engine";
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
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.scenario = goldenModel();
      doc.baseSeed = 12345;
      doc.scenarioName = "Den oprindelige idé";
      doc.hypothesis =
        "En ekstra kollega forventes at mindske køen. Ændringen skal undersøges.";
      await library();
      await page
        .getByLabel("Importér modelpakke", { exact: true })
        .setInputFiles({
          name: "experiment.json",
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
      await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
      await expect(page.getByLabel("Fælles seed", { exact: true })).toHaveValue(
        "12345",
      );
      await library();
      await page
        .getByRole("button", { name: "Gem ny version", exact: true })
        .click();
      await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
      await page.getByLabel("Fælles seed", { exact: true }).fill("54321");
      await page
        .getByLabel("Navn på alternativ", { exact: true })
        .fill("Redigeret efter analysen");
      await page
        .getByRole("textbox", { name: "Din hypotese", exact: false })
        .fill("Dette er en ny fortolkning efter det beregnede resultat.");
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: "Hent rapportpakke",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel("Din beslutning til rapporten")
        .fill("Afprøv modellen i en mindre pilot først.");
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
      await expect(page.getByLabel("Fælles seed", { exact: true })).toHaveValue(
        "54321",
      );
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: "Hent rapportpakke",
          exact: true,
        }),
      ).toBeDisabled();
      await library();
      await page.getByRole("button", { name: "Gendan", exact: true }).click();
      await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
      await expect(page.getByLabel("Fælles seed", { exact: true })).toHaveValue(
        "12345",
      );
      await expect(
        page.getByLabel("Navn på alternativ", { exact: true }),
      ).toHaveValue(doc.scenarioName);
      await expect(
        page.getByRole("textbox", { name: "Din hypotese", exact: false }),
      ).toHaveValue(doc.hypothesis);
      await page
        .getByRole("textbox", { name: "Din hypotese", exact: false })
        .fill("Dette er en ny fortolkning efter det beregnede resultat.");
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: "Hent rapportpakke",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(page.getByLabel("Din beslutning til rapporten")).toHaveValue(
        "Afprøv modellen i en mindre pilot først.",
      );
      await page
        .getByText("Grundlaget ved kørslens start", { exact: true })
        .click();
      await expect(page.locator(".run-context")).toContainText(doc.hypothesis);
      await page.addScriptTag({ content: axe });
      const accessibility = await page.evaluate(
        async () =>
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      );
      expect(accessibility.violations).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow).toBe(false);
      await page.locator(".report-paper h2").click();
      await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
      await page.screenshot({
        path: `reports/flowlab/${engine}-${name}-experiment.png`,
        fullPage: true,
      });
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const download = await downloadPromise,
        archive = unzipSync(
          new Uint8Array(await readFile((await download.path())!)),
        ),
        report = JSON.parse(strFromU8(archive["report.json"]));
      expect(report.baseSeed).toBe(12345);
      expect(report.comparison.seeds).toEqual(seedList(12345));
      expect(report.runContext.hypothesis).toBe(doc.hypothesis);
      expect(report.hypothesis).toContain("ny fortolkning");
      expect(report.narrativeChanged).toBe(true);
      const pdfPath = `reports/flowlab/${engine}-${name}-experiment.pdf`;
      await writeFile(pdfPath, archive["rapport.pdf"]);
      const pdfText = execFileSync("pdftotext", [pdfPath, "-"], {
        encoding: "utf8",
      }).replace(/\s+/g, " ");
      expect(pdfText).toContain("Hypotesen ved kørslens start");
      expect(pdfText).toContain(doc.hypothesis);
      results.push({
        name,
        width,
        height,
        checks: [
          "Custom base seed persists through reload and gates stale reports",
          "Version restores immutable hypothesis, title and seed without losing later decision",
          "Actual report retains current narrative and original run context",
          "Actual shared 30-seed list matches persisted seed",
          "PDF retains original Danish hypothesis",
          "WCAG2AA/21AA violations 0 and no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-experiment-check.json`,
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
      `${engine}: experiment context, seed persistence and original-hypothesis PDF checks passed across all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
