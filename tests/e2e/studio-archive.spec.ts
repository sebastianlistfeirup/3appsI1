import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { accessibility as a11y } from "./accessibility";
import {
  exportProject,
  importProject,
} from "../../apps/studio/src/lib/archive";
import {
  addArtifact,
  artifactSchema,
  createProject,
  sha256,
} from "../../apps/studio/src/lib/model";
import { bytesToBase64 } from "../../apps/studio/src/lib/limits";
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function download(page: Page, button: string) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  return readFile((await (await wait).path())!);
}

test("worker ZIP roundtrip opens a duplicate as an independent copy at every viewport", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const original = await download(page, "Eksportér projekt");
  const source = await importProject(original);
  await open(page, "/projects");
  await page.locator("input[type=file]").setInputFiles({
    name: "realmread.zip",
    mimeType: "application/zip",
    buffer: original,
  });
  await expect(
    page.getByRole("dialog", { name: "Projektet findes allerede" }),
  ).toBeVisible();
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Åbn som kopi" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await a11y(page, `${info.project.name}-import-copy-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-import-copy-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Åbn som kopi" }).click();
  await expect(
    page.getByRole("heading", { name: "Realmread (kopi)." }),
  ).toBeVisible();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Realmread (kopi)." }),
  ).toBeVisible();
  const copied = await importProject(await download(page, "Eksportér projekt"));
  expect(copied.id).not.toBe(source.id);
  expect(copied.artifacts).toEqual(source.artifacts);
  expect(copied.runs).toEqual(source.runs);
  await open(page, "/projects/realmread/overview");
  const preserved = await importProject(
    await download(page, "Eksportér projekt"),
  );
  expect(preserved).toEqual(source);
  expect(errors).toEqual([]);
});

test("actual quota failure still exports the current in-memory brief and explicit reload preserves saved history", async ({
  page,
}, info) => {
  await open(page, "/projects/realmread/brief");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Ny briefversion" }).click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Vigtig bestilling efter fuldt browserlager");
  await page.getByRole("button", { name: "Gem ny version" }).click();
  await expect(
    page.getByRole("button", { name: "Eksportér lokal kopi" }),
  ).toBeVisible();
  const recovered = await importProject(
    await download(page, "Eksportér lokal kopi"),
  );
  expect(recovered.briefVersions.at(-1)!.goal).toBe(
    "Vigtig bestilling efter fuldt browserlager",
  );
  await expect(page.locator(".toast")).toContainText(
    "Din aktuelle lokale kopi",
  );
  await expect(page.locator(".storage-error")).toContainText(
    "Browserens lager er fuldt",
  );
  await a11y(page, `${info.project.name}-quota-recovery`);
  await page.evaluate(() =>
    (window as unknown as { restorePut: () => void }).restorePut(),
  );
  await page.getByRole("button", { name: "Genindlæs gemt version" }).click();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Vigtig bestilling efter fuldt browserlager", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("imports and exports a real binary project beyond the old 10 MB limit using background workers", async ({
  page,
}) => {
  test.setTimeout(90000);
  let project = createProject("Stor pakke"),
    seed = 524;
  for (let index = 0; index < 8; index++) {
    const bytes = new Uint8Array(1_400_000);
    for (let n = 0; n < bytes.length; n++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      bytes[n] = seed & 255;
    }
    project = addArtifact(
      project,
      artifactSchema.parse({
        id: `large-${index}`,
        artifactId: `binary-${index}`,
        version: 1,
        name: `kilde-${index}.bin`,
        mime: "application/octet-stream",
        content: bytesToBase64(bytes),
        encoding: "base64",
        sha256: await sha256(bytes),
        bytes: bytes.length,
        kind: "other",
        provenance: "Synthetic deterministic browser fixture",
        rights: "owned",
        createdAt: "2026-10-16T20:00:00.000Z",
      }),
    );
  }
  const zip = await exportProject(project);
  expect(zip.length).toBeGreaterThan(10_000_000);
  await open(page, "/projects");
  await page.locator("input[type=file]").setInputFiles({
    name: "stor-pakke.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await expect(page.getByRole("heading", { name: "Stor pakke." })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const result = await importProject(await download(page, "Eksportér projekt"));
  expect(result).toEqual(project);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Stor pakke." }),
  ).toBeVisible();
});

test("uploaded UTF-8 with BOM survives preview, worker export and hash verification", async ({
  page,
}) => {
  await open(page, "/projects/realmread/assets");
  await page.getByRole("button", { name: "Tilføj fil", exact: true }).click();
  const content = "\uFEFFEn ægte idé 🌙";
  await page
    .getByRole("combobox", { name: "Rettigheder", exact: true })
    .selectOption("owned");
  await page.getByLabel("Vælg fil til projektet").setInputFiles({
    name: "dansk.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf8"),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await open(page, "/projects/realmread/overview");
  const exported = await importProject(
    await download(page, "Eksportér projekt"),
  );
  const file = exported.artifacts.find((a) => a.name === "dansk.txt")!;
  expect(file.content).toBe(content);
  expect(file.sha256).toBe(await sha256(Buffer.from(content, "utf8")));
});

test("actual project workers can be cancelled after processing without late import or download, then retried", async ({
  page,
}, info) => {
  await open(page);
  const sourceBytes = await download(page, "Eksportér projekt");
  const source = await importProject(sourceBytes);
  const incoming = createProject("Import efter afbrydelse");
  const bytes = await exportProject(incoming);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    const stats = { created: 0, terminated: 0, completed: 0 };
    let hold = true;
    const queued: Array<() => void> = [];
    const state = {
      stats,
      release: () => {
        hold = false;
        for (const deliver of queued.splice(0)) deliver();
        hold = true;
      },
      restore: () => {
        window.Worker = NativeWorker;
      },
    };
    (
      window as unknown as { projectWorkerProbe: typeof state }
    ).projectWorkerProbe = state;
    window.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        stats.created++;
        this.addEventListener("message", (event) => {
          if (!hold) return;
          event.stopImmediatePropagation();
          if (["imported", "exported"].includes(event.data.type))
            stats.completed++;
          // Real worker parse/compression/hash work has finished. Hold only delivery
          // to exercise cancellation and queued late replies deterministically.
          queued.push(() =>
            this.dispatchEvent(
              new MessageEvent("message", { data: event.data }),
            ),
          );
        });
      }
      override terminate() {
        if (!this.stopped) stats.terminated++;
        this.stopped = true;
        super.terminate();
      }
    };
  });
  const stats = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            projectWorkerProbe: {
              stats: { created: number; terminated: number; completed: number };
            };
          }
        ).projectWorkerProbe.stats,
    );
  const release = () =>
    page.evaluate(() =>
      (
        window as unknown as { projectWorkerProbe: { release: () => void } }
      ).projectWorkerProbe.release(),
    );
  await page
    .getByRole("button", { name: "Eksportér projekt", exact: true })
    .click();
  await expect.poll(async () => (await stats()).completed).toBe(1);
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Afbryd eksport", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await a11y(page, `${info.project.name}-project-cancel-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-project-cancel-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Afbryd eksport", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("Eksporten er afbrudt");
  expect(await stats()).toEqual({ created: 1, terminated: 1, completed: 1 });
  await release();
  await expect(page.locator(".archive-progress")).toHaveCount(0);
  expect(downloads).toBe(0);
  await page.locator("input[type=file]").setInputFiles({
    name: "annuller.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(bytes),
  });
  await expect.poll(async () => (await stats()).completed).toBe(2);
  await page
    .getByRole("button", { name: "Afbryd import", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("Importen er afbrudt");
  expect(await stats()).toEqual({ created: 2, terminated: 2, completed: 2 });
  await release();
  await expect(page.getByRole("heading", { name: "Realmread." })).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { projectWorkerProbe: { restore: () => void } }
    ).projectWorkerProbe.restore(),
  );
  expect(
    await importProject(await download(page, "Eksportér projekt")),
  ).toEqual(source);
  await page.locator("input[type=file]").setInputFiles({
    name: "annuller.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(bytes),
  });
  await expect(
    page.getByRole("heading", { name: "Import efter afbrydelse." }),
  ).toBeVisible();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  expect(
    await importProject(await download(page, "Eksportér projekt")),
  ).toEqual(incoming);
});
