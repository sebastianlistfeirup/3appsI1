const { chromium } = require("@playwright/test");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000");
  await page.getByText("Gemt lokalt", { exact: true }).waitFor();
  await page.screenshot({
    path: "reports/studio/overview-desktop.png",
    fullPage: true,
  });
  await page.goto("http://localhost:3000/projects/realmread/review");
  await page.getByRole("heading", { name: "Klar til dit blik." }).waitFor();
  await page.screenshot({
    path: "reports/studio/review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "reports/studio/review-mobile.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      errors,
      title: await page.title(),
      bodyOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    }),
  );
  await browser.close();
})();
