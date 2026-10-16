import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
const input = path.resolve(
  process.argv[2] ?? "reports/director/chromium-media-input.mp4",
);
await fs.access(input);
const profiles = [
  { name: "playwright-default", options: {} },
  {
    name: "playwright-full",
    options: { executablePath: chromium.executablePath() },
  },
];
if (existsSync("/usr/bin/chromium"))
  profiles.unshift({
    name: "system",
    options: { executablePath: "/usr/bin/chromium" },
  });
const results = [];
for (const profile of profiles) {
  const browser = await chromium.launch({
    headless: true,
    ...profile.options,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<input type=file><video muted></video>");
    await page.locator("input").setInputFiles(input);
    const result = await page.evaluate(async () => {
      const el = document.querySelector("video"),
        file = document.querySelector("input").files[0];
      const declared = {
        h264: el.canPlayType('video/mp4; codecs="avc1.64001f"'),
        aac: el.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
      };
      const actual = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 15000);
        el.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve({
            loaded: true,
            width: el.videoWidth,
            height: el.videoHeight,
            duration: el.duration,
          });
        };
        el.onerror = () => {
          clearTimeout(timer);
          resolve({ error: el.error?.code, message: el.error?.message });
        };
        el.src = URL.createObjectURL(file);
      });
      let decoded = null;
      if (actual.loaded) {
        decoded = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ timeout: true }), 10000);
          el.requestVideoFrameCallback((_, metadata) => {
            clearTimeout(timer);
            resolve({
              width: metadata.width,
              height: metadata.height,
              frames: metadata.presentedFrames,
            });
          });
          void el.play().catch((error) => {
            clearTimeout(timer);
            resolve({ error: String(error) });
          });
        });
        el.pause();
      }
      return { declared, actual, decoded };
    });
    results.push({
      name: profile.name,
      executable: profile.options.executablePath ?? "Playwright default",
      version: browser.version(),
      input,
      ...result,
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    await browser.close();
  }
}
await fs.writeFile(
  "reports/director/chromium-codec-probe.json",
  JSON.stringify(results, null, 2),
);
