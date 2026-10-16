/** Original thumbnails rendered by Director itself; no remote imagery or paid models. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { chromiumExecutable, directorUrl } from "./browser.mjs";
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutable,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(20000);
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await fs.mkdir("apps/director/public/locations", { recursive: true });
  for (const [id, name] of [
    ["station", "Observationsdæk"],
    ["studio", "Lysstudie"],
    ["courtyard", "Gårdrum"],
  ]) {
    await page
      .getByRole("button", { name: "Redigér set", exact: true })
      .click();
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page
      .getByRole("button", { name: "Brug dette set", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Gem indstilling", exact: true })
      .click();
    await expect(page.locator(".toast.working")).toHaveCount(0, {
      timeout: 30000,
    });
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
    const src = await page
      .locator(".shot-thumbnail img")
      .first()
      .getAttribute("src");
    await fs.writeFile(
      `apps/director/public/locations/${id}.jpg`,
      Buffer.from(src.split(",")[1], "base64"),
    );
    console.log("Rendered original location preview", id);
  }
} finally {
  await browser.close();
}
