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
      const selectActivity = async () => {
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        const toggle = page.getByRole("button", {
          name: /^Vis (listeeditor|canvas)$/,
        });
        await expect(toggle).toBeVisible();
        if ((await toggle.getAttribute("aria-label")) === "Vis listeeditor")
          await toggle.click();
        await page.getByRole("button", { name: /Aktivitet Aktivitet/ }).click();
      };
      const doc = initialDocument();
      doc.baseline = goldenModel();
      doc.scenario = structuredClone(doc.baseline);
      doc.scenario.nodes.find((node) => node.kind === "activity")!.duration = {
        type: "fixed",
        value: 1,
      };
      await library();
      await page
        .getByLabel("Importér modelpakke", { exact: true })
        .setInputFiles({
          name: "duration.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(doc)),
        });
      await expect(
        page.getByText("Modellen er importeret;", { exact: false }),
      ).toBeVisible();
      await selectActivity();
      const trigger = page.getByRole("button", {
        name: "Rediger varighed",
        exact: true,
      });
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "1 ms",
      );
      await trigger.click();
      const dialog = page.getByRole("dialog", {
          name: "Tid med en tydelig antagelse",
          exact: true,
        }),
        apply = dialog.getByRole("button", {
          name: "Anvend varighed",
          exact: true,
        }),
        unit = dialog.getByRole("combobox", { name: "Tidsenhed", exact: true });
      let value = dialog.getByRole("textbox", {
        name: "Varighed (millisekunder)",
        exact: true,
      });
      await expect(value).toHaveValue("1");
      for (const u of ["hours", "minutes", "seconds", "ms"]) {
        await unit.selectOption(u);
        await expect(apply).toBeDisabled();
        await expect(dialog.locator(".duration-preview strong")).toHaveText(
          "1 ms",
        );
      }
      await value.fill("");
      await expect(apply).toBeDisabled();
      await expect(dialog.getByRole("alert")).toContainText(
        "Modellen er endnu ikke ændret.",
      );
      await unit.selectOption("minutes");
      await expect(unit).toHaveValue("ms");
      await expect(dialog.getByRole("alert")).toContainText(
        "Ret først varigheden",
      );
      await value.fill("31536000000.00000000000001");
      await expect(apply).toBeDisabled();
      await dialog
        .getByRole("button", { name: "Annuller", exact: true })
        .click();
      await expect(trigger).toBeFocused();
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "1 ms",
      );
      await trigger.click();
      await value.fill("1,5");
      await expect(dialog.locator(".duration-preview strong")).toHaveText(
        "2 ms",
      );
      await expect(dialog).toContainText(
        "Afrundet til hele millisekunder: varighed.",
      );
      await apply.click();
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "2 ms",
      );
      await page.getByRole("button", { name: /^Fortryd/ }).click();
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "1 ms",
      );
      await page.getByRole("button", { name: /^Gentag/ }).click();
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "2 ms",
      );
      await trigger.click();
      await dialog
        .getByRole("combobox", { name: "Varighedsfordeling", exact: true })
        .selectOption("triangular");
      await dialog
        .getByRole("textbox", { name: "Minimum (millisekunder)", exact: true })
        .fill("15");
      await expect(apply).toBeDisabled();
      await dialog
        .getByRole("textbox", { name: "Typisk (millisekunder)", exact: true })
        .fill("20");
      await dialog
        .getByRole("textbox", { name: "Maksimum (millisekunder)", exact: true })
        .fill("30");
      await expect(apply).toBeEnabled();
      await expect(dialog.locator(".duration-preview strong")).toHaveText(
        "21,7 ms",
      );
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
      await dialog.evaluate((element) => element.scrollTo(0, 0));
      await page.screenshot({
        path: `reports/flowlab/${engine}-${name}-duration-editor.png`,
      });
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(false);
      if (name !== "desktop") {
        await dialog.evaluate((element) =>
          element.scrollTo(0, element.scrollHeight),
        );
        await page.screenshot({
          path: `reports/flowlab/${engine}-${name}-duration-editor-actions.png`,
        });
      }

      await apply.click();
      await page.getByRole("button", { name: /^Fortryd/ }).click();
      await expect(page.locator(".inspector-duration-summary")).toContainText(
        "2 ms",
      );
      await page.getByRole("button", { name: /^Gentag/ }).click();
      if (name === "mobile")
        await page
          .getByRole("button", { name: "Luk indstillinger", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Kør sammenligning", exact: true })
        .click();
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Modellen, det fælles seed eller motoren er opdateret.",
          { exact: false },
        ),
      ).toHaveCount(0);
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
      expect(
        saved.scenario.nodes.find((node: any) => node.id === "a").duration,
      ).toEqual({ type: "triangular", min: 15, mode: 20, max: 30 });
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await selectActivity();
      await trigger.click();
      await expect(
        dialog.getByRole("textbox", {
          name: "Minimum (millisekunder)",
          exact: true,
        }),
      ).toHaveValue("15");
      await dialog
        .getByRole("combobox", { name: "Varighedsfordeling", exact: true })
        .selectOption("exponential");
      await expect(dialog).toContainText("ingen fast øvre grænse");
      await dialog
        .getByRole("textbox", {
          name: "Gennemsnit (millisekunder)",
          exact: true,
        })
        .fill("0");
      await expect(apply).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(
        dialog.getByRole("combobox", {
          name: "Varighedsfordeling",
          exact: true,
        }),
      ).toHaveValue("triangular");
      await dialog
        .getByRole("button", { name: "Annuller", exact: true })
        .click();
      results.push({
        viewport: name,
        violations,
        checks: [
          "1ms is exact through all four units; empty/oversized/invalid edits never change the model",
          "Decimal comma and half-ms rounding are explicit; one apply equals one undo/redo",
          "Triangle is validated atomically; actual 30-seed run, workspace export and confirmed persistence retain all fields",
          "Exponential meaning, modal cancellation, Escape/focus, axe and responsive bounds verified",
        ],
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-duration-editor-check.json`,
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
      `${engine}: atomic exact duration editing passed at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
