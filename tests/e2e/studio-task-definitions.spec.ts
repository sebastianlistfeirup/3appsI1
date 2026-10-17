import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importProject } from "../../apps/studio/src/lib/archive";
import { accessibility } from "./accessibility";

const title = "Skriv en tydelig hjælpetekst";
const criteria = [
  "Næste handling beskrives i én sætning",
  "Hjælpen kan læses uden forkundskaber",
] as const;
async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function tasks(page: Page) {
  await page.goto("/projects/realmread/tasks");
  await saved(page);
}
function card(page: Page, name = title) {
  return page
    .locator(".task-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function create(page: Page) {
  await tasks(page);
  await page.getByRole("button", { name: "Ny opgave", exact: true }).click();
  await page.getByLabel("Hvad skal laves?").fill(title);
  await page
    .getByLabel("Beskrivelse", { exact: true })
    .fill("En kort forklaring på det næste skridt. Æ, ø, å og 東京.");
  await page.getByLabel("Ansvarlig", { exact: true }).fill("Sebastian");
  await page.getByLabel("Færdig betyder").fill(criteria.join("\n"));
}
async function createDone(page: Page) {
  await create(page);
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await saved(page);
}
async function begin(page: Page, name = title) {
  await card(page, name)
    .getByRole("button", { name: "Levér", exact: true })
    .click();
}
async function close(page: Page) {
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function exported(page: Page) {
  await saved(page);
  const previous = page.url();
  await page.goto("/projects/realmread/overview");
  await saved(page);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Eksportér projekt", exact: true })
    .click();
  const project = await importProject(
    new Uint8Array(await readFile((await (await pending).path())!)),
  );
  await page.goto(previous);
  await saved(page);
  return project;
}
async function newerBrief(page: Page) {
  await page.goto("/projects/realmread/brief");
  await saved(page);
  await page
    .getByRole("button", { name: "Ny briefversion", exact: true })
    .click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Et nyt mål, som ikke ændrer tidligere opgaveaftaler.");
  await page.getByLabel("Acceptkrav").fill("Et nyt samlet projektkrav");
  await page
    .getByRole("button", { name: "Gem ny version", exact: true })
    .click();
  await saved(page);
  await tasks(page);
}
async function deliver(page: Page) {
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page
    .getByLabel("Hvad er ændret?")
    .fill("Den konkrete hjælpetekst er skrevet og kan læses i preview.");
  await page
    .getByLabel("Filindhold", { exact: true })
    .fill(
      '<!doctype html><html lang="da"><title>Hjælp</title><h1>Åbn menuen for at se din næste handling.</h1></html>',
    );
  await page
    .getByRole("button", { name: "Send til review", exact: true })
    .click();
  await saved(page);
  await card(page)
    .getByRole("link", { name: "Se review", exact: true })
    .click();
}

test("a concrete owner and task definition survive actual lock, review, ZIP and reload", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await create(page);
  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByLabel("Ansvarlig", { exact: true })).toHaveValue(
      "Sebastian",
    );
    await accessibility(page, `${info.project.name}-task-definition-${label}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-task-definition-${label}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await saved(page);
  await expect(card(page)).toContainText("Sebastian");
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await expect(page.getByRole("dialog")).toContainText(criteria[0]);
  await expect(page.getByRole("dialog")).not.toContainText(
    "Eksisterende menupunkter er bevaret",
  );
  await accessibility(page, `${info.project.name}-task-definition-lock`);
  await deliver(page);
  for (const criterion of criteria)
    await page.getByRole("checkbox", { name: criterion, exact: true }).check();
  await expect(
    page.getByRole("checkbox", {
      name: "Eksisterende menupunkter er bevaret",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Låste input & historik" }).click();
  await expect(page.locator(".review-task-definition")).toContainText(
    "Sebastian",
  );
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Opgavens to krav er afprøvet i preview.");
  await page
    .getByRole("button", { name: "Acceptér leverance", exact: true })
    .click();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  const project = await exported(page),
    run = project.runs.at(-1)!;
  expect(run.taskSnapshot).toMatchObject({
    title,
    owner: "Sebastian",
    acceptance: criteria,
    revision: 1,
  });
  expect(project.deliveries.at(-1)!.checks.map((check) => check.label)).toEqual(
    criteria,
  );
  expect(project.tasks.find((task) => task.id === run.taskId)?.state).toBe(
    "done",
  );
  expect(project.briefVersions[0]!.acceptance).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("a cancelled run retains its full definition after the task is changed and restarted", async ({
  page,
}) => {
  await createDone(page);
  await begin(page);
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await close(page);
  await page.goto("/projects/realmread/runs");
  await page.getByRole("button", { name: "Annuller", exact: true }).click();
  await saved(page);
  const first = await exported(page),
    oldRun = first.runs.at(-1)!;
  await tasks(page);
  await card(page).locator(".task-card-main").click();
  await page
    .getByRole("button", { name: "Redigér opgave", exact: true })
    .click();
  await page
    .getByLabel("Opgavetitel", { exact: true })
    .fill("Ny præcis opgave");
  await page.getByLabel("Ansvarlig", { exact: true }).fill("Maja");
  await page.getByLabel("Færdig betyder").fill("Et nyt konkret færdigkrav");
  await page.getByRole("button", { name: "Gem opgave", exact: true }).click();
  await close(page);
  await begin(page, "Ny præcis opgave");
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await close(page);
  await saved(page);
  await page.reload();
  const next = await exported(page);
  expect(next.runs.find((run) => run.id === oldRun.id)).toEqual(oldRun);
  expect(next.runs.at(-1)!.taskSnapshot).toMatchObject({
    title: "Ny præcis opgave",
    owner: "Maja",
    acceptance: ["Et nyt konkret færdigkrav"],
  });
  await page.goto("/projects/realmread/runs");
  const historical = page.locator(`#run-${oldRun.id}`);
  await expect(
    historical.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await historical.locator("summary").click();
  await expect(historical).toContainText("Sebastian");
  await expect(historical).toContainText(criteria[0]);
  await expect(historical).not.toContainText("Maja");
});

test("newer briefs require fresh acknowledgment or an explicit task revision while preserving custom requirements", async ({
  page,
}, info) => {
  await createDone(page);
  await newerBrief(page);
  await begin(page);
  await expect(
    page.getByRole("button", { name: "Lås input og fortsæt" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Jeg vil arbejde på opgavens bestilling/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Lås input og fortsæt" }),
  ).toBeEnabled();
  await close(page);
  await begin(page);
  await expect(
    page.getByRole("checkbox", {
      name: /Jeg vil arbejde på opgavens bestilling/,
    }),
  ).not.toBeChecked();
  await accessibility(page, `${info.project.name}-task-definition-stale`);
  await page
    .getByRole("button", { name: "Tilpas opgaven", exact: true })
    .click();
  await page.getByLabel("Opgavens briefversion").selectOption("2");
  await expect(page.getByLabel("Færdig betyder")).toHaveValue(
    criteria.join("\n"),
  );
  await page.getByRole("button", { name: "Gem opgave", exact: true }).click();
  await close(page);
  await begin(page);
  await expect(page.getByRole("dialog")).toContainText("Bestilling v2");
  await expect(
    page.getByRole("checkbox", {
      name: /Jeg vil arbejde på opgavens bestilling/,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await close(page);
  const project = await exported(page);
  expect(project.runs.at(-1)!).toMatchObject({
    briefVersion: 2,
    taskSnapshot: { owner: "Sebastian", acceptance: criteria },
  });
});

test("invalid definitions remain in the form and a correction carries only unresolved task criteria", async ({
  page,
}) => {
  await create(page);
  for (const raw of [
    "Samme\nSamme",
    Array.from({ length: 31 }, (_, i) => `Krav ${i}`).join("\n"),
    "x".repeat(1001),
  ]) {
    await page.getByLabel("Færdig betyder").fill(raw);
    await expect(
      page.getByRole("button", { name: "Opret opgave", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Færdig betyder")).toHaveValue(raw);
  }
  await page.getByLabel("Færdig betyder").fill(criteria.join("\n"));
  await page.getByLabel("Ansvarlig", { exact: true }).fill(" ");
  await expect(
    page.getByRole("button", { name: "Opret opgave", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Ansvarlig", { exact: true }).fill("Sebastian");
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await begin(page);
  await deliver(page);
  await page.getByRole("checkbox", { name: criteria[0], exact: true }).check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Første krav er opfyldt. Forklar begreberne for nye spillere.");
  await page
    .getByRole("button", { name: "Bed om en rettelse", exact: true })
    .click();
  await saved(page);
  const project = await exported(page),
    correction = project.tasks.at(-1)!;
  expect(correction).toMatchObject({
    owner: "Sebastian",
    acceptance: [criteria[1]],
    briefVersion: 1,
  });
  expect(project.deliveries.at(-1)!.checks.map((check) => check.label)).toEqual(
    criteria,
  );
  expect(project.runs.at(-1)!.taskSnapshot!.acceptance).toEqual(criteria);
  await tasks(page);
  await card(page, correction.title).locator(".task-card-main").click();
  await expect(page.getByRole("dialog")).toContainText(criteria[1]);
  await expect(page.getByRole("dialog")).not.toContainText(criteria[0]);
});
