import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit, expect } from "@playwright/test";

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
  const extra = Array.from(
      { length: 60 },
      (_, i) => `Ekstra;${String(i).padStart(2, "0")}-${"æ".repeat(80)}`,
    ),
    broadHeaders = [...extra, "case_id", "started_at", "finished_at"],
    broadCsv =
      broadHeaders.map((header) => `"${header}"`).join(",") +
      "\n" +
      [...extra.map(() => "unneeded"), "wide-case", "0", "60"].join(","),
    malformed =
      'case_id,started_at,event_id\n"\tbad-id",0,a\ngood-id,"0\n",b\nlast-id,0,c',
    csv = (name: string, content: string) => ({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(content),
    });
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
      });
      await context.addInitScript(() => {
        const original = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = async function () {
          const value = await original.call(this);
          if (
            new TextDecoder()
              .decode(value.slice(0, 40))
              .startsWith("delayed-reader")
          ) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            throw new Error("Old file read failed after replacement");
          }
          return value;
        };
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      await page
        .getByRole("tab", { name: "Dataværksted", exact: true })
        .click();
      const upload = page.getByLabel("Vælg CSV-fil", { exact: true }),
        analyze = page.getByRole("button", {
          name: "Kontrollér data",
          exact: true,
        }),
        save = page.getByRole("button", {
          name: "Gem valideret datagrundlag",
          exact: true,
        });
      await upload.setInputFiles(csv("broad-columns.csv", broadCsv));
      await expect(
        page.getByText("3 af 63 kolonner er knyttet", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".mapping-row")).toHaveCount(20);
      await page
        .getByRole("button", { name: "Vis næste kolonner", exact: true })
        .click();
      await expect(
        page.getByText("Side 2 af 4", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Find kolonne", { exact: true }).fill("case_id");
      await expect(
        page.getByRole("combobox", { name: "case_id", exact: true }),
      ).toHaveValue("case_id");
      await page
        .getByLabel("Find kolonne", { exact: true })
        .fill("missing-column");
      await expect(
        page.getByText("Ingen kolonner matcher søgningen.", { exact: false }),
      ).toBeVisible();
      await page.getByLabel("Find kolonne", { exact: true }).fill("_at");
      await expect(page.locator(".mapping-row")).toHaveCount(2);
      await page
        .getByRole("combobox", { name: "Tidsformat", exact: true })
        .selectOption("seconds");
      await analyze.click();
      await expect(save).toBeEnabled();
      await save.click();
      await expect(
        page.getByText("Gemt: broad-columns.csv", { exact: false }),
      ).toBeVisible();
      const qualityDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Kvalitetstjek", exact: true })
        .click();
      const quality = JSON.parse(
        await readFile((await (await qualityDownload).path())!, "utf8"),
      );
      expect(quality.source.sha256).toBe(
        createHash("sha256").update(broadCsv).digest("hex"),
      );
      expect(quality.headers).toEqual(broadHeaders);
      expect(quality.preview).toEqual([
        { case_id: "wide-case", started_at: "0", finished_at: "60" },
      ]);
      await writeFile(
        `reports/flowlab/${engine}-${name}-broad-csv-quality.json`,
        JSON.stringify(quality, null, 2),
      );
      await upload.setInputFiles(
        csv("bad-header.csv", '"\tcase_id",started_at\na,0'),
      );
      await expect(
        page.locator(".data-workshop").getByRole("alert"),
      ).toContainText("Kolonnenavne må ikke indeholde");
      await expect(analyze).toHaveCount(0);
      await upload.setInputFiles(
        csv("long-header.csv", `${"h".repeat(201)},started_at\na,0`),
      );
      await expect(
        page.locator(".data-workshop").getByRole("alert"),
      ).toContainText("200 tegn");
      await upload.setInputFiles(
        csv("duplicate-header.csv", "case_id,case_id\na,a"),
      );
      await expect(
        page.locator(".data-workshop").getByRole("alert"),
      ).toContainText("gentages");
      await upload.setInputFiles(
        csv(
          "escaped-quotes.csv",
          'case_id,started_at\n"' + '""'.repeat(100001) + '",0',
        ),
      );
      await analyze.click();
      await expect(
        page.locator(".data-workshop").getByRole("alert"),
      ).toContainText("Et CSV-felt er for langt");
      await expect(
        page.getByText("Gemt: broad-columns.csv", { exact: false }),
      ).toBeVisible();
      await upload.setInputFiles(
        csv("delayed-reader.csv", "delayed-reader,started_at\na,0"),
      );
      await upload.setInputFiles(csv("control-quality.csv", malformed));
      await expect(analyze).toBeVisible();
      await page.waitForTimeout(900);
      await expect(
        page.locator(".data-workshop").getByRole("alert"),
      ).toHaveCount(0);
      await analyze.click();
      await expect(
        page.getByText("Række 2 · case_id", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Række 3 · started_at", { exact: true }),
      ).toBeVisible();
      await expect(save).toBeDisabled();
      await expect(
        page.getByRole("cell", { name: "\\u0009bad-id", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "0\\u000a", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("checkbox", {
          name: "Jeg vil udelade de 2 fejlbehæftede rækker.",
          exact: false,
        })
        .check();
      await save.click();
      await expect(
        page.getByText("Gemt: control-quality.csv", { exact: false }),
      ).toBeVisible();
      const cleanDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Renset CSV", exact: true })
        .click();
      const clean = await readFile(
        (await (await cleanDownload).path())!,
        "utf8",
      );
      expect(clean).toContain('"last-id"');
      expect(clean).not.toContain('"bad-id"');
      expect(clean).not.toContain('"good-id"');
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
      await page
        .getByRole("heading", {
          name: "Gode beslutninger starter her.",
          exact: true,
        })
        .click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `reports/flowlab/${engine}-${name}-csv-boundaries.png`,
        fullPage: true,
      });
      results.push({
        name,
        width,
        height,
        checks: [
          "Complete >4 KB header and actual source hash",
          "Bounded mapping search and pagination preserve hidden mappings",
          "Raw control characters rejected before trimming",
          "Escaped quotes enforce field budget",
          "Malformed header blocked without replacing saved data",
          "Late old-file failure cannot overwrite new-file state",
          "Explicit exclusions produce exact cleaned CSV",
          "WCAG2AA/21AA violations 0 and no viewport overflow",
        ],
        axeViolations: 0,
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-csv-boundaries-check.json`,
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
      `${engine}: CSV bounds, exact mapping, raw validation, source hash and replacement race pass at all viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
