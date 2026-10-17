import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import { parseProject } from "@tre/scene-format";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const expect = baseExpect.configure({ timeout: 25000 }),
  engine = process.env.HISTORY_ENGINE ?? "chromium";
const report = { engine, phases: [], checks: [], scans: [], errors: [] };
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-render-history-flow.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("Director export archive:", engine, name);
};
const watchdog = setTimeout(() => process.exit(1), 240000);
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
page.setDefaultTimeout(25000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => report.errors.push(error.message));
await page.addInitScript(() => {
  const Original = window.Worker;
  window.__snapshotWorkers = { created: 0, closed: 0 };
  window.Worker = class extends Original {
    constructor(...args) {
      if (window.__failSnapshotWorker) {
        window.__failSnapshotWorker = false;
        throw Error("controlled worker startup failure");
      }
      super(...args);
      window.__snapshotWorkers.created++;
    }
    terminate() {
      if (!this.__closed) {
        this.__closed = true;
        window.__snapshotWorkers.closed++;
      }
      super.terminate();
    }
  };
});
const sha = (value) => createHash("sha256").update(value).digest("hex");
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tre-apps-director-v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          request.onsuccess = () => {
            resolve(request.result.data);
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const importProject = async (project) => {
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    project.title,
  );
  await saved();
};
const exportPanel = () =>
  page.getByRole("button", { name: "Eksportér", exact: true }).click();
const openArchive = async () => {
  const details = page.locator(".render-archive");
  if (!(await details.getAttribute("open"))) {
    if (!(await details.evaluate((element) => element.open)))
      await details.locator("summary").click();
  }
  await expect(
    page.getByText("Henter lokale eksporter …", { exact: true }),
  ).toHaveCount(0);
};
const status = (id) =>
  page.request
    .get(`${directorUrl}/api/exports/${id}`)
    .then((response) => response.json());
const primaryDownload = async () => {
  const pending = page.waitForEvent("download");
  await page
    .locator(".render-status")
    .getByRole("link", { name: "Hent MP4", exact: true })
    .click();
  const download = await pending,
    bytes = await fs.readFile(await download.path());
  return {
    filename: download.suggestedFilename(),
    sha256: sha(bytes),
    bytes: bytes.length,
  };
};
let releasePoll;
try {
  await phase("first actual movie and exact snapshot comparison");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  let project = parseProject(await read());
  project.id = `archive_${randomUUID().replaceAll("-", "")}`;
  project.title = "Arkivprøve Ærlig åben";
  project.revision = 1;
  project.sequence = project.sequence.slice(0, 1);
  project.sequenceVersions = [];
  const shot = project.shots.find((item) => item.id === project.sequence[0]);
  shot.durationFrames = 24;
  shot.dialogue = "Første klipning";
  await importProject(project);
  await exportPanel();
  await page
    .getByRole("button", { name: "Eksportér animatic", exact: true })
    .click();
  await expect(
    page.getByText("Din film er klar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Denne eksport matcher din aktuelle projektversion.", {
      exact: true,
    }),
  ).toBeVisible();
  const firstId = await page.evaluate(() =>
    localStorage.getItem("director-last-render:production"),
  );
  const first = await status(firstId),
    firstFile = await primaryDownload();
  assert.equal(
    first.manifestHash,
    sha(JSON.stringify(parseProject(await read()))),
  );
  assert.equal(firstFile.sha256, first.metadata.sha256);
  assert.match(
    firstFile.filename,
    /^director-arkivproeve-aerlig-aaben-r1-[a-f0-9]{8}\.mp4$/,
  );
  report.checks.push(
    "actual MP4 has original hash and title/revision filename; worker matches exact immutable manifest",
  );
  await phase(
    "same-ID same-revision import is correctly detected as different content",
  );
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  project = parseProject(await read());
  project.shots.find((item) => item.id === project.sequence[0]).dialogue =
    "Anden klipning med samme revisionsnummer";
  await importProject(project);
  await exportPanel();
  await expect(
    page
      .locator(".render-quality .caption-warning")
      .filter({ hasText: "Du har ændret filmen siden denne eksport" }),
  ).toBeVisible();
  assert.equal((await read()).revision, first.source.revision);
  report.checks.push(
    "same revision number is insufficient; full project hash detects changed imported dialogue",
  );
  await phase(
    "late native job-status response cannot replace a deliberately selected old export",
  );
  let heldResolve;
  const held = new Promise((resolve) => {
    heldResolve = resolve;
  });
  const release = new Promise((resolve) => {
    releasePoll = resolve;
  });
  let captured = false;
  await page.route(/\/api\/exports\/[a-f0-9-]{36}$/, async (route) => {
    if (
      captured ||
      route.request().url().endsWith(firstId) ||
      route.request().method() !== "GET"
    )
      return route.continue();
    captured = true;
    const response = await route.fetch();
    heldResolve();
    await release;
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByRole("button", { name: "Lav en ny eksport", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Eksportér animatic", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("director-last-render:production"),
      ),
    )
    .toMatch(/^[a-f0-9-]{36}$/);
  const secondId = await page.evaluate(() =>
    localStorage.getItem("director-last-render:production"),
  );
  assert.notEqual(secondId, firstId);
  await Promise.race([
    held,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Status poll did not start")), 20000),
    ),
  ]);
  await openArchive();
  await expect(page.locator(".render-history-item")).toHaveCount(2);
  await page
    .locator(`[data-render-id="${firstId}"]`)
    .getByRole("button", { name: /Vis eksport/ })
    .click();
  releasePoll();
  await page.unroute(/\/api\/exports\/[a-f0-9-]{36}$/);
  await expect(
    page
      .locator(".render-status")
      .getByRole("link", { name: "Hent MP4", exact: true }),
  ).toHaveAttribute("href", `/api/exports/${firstId}?download=1`);
  await page.waitForTimeout(1500);
  await expect(
    page
      .locator(".render-status")
      .getByRole("link", { name: "Hent MP4", exact: true }),
  ).toHaveAttribute("href", `/api/exports/${firstId}?download=1`);
  assert.equal((await primaryDownload()).sha256, firstFile.sha256);
  assert.deepEqual(parseProject(await read()), project);
  report.checks.push(
    "real in-flight status response released after selection cannot overwrite chosen old job; project and original film remain unchanged",
  );
  await expect
    .poll(async () => (await status(secondId)).state)
    .toBe("succeeded");
  const second = await status(secondId);
  assert.notEqual(second.metadata.sha256, firstFile.sha256);
  await page
    .locator(`[data-render-id="${secondId}"]`)
    .getByRole("button")
    .click();
  await expect(
    page.getByText("Denne eksport matcher din aktuelle projektversion.", {
      exact: true,
    }),
  ).toBeVisible();
  await phase("project boundary and persisted selection survive reload");
  const wrong = await page.request.get(
    `${directorUrl}/api/exports/${firstId}?projectId=some_other_project&download=1`,
  );
  assert.equal(wrong.status(), 404);
  const otherHistory = await (
    await page.request.get(
      `${directorUrl}/api/exports/history?projectId=some_other_project`,
    )
  ).json();
  assert.deepEqual(otherHistory.jobs, []);
  const invalid = await page.request.get(
    `${directorUrl}/api/exports/history?projectId=..%2Fsecret`,
  );
  assert.equal(invalid.status(), 400);
  const crossSite = await page.request.get(
    `${directorUrl}/api/exports/history?projectId=${project.id}`,
    {
      headers: {
        Origin: "https://outside.example",
        "Sec-Fetch-Site": "cross-site",
      },
    },
  );
  assert.equal(crossSite.status(), 403);
  await page.reload();
  await saved();
  await exportPanel();
  await expect(
    page
      .locator(".render-status")
      .getByRole("link", { name: "Hent MP4", exact: true }),
  ).toHaveAttribute("href", `/api/exports/${secondId}?download=1`);
  await openArchive();
  await expect(page.locator(".render-history-item")).toHaveCount(2);
  await expect(page.locator(".render-history-item").first()).toHaveAttribute(
    "data-render-id",
    secondId,
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".render-archive").scrollIntoViewIfNeeded();
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
    await page.screenshot({
      path: `reports/director/${engine}-render-archive-${name}.png`,
    });
  }
  await expect(page.locator(".render-retention").first()).toContainText(
    "Filer slettes ikke automatisk",
  );
  await phase(
    "interrupted history request and unavailable worker preserve old downloads",
  );
  await page.route("**/api/exports/history?*", (route) =>
    route.abort("connectionfailed"),
  );
  await page
    .getByRole("button", { name: "Opdatér arkiv", exact: true })
    .click();
  await expect(page.locator(".render-archive [role=alert]")).toContainText(
    "Forbindelsen til det lokale eksportarkiv blev afbrudt",
  );
  await expect(page.locator(".render-history-item")).toHaveCount(2);
  await page.unroute("**/api/exports/history?*");
  await page
    .getByRole("button", { name: "Opdatér arkiv", exact: true })
    .click();
  await expect(page.locator(".render-archive [role=alert]")).toHaveCount(0);
  await page.reload();
  await saved();
  await page.evaluate(() => {
    window.__failSnapshotWorker = true;
  });
  await exportPanel();
  await expect(
    page
      .locator(".render-quality .caption-warning")
      .filter({ hasText: "Den præcise versionskontrol" }),
  ).toContainText("Den præcise versionskontrol er ikke tilgængelig");
  assert.equal((await primaryDownload()).sha256, second.metadata.sha256);
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await exportPanel();
  await expect(
    page.getByText("Denne eksport matcher din aktuelle projektversion.", {
      exact: true,
    }),
  ).toBeVisible();
  report.checks.push(
    "lost history connection keeps previous list; unavailable worker makes no exact-match claim, preserves download, and retries on reopen",
  );
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  const workers = await page.evaluate(() => window.__snapshotWorkers);
  assert.ok(workers.created >= 1);
  assert.equal(workers.created, workers.closed);
  report.checks.push(
    "history/project-bound download rejects wrong IDs and cross-site reads; selection persists; snapshot workers all terminate; retention is explicit",
  );
  report.jobs = [first, second].map((job) => ({
    id: job.id,
    manifestHash: job.manifestHash,
    metadata: job.metadata,
    source: job.source,
  }));
  report.firstDownload = firstFile;
  report.workers = workers;
  assert.deepEqual(report.errors, []);
  await phase("passed");
} catch (error) {
  report.failure = String(error.stack ?? error);
  await page
    .screenshot({
      path: `reports/director/${engine}-render-history-failure.png`,
    })
    .catch(() => {});
  await phase("failed");
  throw error;
} finally {
  releasePoll?.();
  clearTimeout(watchdog);
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}
