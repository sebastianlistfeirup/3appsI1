import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { unzipSync, zipSync } = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
)("fflate") as {
  unzipSync: (bytes: Uint8Array) => Record<string, Uint8Array>;
  zipSync: (files: Record<string, Uint8Array>) => Uint8Array;
};
import { createSample } from "../../apps/studio/src/lib/sample";
import {
  addArtifact,
  artifactSchema,
  archiveProject,
  createProject,
  saveReviewDraft,
  sha256,
  textArtifact,
} from "../../apps/studio/src/lib/model";
import { bytesToBase64 } from "../../apps/studio/src/lib/limits";
import {
  exportWorkspace,
  importWorkspace,
} from "../../apps/studio/src/lib/workspace-archive";
import { importProject } from "../../apps/studio/src/lib/archive";
import { accessibility } from "./accessibility";

async function open(page: Page) {
  await page.goto("/settings");
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function download(page: Page) {
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Hent samlet backup", exact: true })
    .click();
  return new Uint8Array(await readFile((await (await wait).path())!));
}
async function upload(page: Page, bytes: Uint8Array) {
  await page
    .getByLabel("Vælg samlet Studio-backup", { exact: true })
    .setInputFiles({
      name: "studio-backup.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
}
async function fixture() {
  const state = createSample();
  state.workspace.name = "Min gamle computer";
  const project = state.projects[0]!;
  state.projects = [
    saveReviewDraft(project, project.deliveries[0]!.id, {
      comment: "Ufærdig vurdering · æøå 🌿",
      checkedCriteria: [],
    }),
  ];
  let archived = createProject("Arkiveret illustration");
  archived = addArtifact(
    archived,
    await textArtifact(
      archived,
      "bevar.txt",
      "\uFEFFOphav og præcise bytes 東京",
    ),
  );
  state.projects.push(archiveProject(archived));
  return state;
}

test("whole workspace backup restores exact histories as independent copies and keeps archived projects", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const original = await importWorkspace(await download(page));
  const source = await fixture();
  await upload(
    page,
    await exportWorkspace(
      source,
      source.projects.map((p) => p.id),
    ),
  );
  const dialog = page.getByRole("dialog", {
    name: "Vælg det, der skal med tilbage.",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Indlæses som kopi", { exact: true }),
  ).toHaveCount(1);
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await accessibility(
      page,
      `${info.project.name}-workspace-restore-${label}`,
    );
    await page.screenshot({
      path: `reports/studio/${info.project.name}-workspace-restore-${label}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }
  await dialog
    .getByRole("button", { name: "Indlæs 2 projekter", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "2 projekter indlæst og gemt." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Tilbage til backup" }).click();
  await page.reload();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("heading", { name: "En kopi af hele din produktion." })
      .scrollIntoViewIfNeeded();
    await accessibility(page, `${info.project.name}-workspace-backup-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-workspace-backup-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  const resultBytes = await download(page);
  const result = await importWorkspace(resultBytes);
  expect(result.projects).toHaveLength(3);
  expect(result.workspace).toEqual(original.workspace);
  expect(
    result.projects.find((p) => p.id === original.projects[0]!.id),
  ).toEqual(original.projects[0]);
  const copy = result.projects.find((p) => p.name === "Realmread (kopi)")!;
  expect(copy.id).not.toBe(source.projects[0]!.id);
  expect(copy.reviewDrafts).toEqual(source.projects[0]!.reviewDrafts);
  expect(copy.deliveries).toEqual(source.projects[0]!.deliveries);
  expect(result.projects.find((p) => p.id === source.projects[1]!.id)).toEqual(
    source.projects[1],
  );
  const entries = unzipSync(resultBytes);
  expect(await importProject(entries["projects/003.zip"]!)).toEqual(
    source.projects[1],
  );
  expect(errors).toEqual([]);
});

test("multi-project binary backup uses actual workers and preserves all original hashes after reload", async ({
  page,
}, info) => {
  const state = createSample();
  state.projects = [];
  let seed = 937;
  for (let index = 0; index < 2; index++) {
    let project = createProject(`Originale filer ${index + 1}`);
    const bytes = new Uint8Array(6_100_000);
    for (let n = 0; n < bytes.length; n++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      bytes[n] = seed & 255;
    }
    project = addArtifact(
      project,
      artifactSchema.parse({
        id: `binary-version-${index}`,
        artifactId: `binary-file-${index}`,
        version: 1,
        name: `original-${index}.bin`,
        mime: "application/octet-stream",
        content: bytesToBase64(bytes),
        encoding: "base64",
        sha256: await sha256(bytes),
        bytes: bytes.length,
        kind: "other",
        provenance: "Deterministic synthetic workspace recovery fixture",
        rights: "owned",
        createdAt: new Date().toISOString(),
      }),
    );
    state.projects.push(project);
  }
  const input = await exportWorkspace(
    state,
    state.projects.map((p) => p.id),
  );
  expect(input.length).toBeGreaterThan(12_000_000);
  await open(page);
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    const stats = { created: 0, terminated: 0, longTasks: [] as number[] };
    (
      window as unknown as { backupWorkerStats: typeof stats }
    ).backupWorkerStats = stats;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          stats.longTasks.push(entry.duration);
      }).observe({ type: "longtask" });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        stats.created++;
      }
      override terminate() {
        stats.terminated++;
        super.terminate();
      }
    };
  });
  // Use a real filesystem upload: injecting a 12 MB base64 FilePayload itself
  // blocks the page in Playwright and would contaminate application long-task measurements.
  await mkdir(info.outputDir, { recursive: true });
  const fixturePath = info.outputPath("workspace-binary-input.zip");
  await writeFile(fixturePath, input);
  await page
    .getByLabel("Vælg samlet Studio-backup", { exact: true })
    .setInputFiles(fixturePath);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await rm(fixturePath);
  await dialog
    .getByRole("button", { name: "Indlæs 2 projekter", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "2 projekter indlæst og gemt." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Tilbage til backup" }).click();
  const output = await download(page);
  const restored = await importWorkspace(output);
  for (const original of state.projects)
    expect(restored.projects.find((p) => p.id === original.id)).toEqual(
      original,
    );
  const evidence = await page.evaluate(
    () =>
      (
        window as unknown as {
          backupWorkerStats: {
            created: number;
            terminated: number;
            longTasks: number[];
          };
        }
      ).backupWorkerStats,
  );
  expect(evidence.created).toBe(2);
  expect(evidence.terminated).toBe(2);
  await page.reload();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const reloaded = await importWorkspace(await download(page));
  for (const original of state.projects)
    expect(reloaded.projects.find((p) => p.id === original.id)).toEqual(
      original,
    );
  await writeFile(
    `reports/studio/${info.project.name}-workspace-binary-backup.json`,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        browser: info.project.name,
        sourceBytes: input.length,
        exportedBytes: output.length,
        originalProjects: state.projects.length,
        fileBytes: 12_200_000,
        exactOriginalsAfterReload: true,
        ...evidence,
      },
      null,
      2,
    ),
  );
});

test("failed workspace commit leaves a downloadable single import and reload returns to saved projects", async ({
  page,
}, info) => {
  await open(page);
  const original = await importWorkspace(await download(page));
  const source = await fixture();
  await upload(page, await exportWorkspace(source, [source.projects[1]!.id]));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException(
          "Synthetic workspace quota failure",
          "QuotaExceededError",
        );
      return original.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Indlæs 1 projekt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projekterne er åbne i denne session." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Indlæs 1 projekt", exact: true }),
  ).toHaveCount(0);
  await accessibility(page, `${info.project.name}-workspace-backup-quota`);
  await page.getByRole("button", { name: "Tilbage til backup" }).click();
  const rescued = await importWorkspace(await download(page));
  expect(rescued.projects).toHaveLength(2);
  expect(rescued.projects[1]).toEqual(source.projects[1]);
  await expect(
    page.getByText(/Kopien indeholder den aktuelle session/),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const saved = await importWorkspace(await download(page));
  expect(saved.projects).toEqual(original.projects);
});

test("malformed backups preserve the workspace and actual workers terminate on cancellation or navigation", async ({
  page,
}) => {
  await open(page);
  const originalBytes = await download(page);
  const original = await importWorkspace(originalBytes);
  const damaged = unzipSync(originalBytes);
  damaged["projects/001.zip"] = Uint8Array.of(9, 8, 7);
  await upload(page, zipSync(damaged));
  await expect(
    page.getByRole("alert").filter({ hasText: "kontrolsum matcher ikke" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await importWorkspace(await download(page))).projects).toEqual(
    original.projects,
  );
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    const stats = { created: 0, terminated: 0 };
    (
      window as unknown as { backupWorkerStats: typeof stats }
    ).backupWorkerStats = stats;
    window.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        stats.created++;
      }
      override postMessage(
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        setTimeout(() => {
          if (!this.stopped) {
            if (Array.isArray(transfer)) super.postMessage(message, transfer);
            else super.postMessage(message, transfer);
          }
        }, 5000);
      }
      override terminate() {
        if (!this.stopped) stats.terminated++;
        this.stopped = true;
        super.terminate();
      }
    };
  });
  await page
    .getByRole("button", { name: "Hent samlet backup", exact: true })
    .click();
  await page.getByRole("button", { name: "Afbryd", exact: true }).click();
  await expect(
    page.getByText("Backup afbrudt. Dine projekter er bevaret.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { backupWorkerStats: unknown }).backupWorkerStats,
    ),
  ).toEqual({ created: 1, terminated: 1 });
  await page
    .getByRole("button", { name: "Hent samlet backup", exact: true })
    .click();
  await page.getByRole("link", { name: "Overblik", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Realmread.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { backupWorkerStats: unknown }).backupWorkerStats,
    ),
  ).toEqual({ created: 2, terminated: 2 });
});

test("workspace selection is searchable and paginated while exporting every selected project", async ({
  page,
}) => {
  const source = createSample();
  source.projects = Array.from({ length: 12 }, (_, i) =>
    createProject(`Produktion ${String(i + 1).padStart(2, "0")}`),
  );
  await open(page);
  await upload(
    page,
    await exportWorkspace(
      source,
      source.projects.map((p) => p.id),
    ),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(8);
  await dialog.getByRole("button", { name: "Næste side i indlæsning" }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(4);
  await dialog
    .getByLabel("Søg projekter i indlæsning", { exact: true })
    .fill("Produktion 12");
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Fravælg alle", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Vælg alle fundne", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Indlæs 1 projekt", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "1 projekt indlæst og gemt." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Tilbage til backup" }).click();
  const restored = await importWorkspace(await download(page));
  expect(restored.projects.map((p) => p.name)).toEqual([
    "Realmread",
    "Produktion 12",
  ]);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
});
