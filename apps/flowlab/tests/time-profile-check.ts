import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { goldenModel, type Comparison } from "@tre/flow-engine";
import { initialDocument } from "../src/lib/document";
import { formatCaseTime } from "../src/lib/time-profile";

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
      const report = async () => {
        await page.getByRole("tab", { name: "Rapport", exact: true }).click();
        const pending = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Hent rapportpakke", exact: true })
          .click();
        const downloaded = await pending,
          files = unzipSync(await readFile((await downloaded.path())!));
        return files;
      };
      const initialFiles = await report(),
        initial = JSON.parse(strFromU8(initialFiles["report.json"]))
          .comparison as Comparison;
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
      const section = page.getByRole("region", {
          name: "Se også dem, der tager længere tid.",
          exact: true,
        }),
        seedSelect = page.getByRole("combobox", {
          name: "Seed for sagernes tider",
          exact: true,
        });
      await seedSelect.selectOption(String(initial.seeds.at(-1)));
      for (const side of ["baseline", "scenario"] as const) {
        const run =
          initial[side === "baseline" ? "baselineRuns" : "scenarioRuns"].at(
            -1,
          )!;
        const card = section.getByRole("article", {
          name: `${side === "baseline" ? "Baseline" : "Alternativ"} · sagernes tider`,
          exact: true,
        });
        await expect(
          card.locator(".time-profile-numbers strong").nth(0),
        ).toHaveText(formatCaseTime(run.metrics.leadTime.median));
        await expect(
          card.locator(".time-profile-numbers strong").nth(1),
        ).toHaveText(formatCaseTime(run.metrics.leadTime.p90));
        await expect(card.locator(".time-profile-count b").first()).toHaveText(
          String(run.metrics.leadTime.count),
        );
      }
      const csvPending = page.waitForEvent("download");
      await section
        .getByRole("button", {
          name: "Hent tidstal for alle seeds",
          exact: true,
        })
        .click();
      const csv = await readFile((await (await csvPending).path())!, "utf8");
      expect(csv).toBe(strFromU8(initialFiles["time-summaries.csv"]));
      const rows = csv.split("\n");
      expect(rows).toHaveLength(181);
      for (const seed of initial.seeds)
        for (const side of ["baseline", "scenario"] as const)
          for (const metric of [
            "leadTime",
            "queueTime",
            "plannedWaitTime",
          ] as const) {
            const summary = initial[
              side === "baseline" ? "baselineRuns" : "scenarioRuns"
            ].find((run) => run.seed === seed)!.metrics[metric];
            expect(rows).toContain(
              [
                seed,
                side,
                metric,
                "ms",
                summary.count,
                summary.mean,
                summary.median,
                summary.p90,
              ].join(","),
            );
          }
      await writeFile(
        `reports/flowlab/${engine}-${name}-time-summaries.csv`,
        csv,
      );
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
            name: "time-fixture.json",
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
      const golden = initialDocument();
      golden.baseline = goldenModel();
      golden.scenario = goldenModel();
      golden.scenario.resources[0].capacity = 2;
      await load(golden);
      const baseline = section.getByRole("article", {
          name: "Baseline · sagernes tider",
          exact: true,
        }),
        scenario = section.getByRole("article", {
          name: "Alternativ · sagernes tider",
          exact: true,
        });
      await expect(
        baseline.locator(".time-profile-numbers strong").nth(0),
      ).toHaveText("2 min");
      await expect(
        baseline.locator(".time-profile-numbers strong").nth(1),
      ).toHaveText("2,4 min");
      await expect(
        scenario.locator(".time-profile-numbers strong").nth(1),
      ).toHaveText("1,5 min");
      await expect(
        baseline.locator(".time-profile-count b").first(),
      ).toHaveText("3");
      await expect(
        baseline.getByText("Få observationer.", { exact: false }),
      ).toBeVisible();
      const goldenFiles = await report(),
        pdfPath = `reports/flowlab/${engine}-${name}-time-profile.pdf`;
      await writeFile(pdfPath, goldenFiles["rapport.pdf"]);
      const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
        encoding: "utf8",
      });
      expect(pdfText).toContain("De afsluttede sagers tider");
      expect(pdfText).toMatch(/P90 pr\. kørsel, middel\s+2,4 min\s+1,5 min/);
      expect(pdfText).toMatch(/Afsluttede sager pr\. kørsel, min–maks\s+3\s+3/);
      expect(pdfText.replace(/\s+/g, " ")).toContain(
        "ikke percentiler af alle sager lagt sammen",
      );
      await page.getByRole("tab", { name: "Resultater", exact: true }).click();
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
      await section
        .getByRole("heading", {
          name: "Se også dem, der tager længere tid.",
          exact: true,
        })
        .click();
      await section.screenshot({
        path: `reports/flowlab/${engine}-${name}-time-profile.png`,
      });
      const waiting = structuredClone(golden);
      for (const model of [waiting.baseline, waiting.scenario]) {
        model.horizon = 200000;
        model.nodes.push({
          id: "hold",
          label: "Planlagt vent",
          kind: "wait",
          duration: { type: "fixed", value: 30000 },
          position: { x: 300, y: 100 },
          variableCost: 0,
          maxVisits: 20,
        });
        model.edges[1].target = "hold";
        model.edges.push({ id: "hold-end", source: "hold", target: "e" });
      }
      await load(waiting);
      await expect(
        baseline.locator(".time-profile-count b").first(),
      ).toHaveText("1");
      await expect(baseline.locator(".time-profile-count b").nth(1)).toHaveText(
        "2",
      );
      await expect(
        baseline
          .locator(".time-profile-details > div")
          .filter({ hasText: "Planlagt vent, gennemsnit" })
          .locator("dd"),
      ).toHaveText("30 sek.");
      await expect(
        baseline
          .locator(".time-profile-details > div")
          .filter({ hasText: "I planlagt vent ved stop" })
          .locator("dd"),
      ).toHaveText("1");
      await expect(
        scenario.locator(".time-profile-count b").first(),
      ).toHaveText("2");
      const missing = structuredClone(golden);
      missing.scenario.resources[0].capacity = 0;
      await load(missing);
      await expect(
        scenario.locator(".time-profile-numbers strong").nth(0),
      ).toHaveText("—");
      await expect(
        scenario.locator(".time-profile-numbers strong").nth(1),
      ).toHaveText("—");
      await expect(
        scenario.getByText("Ingen afsluttede sager.", { exact: false }),
      ).toBeVisible();
      await expect(
        baseline.locator(".time-profile-numbers strong").nth(1),
      ).toHaveText("2,4 min");
      results.push({
        name,
        width,
        height,
        checks: [
          "Selecting a real seed shows its median, p90 and exact completed-case count",
          "All 180 CSV measurements match real report JSON and report ZIP",
          "Golden FCFS median 120 s and p90 144 s versus parallel p90 90 s",
          "PDF shows exact p90 and counts with explicit run aggregation",
          "Planned wait is separate and unfinished cases are excluded",
          "No completions means unavailable, not zero",
          "WCAG2AA/21AA violations 0 and no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-time-profile-check.json`,
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
      `${engine}: time distributions, sample counts, planned wait and real CSV/PDF agree at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
