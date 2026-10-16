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
            name: "costs.json",
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
      const download = async (button: string) => {
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: button, exact: true }).click();
        return readFile((await (await pending).path())!);
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.baseline.observationStart = 120000;
      doc.baseline.fixedAutomationCost = 100;
      doc.baseline.nodes.find(
        (node) => node.kind === "activity",
      )!.variableCost = 7;
      doc.scenario = structuredClone(doc.baseline);
      doc.scenario.resources[0].capacity = 2;
      doc.scenario.resources[0].label = "Nyt navn, samme id";
      doc.scenario.fixedAutomationCost = 250;
      doc.scenario.resources.push({
        id: "unused",
        label: "Reserveret reserve",
        capacity: 2,
        hourlyCost: 300,
        calendar: [],
      });
      await load(doc);
      const section = page.getByRole("region", {
        name: "Se, hvad kapaciteten koster.",
        exact: true,
      });
      const table = section.getByRole("region", {
        name: "Omkostningernes bestanddele",
        exact: true,
      });
      const total = table.getByRole("row", {
        name: "Samlet omkostning",
        exact: false,
      });
      await expect(total).toContainText("112,00 kr.");
      await expect(total).toContainText("297,00 kr.");
      await expect(total).toContainText("+185,00 kr.");
      await expect(
        table.getByRole("row", { name: "Reserveret løn", exact: false }),
      ).toContainText("40,00 kr.");
      const unused = section.getByRole("article", {
        name: "Alternativ · ressource unused",
        exact: true,
      });
      await expect(unused).toContainText("Ingen trin bruger puljen");
      await expect(unused.locator(".resource-ledger-salary dd")).toHaveText(
        "30,00 kr.",
      );
      await expect(
        unused.locator(".resource-ledger-values > div").nth(1),
      ).toContainText("0 ms");
      const renamed = section.getByRole("article", {
        name: "Alternativ · ressource r",
        exact: true,
      });
      await expect(
        renamed.getByRole("heading", {
          name: "Nyt navn, samme id",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        section
          .getByRole("article", { name: "Baseline · ressource r", exact: true })
          .locator(".resource-ledger-values > div")
          .nth(1),
      ).toContainText("2,5 min");
      const costCsv = (await download("Hent beløb for alle seeds")).toString(
          "utf8",
        ),
        resourceCsv = (await download("Hent puljetal for alle seeds")).toString(
          "utf8",
        );
      expect(costCsv.split("\n")).toHaveLength(61);
      expect(resourceCsv.split("\n")).toHaveLength(91);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const files = unzipSync(await download("Hent rapportpakke"));
      expect(strFromU8(files["costs.csv"])).toBe(costCsv);
      expect(strFromU8(files["resources.csv"])).toBe(resourceCsv);
      const report = JSON.parse(strFromU8(files["report.json"])),
        seeds = report.comparison.seeds as number[];
      for (const seed of seeds) {
        expect(costCsv).toContain(
          `${seed},"baseline","completed",120000,300000,5,7,100,112`,
        );
        expect(costCsv).toContain(
          `${seed},"scenario","completed",120000,300000,40,7,250,297`,
        );
        expect(resourceCsv).toContain(
          `${seed},"scenario","completed","unused","Reserveret reserve",2,300,"no",120000,300000,360000,0,360000,0,30`,
        );
      }
      const pdfPath = `reports/flowlab/${engine}-${name}-cost-report.pdf`;
      await writeFile(pdfPath, files["rapport.pdf"]);
      const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
        encoding: "utf8",
      });
      expect(pdfText).toContain("Kapacitetens tid & pris");
      expect(pdfText).toContain("112,00 kr.");
      expect(pdfText).toContain("297,00 kr.");
      expect(pdfText).toContain("Reserveret reserve");
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
      const view = section.getByRole("combobox", {
        name: "Grundlag for omkostninger",
        exact: true,
      });
      await view.selectOption(String(seeds.at(-1)));
      await expect(section).toContainText(
        `Begge scenarier for seed ${seeds.at(-1)}.`,
      );
      await expect(total).toContainText("112,00 kr.");
      await view.selectOption("mean");
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
      await section
        .getByRole("heading", {
          name: "Se, hvad kapaciteten koster.",
          exact: true,
        })
        .click();
      await section.screenshot({
        path: `reports/flowlab/${engine}-${name}-cost-profile.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const zero = initialDocument();
      zero.baseline = goldenModel();
      zero.baseline.resources[0].capacity = 0;
      zero.scenario = goldenModel();
      zero.scenario.resources[0].id = "new";
      zero.scenario.nodes.find((node) => node.kind === "activity")!.resourceId =
        "new";
      await load(zero);
      const zeroCard = section.getByRole("article", {
        name: "Baseline · ressource r",
        exact: true,
      });
      await expect(zeroCard).toContainText(
        "Ingen planlagt kapacitet i målevinduet",
      );
      await expect(zeroCard.locator(".resource-ledger-salary dd")).toHaveText(
        "0,00 kr.",
      );
      await expect(
        section.getByRole("article", {
          name: "Alternativ · ressource r",
          exact: true,
        }),
      ).toContainText("Puljen findes ikke i dette scenarie");
      const large = initialDocument();
      large.baseline = goldenModel();
      large.scenario = goldenModel();
      for (const side of ["baseline", "scenario"] as const) {
        large[side].resources = Array.from({ length: 50 }, (_, i) => ({
          id: `${side}-${i}`,
          label: `${side} team ${i}`,
          capacity: 1,
          hourlyCost: 100,
          calendar: [],
        }));
        large[side].nodes.find((node) => node.kind === "activity")!.resourceId =
          `${side}-0`;
      }
      await load(large);
      await expect(section.locator(".resource-ledger-pair")).toHaveCount(8);
      await section
        .getByRole("combobox", { name: "Side med puljetal", exact: true })
        .selectOption("12");
      await expect(section.locator(".resource-ledger-pair")).toHaveCount(4);
      await expect(section).toContainText("scenario team 49");
      await section
        .getByRole("searchbox", { name: "Find ressourcepulje", exact: true })
        .fill("scenario team 49");
      await expect(section.locator(".resource-ledger-pair")).toHaveCount(1);
      const allCsv = (await download("Hent puljetal for alle seeds")).toString(
        "utf8",
      );
      expect(allCsv.split("\n")).toHaveLength(3001);
      expect(allCsv).toContain('"scenario-0"');
      expect(allCsv).toContain('"scenario-49"');
      await section
        .getByRole("searchbox", { name: "Find ressourcepulje", exact: true })
        .fill("ingen-match");
      await expect(
        section.getByText("Ingen ressourcepuljer matcher søgningen.", {
          exact: true,
        }),
      ).toBeVisible();
      results.push({
        viewport: name,
        checks: [
          "Warmup costs reconcile 5+7+100=112 and 40+7+250=297 for all 30 seeds",
          "Unused reserved salary is charged despite zero occupied time",
          "Side-specific renamed labels, exact staff time, selected last seed",
          "Downloaded CSVs match the real PDF/JSON report package",
          "Zero capacity differs from absent resource; 100-pool union paginates/searches without filtering exports",
          "WCAG2AA/21AA zero, no page errors or horizontal overflow",
        ],
        violations,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-cost-profile-check.json`,
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
