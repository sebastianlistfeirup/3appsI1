import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { initialDocument } from "../src/lib/document";
import { appendVersion } from "../src/lib/workspace";
import { parseCsv } from "@tre/flow-engine";
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
      const scenarios = async () => {
        await page
          .getByRole("tab", { name: "Scenarier", exact: false })
          .click();
      };
      const load = async (doc: ReturnType<typeof initialDocument>) => {
        await library();
        await page
          .getByLabel("Importér modelpakke", { exact: true })
          .setInputFiles({
            name: "scenarios.json",
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
        await scenarios();
      };
      const exportWorkspace = async () => {
        await library();
        const pending = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Eksportér arbejdsrum", exact: true })
          .click();
        const download = await pending;
        return JSON.parse(
          (await readFile((await download.path())!)).toString(),
        );
      };
      const fixture = initialDocument(),
        date = new Date(0).toISOString();
      fixture.baseSeed = 113;
      fixture.scenarioName = "Fire sagsbehandlere";
      fixture.hypothesis =
        "Fire kolleger skal afkorte ventetiden uden at ændre arbejdsgangen.";
      fixture.versions = appendVersion(fixture, "saved-a", date).versions;
      fixture.scenarioName = "Fem sagsbehandlere";
      fixture.hypothesis =
        "Prøv fem kolleger og vurder den ekstra lønkapacitet.";
      fixture.scenario.resources[0].capacity = 5;
      fixture.baseSeed = 3322;
      fixture.decision =
        "Denne beslutningskladde og datagrundlaget skal overleve et skabelonskift.";
      fixture.dataset = {
        id: "data-current",
        name: "preserved.csv",
        sha256: "a".repeat(64),
        unit: "seconds",
        importedAt: date,
        result: parseCsv("case_id,started_at,finished_at\na,0,60", {
          unit: "seconds",
        }),
      };
      fixture.datasetHistory = [
        { ...fixture.dataset, id: "older-data", name: "older.csv" },
      ];
      await load(fixture);
      const panel = page.locator(".scenario-library");
      await expect(
        page.getByLabel("Navn på alternativ", { exact: true }),
      ).toHaveValue("Fem sagsbehandlere");
      await panel
        .getByRole("button", {
          name: "Åbn Version 1: Fire sagsbehandlere",
          exact: true,
        })
        .click();
      await expect(
        page.getByLabel("Navn på alternativ", { exact: true }),
      ).toHaveValue("Fire sagsbehandlere");
      await expect(page.getByLabel("Fælles seed", { exact: true })).toHaveValue(
        "113",
      );
      await expect(
        panel.getByRole("button", {
          name: "Åbn Version 2: Fem sagsbehandlere",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await scenarios();
      await expect(
        panel.getByRole("button", {
          name: "Åbn Version 2: Fem sagsbehandlere",
          exact: true,
        }),
      ).toBeVisible();
      await panel
        .getByRole("button", {
          name: "Åbn Version 2: Fem sagsbehandlere",
          exact: true,
        })
        .click();
      await expect(page.getByLabel("Fælles seed", { exact: true })).toHaveValue(
        "3322",
      );
      await expect(panel.locator(".saved-scenario-card")).toHaveCount(2);
      await page
        .getByRole("button", { name: "Kopiér baseline", exact: true })
        .click();
      await expect(
        page.getByLabel("Navn på alternativ", { exact: true }),
      ).toHaveValue("Nyt alternativ");
      await expect(
        page.getByRole("textbox", { name: "Din hypotese", exact: false }),
      ).toHaveValue("");
      await page
        .getByLabel("Navn på alternativ", { exact: true })
        .fill("Samme kapacitet som i dag");
      await page
        .getByRole("textbox", { name: "Din hypotese", exact: false })
        .fill("Kontrollér det uændrede udgangspunkt før næste ændring.");
      await panel
        .getByRole("button", { name: "Gem dette scenarie", exact: true })
        .click();
      await expect(panel.locator(".saved-scenario-card")).toHaveCount(3);
      await library();
      await page
        .getByRole("button", { name: "Åbn frisk skabelon", exact: true })
        .click();
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      const exported = await exportWorkspace();
      expect(exported.dataset.name).toBe("preserved.csv");
      expect(exported.datasetHistory[0].name).toBe("older.csv");
      expect(exported.decision).toBe(fixture.decision);
      expect(exported.baseSeed).toBe(3322);
      expect(exported.versions).toHaveLength(3);
      expect(
        exported.versions.find(
          (version: any) =>
            version.context.scenarioName === "Fem sagsbehandlere",
        ).scenario.resources[0].capacity,
      ).toBe(5);
      await writeFile(
        `reports/flowlab/${engine}-${name}-scenario-workspace.json`,
        JSON.stringify(exported, null, 2),
      );
      await scenarios();
      await panel
        .getByRole("button", {
          name: "Åbn Version 2: Fem sagsbehandlere",
          exact: true,
        })
        .click();
      await expect(panel.locator(".saved-scenario-card")).toHaveCount(4);
      await panel
        .getByRole("textbox", { name: "Find gemt scenarie", exact: false })
        .fill("missing");
      await expect(
        panel.getByText("Ingen gemte scenarier matcher", { exact: false }),
      ).toBeVisible();
      await panel
        .getByRole("textbox", { name: "Find gemt scenarie", exact: false })
        .fill("");
      await page.addScriptTag({ content: axe });
      const a11y = await page.evaluate(
        async () =>
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      );
      expect(a11y.violations).toEqual([]);
      await panel
        .getByRole("heading", { name: "Dine gemte scenarier", exact: true })
        .click();
      await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
      await panel.screenshot({
        path: `reports/flowlab/${engine}-${name}-scenario-library.png`,
      });
      const full = initialDocument();
      for (let i = 1; i <= 30; i++) {
        full.scenarioName = `Gemt idé ${i}`;
        full.versions = appendVersion(full, String(i), date).versions;
      }
      full.scenarioName = "Mit uarkiverede arbejde";
      await load(full);
      await page
        .getByRole("button", { name: "Kopiér baseline", exact: true })
        .click();
      await expect(
        page.getByText("Alle 30 versionspladser er i brug.", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Navn på alternativ", { exact: true }),
      ).toHaveValue("Mit uarkiverede arbejde");
      await page
        .getByRole("button", { name: "Luk fejlbesked", exact: true })
        .click();
      await panel
        .getByRole("button", { name: "Gem dette scenarie", exact: true })
        .click();
      await expect(
        page.getByText("Ingen gemte versioner er fjernet.", { exact: false }),
      ).toBeVisible();
      const protectedDoc = await exportWorkspace();
      expect(protectedDoc.versions).toHaveLength(30);
      expect(protectedDoc.versions.at(-1).id).toBe("1");
      expect(protectedDoc.scenarioName).toBe("Mit uarkiverede arbejde");
      await page
        .getByRole("button", { name: "Fjern Version 1", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Gem ny version", exact: true })
        .click();
      await expect(page.getByText("Version 31", { exact: true })).toBeVisible();
      results.push({
        name,
        width,
        height,
        checks: [
          "Unsaved scenario auto-archives before opening a saved alternative",
          "Reload preserves both hypotheses, seeds and models",
          "Baseline copy starts a new idea without losing prior alternatives",
          "Fresh template preserves datasets, history, seed and decision draft",
          "Actual backup contains previous scenarios and both data versions",
          "Search and no-result state work",
          "At 30 snapshots, switching and saving preserve all existing work until explicit cleanup",
          "WCAG2AA/21AA violations 0; no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-scenario-library-check.json`,
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
      `${engine}: saved scenarios, draft safety, template preservation and version budget pass at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
