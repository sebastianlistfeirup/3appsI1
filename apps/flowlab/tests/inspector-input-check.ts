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
      ).toBeVisible({ timeout: 20000 });
      const select = async (name: RegExp) => {
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        const toggle = page.getByRole("button", {
          name: /^Vis (listeeditor|canvas)$/,
        });
        await expect(toggle).toBeVisible();
        if ((await toggle.getAttribute("aria-label")) === "Vis listeeditor")
          await toggle.click();
        await page.getByRole("button", { name }).click();
      };
      const library = async () => {
        if (name === "mobile") {
          const close = page.getByRole("button", {
            name: "Luk indstillinger",
            exact: true,
          });
          if (await close.isVisible()) await close.click();
          await page
            .getByRole("button", { name: "Åbn navigation", exact: true })
            .click();
        }
        await page
          .getByRole("button", { name: "Modelbibliotek", exact: true })
          .click();
      };
      const load = async (doc: ReturnType<typeof initialDocument>) => {
        await library();
        await page
          .getByLabel("Importér modelpakke", { exact: true })
          .setInputFiles({
            name: "inspector.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(doc)),
          });
        await expect(
          page.getByText("Modellen er importeret;", { exact: false }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Model", exact: true }).click();
      };
      await select(/Aktivitet Sagsbehandling/);
      const capacity = page.getByRole("textbox", {
        name: "Antal medarbejdere",
        exact: true,
      });
      await expect(capacity).toHaveValue("4");
      await capacity.fill("");
      await expect(capacity).toHaveValue("");
      await expect(capacity).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await capacity.press("Tab");
      await expect(capacity).toHaveValue("4");
      await expect(page.locator(".inspector").getByRole("alert")).toContainText(
        "Den tidligere modelværdi er bevaret.",
      );
      for (const invalid of ["1001", "1.5", "-1"]) {
        await capacity.fill(invalid);
        await capacity.press("Enter");
        await expect(capacity).toHaveValue(invalid);
        await expect(capacity).toHaveAttribute("aria-invalid", "true");
        await capacity.press("Escape");
        await expect(capacity).toHaveValue("4");
      }
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await capacity.fill("");
      await capacity.pressSequentially("20");
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      if (engine === "chromium" && name === "desktop") {
        const prompt = page.waitForEvent("dialog");
        const navigation = page
          .reload({ waitUntil: "domcontentloaded", timeout: 10000 })
          .catch((error) => error.message);
        const warning = await prompt;
        expect(warning.type()).toBe("beforeunload");
        await warning.dismiss();
        await navigation;
        await expect(capacity).toHaveValue("20");
      }
      await capacity.press("Enter");
      await expect(page.locator(".stale-notice")).toBeVisible();
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(capacity).toHaveValue("4");
      await page
        .getByRole("button", { name: "Gentag ændring", exact: true })
        .click();
      await expect(capacity).toHaveValue("20");
      await capacity.fill("5");
      await page
        .getByRole("button", { name: "Tilføj en medarbejder", exact: true })
        .click();
      await expect(capacity).toHaveValue("6");
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(capacity).toHaveValue("5");
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(capacity).toHaveValue("20");
      const nodeName = page.getByRole("textbox", { name: "Navn", exact: true });
      await nodeName.fill("");
      await nodeName.press("Tab");
      await expect(nodeName).toHaveValue("Sagsbehandling");
      const salary = page.getByRole("textbox", {
        name: "Lønkapacitet (kr. pr. time)",
        exact: true,
      });
      await salary.fill("285,75");
      await salary.press("Enter");
      await expect(salary).toHaveValue("285.75");
      await salary.fill("1000000.01");
      await salary.press("Enter");
      await expect(salary).toHaveAttribute("aria-invalid", "true");
      await salary.press("Escape");
      await capacity.fill("7");
      await page.getByRole("button", { name: "Baseline", exact: true }).click();
      await expect(capacity).toHaveValue("3");
      await page
        .getByRole("button", { name: "Alternativ", exact: true })
        .click();
      await expect(capacity).toHaveValue("7");
      await select(/Ankomst Nye henvendelser/);
      const horizon = page.getByRole("textbox", {
        name: "Simulationshorisont (timer)",
        exact: true,
      });
      await horizon.fill("");
      await horizon.press("Tab");
      await expect(horizon).toHaveValue("8");
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
      const closeToast = page.getByRole("button", {
        name: "Luk besked",
        exact: true,
      });
      await expect(closeToast).toBeHidden({ timeout: 10000 });
      await page
        .locator(".inspector")
        .evaluate((element) => element.scrollTo(0, 0));
      const bounds = await page.locator(".inspector").evaluate((element) => {
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
        path: `reports/flowlab/${engine}-${name}-inspector-input.png`,
        fullPage: true,
        clip: bounds,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.baseline.observationStart = 120000;
      doc.baseline.arrivals = {
        type: "poisson",
        meanInterval: 600000,
        maxCases: 3,
        initialBacklog: 0,
      };
      doc.scenario = structuredClone(doc.baseline);
      await load(doc);
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      await select(/Ankomst Ankomst/);
      const expected = page.getByRole("textbox", {
        name: "Forventede nye ankomster i perioden",
        exact: true,
      });
      await expect(expected).toHaveValue("0.5");
      await horizon.fill("0.16666666666666667");
      await horizon.press("Enter");
      await expect(expected).toHaveValue("1");
      await horizon.fill("0.01");
      await horizon.press("Enter");
      await expect(horizon).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator(".inspector").getByRole("alert")).toContainText(
        "efter målestart",
      );
      await horizon.press("Escape");
      const cap = page.getByRole("textbox", {
          name: "Loft for nye sager",
          exact: true,
        }),
        backlog = page.getByRole("textbox", {
          name: "Startkø (sager)",
          exact: true,
        });
      await backlog.fill("10");
      await backlog.press("Enter");
      await cap.fill("99990");
      await cap.press("Enter");
      await backlog.fill("11");
      await backlog.press("Enter");
      await expect(page.locator(".inspector").getByRole("alert")).toContainText(
        "tilsammen højst",
      );
      await backlog.press("Escape");
      await expect(backlog).toHaveValue("10");
      await cap.fill("3");
      await cap.press("Enter");
      await backlog.fill("0");
      await backlog.press("Enter");
      const sla = page.getByRole("textbox", {
        name: "SLA (minutter)",
        exact: true,
      });
      await sla.fill("");
      await sla.press("Tab");
      await expect(sla).toHaveValue("2");
      await sla.fill("0.000016666666666667");
      await sla.press("Enter");
      await page.getByRole("button", { name: "Baseline", exact: true }).click();
      await horizon.fill("0.16666666666666667");
      await horizon.press("Enter");
      await page
        .getByRole("button", { name: "Alternativ", exact: true })
        .click();
      if (name === "mobile")
        await page
          .getByRole("button", { name: "Luk indstillinger", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(page.locator(".stale-notice")).toHaveCount(0);
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await library();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Eksportér arbejdsrum", exact: true })
        .click();
      const saved = JSON.parse(
        await readFile((await (await pending).path())!, "utf8"),
      );
      expect(saved.scenario).toMatchObject({
        horizon: 600000,
        sla: 1,
        observationStart: 120000,
        arrivals: {
          type: "poisson",
          meanInterval: 600000,
          maxCases: 3,
          initialBacklog: 0,
        },
      });
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await select(/Ankomst Ankomst/);
      await expect(expected).toHaveValue("1");
      await expect(sla).toHaveValue("0.000016666666666666667");
      const large = initialDocument();
      large.baseline = goldenModel();
      large.baseline.maxEvents = 1;
      large.baseline.resources[0].calendar = Array.from(
        { length: 1000 },
        (_, index) => ({ start: index * 120000, end: index * 120000 + 60000 }),
      );
      large.scenario = structuredClone(large.baseline);
      await load(large);
      await select(/Aktivitet Aktivitet/);
      await page.locator(".calendar-details summary").click();
      await expect(page.locator(".inspector-calendar-preview li")).toHaveCount(
        3,
      );
      await expect(page.locator(".calendar-details input")).toHaveCount(0);
      await expect(page.locator(".calendar-details")).toContainText(
        "1.000 arbejdsintervaller",
      );
      await page
        .getByRole("button", { name: "Rediger arbejdsplan", exact: true })
        .click();
      const resources = page.getByRole("dialog", {
        name: "Kapacitet med en tydelig pris",
        exact: true,
      });
      await expect(resources.locator(".resource-calendar-row")).toHaveCount(20);
      await resources
        .getByRole("button", { name: "Luk uden at anvende", exact: true })
        .click();
      results.push({
        viewport: name,
        violations,
        checks: [
          "Empty/invalid capacity and horizon preserve model; valid multi-key entry is one undo; Escape cancels",
          "Committed blur before plus uses new value; baseline/scenario edits remain isolated; Danish decimal money retained",
          "Tiny arrival expectations remain nonzero; horizon change updates the derived field; warmup and combined case budget enforced",
          "Exact 1ms SLA, real 30-pair run, workspace export and confirmed persistence agree",
          "Large calendar inspector renders three summaries and opens the complete paged resource editor",
        ],
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-inspector-input-check.json`,
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
      `${engine}: safe inspector drafts, bounds, undo and persistence pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
