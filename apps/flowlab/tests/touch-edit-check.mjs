import { chromium, firefox, webkit, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const name = process.env.FLOWLAB_BROWSER ?? "chromium";
const browser = await { chromium, firefox, webkit }[name].launch(
  name === "chromium"
    ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        args: ["--no-sandbox"],
      }
    : {},
);
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    hasTouch: true,
    ...(name !== "firefox" ? { isMobile: true } : {}),
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
  await expect(
    page.getByText("30 parrede replikationer", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: /Aktivitet Sagsbehandling/ }).tap();
  const capacity = page.getByRole("textbox", {
    name: "Antal medarbejdere",
    exact: true,
  });
  await capacity.fill("20");
  await capacity.press("Enter");
  await capacity.fill("5");
  await page
    .getByRole("button", { name: "Tilføj en medarbejder", exact: true })
    .tap();
  await expect(capacity).toHaveValue("6");
  await page
    .getByRole("button", { name: "Fortryd ændring", exact: true })
    .tap();
  await expect(capacity).toHaveValue("5");
  await page
    .getByRole("button", { name: "Fortryd ændring", exact: true })
    .tap();
  await expect(capacity).toHaveValue("20");
  await capacity.fill("5");
  await page
    .getByRole("button", { name: "Fjern en medarbejder", exact: true })
    .tap();
  await expect(capacity).toHaveValue("4");
  await page
    .getByRole("button", { name: "Fortryd ændring", exact: true })
    .tap();
  await expect(capacity).toHaveValue("5");
  await page
    .getByRole("button", { name: "Fortryd ændring", exact: true })
    .tap();
  await expect(capacity).toHaveValue("20");
  await capacity.fill("5");
  await capacity.press("Tab");
  await expect(
    page.getByRole("button", { name: "Tilføj en medarbejder", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(capacity).toHaveValue("6");
  await capacity.fill("7");
  await page.getByRole("button", { name: "Baseline", exact: true }).tap();
  await expect(capacity).toHaveValue("3");
  await page.getByRole("button", { name: "Alternativ", exact: true }).tap();
  await expect(capacity).toHaveValue("7");
  await capacity.fill("");
  await page
    .getByRole("button", { name: "Tilføj en medarbejder", exact: true })
    .tap();
  await expect(capacity).toHaveValue("8");
  await page
    .getByRole("button", { name: "Rediger varighed", exact: true })
    .tap();
  const dialog = page.getByRole("dialog", {
    name: "Tid med en tydelig antagelse",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuller", exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await capacity.fill("7");
  await page
    .getByRole("button", { name: "Luk indstillinger", exact: true })
    .tap();
  await page.getByRole("button", { name: /Aktivitet Sagsbehandling/ }).tap();
  await expect(capacity).toHaveValue("7");
  const nodeName = page.getByRole("textbox", { name: "Navn", exact: true });
  await nodeName.fill("Berøringskontrol");
  await page
    .getByRole("button", { name: "Luk indstillinger", exact: true })
    .tap();
  await page.getByRole("button", { name: /Aktivitet Berøringskontrol/ }).tap();
  await expect(nodeName).toHaveValue("Berøringskontrol");
  await capacity.fill("6");
  await page
    .getByRole("button", { name: "Kør sammenligning", exact: true })
    .tap();
  await expect(page.locator(".stale-notice")).toHaveCount(0);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Rapport", exact: true }).tap();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Hent rapportpakke", exact: true })
    .tap();
  const files = unzipSync(await readFile(await (await pending).path()));
  const report = JSON.parse(strFromU8(files["report.json"]));
  expect(report.comparison.scenario.resources[0].capacity).toBe(6);
  expect(
    report.comparison.scenario.nodes.find(
      (node) => node.label === "Berøringskontrol",
    ),
  ).toBeTruthy();
  expect(report.comparison.seeds).toHaveLength(30);
  expect(errors).toEqual([]);
  await writeFile(
    `reports/flowlab/${name}-touch-edit-check.json`,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        browser: name,
        viewport: "390x844",
        hasTouch: true,
        isMobile: name !== "firefox",
        checks: [
          "Actual touch tap commits5 then increments to6; two undo restore5 then20",
          "Actual touch decrements from current draft, two undo restore draft and original",
          "Keyboard Tab then Space applies draft and increments exactly once",
          "Touch switching baseline/alternative commits previous draft to correct model",
          "Invalid empty draft keeps previous value before touch step",
          "Touch opens and cancels duration modal",
          "Touch closing inspector commits7 and reopening preserves it",
          "Touch closing preserves text label too",
          "Touch run with pending6 computes and exports real30-pair report with capacity6",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`${name}: touch editing and modal cancellation passed`);
} finally {
  await browser.close();
}
