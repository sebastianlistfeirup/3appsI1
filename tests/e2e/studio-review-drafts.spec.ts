import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  submitDelivery,
  textArtifact,
} from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";
const criteria = [
  "Aktiv quest har titel og næste handling",
  "Eksisterende menupunkter er bevaret",
  "Questpanelet er læsbart på mobil",
];
const comment =
  "Min ufærdige vurdering.\nJeg vil kontrollere mobilvisningen igen. Æble · 東京 🌱";
async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function open(page: Page, path = "/projects/realmread/review") {
  await page.goto(path);
  await saved(page);
}
async function draftSaved(page: Page) {
  await expect(
    page.getByText("Reviewkladde gemt lokalt", { exact: true }),
  ).toBeVisible();
  await saved(page);
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name, exact: name !== "Tag hele projektet med" })
    .click();
  return readFile((await (await pending).path())!);
}
test("review draft survives immediate route change, reload and project ZIP without accepting the delivery", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("checkbox", { name: criteria[0]! }).check();
  await page.getByLabel("DIN VURDERING", { exact: true }).fill(comment);
  // Navigation before the debounce must flush current fields.
  await page.getByRole("link", { name: "Overblik", exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await page
    .getByRole("link", { name: /Leverancer/ })
    .first()
    .click();
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    comment,
  );
  await expect(
    page.getByRole("checkbox", { name: criteria[0]! }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: criteria[1]! }),
  ).not.toBeChecked();
  await draftSaved(page);
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeDisabled();
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
    await accessibility(page, `${info.project.name}-review-draft-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-review-draft-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  const standalone = JSON.parse(
    (await download(page, "Hent reviewkladde")).toString(),
  );
  expect(standalone.fields.comment).toBe(comment);
  expect(standalone.fields).not.toHaveProperty("acknowledgedStale");
  const exported = await importProject(
    new Uint8Array(await download(page, "Tag hele projektet med")),
  );
  expect(exported.reviewDrafts![0]).toMatchObject({
    deliveryId: standalone.deliveryId,
    ...standalone.fields,
  });
  expect(exported.reviews).toHaveLength(0);
  expect(exported.runs[0]!.state).toBe("review");
  for (const name of criteria)
    await page.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "Acceptér leverance" }).click();
  await expect(
    page.getByText("Accepteret af dig", { exact: true }),
  ).toBeVisible();
  await saved(page);
  const completed = await importProject(
    new Uint8Array(await download(page, "Tag hele projektet med")),
  );
  expect(completed.reviewDrafts).toEqual([]);
  expect(completed.reviews[0]!.comment).toBe(comment);
  expect(completed.reviews).toHaveLength(1);
  expect(errors).toEqual([]);
});
test("storage failure preserves a downloadable review draft and validates its exact delivery on import", async ({
  page,
}, info) => {
  await open(page);
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Den allerede gemte vurdering.");
  await draftSaved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("DIN VURDERING", { exact: true }).fill(comment);
  await page.getByRole("checkbox", { name: criteria[0]! }).check();
  await expect(
    page.getByText("Kladde bevaret her · ikke gemt", { exact: true }),
  ).toBeVisible();
  await accessibility(page, `${info.project.name}-review-draft-storage-error`);
  const bytes = await download(page, "Hent reviewkladde");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await saved(page);
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    "Den allerede gemte vurdering.",
  );
  const wrong = JSON.parse(bytes.toString());
  wrong.deliveryId = "different-delivery";
  await page.getByLabel("Indlæs reviewkladde", { exact: true }).setInputFiles({
    name: "forkert.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(wrong)),
  });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Kladden tilhører et andet projekt" }),
  ).toBeVisible();
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    "Den allerede gemte vurdering.",
  );
  await page.getByLabel("Indlæs reviewkladde", { exact: true }).setInputFiles({
    name: "review.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    comment,
  );
  await draftSaved(page);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    comment,
  );
  await expect(
    page.getByRole("checkbox", { name: criteria[0]! }),
  ).toBeChecked();
});
test("restored review criteria never restore stale-input approval", async ({
  page,
}) => {
  await open(page);
  for (const name of criteria)
    await page.getByRole("checkbox", { name }).check();
  await page.getByLabel("DIN VURDERING", { exact: true }).fill(comment);
  await draftSaved(page);
  await open(page, "/projects/realmread/brief");
  await page.getByRole("button", { name: "Ny briefversion" }).click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Ny bestilling kræver et nyt aktivt review.");
  await page
    .getByRole("button", { name: "Gem ny version", exact: true })
    .click();
  await saved(page);
  await open(page);
  const ack = page.getByRole("checkbox", {
    name: "Jeg accepterer eksplicit leverancen med dens ældre input.",
  });
  await expect(ack).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeDisabled();
  await ack.check();
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeEnabled();
  await page.reload();
  await saved(page);
  await expect(ack).not.toBeChecked();
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    comment,
  );
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Bed om en rettelse" }).click();
  await expect(
    page.getByText("Rettelse ønsket", { exact: true }).first(),
  ).toBeVisible();
  await saved(page);
  const p = await importProject(
    new Uint8Array(await download(page, "Tag hele projektet med")),
  );
  expect(p.reviewDrafts).toEqual([]);
  expect(p.reviews[0]!.decision).toBe("changes_requested");
  expect(p.tasks.at(-1)!.description).toBe(comment);
});
test("switching delivery versions flushes separate drafts into the correct immutable delivery", async ({
  page,
}) => {
  let p = saveBrief(createProject("To gennemgange"), {
    goal: "Hold vurderinger adskilt",
    audience: "Reviewer",
    constraints: "",
    acceptance: ["Indhold gennemgået"],
  });
  for (let i = 0; i < 2; i++) {
    p = addTask(p, `Opgave ${i + 1}`);
    p = beginManualRun(p, p.tasks.at(-1)!.id, `draft-review-${i}`);
    const artifact = await textArtifact(p, `version-${i}.txt`, `Indhold ${i}`);
    p = addArtifact(p, artifact);
    p = submitDelivery(p, p.runs.at(-1)!.id, {
      title: `Leverance ${i + 1}`,
      summary: "To særskilte leverancer",
      outputVersionIds: [artifact.id],
      checks: [
        {
          id: "check",
          label: "Indhold gennemgået",
          passed: true,
          source: "manual",
          evidence: "Læs filen",
        },
      ],
    });
  }
  await open(page, "/projects");
  await page.getByLabel("Importér projektpakke").setInputFiles({
    name: "to.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await exportProject(p)),
  });
  await expect(
    page.getByRole("heading", { name: "To gennemgange.", exact: true }),
  ).toBeVisible();
  await saved(page);
  await open(page, `/projects/${p.id}/review/${p.deliveries[0]!.id}`);
  await page.getByRole("checkbox", { name: "Indhold gennemgået" }).check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Kun til første leverance");
  await page.getByLabel("Vælg leverance").selectOption(p.deliveries[1]!.id);
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("checkbox", { name: "Indhold gennemgået" }),
  ).not.toBeChecked();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Kun til anden leverance");
  await draftSaved(page);
  await page.reload();
  await saved(page);
  await page.getByLabel("Vælg leverance").selectOption(p.deliveries[0]!.id);
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toHaveValue(
    "Kun til første leverance",
  );
  await expect(
    page.getByRole("checkbox", { name: "Indhold gennemgået" }),
  ).toBeChecked();
  await draftSaved(page);
  const result = await importProject(
    new Uint8Array(await download(page, "Tag hele projektet med")),
  );
  expect(result.reviewDrafts).toHaveLength(2);
  expect(
    result.reviewDrafts!.find((d) => d.deliveryId === p.deliveries[1]!.id)!
      .comment,
  ).toBe("Kun til anden leverance");
  expect(result.reviews).toHaveLength(0);
});

test("base64 SVG delivery renders original vector content inside the empty sandbox", async ({
  page,
}) => {
  let p = saveBrief(createProject("Vektorreview"), {
    goal: "Vis vektorgrafik",
    audience: "Reviewer",
    constraints: "",
    acceptance: ["Den rigtige SVG er synlig"],
  });
  p = addTask(p, "Lever vektoren");
  p = beginManualRun(p, p.tasks[0]!.id, "svg-review");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 180"><rect width="400" height="180" fill="#7357e8"/><text x="30" y="100" fill="white" font-size="25">Ægte vektor · Æble</text><script>document.body.dataset.executed="yes"</script></svg>';
  const source = await textArtifact(p, "vektor.svg", svg, "image");
  const artifact = {
    ...source,
    mime: "image/svg+xml",
    encoding: "base64" as const,
    content: Buffer.from(svg).toString("base64"),
  };
  p = addArtifact(p, artifact);
  p = submitDelivery(p, p.runs[0]!.id, {
    title: "Original vektor",
    summary: "En SVG i en faktisk binær filversion",
    outputVersionIds: [artifact.id],
    checks: [
      {
        id: "svg-check",
        label: "Den rigtige SVG er synlig",
        passed: true,
        source: "manual",
        evidence: "Gennemgå selv originalen",
      },
    ],
  });
  await open(page, "/projects");
  await page.getByLabel("Importér projektpakke").setInputFiles({
    name: "svg.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await exportProject(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Vektorreview.", exact: true }),
  ).toBeVisible();
  await saved(page);
  await open(page, `/projects/${p.id}/review`);
  const frame = page.frameLocator('iframe[title="Efter: ny version"]');
  await expect(frame.locator("svg text")).toHaveText("Ægte vektor · Æble");
  await expect(frame.locator("body")).not.toHaveAttribute(
    "data-executed",
    "yes",
  );
  await expect(
    page.locator('iframe[title="Efter: ny version"]'),
  ).toHaveAttribute("sandbox", "");
  const roundtrip = await importProject(
    new Uint8Array(await download(page, "Tag hele projektet med")),
  );
  expect(roundtrip.artifacts[0]!.sha256).toBe(artifact.sha256);
  expect(roundtrip.artifacts[0]!.content).toBe(artifact.content);
});
