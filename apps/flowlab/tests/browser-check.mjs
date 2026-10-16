import { existsSync } from "node:fs";
import { chromium, firefox, webkit } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browserName = process.env.FLOWLAB_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error("Unknown browser");
const browser = await browserType.launch(
  browserName === "chromium"
    ? {
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        headless: true,
        args: ["--no-sandbox"],
      }
    : { headless: true },
);
const errors = [];
const evidence =
  browserName === "chromium"
    ? "reports/flowlab"
    : `reports/flowlab/${browserName}`;
await mkdir(evidence, { recursive: true });
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["tablet", 1024, 768],
  ["mobile", 390, 844],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    acceptDownloads: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    errors.push({ viewport: name, error: error.message }),
  );
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Kør sammenligning", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("30 parrede replikationer"),
    { timeout: 30000 },
  );
  if (
    await page
      .getByRole("button", { name: "Luk besked", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Luk besked", exact: true }).click();
  await page.screenshot({
    path: `${evidence}/${name}-model.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow)
    errors.push({ viewport: name, error: "Page has horizontal overflow" });
  await page.getByRole("tab", { name: "Scenarier", exact: false }).click();
  await page.screenshot({
    path: `${evidence}/${name}-scenarios.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Resultater", exact: true }).click();
  await page.screenshot({
    path: `${evidence}/${name}-results.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Rapport", exact: true }).click();
  await page
    .getByLabel("Din beslutning til rapporten")
    .fill(
      "Vi afprøver én ekstra sagsbehandler i en afgrænset periode og validerer ventetid og restkø.",
    );
  await page.screenshot({
    path: `${evidence}/${name}-report.png`,
    fullPage: true,
  });
  if (name === "desktop") {
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Hent kun PDF", exact: true })
      .click();
    const download = await downloadPromise;
    await download.saveAs(`${evidence}/sample-report.pdf`);
    const zipPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Hent rapportpakke", exact: true })
      .click();
    const zip = await zipPromise;
    await zip.saveAs(`${evidence}/sample-report.zip`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Rapport", exact: true }).click();
    const persisted = await page
      .getByLabel("Din beslutning til rapporten")
      .inputValue();
    if (!persisted.includes("afgrænset periode"))
      errors.push({
        viewport: name,
        error: "Decision did not persist after reload",
      });
  }
  await context.close();
}
await writeFile(
  `${evidence}/browser-check.json`,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      browser: browserName,
      viewports: ["1440x900", "1024x768", "390x844"],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log(JSON.stringify({ errors }));
if (errors.length) process.exitCode = 1;
