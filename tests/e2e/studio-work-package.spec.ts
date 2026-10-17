import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { strFromU8, unzipSync } = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
)("fflate") as {
  strFromU8: (bytes: Uint8Array) => string;
  unzipSync: (bytes: Uint8Array) => Record<string, Uint8Array>;
};
import { exportProject } from "../../apps/studio/src/lib/archive";
import {
  addArtifact,
  addTask,
  beginManualRun,
  createProject,
  saveBrief,
  sha256,
  textArtifact,
  type Project,
} from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";

async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function fixture(count = 12) {
  let p = addTask(
    saveBrief(createProject("Arbejd videre"), {
      goal: "Skriv hjælpen færdig",
      audience: "Nye spillere",
      constraints: "Brug egne værktøjer",
      acceptance: ["Næste handling er tydelig"],
    }),
    "Skriv hjælp",
    "En kort, venlig sætning.",
    { owner: "Sebastian", acceptance: ["Et konkret næste skridt"] },
  );
  const first = await textArtifact(
    p,
    "hjælp.txt",
    "\uFEFFFørste original: æ, ø, å og 東京",
    "document",
  );
  p = addArtifact(p, first);
  const second = await textArtifact(
    p,
    "hjælp.txt",
    "Senere tekst, som ikke vælges",
    "document",
    first.artifactId,
  );
  p = addArtifact(p, second);
  for (let i = 1; i < count; i++)
    p = addArtifact(
      p,
      await textArtifact(
        p,
        `notat-${String(i).padStart(3, "0")}.txt`,
        `Indhold ${i}`,
        "document",
      ),
    );
  return { p, first, second };
}
async function upload(page: Page, p: Project) {
  await page.goto("/projects");
  await saved(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "arbejde.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await exportProject(p)),
  });
  await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/overview$`));
  await saved(page);
  await page.goto(`/projects/${p.id}/tasks`);
  await saved(page);
}
async function start(page: Page) {
  await page.getByRole("button", { name: "Levér", exact: true }).click();
}
async function packageDownload(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Hent arbejdspakke", exact: true })
    .click();
  return unzipSync(
    new Uint8Array(await readFile((await (await pending).path())!)),
  );
}

test("chosen original survives actual worker package, manifest hashes and persisted run", async ({
  page,
}, info) => {
  const { p, first, second } = await fixture();
  await upload(page, p);
  await start(page);
  await page.locator(".run-input-picker summary").click();
  await page.getByRole("button", { name: "Fravælg alle", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Medtag hjælp.txt", exact: true })
    .check();
  await page
    .getByLabel("Inputversion af hjælp.txt", { exact: true })
    .selectOption(first.id);
  await expect(
    page.getByText("tidligere version valgt", { exact: false }),
  ).toBeVisible();
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await accessibility(page, `${info.project.name}-work-input-${label}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-work-input-${label}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Næste filer", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Medtag notat-011.txt", exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Søg inputfiler", { exact: true }).fill("hjælp");
  await expect(
    page.getByRole("checkbox", { name: "Medtag hjælp.txt", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await saved(page);
  const files = await packageDownload(page);
  const context = JSON.parse(strFromU8(files["context.json"]!));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
  expect(context.run.inputVersionIds).toEqual([first.id]);
  expect(context.run.inputVersionIds).not.toContain(second.id);
  expect(context.taskDefinition.owner).toBe("Sebastian");
  expect(context.acceptance).toEqual(["Et konkret næste skridt"]);
  expect(
    new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      files[context.inputs[0].path],
    ),
  ).toBe(first.content);
  for (const entry of manifest.entries)
    expect(await sha256(files[entry.path]!)).toBe(entry.sha256);
  await accessibility(page, `${info.project.name}-work-package-delivery`);
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await page.goto(`/projects/${p.id}/runs`);
  await saved(page);
  await page.reload();
  await saved(page);
  const historical = JSON.parse(
    strFromU8((await packageDownload(page))["context.json"]!),
  );
  expect(historical).toEqual(context);
});

test("more than 100 files requires explicit selection and preserves pagination and empty choice", async ({
  page,
}) => {
  const { p } = await fixture(101);
  await upload(page, p);
  await start(page);
  await expect(
    page.getByRole("button", { name: "Lås input og fortsæt" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Vælg højst 100 filversioner. Ingen filer bliver fravalgt automatisk.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".run-input-list input[type=checkbox]"),
  ).toHaveCount(8);
  await page.getByRole("button", { name: "Fravælg alle", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Lås input og fortsæt" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  const files = await packageDownload(page);
  expect(
    JSON.parse(strFromU8(files["context.json"]!)).run.inputVersionIds,
  ).toEqual([]);
  expect(Object.keys(files).some((name) => name.startsWith("inputs/"))).toBe(
    false,
  );
});

test("work package cancellation and dialog close terminate actual workers and retain the locked run", async ({
  page,
}) => {
  const { p, first } = await fixture(1);
  const started = beginManualRun(
    p,
    p.tasks[0]!.id,
    "browser-worker",
    undefined,
    [first.id],
  );
  await upload(page, started);
  await start(page);
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    const stats = { created: 0, terminated: 0 };
    (
      window as unknown as { runPackageWorkers: typeof stats }
    ).runPackageWorkers = stats;
    window.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        stats.created++;
      }
      override postMessage(
        _message: unknown,
        _transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        /* Hold real worker before CPU work to exercise cancellation deterministically. */
      }
      override terminate() {
        if (!this.stopped) stats.terminated++;
        this.stopped = true;
        super.terminate();
      }
    };
  });
  await page
    .getByRole("button", { name: "Hent arbejdspakke", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Afbryd arbejdspakke", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { runPackageWorkers: unknown }).runPackageWorkers,
    ),
  ).toEqual({ created: 1, terminated: 1 });
  await page
    .getByRole("button", { name: "Hent arbejdspakke", exact: true })
    .click();
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { runPackageWorkers: unknown }).runPackageWorkers,
    ),
  ).toEqual({ created: 2, terminated: 2 });
  await saved(page);
  await page.reload();
  await saved(page);
  await start(page);
  expect(
    JSON.parse(strFromU8((await packageDownload(page))["context.json"]!)).run
      .id,
  ).toBe(started.runs[0]!.id);
});
