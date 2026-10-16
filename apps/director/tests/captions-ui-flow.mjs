import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { parseProject, reviseShot } from "@tre/scene-format";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const captionsModule = await import("../src/lib/captions.ts");
const { buildCaptionTrack, captionFile } =
  captionsModule.default ?? captionsModule;
const expect = baseExpect.configure({ timeout: 20000 });
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const engine = process.env.CAPTION_ENGINE ?? "chromium",
  report = { engine, phases: [], scans: [], checks: [], errors: [] };
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-captions-flow.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("Director captions:", engine, name);
};
const watchdog = setTimeout(() => {
  console.error("Caption UI exceeded 240 seconds");
  process.exit(1);
}, 240000);
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => report.errors.push(error.message));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            req = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          req.onsuccess = () => {
            resolve(req.result.data);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const scan = async (name) => {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
      })
    ).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((node) => node.target),
    })),
  );
  report.scans.push({ name, violations });
  assert.deepEqual(violations, []);
};
const importProject = async (project) => {
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "captions.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    project.title,
  );
  await saved();
};
const seek = async (frame) => {
  await page
    .getByRole("slider", { name: "Afspilningsposition", exact: true })
    .evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, frame);
  await expect(page.locator(".playback-frame")).toHaveAttribute(
    "data-review-frame",
    String(frame),
  );
};
try {
  await phase("import long complete dialogue and actual audio");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  const directory = await fs.mkdtemp("/tmp/director-caption-ui-");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=550:sample_rate=44100:duration=4",
      "-c:a",
      "pcm_s16le",
      `${directory}/voice.wav`,
    ],
    { timeout: 15000 },
  );
  const wav = await fs.readFile(`${directory}/voice.wav`);
  let project = parseProject(
    JSON.parse(
      await fs.readFile("fixtures/director-sample-render.json", "utf8"),
    ),
  );
  project.title = `${engine} · Undertekster uden tab`;
  project.sequence = project.sequence.slice(0, 2);
  project.sequenceVersions = [];
  project.media = [
    {
      id: "tone",
      name: "Egen tone.wav",
      kind: "audio",
      mime: "audio/wav",
      dataUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
      sha256: sha(wav),
      bytes: wav.length,
      durationFrames: 96,
      source: "Original test tone",
      rights: "owned",
    },
  ];
  project.voice = {
    mediaId: "tone",
    volume: 1,
    sourceIn: 0,
    startFrame: 0,
    fadeFrames: 6,
    duck: false,
  };
  project.music = null;
  const dialogue =
    "Vi skal kunne læse hele den oprindelige replik. Hvert ord har betydning, og slutningen må aldrig forsvinde efter tre linjer. " +
    "Teksten indeholder æ, ø, å, Ελληνικά og Привет samt <b>bogstavelige tegn</b>. Vi følger den samme timing gennem klipningen. DEN SIDSTE SÆTNING ER BEVARET.";
  project = reviseShot(project, project.sequence[0], {
    durationFrames: 48,
    transitionFrames: 0,
    dialogue,
  });
  project = reviseShot(project, project.sequence[1], {
    durationFrames: 48,
    transitionFrames: 12,
    dialogue: "Den næste scene får plads.",
  });
  project.captions = true;
  await importProject(project);
  const before = await read(),
    track = buildCaptionTrack(before);
  await phase("preview exact cue boundaries and midpoint handover");
  await seek(1);
  for (const cue of track.cues) {
    for (const frame of [cue.startFrame, cue.endFrame - 1]) {
      await seek(frame);
      await expect(page.locator(".playback-caption")).toHaveAttribute(
        "data-caption-id",
        cue.id,
      );
      assert.equal(
        await page.locator(".playback-caption").textContent(),
        cue.text,
      );
    }
  }
  await phase("download whole current SRT and VTT and review reading warnings");
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  await page.locator(".caption-export summary").click();
  await expect(page.locator(".caption-export")).toContainText(
    "Forlæng shottet",
  );
  for (const format of ["srt", "vtt"]) {
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Hent ${format.toUpperCase()}`,
        exact: true,
      })
      .click();
    const bytes = await fs.readFile(await (await event).path());
    assert.equal(bytes.toString(), captionFile(before, format));
    const plain = bytes
      .toString()
      .split("\n\n")
      .filter((block) => block.includes(" --> "))
      .flatMap((block) => block.split("\n").slice(2))
      .join(" ")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&")
      .replace(/\s+/gu, " ");
    assert.ok(plain.includes("DEN SIDSTE SÆTNING ER BEVARET."));
    assert.equal(
      plain.replace(/\s/gu, ""),
      before.sequence
        .map((id) => before.shots.find((shot) => shot.id === id).dialogue)
        .join("")
        .replace(/\s/gu, ""),
    );
  }
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".caption-export").scrollIntoViewIfNeeded();
    await scan(`${name}-caption-options`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-caption-options.png`,
      fullPage: false,
    });
  }
  assert.deepEqual(await read(), before);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".caption-export summary").click();
  await phase(
    "render actual movie and verify locked quality report and subtitle downloads",
  );
  await page
    .getByRole("button", { name: "Eksportér animatic", exact: true })
    .click();
  await expect(page.getByText("Din film er klar", { exact: true })).toBeVisible(
    { timeout: 120000 },
  );
  await expect(page.locator(".render-quality")).toContainText("48 kHz");
  await expect(page.locator(".render-quality")).toContainText("LUFS");
  const jobId = await page.evaluate(() =>
    localStorage.getItem("director-last-render:production"),
  );
  const state = await (
    await page.request.get(`${directorUrl}/api/exports/${jobId}`)
  ).json();
  report.metadata = state.metadata;
  const movieEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Hent MP4", exact: true }).click();
  const movie = await fs.readFile(await (await movieEvent).path());
  assert.equal(sha(movie), state.metadata.sha256);
  report.browserPlayback = await page.evaluate(
    (base64) =>
      new Promise((resolve, reject) => {
        const video = document.createElement("video"),
          bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
          url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        video.muted = true;
        video.playsInline = true;
        video.style.cssText =
          "position:fixed;left:-2000px;top:0;width:320px;height:180px";
        document.body.append(video);
        let callback;
        const cleanup = () => {
          clearTimeout(timer);
          if (callback !== undefined) video.cancelVideoFrameCallback(callback);
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
          URL.revokeObjectURL(url);
        };
        const fail = (message) => {
          cleanup();
          reject(Error(message));
        };
        const timer = setTimeout(
          () =>
            fail(
              "The downloaded MP4 did not present a decoded frame within 10 seconds",
            ),
          10000,
        );
        video.onerror = () =>
          fail(
            `The downloaded MP4 failed native decoding: ${video.error?.code}`,
          );
        callback = video.requestVideoFrameCallback((_now, frame) => {
          const result = {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            presentedFrames: frame.presentedFrames,
            mediaTime: frame.mediaTime,
          };
          cleanup();
          resolve(result);
        });
        video.src = url;
        video.play().catch((error) => fail(error.message));
      }),
    movie.toString("base64"),
  );
  assert.equal(report.browserPlayback.width, 1280);
  assert.equal(report.browserPlayback.height, 720);
  assert.ok(Math.abs(report.browserPlayback.duration - 3.5) < 1 / 24);
  assert.ok(report.browserPlayback.presentedFrames >= 1);
  const reportEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Hent kvalitetsrapport", exact: true })
    .click();
  const validationBytes = await fs.readFile(await (await reportEvent).path()),
    validation = JSON.parse(validationBytes);
  assert.equal(sha(validationBytes), state.artifacts["validation.json"].sha256);
  assert.equal(validation.sha256, state.metadata.sha256);
  assert.equal(validation.source.title, before.title);
  assert.equal(validation.source.revision, before.revision);
  assert.equal(validation.loudnessLufs, state.metadata.loudnessLufs);
  assert.equal(validation.truePeakDbfs, state.metadata.truePeakDbfs);
  assert.equal(validation.captions.cues, track.cues.length);
  const oldSubtitle = await (
    await page.request.get(
      `${directorUrl}/api/exports/${jobId}?artifact=captions.srt`,
    )
  ).text();
  assert.equal(oldSubtitle, captionFile(before, "srt"));
  assert.equal(
    (
      await page.request.get(
        `${directorUrl}/api/exports/${jobId}?artifact=../manifest.json`,
      )
    ).status(),
    404,
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".render-quality").scrollIntoViewIfNeeded();
    await scan(`${name}-measured-quality`);
    await page.screenshot({
      path: `reports/director/${engine}-${name}-measured-quality.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  project = reviseShot(before, before.sequence[0], {
    dialogue: "En ny klipning har en anden replik.",
  });
  project.title += " · ændret";
  await importProject(project);
  await page.reload();
  await saved();
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  await expect(
    page.getByText("Din film er klar", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".render-quality")).toContainText(
    "Du har ændret filmen siden denne eksport",
  );
  const lockedEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Filmens SRT", exact: true }).click();
  assert.equal(
    (await fs.readFile(await (await lockedEvent).path())).toString(),
    oldSubtitle,
  );
  assert.equal(
    (await read()).shots.find((s) => s.id === project.sequence[0]).dialogue,
    "En ny klipning har en anden replik.",
  );
  report.checks.push(
    "Preview uses the same complete cues and midpoint handover; exact SRT/VTT downloads preserve long Unicode dialogue; real 3.5-second MP4 quality report hashes match; locked subtitle remains unchanged after editing and reload; six responsive axe states are clean",
  );
  assert.deepEqual(report.errors, []);
  await phase("passed");
  await fs.rm(`reports/director/${engine}-captions-failure.png`, {
    force: true,
  });
} catch (error) {
  report.failure = String(error);
  await phase("failed");
  await page
    .screenshot({
      path: `reports/director/${engine}-captions-failure.png`,
      timeout: 4000,
    })
    .catch(() => {});
  throw error;
} finally {
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Browser cleanup exceeded 5 seconds")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
  }
}
