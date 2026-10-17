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
            name: "sla-fixture.json",
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
      doc.baseline.horizon = 200000;
      doc.baseline.sla = 100000;
      doc.scenario = structuredClone(doc.baseline);
      doc.scenario.resources[0].capacity = 0;
      await load(doc);
      const section = page.getByRole("region", {
        name: "Sagerne, du endnu ikke kan se hele udfaldet af",
        exact: true,
      });
      const baseline = section.getByRole("article", {
          name: "Baseline · SLA",
          exact: true,
        }),
        scenario = section.getByRole("article", {
          name: "Alternativ · SLA",
          exact: true,
        });
      await expect(baseline.locator(".sla-share strong")).toHaveText("50,0 %");
      await expect(scenario.locator(".sla-share strong")).toHaveText("—");
      await expect(scenario).toContainText(
        "En ukendt andel er hverken 0 % eller 100 %.",
      );
      for (const [field, a, b] of [
        ["completed", "2,0", "0,0"],
        ["withinSla", "1,0", "0,0"],
        ["completedBreaches", "1,0", "0,0"],
        ["backlog", "1,0", "3,0"],
        ["knownBacklogBreaches", "0,0", "2,0"],
        ["unknownBacklog", "1,0", "1,0"],
        ["aborted", "0,0", "0,0"],
      ]) {
        await expect(
          baseline.locator(`[data-sla-field="${field}"]`),
        ).toHaveText(a);
        await expect(
          scenario.locator(`[data-sla-field="${field}"]`),
        ).toHaveText(b);
      }
      const toastClose = page.getByRole("button", {
        name: "Luk besked",
        exact: true,
      });
      if (await toastClose.isVisible()) await toastClose.click();
      await section.getByRole("heading").click();
      const sectionBounds = await section.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        };
      });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `reports/flowlab/${engine}-${name}-sla-profile.png`,
        fullPage: true,
        clip: sectionBounds,
      });
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations.map((item: any) => ({
          id: item.id,
          targets: item.nodes.map((node: any) => node.target),
        })),
      );
      expect(violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const select = section.getByRole("combobox", {
        name: "Grundlag for SLA",
        exact: true,
      });
      const last = await select.locator("option").last().getAttribute("value");
      await select.selectOption(last!);
      await expect(baseline.locator('[data-sla-field="completed"]')).toHaveText(
        "2",
      );
      await expect(
        scenario.locator('[data-sla-field="knownBacklogBreaches"]'),
      ).toHaveText("2");
      await expect(section).toContainText(
        `De to frosne modeller for seed ${last}`,
      );
      const csvPending = page.waitForEvent("download");
      await section
        .getByRole("button", {
          name: "Hent SLA-tal for alle seeds",
          exact: true,
        })
        .click();
      const csv = await readFile((await (await csvPending).path())!, "utf8");
      expect(csv.split("\n")).toHaveLength(61);
      expect(csv).toContain(
        `${last},baseline,completed,100000,0,200000,2,1,1,0.5,1,0,1,0`,
      );
      expect(csv).toContain(
        `${last},scenario,completed,100000,0,200000,0,0,0,,3,2,1,0`,
      );
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const zipPending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const files = unzipSync(
        await readFile((await (await zipPending).path())!),
      );
      expect(strFromU8(files["sla.csv"])).toBe(csv);
      const report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.comparison.seeds).toHaveLength(30);
      const pdfPath = `reports/flowlab/${engine}-${name}-sla-report.pdf`;
      await writeFile(pdfPath, files["rapport.pdf"]);
      const pdfText = execFileSync(
        "pdftotext",
        ["-f", "5", "-l", "5", "-layout", pdfPath, "-"],
        { encoding: "utf8" },
      );
      expect(pdfText).toContain("SLA & de uafsluttede sager");
      expect(pdfText).toMatch(/Inden for SLA blandt afsluttede\s+50,0 %\s+—/);
      expect(pdfText).toMatch(/Heraf allerede over SLA\s+0,0\s+2,0/);
      expect(pdfText).toMatch(/Heraf endnu ukendt SLA-udfald\s+1,0\s+1,0/);
      await writeFile(`reports/flowlab/${engine}-${name}-sla.csv`, csv);
      // Changing only the limit changes the meaning, not the observed completion times.
      doc.scenario.sla = 200000;
      await load(doc);
      await expect(section).toContainText(
        "Modellerne bruger forskellige SLA-grænser.",
      );
      await select.selectOption("mean");
      await expect(
        scenario.locator('[data-sla-field="knownBacklogBreaches"]'),
      ).toHaveText("0,0");
      await expect(
        scenario.locator('[data-sla-field="unknownBacklog"]'),
      ).toHaveText("3,0");
      await expect(baseline.locator(".sla-share strong")).toHaveText("50,0 %");
      doc.baseline.arrivals = { type: "explicit", cases: [] };
      doc.scenario = structuredClone(doc.baseline);
      await load(doc);
      await expect(baseline.locator(".sla-share strong")).toHaveText("—");
      await expect(baseline.locator('[data-sla-field="backlog"]')).toHaveText(
        "0,0",
      );
      await expect(baseline).toContainText(
        "SLA-andel findes i 0 af 30 kørsler.",
      );
      results.push({
        viewport: name,
        violations,
        checks: [
          "Exact completed/known/unknown counts on 30 real seeds; no-completion ratio stays unknown",
          "Last seed selection and CSV match the downloaded report ZIP and page-five PDF",
          "Changed limit is explicit; equality at the limit is not an already-exceeded backlog case",
          "Empty period has zero counts and unknown ratio; no overflow or browser errors",
        ],
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-sla-profile-check.json`,
      JSON.stringify(
        { executedAt: new Date().toISOString(), results, errors },
        null,
        2,
      ),
    );
    console.log(
      `${engine}: SLA counts, limits, unknown outcomes and real PDF/CSV pass at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
