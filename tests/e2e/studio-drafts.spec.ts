import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importProject } from "../../apps/studio/src/lib/archive";
import { accessibility } from "./accessibility";

const taskTitle = "Bevar den ufærdige hjælp";
async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function start(page: Page) {
  await page.goto("/projects/realmread/tasks");
  await saved(page);
  await page.getByRole("button", { name: "Ny opgave", exact: true }).click();
  await page.getByLabel("Hvad skal laves?").fill(taskTitle);
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await page
    .locator(".task-card-main")
    .filter({
      has: page.getByRole("heading", { name: taskTitle, exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await expect(
    page.getByText("Kladde gemt lokalt", { exact: true }),
  ).toBeVisible();
}
async function resume(page: Page) {
  await page.goto("/projects/realmread/runs");
  await saved(page);
  await page
    .locator(".run-card")
    .filter({
      has: page.getByRole("heading", { name: taskTitle, exact: true }),
    })
    .filter({ has: page.getByText("Afventer fil", { exact: true }) })
    .getByRole("button", { name: "Aflevér resultat" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  const dialog = page.getByRole("dialog");
  const scope = (await dialog.count()) ? dialog : page;
  await scope.getByRole("button", { name, exact: true }).click();
  return readFile((await (await pending).path())!);
}

test("unfinished delivery survives immediate close, reload, file-mode changes and project export", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await page
    .getByLabel("Leverancens titel")
    .fill("Hjælp, der stadig er på vej");
  await page
    .getByLabel("Hvad er ændret?")
    .fill("Første forklaring\nMed et åbent spørgsmål.");
  await page.getByLabel("Filnavn", { exact: true }).fill("hjaelp.html");
  await page
    .getByLabel("Filindhold")
    .fill("<h1>Æble · 東京 🌱</h1>\n<p>Et ufærdigt svar.</p>");
  await page.getByRole("checkbox").check();
  // Closing before the debounce expires must flush the latest field into the document.
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await saved(page);
  await page.reload();
  await resume(page);
  await expect(page.getByLabel("Leverancens titel")).toHaveValue(
    "Hjælp, der stadig er på vej",
  );
  await expect(page.getByLabel("Hvad er ændret?")).toHaveValue(
    "Første forklaring\nMed et åbent spørgsmål.",
  );
  await expect(page.getByLabel("Filindhold")).toHaveValue(
    "<h1>Æble · 東京 🌱</h1>\n<p>Et ufærdigt svar.</p>",
  );
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page
    .getByRole("button", { name: "Eksisterende fil", exact: true })
    .click();
  const outputId = await page
    .getByLabel("Vælg outputversion")
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await page.getByLabel("Vælg outputversion").selectOption(outputId!);
  await page.getByRole("button", { name: "Gem kladde og luk" }).click();
  await saved(page);
  await page.reload();
  await resume(page);
  await expect(page.getByLabel("Vælg outputversion")).toHaveValue(outputId!);
  await page
    .getByRole("button", { name: "Ny tekst-/kodefil", exact: true })
    .click();
  await expect(page.getByLabel("Filindhold")).toContainText(
    "Et ufærdigt svar.",
  );
  await expect(
    page.getByText("Kladde gemt lokalt", { exact: true }),
  ).toBeVisible();
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
    await accessibility(page, `${info.project.name}-delivery-draft-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-delivery-draft-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  const standalone = JSON.parse(
    (await download(page, "Hent kladde")).toString(),
  );
  expect(standalone.fields.risk).toBe(true);
  await page.getByRole("button", { name: "Gem kladde og luk" }).click();
  await saved(page);
  await page.goto("/projects/realmread/overview");
  await saved(page);
  const project = await importProject(
    new Uint8Array(await download(page, "Eksportér projekt")),
  );
  expect(
    project.deliveryDrafts!.find((draft) => draft.runId === standalone.runId)!
      .content,
  ).toBe(standalone.fields.content);
  const run = project.runs.find((run) => run.id === standalone.runId)!;
  expect(run.state).toBe("awaiting_upload");
  expect(run.costMinor).toBe(0);
  expect(project.deliveries.some((delivery) => delivery.runId === run.id)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test("draft leaves the working set only when an actual output is delivered", async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel("Hvad er ændret?")
    .fill("Færdig hjælp med gennemlæst tekst.");
  await page.getByLabel("Filindhold").fill("<h1>Hjælp</h1>\n<p>Start her.</p>");
  await page.getByLabel("Filnavn", { exact: true }).fill("hjaelp.html");
  await expect(
    page.getByText("Kladde gemt lokalt", { exact: true }),
  ).toBeVisible();
  const draft = JSON.parse((await download(page, "Hent kladde")).toString());
  await page.getByRole("button", { name: "Send til review" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved(page);
  await page.goto("/projects/realmread/overview");
  await saved(page);
  const project = await importProject(
    new Uint8Array(await download(page, "Eksportér projekt")),
  );
  expect(
    project.deliveryDrafts?.some((item) => item.runId === draft.runId),
  ).toBe(false);
  const delivery = project.deliveries.find(
    (item) => item.runId === draft.runId,
  )!;
  expect(delivery.summary).toBe(draft.fields.summary);
  expect(
    project.artifacts.find((item) => item.id === delivery.outputVersionIds[0])!
      .content,
  ).toBe(draft.fields.content);
  expect(project.runs.find((item) => item.id === draft.runId)!.state).toBe(
    "review",
  );
});

test("a real quota error leaves a downloadable and reimportable unfinished draft", async ({
  page,
}, info) => {
  await start(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page
    .getByLabel("Hvad er ændret?")
    .fill("Denne forklaring må ikke forsvinde ved fuldt lager.");
  await page.getByLabel("Filindhold").fill("Vigtigt ufærdigt arbejde med æøå.");
  await expect(
    page.getByText("Kladde ikke gemt · hent en kopi", { exact: true }),
  ).toBeVisible();
  const bytes = await download(page, "Hent kladde");
  await accessibility(page, `${info.project.name}-draft-storage-error`);
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await expect(page.locator(".storage-error")).toContainText(
    "Browserens lager er fuldt",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await resume(page);
  await expect(page.getByLabel("Filindhold")).toHaveValue("");
  await page.getByLabel("Vælg afleveringskladde").setInputFiles({
    name: "kladde.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByLabel("Filindhold")).toHaveValue(
    "Vigtigt ufærdigt arbejde med æøå.",
  );
  await expect(
    page.getByText("Kladde gemt lokalt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gem kladde og luk" }).click();
  await page.reload();
  await resume(page);
  await expect(page.getByLabel("Hvad er ændret?")).toHaveValue(
    "Denne forklaring må ikke forsvinde ved fuldt lager.",
  );
});

test("cancelled history retains its draft and imported text does not reopen the old run", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Hvad er ændret?").fill("Et tidligere forsøg.");
  await page
    .getByLabel("Filindhold")
    .fill("Genbrug denne tekst med nye input.");
  await page.getByRole("button", { name: "Gem kladde og luk" }).click();
  await saved(page);
  await page.goto("/projects/realmread/runs");
  await saved(page);
  const original = page.locator(".run-card").filter({
    has: page.getByRole("heading", { name: taskTitle, exact: true }),
  });
  await original.getByRole("button", { name: "Annuller", exact: true }).click();
  await expect(original).toContainText(
    "Kladden er bevaret fra det annullerede forløb.",
  );
  const bytes = await download(page, "Hent kladde");
  const oldRun = JSON.parse(bytes.toString()).runId;
  await page.goto("/projects/realmread/tasks");
  await saved(page);
  await page
    .locator(".task-card-main")
    .filter({
      has: page.getByRole("heading", { name: taskTitle, exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page.getByLabel("Vælg afleveringskladde").setInputFiles({
    name: "tidligere.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByLabel("Filindhold")).toHaveValue(
    "Genbrug denne tekst med nye input.",
  );
  await expect(page.locator(".toast")).toContainText(
    "aktuelle låste input er bevaret",
  );
  const imported = JSON.parse((await download(page, "Hent kladde")).toString());
  expect(imported.runId).not.toBe(oldRun);
  const foreign = {
    ...imported,
    projectId: "other",
    fields: {
      ...imported.fields,
      mode: "existing",
      artifactId: "foreign-file",
    },
  };
  await page.getByLabel("Vælg afleveringskladde").setInputFiles({
    name: "foreign.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(foreign)),
  });
  await expect(page.locator(".toast")).toContainText("andet projekt");
  await expect(page.getByLabel("Filindhold")).toHaveValue(
    "Genbrug denne tekst med nye input.",
  );
});
