import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
await expect(
  page.getByText("30 parrede replikationer", { exact: false }),
).toBeVisible();
const node = page.locator('.react-flow__node[data-id="process"]');
const before = await node.getAttribute("style");
const box = await node.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 50, {
  steps: 8,
});
await page.mouse.up();
const after = await node.getAttribute("style");
expect(after).not.toBe(before);
await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
await page.reload({ waitUntil: "networkidle" });
await expect(
  page.locator('.react-flow__node[data-id="process"]'),
).toHaveAttribute("style", after);
await page.getByRole("tab", { name: "Model", exact: true }).focus();
await page.keyboard.press("ArrowRight");
await expect(
  page.getByRole("tab", { name: "Scenarier", exact: false }),
).toBeFocused();
await expect(
  page.getByRole("tab", { name: "Scenarier", exact: false }),
).toHaveAttribute("aria-selected", "true");
await page.keyboard.press("End");
await expect(
  page.getByRole("tab", { name: "Rapport", exact: true }),
).toBeFocused();
await page.keyboard.press("Home");
await expect(
  page.getByRole("tab", { name: "Model", exact: true }),
).toBeFocused();
await writeFile(
  "reports/flowlab/canvas-keyboard.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      checks: [
        "Real pointer drag updates diagram position.",
        "Position persists after reload.",
        "Arrow/Home/End switches and focuses tablist.",
      ],
      before,
      after,
    },
    null,
    2,
  ),
);
await browser.close();
