import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  exportProject,
  importProject,
} from "../../apps/studio/src/lib/archive";
import {
  addArtifact,
  addTask,
  beginManualRun,
  createProject,
  saveBrief,
  textArtifact,
  type Project,
} from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";
const { unzipSync, strFromU8 } = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
)("fflate") as {
  unzipSync: (bytes: Uint8Array) => Record<string, Uint8Array>;
  strFromU8: (bytes: Uint8Array) => string;
};

async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function historyProject() {
  let p = addTask(
    saveBrief(createProject("Lang arbejdshistorik"), {
      goal: "Bevar alle aftaler",
      audience: "Projektets ejer",
      constraints: "Ingen overskrivning",
      acceptance: ["Originalen kan findes"],
    }),
    "Aktuel opgave",
    "Den oprindelige beskrivelse.",
  );
  p = addArtifact(
    p,
    await textArtifact(
      p,
      "grundlag.txt",
      "Samme originale byteindhold",
      "document",
    ),
  );
  p = beginManualRun(p, p.tasks[0]!.id, "source");
  const source = p.runs[0]!;
  p.runs = Array.from({ length: 1000 }, (_, i) => ({
    ...source,
    id: `historical-${String(i).padStart(4, "0")}`,
    idempotencyKey: `request-${i}`,
    state: i === 999 ? ("awaiting_upload" as const) : ("cancelled" as const),
    completedAt: i === 999 ? null : source.startedAt,
    taskSnapshot: {
      ...source.taskSnapshot!,
      title: `Historisk opgave ${String(i).padStart(4, "0")}`,
      owner: i === 0 ? "Ida" : "Sebastian",
    },
  }));
  p.activity = Array.from({ length: 10000 }, (_, i) => ({
    id: `event-${i}`,
    type: i % 2 ? "run.started" : "run.cancelled",
    title: `Bevaret hændelse ${String(i).padStart(5, "0")}`,
    createdAt: p.createdAt,
    revision: i + 1,
  }));
  p.revision = 10001;
  return p;
}
async function upload(page: Page, p: Project) {
  await page.goto("/projects");
  await saved(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "historik.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportProject(p)),
    });
  await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/overview$`));
  await saved(page);
}
async function download(page: Page, name: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return new Uint8Array(await readFile((await (await waiting).path())!));
}

test("1000 runs and 10000 events remain bounded, searchable and fully retained in real export", async ({
  page,
}, info) => {
  const p = await historyProject();
  await upload(page, p);
  await page.goto(`/projects/${p.id}/runs`);
  await saved(page);
  await expect(page.locator(".run-card")).toHaveCount(8);
  await expect(page.locator(".full-activity .activity-list > div")).toHaveCount(
    20,
  );
  await expect(page.locator("#run-historical-0999")).toBeVisible();
  await page.getByRole("button", { name: "Næste forløb", exact: true }).click();
  await expect(page.locator("#run-historical-0991")).toBeVisible();
  await page.getByLabel("Søg leveringsforløb", { exact: true }).fill("Ida");
  await expect(page.locator(".run-card")).toHaveCount(1);
  await expect(page.locator("#run-historical-0000")).toBeVisible();
  await page.getByLabel("Søg hændelser", { exact: true }).fill("rev 5001");
  await expect(page.locator(".full-activity .activity-list > div")).toHaveCount(
    1,
  );
  await expect(page.locator(".full-activity")).toContainText(
    "Bevaret hændelse 05000",
  );
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await accessibility(page, `${info.project.name}-long-history-${label}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-long-history-${label}.png`,
      fullPage: true,
    });
  }
  const files = unzipSync(await download(page, "Hent arbejdspakke"));
  expect(
    JSON.parse(strFromU8(files["context.json"]!)).taskDefinition.owner,
  ).toBe("Ida");
  await page
    .getByRole("combobox", { name: "Forløbets status", exact: true })
    .selectOption("succeeded");
  await expect(
    page.getByText("Ingen forløb matcher din søgning og status.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto(`/projects/${p.id}/overview`);
  await saved(page);
  const copy = await importProject(await download(page, "Eksportér projekt"));
  expect(copy.runs).toEqual(p.runs);
  expect(copy.activity).toEqual(p.activity);
});

test("deep links reveal the exact historical page after reload and a later hash change", async ({
  page,
}) => {
  const p = await historyProject();
  await upload(page, p);
  await page.goto(`/projects/${p.id}/runs#run-historical-0000`);
  await saved(page);
  await expect(page.locator("#run-historical-0000")).toBeVisible();
  await expect(page.locator("#run-historical-0000")).toBeFocused();
  await expect(
    page.getByText("Side 125 af 125 · 1000 af 1000 forløb", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".run-card")).toHaveCount(8);
  await page.reload();
  await saved(page);
  await expect(page.locator("#run-historical-0000")).toBeFocused();
  await page
    .getByLabel("Søg leveringsforløb", { exact: true })
    .fill("Findes ikke");
  await page.evaluate(() => {
    location.hash = "run-historical-0500";
  });
  await expect(page.locator("#run-historical-0500")).toBeVisible();
  await expect(page.locator("#run-historical-0500")).toBeFocused();
  await expect(
    page.getByLabel("Søg leveringsforløb", { exact: true }),
  ).toHaveValue("");
  await page.evaluate(() => {
    location.hash = "run-unknown";
  });
  await expect(
    page.getByText("Linkets leveringsforløb findes ikke i dette projekt.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".run-card")).toHaveCount(8);
});
