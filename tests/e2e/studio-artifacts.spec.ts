import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importProject } from "../../apps/studio/src/lib/archive";
import { accessibility } from "./accessibility";
async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function openFiles(page: Page) {
  await page.goto("/projects/realmread/assets");
  await saved(page);
}
async function selectFile(page: Page, name: string) {
  await page.locator(".asset-name").filter({ hasText: name }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function exportCurrent(page: Page) {
  await page.goto("/projects/realmread/overview");
  await saved(page);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Eksportér projekt", exact: true })
    .click();
  return importProject(
    new Uint8Array(await readFile((await (await pending).path())!)),
  );
}
test("licensed edits preserve provenance and metadata corrections retain exact historical bytes", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openFiles(page);
  await page.getByRole("button", { name: "Tilføj fil", exact: true }).click();
  await page
    .getByLabel("Hvor kommer indholdet fra?")
    .fill("Forfatter A · CC BY 4.0 · https://example.test/source");
  await page
    .getByRole("combobox", { name: "Rettigheder", exact: true })
    .selectOption("licensed");
  await page.getByLabel("Vælg fil til projektet").setInputFiles({
    name: "licensed.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"original":true}\n'),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved(page);
  await selectFile(page, "licensed.json");
  await expect(
    page.getByRole("dialog").getByText("Licenseret", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Opret ny version", exact: true })
    .click();
  await page.getByLabel("Filindhold").fill('{"updated":true}\n');
  await page
    .getByRole("button", { name: "Gem ny version", exact: true })
    .click();
  await saved(page);
  await selectFile(page, "licensed.json");
  await expect(
    page.getByRole("dialog").getByText("Licenseret", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".asset-provenance")).toContainText("CC BY 4.0");
  await expect(
    page.getByLabel("Se filversion").locator("option:checked"),
  ).toContainText("Version 2");
  await page
    .getByRole("button", { name: "Afklar ophav og rettigheder" })
    .click();
  await page
    .getByLabel("Hvor kommer indholdet fra?")
    .fill("Forfatter A · CC BY 4.0 · kilde og licens gennemgået");
  await expect(
    page.getByRole("combobox", { name: "Rettigheder", exact: true }),
  ).toHaveValue("licensed");
  await accessibility(page, `${info.project.name}-asset-metadata`);
  await page
    .getByRole("button", { name: "Gem som ny version", exact: true })
    .click();
  await expect(
    page.getByLabel("Se filversion").locator("option:checked"),
  ).toContainText("Version 3");
  await expect(page.locator(".asset-provenance")).toContainText(
    "Filindholdet er identisk",
  );
  await page.getByRole("button", { name: "version 2", exact: true }).click();
  await expect(page.locator(".asset-provenance")).toContainText(
    "https://example.test/source",
  );
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await selectFile(page, "licensed.json");
  await expect(page.locator(".asset-provenance")).toContainText(
    "kilde og licens gennemgået",
  );
  await page.getByRole("button", { name: "Luk dialog" }).click();
  const p = await exportCurrent(page),
    versions = p.artifacts
      .filter((a) => a.name === "licensed.json")
      .sort((a, b) => a.version - b.version);
  expect(versions).toHaveLength(3);
  expect(versions.map((a) => a.rights)).toEqual([
    "licensed",
    "licensed",
    "licensed",
  ]);
  expect(versions.map((a) => a.mime)).toEqual([
    "application/json",
    "application/json",
    "application/json",
  ]);
  expect(versions[0]!.content).toBe('{"original":true}\n');
  expect(versions[1]!.content).toBe('{"updated":true}\n');
  expect(versions[2]!.sha256).toBe(versions[1]!.sha256);
  expect(versions[2]!.derivedFrom).toBe(versions[1]!.id);
  expect(versions[1]!.derivedFrom).toBe(versions[0]!.id);
  expect(p.runs[0]!.inputVersionIds).toEqual(["menu-v1", "design-v1"]);
  expect(errors).toEqual([]);
});
test("selected file version shows its actual uses and navigates to the locked run or delivery", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openFiles(page);
  await selectFile(page, "quest-menu.html");
  await expect(page.getByLabel("Hvor bruges denne version?")).toContainText(
    "Afleveret output · 1",
  );
  await expect(page.getByLabel("Hvor bruges denne version?")).not.toContainText(
    "Låst input",
  );
  await page.getByLabel("Se filversion").selectOption("menu-v1");
  await expect(page.getByLabel("Hvor bruges denne version?")).toContainText(
    "Låst input · 1",
  );
  await expect(page.getByLabel("Hvor bruges denne version?")).not.toContainText(
    "Afleveret output",
  );
  for (const [size, width, height] of [
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
    await accessibility(page, `${info.project.name}-artifact-lineage-${size}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-artifact-lineage-${size}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .getByRole("link", { name: "Gør den aktive quest synlig", exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs#run-run-sample$/);
  await expect(page.locator("#run-run-sample")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFiles(page);
  await selectFile(page, "quest-menu.html");
  await page
    .getByRole("link", {
      name: "En tydelig vej tilbage til eventyret",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/review\/delivery-sample$/);
  await expect(
    page
      .frameLocator('iframe[title="Efter: ny version"]')
      .getByText("AKTIV QUEST"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
