import { chromiumExecutable, directorUrl } from "./browser.mjs";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const dir = await fs.mkdtemp("/tmp/director-ui-media-");
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "",
      err = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (err += v));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(Error(err)),
    );
  });
await run("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=30:duration=6",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=880:sample_rate=48000:duration=6",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  `${dir}/Eget klip.mp4`,
]);
for (const [name, hz, duration] of [
  ["Voiceover", 440, 3],
  ["Musik", 220, 6],
])
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${hz}:sample_rate=48000:duration=${duration}`,
    "-c:a",
    "pcm_s16le",
    `${dir}/${name}.wav`,
  ]);
const p = JSON.parse(
  await fs.readFile("fixtures/director-sample-render.json", "utf8"),
);
p.title = "Et eget klip og to lydspor";
p.sequence = p.sequence.slice(0, 3);
for (const s of p.shots) {
  s.durationFrames = 48;
  s.transitionFrames = 0;
}
p.shots.find((s) => s.id === p.sequence[1]).transitionFrames = 12;
const engine = process.env.MEDIA_ENGINE ?? "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const fixtureBytes = await fs.readFile(`${dir}/Eget klip.mp4`);
await fs.copyFile(
  `${dir}/Eget klip.mp4`,
  `reports/director/${engine}-media-input.mp4`,
);
const diagnostic = {
  engine,
  browserVersion: browser.version(),
  executablePath: chromiumExecutable ?? "Playwright default headless shell",
  ffmpegVersion: (await run("ffmpeg", ["-version"])).split("\n")[0],
  inputSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  inputMetadata: JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      `${dir}/Eget klip.mp4`,
    ]),
  ),
  browserCapabilities: null,
  mediaErrors: [],
  failure: null,
  verifiedAt: new Date().toISOString(),
};
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [],
    accessibility = [];
  const scan = async (name) => {
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(
      async () =>
        (
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
          })
        ).violations,
    );
    accessibility.push({
      name,
      violations: violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
    assert.deepEqual(
      violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      [],
    );
  };
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.text().startsWith("Director media import failed"))
      diagnostic.mediaErrors.push(message.text());
  });
  await page.goto(directorUrl);
  diagnostic.browserCapabilities = await page.evaluate(() => {
    const media = document.createElement("video");
    return {
      userAgent: navigator.userAgent,
      h264: media.canPlayType('video/mp4; codecs="avc1.64001f"'),
      aac: media.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
      vp9opus: media.canPlayType('video/webm; codecs="vp9, opus"'),
    };
  });
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await page
    .locator("input[type=file]")
    .nth(0)
    .setInputFiles({
      name: "media-review.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.locator(".shot-card")).toHaveCount(3);
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Shot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importér billede eller klip", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${dir}/Eget klip.mp4`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".shot-thumbnail video")).toHaveCount(1);
  await page.getByRole("spinbutton", { name: "Varighed i sekunder" }).fill("4");
  await page
    .getByRole("spinbutton", { name: "Varighed i sekunder" })
    .press("Tab");
  await page
    .getByRole("spinbutton", { name: "Klipstart i sekunder" })
    .fill("1");
  await page
    .getByRole("spinbutton", { name: "Klipstart i sekunder" })
    .press("Tab");
  await page.getByLabel("Brug klippets lyd").check();
  await page
    .getByRole("button", { name: "Importér din egen voiceover", exact: false })
    .click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${dir}/Voiceover.wav`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tilføj et musikspor", exact: false })
    .click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(`${dir}/Musik.wav`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".audio-name").first().click();
  await page
    .getByRole("spinbutton", { name: "Start på tidslinje (sek.)", exact: true })
    .fill("0.5");
  await page
    .getByRole("spinbutton", { name: "Start på tidslinje (sek.)", exact: true })
    .press("Tab");
  await page
    .getByRole("spinbutton", { name: "Start i lydfil (sek.)", exact: true })
    .fill("0.25");
  await page
    .getByRole("spinbutton", { name: "Start i lydfil (sek.)", exact: true })
    .press("Tab");
  await page
    .getByRole("spinbutton", { name: "Fade ind/ud (sek.)", exact: true })
    .fill("0.2");
  await page
    .getByRole("spinbutton", { name: "Fade ind/ud (sek.)", exact: true })
    .press("Tab");
  await scan("audio-dialog");
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Afspil sekvens", exact: true })
    .click();
  await expect(page.locator(".preview-meter")).toHaveAttribute(
    "data-audio-context",
    "running",
  );
  await expect
    .poll(() => page.locator(".preview-meter").evaluate((e) => e.value))
    .toBeGreaterThan(0.005);
  await expect
    .poll(() =>
      page
        .locator(".preview-meter")
        .evaluate((e) => Number(e.getAttribute("data-duck-gain"))),
    )
    .toBeLessThan(0.95);
  await expect
    .poll(() =>
      page.locator(".review-layer video").evaluate((e) => e.currentTime),
    )
    .toBeGreaterThan(1.1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(
    await page.locator(".review-layer video").evaluate((e) => e.paused),
    true,
  );
  const paused = await page
    .locator(".playback-frame")
    .getAttribute("data-review-frame");
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator(".playback-frame").getAttribute("data-review-frame"),
    paused,
  );
  await page
    .getByRole("slider", { name: "Afspilningsposition", exact: true })
    .evaluate((el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(el, "90");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(page.locator(".playback-frame")).toHaveAttribute(
    "data-review-frame",
    "90",
  );
  await expect(page.locator(".review-layer")).toHaveCount(2);
  assert.equal(
    await page
      .locator(".review-layer")
      .nth(1)
      .evaluate((e) => Number(getComputedStyle(e).opacity)),
    0.5,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await scan("desktop-preview");
  await page.screenshot({
    path: `reports/director/${engine}-media-review-crossfade.png`,
    fullPage: true,
  });
  for (const [name, width, height] of [
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await scan(`${name}-preview`);
    await page.screenshot({
      path: `reports/director/${engine}-${name}-media-review.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  let metadata = null;
  if (!process.env.DIRECTOR_SKIP_RENDER) {
    await page.getByRole("button", { name: "Eksportér", exact: true }).click();
    await page
      .getByRole("button", { name: "Eksportér animatic", exact: true })
      .click();
    await expect(
      page.getByText("Din film er klar", { exact: true }),
    ).toBeVisible({ timeout: 120000 });
    const event = page.waitForEvent("download");
    await page.getByRole("link", { name: "Hent MP4", exact: true }).click();
    await (await event).saveAs("reports/director/media-ui-export.mp4");
    metadata = JSON.parse(
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        "reports/director/media-ui-export.mp4",
      ]),
    );
    assert.equal(Number(metadata.format.duration), 7.5);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-media-ui-flow.json`,
    JSON.stringify(
      {
        engine,
        rendered: !process.env.DIRECTOR_SKIP_RENDER,
        checks: [
          "real browser MP4/WAV import",
          "source trim and own clip audio",
          "voice/music timing and fades",
          "running WebAudio context and measured nonzero PCM",
          "actual music gain reduced by voice energy",
          "source video clock advances",
          "pause freezes frame",
          "scrub positions crossfade at 50%",
          ...(!process.env.DIRECTOR_SKIP_RENDER ? ["real UI export 7.5s"] : []),
        ],
        metadata,
        accessibility,
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Director media UI flow passed", engine);
} catch (error) {
  diagnostic.failure = String(error);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    console.error(
      await page.locator(".modal-error,.error-banner").allTextContents(),
    );
    await page.screenshot({
      path: `/tmp/director-${engine}-media-failed.png`,
      fullPage: true,
    });
  }
  throw error;
} finally {
  await fs.writeFile(
    `reports/director/${engine}-media-diagnostic.json`,
    JSON.stringify(diagnostic, null, 2),
  );
  await browser.close();
}
