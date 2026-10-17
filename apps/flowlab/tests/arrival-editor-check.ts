import { readFile, writeFile } from "node:fs/promises";
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
            name: "arrivals.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(doc)),
          });
        // A previous import toast can still be visible while this worker is busy.
        // Fixtures reuse the golden id, so wait for both complete model inputs,
        // confirmed in the real document store, before navigating to the editor.
        await expect
          .poll(
            () =>
              page.evaluate(
                () =>
                  new Promise<unknown>((resolve, reject) => {
                    const request = indexedDB.open("tre-apps-flowlab-v1", 1);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                      const db = request.result;
                      const transaction = db.transaction(
                        "documents",
                        "readonly",
                      );
                      const get = transaction
                        .objectStore("documents")
                        .get("workspace");
                      get.onsuccess = () =>
                        resolve({
                          baseline: get.result?.data.baseline,
                          scenario: get.result?.data.scenario,
                        });
                      get.onerror = () => reject(get.error);
                      transaction.oncomplete = () => db.close();
                      transaction.onabort = () => {
                        db.close();
                        reject(transaction.error);
                      };
                    };
                  }),
              ),
            {
              timeout: 20000,
              message:
                "The current imported baseline and alternative are persisted",
            },
          )
          .toEqual({ baseline: doc.baseline, scenario: doc.scenario });
        await expect(
          page.getByRole("button", { name: "Afbryd modelpakke", exact: true }),
        ).toHaveCount(0);
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
        const listToggle = page.getByRole("button", {
          name: "Vis listeeditor",
          exact: true,
        });
        if (await listToggle.count()) await listToggle.click();
        await page
          .locator(".node-list-item")
          .filter({ hasText: "Ankomst" })
          .click();
        await page
          .getByRole("button", { name: "Rediger ankomster", exact: true })
          .click();
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.scenario = goldenModel();
      await load(doc);
      await open();
      const dialog = page.getByRole("dialog", {
          name: "Hvilke sager kommer ind?",
          exact: true,
        }),
        apply = dialog.getByRole("button", {
          name: "Anvend ankomster",
          exact: true,
        });
      await expect(apply).toBeDisabled();
      await dialog
        .getByRole("button", { name: "Fjern sag c", exact: true })
        .click();
      await expect(dialog.getByRole("listitem")).toHaveCount(2);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Rediger ankomster", exact: true }),
      ).toBeFocused();
      await open();
      await expect(dialog.getByRole("listitem")).toHaveCount(3);
      await dialog
        .getByRole("button", { name: "Rediger sag b", exact: true })
        .click();
      await dialog.getByLabel("Sags-id", { exact: true }).fill("a");
      await dialog
        .getByRole("button", { name: "Opdatér sag i kladden", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText("findes allerede");
      await expect(apply).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "Rediger sag c", exact: true }),
      ).toBeDisabled();
      await dialog.getByLabel("Sags-id", { exact: true }).fill("b");
      await dialog.getByLabel("Ankomsttid", { exact: true }).fill("0");
      await dialog.getByLabel("Sagstype", { exact: true }).fill("haster");
      await dialog
        .getByRole("button", { name: "Opdatér sag i kladden", exact: true })
        .click();
      await dialog.getByLabel("Sags-id", { exact: true }).fill("at-stop");
      await dialog.getByLabel("Ankomsttid", { exact: true }).fill("5");
      await dialog
        .getByRole("button", { name: "Føj sag til kladden", exact: true })
        .click();
      await expect(dialog.locator(".arrival-counts")).toContainText(
        "4 sager · 3 ankommer før stop ved 5 min. 1 ved eller efter stop.",
      );
      await dialog
        .getByRole("heading", { name: "Hvilke sager kommer ind?", exact: true })
        .click();
      await page.keyboard.press("Control+z");
      await expect(dialog.getByRole("listitem")).toHaveCount(4);
      await apply.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".stale-notice")).toBeVisible();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const files = unzipSync(await readFile((await (await download).path())!)),
        report = JSON.parse(strFromU8(files["report.json"]));
      expect(report.comparison.scenario.arrivals.cases).toHaveLength(4);
      expect(report.comparison.scenarioRuns[0].metrics).toMatchObject({
        arrived: 3,
        throughput: 3,
        leadTime: { median: 150000, p90: 174000, count: 3 },
        queueTime: { mean: 50000 },
      });
      expect(
        report.comparison.scenarioRuns[0].cases.find(
          (item: any) => item.id === "b",
        ),
      ).toMatchObject({ arrival: 0, caseType: "haster" });
      expect(
        report.comparison.scenarioRuns[0].cases.some(
          (item: any) => item.id === "at-stop",
        ),
      ).toBe(false);
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await open();
      await expect(dialog.getByRole("listitem")).toHaveCount(4);
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
        .getByRole("heading", { name: "Hvilke sager kommer ind?", exact: true })
        .click();
      await dialog.screenshot({
        path: `reports/flowlab/${engine}-${name}-arrival-editor.png`,
      });
      await dialog.locator(".arrival-case-form").scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: `reports/flowlab/${engine}-${name}-arrival-fields.png`,
      });
      await dialog
        .getByRole("combobox", { name: "Ankomstmetode", exact: true })
        .selectOption("poisson");
      await dialog
        .getByLabel("Loft for nye sager", { exact: true })
        .fill("100000");
      await dialog.getByLabel("Startkø (sager)", { exact: true }).fill("1");
      await apply.click();
      await expect(dialog.getByRole("alert")).toContainText("tilsammen");
      await dialog
        .getByLabel("Loft for nye sager", { exact: true })
        .fill("100");
      await apply.click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByLabel("Loft for nye sager", { exact: true }),
      ).toHaveValue("100");
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await open();
      await expect(
        dialog.getByRole("combobox", { name: "Ankomstmetode", exact: true }),
      ).toHaveValue("explicit");
      await expect(dialog.getByRole("listitem")).toHaveCount(4);
      await page.keyboard.press("Escape");
      const routing = initialDocument();
      routing.baseline = goldenModel();
      routing.baseline.nodes.push(
        {
          id: "d",
          label: "Sagstype",
          kind: "decision",
          position: { x: 100, y: 0 },
          variableCost: 0,
          maxVisits: 20,
        },
        {
          ...routing.baseline.nodes[1],
          id: "fast",
          label: "Haster",
          position: { x: 200, y: 100 },
          duration: { type: "fixed", value: 30000 },
        },
      );
      routing.baseline.edges = [
        { id: "sd", source: "s", target: "d" },
        { id: "da", source: "d", target: "a", caseType: "standard" },
        { id: "df", source: "d", target: "fast", caseType: "haster" },
        { id: "ae", source: "a", target: "e" },
        { id: "fe", source: "fast", target: "e" },
      ];
      routing.scenario = structuredClone(routing.baseline);
      await load(routing);
      await open();
      await dialog
        .getByRole("button", { name: "Rediger sag b", exact: true })
        .click();
      await dialog.getByLabel("Sagstype", { exact: true }).fill("haster");
      await dialog
        .getByRole("button", { name: "Opdatér sag i kladden", exact: true })
        .click();
      await apply.click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const routedDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent rapportpakke", exact: true })
        .click();
      const routed = JSON.parse(
        strFromU8(
          unzipSync(await readFile((await (await routedDownload).path())!))[
            "report.json"
          ],
        ),
      );
      expect(routed.comparison.scenarioRuns[0].metrics.leadTime.median).toBe(
        90000,
      );
      expect(
        routed.comparison.scenarioRuns[0].resourceTimelines.find(
          (item: any) => item.caseId === "b" && item.nodeId === "fast",
        ),
      ).toMatchObject({ start: 90000, end: 120000 });
      const many = initialDocument();
      many.baseline = goldenModel();
      many.baseline.maxEvents = 1;
      many.baseline.arrivals = {
        type: "explicit",
        cases: Array.from({ length: 1000 }, (_, index) => ({
          id: `synthetic-${index}`,
          time: index * 1000,
          caseType: index % 2 ? "haster" : "standard",
        })),
      };
      many.scenario = structuredClone(many.baseline);
      await load(many);
      await open();
      await expect(dialog.getByRole("listitem")).toHaveCount(20);
      await dialog.getByLabel("Side med ankomster", { exact: true }).fill("50");
      await expect(dialog.getByRole("listitem")).toHaveCount(20);
      await dialog
        .getByLabel("Find ankomst", { exact: true })
        .fill("synthetic-999");
      await expect(dialog.getByRole("listitem")).toHaveCount(1);
      await dialog
        .getByRole("button", { name: "Rediger sag synthetic-999", exact: true })
        .click();
      await dialog.getByLabel("Sags-id", { exact: true }).fill("seneste-sag");
      await dialog
        .getByRole("button", { name: "Opdatér sag i kladden", exact: true })
        .click();
      await apply.click();
      await open();
      await dialog
        .getByLabel("Find ankomst", { exact: true })
        .fill("seneste-sag");
      await expect(dialog.getByRole("listitem")).toHaveCount(1);
      await expect(dialog.getByRole("listitem")).toContainText("haster");
      await dialog
        .getByRole("button", { name: "Luk uden at anvende", exact: true })
        .click();
      const empty = initialDocument();
      empty.baseline = goldenModel();
      empty.baseline.arrivals = {
        type: "poisson",
        meanInterval: 60000,
        maxCases: 20,
        initialBacklog: 0,
      };
      empty.scenario = structuredClone(empty.baseline);
      await load(empty);
      await open();
      await dialog
        .getByRole("combobox", { name: "Ankomstmetode", exact: true })
        .selectOption("explicit");
      await expect(
        dialog.getByText("Listen er tom.", { exact: false }),
      ).toBeVisible();
      const emptyAudit = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      expect(emptyAudit.violations).toEqual([]);
      await apply.click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      const emptyDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent JSON-grundlag", exact: true })
        .click();
      const emptyReport = JSON.parse(
        await readFile((await (await emptyDownload).path())!, "utf8"),
      );
      expect(emptyReport.comparison.scenarioRuns[0].metrics).toMatchObject({
        arrived: 0,
        throughput: 0,
        leadTime: { count: 0, median: null, p90: null },
      });
      results.push({
        name,
        width,
        height,
        checks: [
          "Cancel and Escape preserve original list and return focus",
          "Duplicate id and unfinished row prevent apply; pending fields cannot be overwritten",
          "Exact time edits, cohort counts and strict horizon boundary verified in real export",
          "Model undo blocked behind modal; normal undo restores method and all cases",
          "Reload preserves four manually edited cases",
          "Case-type routing takes actual fast activity from 90000 to 120000 ms",
          "1000-case list has at most 20 rows with direct page/search and stable id edit",
          "Poisson total-case budget validated before apply",
          "Switching Poisson to an empty manual list gives actual zero arrivals and unavailable time metrics",
        ],
        metrics: report.comparison.scenarioRuns[0].metrics,
        routedMedian: 90000,
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-arrival-editor-check.json`,
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
      `${engine}: manual arrivals, drafts, routing, exact timing, paging, reload and undo pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
