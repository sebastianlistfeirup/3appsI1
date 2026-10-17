import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  exportProject,
  importProject,
} from "../../apps/studio/src/lib/archive";
import {
  archiveProject,
  createProject,
  latestBrief,
  saveBrief,
  saveBriefDraft,
  type Project,
} from "../../apps/studio/src/lib/model";
import { createSample } from "../../apps/studio/src/lib/sample";
import { accessibility } from "./accessibility";
const goal =
  "Min ufærdige bestilling.\nÆble · 東京 🌱 — bevar både tekst og retning.";
const fields = {
  goal,
  audience: "Et lille studio",
  constraints: "Bevar eksisterende filer.",
  criteria: "Teksten kan læses\nDen rigtige version kan hentes",
};
async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function open(page: Page, path = "/projects/realmread/brief") {
  await page.goto(path);
  await saved(page);
}
async function edit(page: Page) {
  await page
    .getByRole("button", {
      name: /^(Ny briefversion|Skriv din bestilling|Fortsæt bestillingskladde|Se bestillingskladde)$/,
    })
    .click();
}
async function draftSaved(page: Page) {
  await expect(
    page.getByText("Bestillingskladde gemt lokalt", { exact: true }),
  ).toBeVisible();
  await saved(page);
}
async function download(page: Page, name: string) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return readFile((await (await event).path())!);
}
async function uploadProject(page: Page, p: Project) {
  await page.getByLabel("Importér projektpakke").setInputFiles({
    name: "project.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await exportProject(p)),
  });
  await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/overview`));
  await saved(page);
  await page
    .getByRole("link", { name: "Bestilling", exact: true })
    .first()
    .click();
}
test("brief draft survives immediate close, reload and real ZIP before one explicit publication", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await edit(page);
  await page.getByLabel("Hvad vil du opnå?").fill(goal);
  await page.getByRole("button", { name: "Luk kladde", exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await edit(page);
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(goal);
  await draftSaved(page);
  const standalone = JSON.parse(
    (await download(page, "Hent bestillingskladde")).toString(),
  );
  expect(standalone.fields.goal).toBe(goal);
  expect(standalone).not.toHaveProperty("acknowledgeNewerBrief");
  expect(standalone.baseBriefSha256).toMatch(/^[a-f0-9]{64}$/);
  for (const [name, width, height] of [
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
    await accessibility(page, `${info.project.name}-brief-draft-${name}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-brief-draft-${name}.png`,
      animations: "disabled",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Luk kladde", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await accessibility(page, `${info.project.name}-brief-draft-callout`);
  await page.getByRole("link", { name: "Overblik", exact: true }).click();
  const exported = await importProject(
    new Uint8Array(await download(page, "Eksportér projekt")),
  );
  expect(exported.briefDraft!.goal).toBe(goal);
  expect(latestBrief(exported).goal).not.toBe(goal);
  const originalVersions = exported.briefVersions,
    originalRuns = exported.runs;
  await page
    .getByRole("link", { name: "Bestilling", exact: true })
    .first()
    .click();
  await edit(page);
  await page
    .getByRole("button", { name: "Gem ny version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved(page);
  await page.getByRole("link", { name: "Overblik", exact: true }).click();
  const published = await importProject(
    new Uint8Array(await download(page, "Eksportér projekt")),
  );
  expect(published.briefDraft).toBeUndefined();
  expect(published.briefVersions.slice(0, -1)).toEqual(originalVersions);
  expect(published.runs).toEqual(originalRuns);
  expect(latestBrief(published).goal).toBe(goal);
  expect(errors).toEqual([]);
});
test("quota failure preserves downloadable draft and checks project plus exact base hash on import", async ({
  page,
}, info) => {
  await open(page);
  await edit(page);
  await page.getByLabel("Hvad vil du opnå?").fill("Den gemte kladde");
  await draftSaved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException("Synthetic quota", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Hvad vil du opnå?").fill(goal);
  await expect(
    page.getByText("Kladde bevaret her · ikke gemt", { exact: true }),
  ).toBeVisible();
  await accessibility(page, `${info.project.name}-brief-draft-quota`);
  const bytes = await download(page, "Hent bestillingskladde");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await saved(page);
  await edit(page);
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(
    "Den gemte kladde",
  );
  for (const variant of [
    { projectId: "different-project" },
    { baseBriefSha256: "0".repeat(64) },
  ]) {
    await page
      .getByLabel("Indlæs bestillingskladde", { exact: true })
      .setInputFiles({
        name: "wrong.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ ...JSON.parse(bytes.toString()), ...variant }),
        ),
      });
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Kladden tilhører et andet projekt" }),
    ).toBeVisible();
    await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(
      "Den gemte kladde",
    );
  }
  await page
    .getByLabel("Indlæs bestillingskladde", { exact: true })
    .setInputFiles({
      name: "recovered.json",
      mimeType: "application/json",
      buffer: bytes,
    });
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(goal);
  await draftSaved(page);
  await page.reload();
  await saved(page);
  await edit(page);
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(goal);
});
test("an older draft requires acknowledgment again after reopening and preserves every brief version", async ({
  page,
}, info) => {
  let p = createProject("Ældre bestillingskladde"),
    base = latestBrief(p).id;
  p = saveBriefDraft(p, base, fields);
  p = saveBrief(p, {
    goal: "En nyere beslutning",
    audience: "",
    constraints: "",
    acceptance: ["Nyt krav"],
  });
  await open(page);
  await uploadProject(page, p);
  await edit(page);
  const acknowledge = page.getByRole("checkbox", {
    name: "Jeg har gennemgået den nyere bestilling og vil gemme denne kladde som en ny version.",
  });
  await expect(acknowledge).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Gem ny version", exact: true }),
  ).toBeDisabled();
  await acknowledge.check();
  await expect(
    page.getByRole("button", { name: "Gem ny version", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Luk kladde" }).click();
  await edit(page);
  await expect(acknowledge).not.toBeChecked();
  await accessibility(page, `${info.project.name}-brief-draft-stale`);
  await acknowledge.check();
  await page
    .getByRole("button", { name: "Gem ny version", exact: true })
    .click();
  await saved(page);
  await expect(page.getByText("BRIEF V3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Bestilling v2/ }).click();
  await expect(
    page.getByRole("heading", { name: "En nyere beslutning", exact: true }),
  ).toBeVisible();
});
test("too many or overly long criteria remain recoverable and archived drafts stay read-only", async ({
  page,
}) => {
  await open(page);
  await edit(page);
  const many = Array.from(
    { length: 31 },
    (_, index) => `Krav ${index + 1}`,
  ).join("\n");
  await page.getByLabel(/Acceptkrav/).fill(many);
  await draftSaved(page);
  await expect(page.getByText(/Der er 31 acceptkrav/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gem ny version", exact: true }),
  ).toBeDisabled();
  expect(
    JSON.parse((await download(page, "Hent bestillingskladde")).toString())
      .fields.criteria,
  ).toBe(many);
  await page.getByLabel(/Acceptkrav/).fill("x".repeat(1001));
  await draftSaved(page);
  await expect(page.getByText(/Hvert acceptkrav må højst fylde/)).toBeVisible();
  await page.getByRole("button", { name: "Luk kladde" }).click();
  let p = createProject("Arkiveret kladde");
  p = archiveProject(saveBriefDraft(p, latestBrief(p).id, fields));
  await uploadProject(page, p);
  await edit(page);
  await expect(page.getByLabel("Hvad vil du opnå?")).toBeDisabled();
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(goal);
  await expect(
    page.getByRole("button", { name: "Gem ny version", exact: true }),
  ).toBeDisabled();
  expect(
    JSON.parse((await download(page, "Hent bestillingskladde")).toString())
      .fields.goal,
  ).toBe(goal);
});
test("long brief histories are bounded, searchable and preserve the selected historical version", async ({
  page,
}) => {
  let p = createProject("Lang bestillingshistorik");
  for (let i = 0; i < 35; i++)
    p = saveBrief(p, {
      goal: `Retning nummer ${i}`,
      audience: "Et studio",
      constraints: "",
      acceptance: ["Efterprøveligt krav"],
    });
  await open(page);
  await uploadProject(page, p);
  await expect(page.locator(".version-list button")).toHaveCount(8);
  await page
    .getByRole("navigation", { name: "Sider i bestillingshistorik" })
    .getByRole("button", { name: "Næste", exact: true })
    .click();
  await expect(page.locator(".version-list button")).toHaveCount(8);
  await page.getByLabel("Søg i bestillingshistorik").fill("Retning nummer 12");
  await expect(page.locator(".version-list button")).toHaveCount(1);
  await page.locator(".version-list button").click();
  await expect(
    page.getByRole("heading", { name: "Retning nummer 12", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Søg i bestillingshistorik")
    .fill("Ingen sådan bestilling");
  await expect(
    page.getByText("Ingen bestillinger matcher søgningen."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retning nummer 12", exact: true }),
  ).toBeVisible();
});
test("overview decodes genuine base64 HTML and survives invalid UTF-8 without executing it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  for (const valid of [true, false]) {
    const p = createSample().projects[0]!;
    p.id = `preview-${valid}`;
    p.name = valid ? "Base64 preview" : "Ugyldig tekst";
    const output = p.artifacts.find(
      (artifact) =>
        p.deliveries[0]!.outputVersionIds.includes(artifact.id) &&
        artifact.mime === "text/html",
    )!;
    const bytes = valid ? Buffer.from(output.content) : Buffer.from([255, 254]);
    output.encoding = "base64";
    output.content = bytes.toString("base64");
    output.bytes = bytes.length;
    output.sha256 = createHash("sha256").update(bytes).digest("hex");
    await page.getByLabel("Importér projektpakke").setInputFiles({
      name: "preview.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportProject(p)),
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/overview`));
    await saved(page);
    if (valid)
      await expect(
        page
          .frameLocator('iframe[title="Preview af seneste leverance"]')
          .getByText("AKTIV QUEST"),
      ).toBeVisible();
    else
      await expect(
        page.getByText(
          "Teksten kunne ikke vises. Den originale fil er bevaret.",
        ),
      ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
