import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";
const engine = process.env.FLOWLAB_BROWSER ?? "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch({
  ...(engine === "chromium"
    ? {
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        args: ["--no-sandbox"],
      }
    : {}),
});
const results = [],
  errors = [];
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
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
    const inspector = async () => {
      await page.getByRole("tab", { name: "Model", exact: true }).click();
      if (name === "mobile")
        await page
          .getByRole("button", {
            name: "Vis eller skjul indstillinger",
            exact: true,
          })
          .click();
    };
    await page.getByRole("tab", { name: "Rapport", exact: true }).click();
    await page
      .getByLabel("Din beslutning til rapporten")
      .fill(
        "Arbejdsrummet skal bevare både denne beslutning og den tidligere model.",
      );
    await library();
    await page
      .getByRole("button", { name: "Gem ny version", exact: true })
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Eksportér arbejdsrum", exact: true })
      .click();
    const download = await downloadPromise,
      raw = await readFile(await download.path()),
      exported = JSON.parse(raw.toString("utf8"));
    expect(exported.comparison).toBeNull();
    expect(exported.versions).toHaveLength(1);
    expect(exported.decision).toContain("den tidligere model");
    expect(raw.byteLength).toBeLessThan(20000);
    await page
      .getByRole("button", { name: "Fjern Version 1", exact: true })
      .click();
    await expect(page.getByText("Version 1", { exact: true })).toHaveCount(0);
    await page
      .getByRole("heading", {
        name: "Et sikkert sted for dine næste idéer.",
        exact: true,
      })
      .click();
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
    await page
      .getByLabel("Importér modelpakke", { exact: true })
      .setInputFiles({
        name: "restored.json",
        mimeType: "application/json",
        buffer: raw,
      });
    await expect(
      page.getByText(
        "Modellen er importeret; resultater genberegnes fra input.",
        { exact: false },
      ),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Rapport", exact: true }).click();
    await expect(page.getByLabel("Din beslutning til rapporten")).toHaveValue(
      exported.decision,
    );
    await expect(
      page.getByRole("button", { name: "Hent rapportpakke", exact: true }),
    ).toBeEnabled();
    results.push({
      viewport: name,
      test: "Actual exported model package reimports, reruns 30 pairs, and preserves decision and immutable version; deleted version can be undone",
      passed: true,
      bytes: raw.byteLength,
    });
    await library();
    await page
      .getByLabel("Importér modelpakke", { exact: true })
      .setInputFiles({
        name: "broken.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"broken":'),
      });
    await expect(
      page.getByText("Filen indeholder ikke gyldig JSON.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
    // Delay only request delivery, never worker results: the real worker still parses the actual file.
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      window.pauseWorkspaceImport = true;
      Worker.prototype.postMessage = function (message, ...args) {
        if (
          window.pauseWorkspaceImport &&
          message.type === "import" &&
          message.file?.name.endsWith(".json")
        )
          window.releaseWorkspaceImport = () =>
            original.call(this, message, ...args);
        else original.call(this, message, ...args);
      };
    });
    await page
      .getByLabel("Importér modelpakke", { exact: true })
      .setInputFiles({
        name: "cancelled.json",
        mimeType: "application/json",
        buffer: raw,
      });
    await page
      .getByRole("button", { name: "Afbryd modelpakke", exact: true })
      .click();
    await page.evaluate(() => window.releaseWorkspaceImport());
    await expect(
      page.getByText(
        "Modelpakken er afbrudt. Dit nuværende arbejde er bevaret.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByLabel("Importér modelpakke", { exact: true })
      .setInputFiles({
        name: "concurrent-edit.json",
        mimeType: "application/json",
        buffer: raw,
      });
    await inspector();
    await page.getByLabel("Antal medarbejdere", { exact: true }).fill("8");
    await page.evaluate(() => window.releaseWorkspaceImport());
    await expect(
      page.getByText("Arbejdsrummet blev ændret, mens filen blev læst.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Antal medarbejdere", { exact: true }),
    ).toHaveValue("8");
    results.push({
      viewport: name,
      test: "Malformed import preserves workspace; cancellation ignores late delivery; real import result cannot overwrite a concurrent edit",
      passed: true,
    });
    if (name === "mobile") {
      const close = page.getByRole("button", {
        name: "Luk indstillinger",
        exact: true,
      });
      if (await close.isVisible()) await close.click();
    }
    await library();
    const closeToast = page.getByRole("button", {
      name: "Luk besked",
      exact: true,
    });
    if (await closeToast.isVisible()) await closeToast.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `reports/flowlab/${engine}-${name}-workspace.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await context.close();
  }
  expect(errors).toEqual([]);
  await writeFile(
    `reports/flowlab/workspace-${engine}.json`,
    JSON.stringify(
      { executedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ browser: engine, passed: results.length, errors }),
  );
} finally {
  await browser.close();
}
