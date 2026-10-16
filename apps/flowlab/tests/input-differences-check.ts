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
            name: "many-inputs.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(doc)),
          });
        await expect(
          page.getByText("Modellen er importeret;", { exact: false }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Hent partial JSON", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("tab", { name: "Scenarier", exact: false })
          .click();
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.baseline.maxEvents = 1;
      doc.baseline.arrivals = {
        type: "explicit",
        cases: Array.from({ length: 1200 }, (_, index) => ({
          id: `synthetic-${index}`,
          time: index * 1000,
          caseType: "standard",
        })),
      };
      doc.scenario = structuredClone(doc.baseline);
      doc.scenario.revision++;
      doc.scenario.nodes[0].position.x++;
      doc.scenario.description = "Lang modelantagelse "
        .repeat(100)
        .slice(0, 1900);
      if (doc.scenario.arrivals.type === "explicit")
        doc.scenario.arrivals.cases.forEach((arrival) => arrival.time++);
      await load(doc);
      const panel = page.getByRole("region", {
          name: "Præcis dét er ændret",
          exact: true,
        }),
        rows = panel.getByRole("listitem"),
        query = panel.getByLabel("Find inputændring", { exact: true });
      await expect(
        panel.getByText("1.201 input", { exact: true }),
      ).toBeVisible();
      await expect(rows).toHaveCount(20);
      await panel
        .getByRole("button", { name: "Næste inputændringer", exact: true })
        .click();
      await expect(
        panel.getByLabel("Side med inputændringer", { exact: true }),
      ).toHaveValue("2");
      await panel
        .getByLabel("Side med inputændringer", { exact: true })
        .fill("61");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Modelbeskrivelse");
      await expect(
        panel.getByRole("button", {
          name: "Næste inputændringer",
          exact: true,
        }),
      ).toBeDisabled();
      expect((await rows.textContent())!.length).toBeLessThan(700);
      await query.fill("arrivals.cases.1199.time");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("1.199.000");
      await expect(rows).toContainText("1.199.001");
      const download = page.waitForEvent("download");
      await panel
        .getByRole("button", { name: "Hent alle inputændringer", exact: true })
        .click();
      const exported = JSON.parse(
        await readFile((await (await download).path())!, "utf8"),
      );
      expect(exported.differences).toHaveLength(1201);
      expect(
        exported.differences.find(
          (difference: any) => difference.path === "description",
        ).after,
      ).toBe(doc.scenario.description);
      expect(
        exported.differences.find(
          (difference: any) => difference.path === "arrivals.cases.1199.time",
        ),
      ).toEqual({
        path: "arrivals.cases.1199.time",
        before: 1199000,
        after: 1199001,
      });
      await query.fill("intet matcher denne søgning");
      await expect(rows).toHaveCount(0);
      await expect(
        panel.getByText("Ingen inputændringer matcher søgningen.", {
          exact: false,
        }),
      ).toBeVisible();
      await query.fill("arrivals.cases.119");
      await expect(rows).toHaveCount(11);
      await page.evaluate(axe);
      const audit = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      expect(audit.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Luk besked", exact: true }),
      ).toHaveCount(0, { timeout: 10000 });
      await panel
        .getByRole("heading", { name: "Præcis dét er ændret", exact: true })
        .click();
      await panel.screenshot({
        path: `reports/flowlab/${engine}-${name}-input-differences.png`,
      });
      const composite = structuredClone(doc);
      composite.baseline.arrivals = {
        type: "poisson",
        meanInterval: 1000,
        maxCases: 1200,
        initialBacklog: 0,
      };
      await load(composite);
      await query.fill("arrivals.cases");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Liste med 1.200 elementer");
      expect((await rows.textContent())!.length).toBeLessThan(300);
      const compositeDownload = page.waitForEvent("download");
      await panel
        .getByRole("button", { name: "Hent alle inputændringer", exact: true })
        .click();
      const compositeJson = JSON.parse(
        await readFile((await (await compositeDownload).path())!, "utf8"),
      );
      expect(
        compositeJson.differences.find(
          (difference: any) => difference.path === "arrivals.cases",
        ).after,
      ).toEqual(
        doc.scenario.arrivals.type === "explicit"
          ? doc.scenario.arrivals.cases
          : null,
      );
      results.push({
        name,
        width,
        height,
        changedInputs: 1201,
        maxVisibleRows: 20,
        finalPage: 61,
        exportedAllWhileFiltered: true,
        fullLongTextLength: doc.scenario.description.length,
        compositeCasesPreserved: 1200,
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-input-differences-check.json`,
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
      `${engine}: bounded 1,201-input diff, paging, search, full exports and composite lists pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
