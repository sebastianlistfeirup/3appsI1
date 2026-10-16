import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 20000 });
const dir = await fs.mkdtemp("/tmp/director-storyboard-");
const run = (cmd, args, bytes = false) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args),
      out = [],
      err = [];
    child.stdout.on("data", (x) => out.push(x));
    child.stderr.on("data", (x) => err.push(x));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(bytes ? Buffer.concat(out) : Buffer.concat(out).toString())
        : reject(Error(Buffer.concat(err).toString())),
    );
  });
await run("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=red:size=640x360:rate=24:duration=3",
  "-f",
  "lavfi",
  "-i",
  "color=blue:size=640x360:rate=24:duration=3",
  "-filter_complex",
  "[0:v][1:v]concat=n=2:v=1:a=0[v]",
  "-map",
  "[v]",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  `${dir}/red-then-blue.mp4`,
]);
const video = await fs.readFile(`${dir}/red-then-blue.mp4`),
  p = JSON.parse(
    await fs.readFile("fixtures/director-sample-render.json", "utf8"),
  );
p.title = "Blå efter kliptrim · Æøå Ω Привет";
p.sequence = p.sequence.slice(0, 2);
const first = p.shots.find((s) => s.id === p.sequence[0]);
first.mediaId = "own_trimmed_video";
first.sourceIn = 96;
first.durationFrames = 48;
first.transitionFrames = 0;
first.name = "Et blåt klip fra sekund fire";
first.dialogue = (
  "Ærlig følelse — déjà vu, Ωμέγα, Привет. Det hele skal med. ".repeat(25) +
  "SLUTREPLIKBEVARET"
).slice(0, 1950);
first.notes =
  "FULDNOTE_START " +
  "Kontinuitet: β, é og å. ".repeat(35) +
  " LANGTORD_" +
  "x".repeat(400) +
  " SLUTNOTEBEVARET";
p.shots.find((s) => s.id === p.sequence[1]).durationFrames = 48;
p.shots.find((s) => s.id === p.sequence[1]).transitionFrames = 12;
p.media = [
  {
    id: "own_trimmed_video",
    name: "Rød så blå.mp4",
    kind: "video",
    mime: "video/mp4",
    dataUrl: `data:video/mp4;base64,${video.toString("base64")}`,
    sha256: createHash("sha256").update(video).digest("hex"),
    bytes: video.length,
    durationFrames: 144,
    source: "Egen syntetisk testfilm",
    rights: "owned",
  },
];
p.voice = p.music = null;
const engine = process.env.STORYBOARD_ENGINE ?? "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(25000);
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
      }),
  );
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
try {
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "blue-film.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(p.title);
  await saved();
  const beforeExport = await read();
  await expect
    .poll(() =>
      page.locator(".shot-thumbnail video").evaluate((v) => v.currentTime),
    )
    .toBe(4);
  await page.getByRole("button", { name: "Eksportér", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.locator(".export-options button").first().click();
  const path = `reports/director/${engine}-trimmed-storyboard.pdf`;
  await (await download).saveAs(path);
  const text = await run("pdftotext", ["-layout", path, "-"]);
  assert.ok(text.includes("SLUTREPLIKBEVARET"));
  assert.ok(text.includes("SLUTNOTEBEVARET"));
  assert.ok(text.includes("Ærlig følelse"));
  assert.ok(text.includes("Ωμέγα"));
  assert.ok(text.includes("Привет"));
  assert.ok(text.includes("Fuld replik og noter: side"));
  assert.ok(text.includes("Trim: 96 → 144 frames"));
  assert.ok(text.includes("84 frames ved 24 fps"));
  await run("pdfdetach", ["-saveall", "-o", dir, path]);
  const manifest = JSON.parse(
    await fs.readFile(`${dir}/director-manifest.json`, "utf8"),
  );
  assert.equal(manifest.production.totalFrames, 84);
  assert.equal(manifest.shots[0].dialogue, first.dialogue);
  assert.equal(manifest.shots[0].notes, first.notes);
  assert.equal(manifest.shots[0].source.sourceIn, 96);
  assert.equal(manifest.shots[0].source.sha256, p.media[0].sha256);
  assert.equal(manifest.shots[0].poster.source, "video");
  assert.equal(manifest.shots[0].poster.sourceFrame, 96);
  assert.equal(manifest.shots[0].cameraFrameSha256, null);
  assert.equal(manifest.shots[1].poster.source, "camera");
  assert.deepEqual(manifest.warnings, []);
  await run("pdfimages", ["-j", path, `${dir}/image`]);
  assert.equal(
    createHash("sha256")
      .update(await fs.readFile(`${dir}/image-000.jpg`))
      .digest("hex"),
    manifest.shots[0].poster.sha256,
  );
  const rgb = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      `${dir}/image-000.jpg`,
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    true,
  );
  assert.ok(
    rgb[2] > 220 && rgb[0] < 20 && rgb[1] < 20,
    `trimmed poster is not blue: ${[...rgb]}`,
  );
  await run("pdftoppm", [
    "-f",
    "1",
    "-singlefile",
    "-scale-to",
    "1600",
    "-png",
    path,
    `reports/director/${engine}-trimmed-storyboard`,
  ]);
  assert.deepEqual(await read(), beforeExport);
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Shot", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Klipstart i sekunder" })
    .fill("1");
  await page
    .getByRole("spinbutton", { name: "Klipstart i sekunder" })
    .press("Tab");
  await saved();
  await expect
    .poll(() =>
      page.locator(".shot-thumbnail video").evaluate((v) => v.currentTime),
    )
    .toBe(1);
  const after = await read();
  assert.equal(after.shots.find((s) => s.id === first.id).sourceIn, 96);
  assert.equal(
    after.shots.find((s) => s.id === after.sequence[0]).sourceIn,
    24,
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-storyboard-flow.json`,
    JSON.stringify(
      {
        engine,
        browser: browser.version(),
        checks: [
          "actual H264 clip decoded at sourceIn=96 into blue PDF image, not red first frame or stale camera frame",
          "full long Danish/Greek/Cyrillic dialogue and notes retained across pages",
          "measured long-token wrapping",
          "embedded JSON manifest preserves original text, immutable versions, timeline and source/poster hashes",
          "PDF export leaves project byte-equivalent",
          "trim creates new shot version and updates actual thumbnail source time",
        ],
        posterRgb: [...rgb],
        pdfMetadata: await run("pdfinfo", [path]),
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Director storyboard flow passed", engine);
} finally {
  await browser.close();
}
