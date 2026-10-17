import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const {
  chromium,
  firefox,
  webkit,
  expect: baseExpect,
} = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 15000 });
const root = process.cwd();
const watchdog = setTimeout(() => {
  console.error("Editable example check exceeded 120 seconds");
  process.exit(1);
}, 120000);
watchdog.unref();
const app = process.argv[2];
if (!["director", "flowlab"].includes(app))
  throw Error("Choose the exact example app");
const manifest = JSON.parse(
  await readFile(`${root}/examples/foerste-gennemgang/manifest.json`, "utf8"),
);
const flow = JSON.parse(
  await readFile(
    `${root}/examples/foerste-gennemgang/flowlab-modelpakke.json`,
    "utf8",
  ),
);
const director = JSON.parse(
  await readFile(`${root}/fixtures/director-sample-render.json`, "utf8"),
);
const checks = [];
const readDocument = (page, name, key) =>
  page.evaluate(
    async ({ name, key }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const r = db
            .transaction("documents")
            .objectStore("documents")
            .get(key);
          r.onsuccess = () => resolve(r.result?.data);
          r.onerror = () => reject(r.error);
        });
      } finally {
        db.close();
      }
    },
    { name, key },
  );
await mkdir(`${root}/reports/examples`, { recursive: true });
for (const [engine, launcher] of Object.entries({
  chromium,
  firefox,
  webkit,
})) {
  const browser = await launcher.launch(
    engine === "chromium"
      ? {
          args: [
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (app === "flowlab") {
      await page.goto("http://localhost:3001");
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Modelbibliotek", exact: true })
        .click();
      await page
        .getByLabel("Importér modelpakke", { exact: true })
        .setInputFiles(
          `${root}/examples/foerste-gennemgang/flowlab-modelpakke.json`,
        );
      await expect
        .poll(
          async () =>
            (await readDocument(page, "tre-apps-flowlab-v1", "workspace"))
              ?.decision,
        )
        .toBe(flow.decision);
      await expect(
        page.getByRole("button", { name: "Eksportér arbejdsrum", exact: true }),
      ).toBeEnabled();
      await page.getByRole("tab", { name: "Rapport", exact: true }).click();
      await expect(page.getByLabel("Din beslutning til rapporten")).toHaveValue(
        flow.decision,
      );
      await expect(
        page.getByRole("button", { name: "Hent JSON-grundlag", exact: true }),
      ).toBeEnabled();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Hent JSON-grundlag", exact: true })
        .click();
      const bytes = await readFile(await (await pending).path());
      const report = JSON.parse(bytes.toString());
      assert.deepEqual(report.comparison.seeds, manifest.flow.pairedSeeds);
      assert.equal(report.comparison.status, "completed");
      assert.equal(report.comparison.baseline.resources[0].capacity, 3);
      assert.equal(report.comparison.scenario.resources[0].capacity, 4);
      assert(
        report.comparison.baselineRuns.every(
          (r) => r.prngVersion === manifest.flow.prng,
        ),
      );
      await page.reload();
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      const saved = await readDocument(
        page,
        "tre-apps-flowlab-v1",
        "workspace",
      );
      assert.deepEqual(saved.baseline, flow.baseline);
      assert.deepEqual(saved.scenario, flow.scenario);
      assert.equal(saved.decision, flow.decision);
      checks.push({
        app,
        engine,
        importedActualPackage: true,
        recalculatedSeedPairs: report.comparison.seeds.length,
        sourceModelsPreserved: true,
        reopened: true,
        downloadedReportSha256: createHash("sha256")
          .update(bytes)
          .digest("hex"),
        pageErrors: errors,
      });
    } else {
      await page.goto("http://127.0.0.1:3002");
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Director · produktioner", exact: true })
        .click();
      await expect(page.locator(".library-main")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await page
        .locator("input[type=file]")
        .setInputFiles(`${root}/reports/director/sample-project.zip`);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const key = localStorage.getItem("director-active-production");
            return Boolean(key && key !== "production");
          }),
        )
        .toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Det sidste signal",
      );
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      const key = await page.evaluate(() =>
        localStorage.getItem("director-active-production"),
      );
      const imported = await readDocument(page, "tre-apps-director-v1", key);
      assert(imported);
      assert.notEqual(imported.id, director.id);
      for (const field of ["shots", "scenes", "draft", "media", "sequence"])
        assert.deepEqual(imported[field], director[field]);
      await page
        .getByRole("button", { name: "Eksportér", exact: true })
        .click();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Projekt-JSON", exact: false })
        .click();
      const exported = JSON.parse(
        await readFile(await (await pending).path(), "utf8"),
      );
      for (const field of ["shots", "scenes", "draft", "media", "sequence"])
        assert.deepEqual(exported[field], director[field]);
      await page
        .getByRole("button", { name: "Luk dialog", exact: true })
        .click();
      await page.reload();
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      assert.deepEqual(
        (await readDocument(page, "tre-apps-director-v1", key)).shots,
        director.shots,
      );
      checks.push({
        app,
        engine,
        importedActualPackage: true,
        independentProjectIdentity: true,
        scenesShotsMediaAndSequenceUnchanged: true,
        actualJsonDownload: true,
        reopened: true,
        pageErrors: errors,
      });
    }
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${root}/reports/examples/${app}-${engine}.png`,
      fullPage: true,
    });
    console.log(
      `${app}/${engine}: actual editable example imported, exported and reopened`,
    );
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${root}/reports/examples/${app}-editable-project.json`,
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      appSourceCommit: process.env.EXAMPLE_SERVER_COMMIT ?? null,
      serverProfile:
        process.env.EXAMPLE_SERVER_PROFILE ??
        "existing local server; profile supplied by caller",
      manifestGeneratedAt: manifest.generatedAt,
      checks,
    },
    null,
    2,
  ) + "\n",
);

clearTimeout(watchdog);
