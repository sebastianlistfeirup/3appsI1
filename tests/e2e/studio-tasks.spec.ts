import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importProject } from "../../apps/studio/src/lib/archive";
import type { Project } from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";

async function saved(page: Page) {
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function openTask(page: Page, title: string) {
  await page
    .locator(".task-card-main")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function exported(page: Page): Promise<Project> {
  await saved(page);
  const previous = page.url();
  if (
    !(await page
      .getByRole("button", { name: "Tag hele projektet med" })
      .count())
  ) {
    await page.goto("/projects/realmread/review");
    await saved(page);
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tag hele projektet med" }).click();
  const project = await importProject(
    new Uint8Array(await readFile((await (await download).path())!)),
  );
  if (page.url() !== previous) {
    await page.goto(previous);
    await saved(page);
  }
  return project;
}

test("pending task can be edited, paused and resumed without replacing its locked delivery", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/projects/realmread/tasks");
  await saved(page);
  await page.getByRole("button", { name: "Ny opgave", exact: true }).click();
  await page.getByLabel("Hvad skal laves?").fill("Skriv hjælpetekst");
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await openTask(page, "Skriv hjælpetekst");
  await page.getByRole("button", { name: "Redigér opgave" }).click();
  await page.getByLabel("Opgavetitel").fill("Gør hjælpen tydelig");
  await page
    .getByLabel("Opgavebeskrivelse")
    .fill(
      "Forklar næste skridt med én kort sætning.\nBevar den eksisterende menu.",
    );
  await page.getByRole("button", { name: "Gem opgave", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Forklar næste skridt");
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  const before = await exported(page);
  const run = before.runs.at(-1)!;
  await openTask(page, "Gør hjælpen tydelig");
  await expect(
    page.getByRole("button", { name: "Redigér opgave" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Markér blokeret" }).click();
  await expect(
    page.getByRole("button", { name: "Gem blokering" }),
  ).toBeDisabled();
  await page
    .getByLabel("Årsag til blokering")
    .fill("Afventer godkendt formulering fra forfatteren.");
  await page.getByRole("button", { name: "Gem blokering" }).click();
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
    await accessibility(page, `${info.project.name}-task-pause-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-task-pause-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await openTask(page, "Gør hjælpen tydelig");
  await expect(page.getByRole("dialog")).toContainText(
    "Afventer godkendt formulering",
  );
  await expect(
    page.getByRole("button", { name: "Fortsæt levering" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fjern blokering" }).click();
  await expect(
    page.getByRole("button", { name: "Fortsæt levering" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fortsæt levering" }).click();
  await expect(
    page.getByRole("heading", { name: "Aflevér et konkret resultat" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  const resumed = await exported(page);
  expect(resumed.runs).toEqual(before.runs);
  expect(resumed.tasks.find((task) => task.id === run.taskId)?.state).toBe(
    "in_progress",
  );
  expect(
    resumed.tasks.find((task) => task.id === run.taskId)?.blockedReason,
  ).toBeUndefined();
  await openTask(page, "Gør hjælpen tydelig");
  await page.getByRole("button", { name: "Markér blokeret" }).click();
  await page
    .getByLabel("Årsag til blokering")
    .fill("Det gamle forsøg skal annulleres, men teksten mangler stadig.");
  await page.getByRole("button", { name: "Gem blokering" }).click();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Aktivitet", exact: true }).click();
  const card = page
    .locator(".run-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Gør hjælpen tydelig",
        exact: true,
      }),
    });
  await expect(
    card.getByRole("link", { name: "Opgaven er blokeret" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Aflevér resultat" }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "Annuller", exact: true }).click();
  await expect(card).toContainText("Annulleret");
  await page.getByRole("link", { name: "Opgaver", exact: true }).click();
  await openTask(page, "Gør hjælpen tydelig");
  await expect(page.getByRole("dialog")).toContainText(
    "teksten mangler stadig",
  );
  await page.getByRole("button", { name: "Fjern blokering" }).click();
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  const restarted = await exported(page);
  expect(
    restarted.runs.find((candidate) => candidate.id === run.id)?.state,
  ).toBe("cancelled");
  expect(restarted.runs).toHaveLength(before.runs.length + 1);
  expect(restarted.runs.at(-1)?.id).not.toBe(run.id);
  expect(errors).toEqual([]);
});

test("rejected delivery creates an actionable correction and unblocks its successor after acceptance", async ({
  page,
}, info) => {
  await page.goto("/projects/realmread/tasks");
  await saved(page);
  await openTask(page, "Gør den aktive quest synlig");
  const reviewLink = page
    .getByRole("dialog")
    .getByRole("link", { name: "Se denne leverance" });
  await page.keyboard.press("Shift+Tab");
  await expect(reviewLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Luk dialog" })).toBeFocused();
  await reviewLink.click();
  await expect(page.getByLabel("DIN VURDERING", { exact: true })).toBeVisible();
  const original = await exported(page);
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Gør questtitlen tydeligere på telefon.");
  await page.getByRole("button", { name: "Bed om en rettelse" }).click();
  await page.getByRole("link", { name: "Se rettelsesopgaven" }).click();
  const correctionTitle = "Rettelse: En tydelig vej tilbage til eventyret";
  await openTask(page, "Gennemgå den færdige oplevelse");
  await expect(page.getByRole("dialog")).toContainText(correctionTitle);
  await expect(
    page.getByRole("button", { name: "Opret manuel levering" }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(correctionTitle) })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Denne opgave retter et tidligere resultat.",
  );
  await page.getByRole("button", { name: "Se oprindelig opgave" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Erstattet · historik bevaret",
  );
  await expect(
    page.getByRole("button", { name: "Fjern blokering" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Åbn rettelsesopgaven" }).click();
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page
    .getByLabel("Hvad er ændret?")
    .fill("Titlen er gjort tydelig og kontrolleret på telefon.");
  await page.getByLabel("Filnavn", { exact: true }).fill("quest-menu.html");
  await page
    .getByLabel("Filindhold", { exact: true })
    .fill(
      '<!doctype html><html lang="da"><title>Quest</title><h1>Find vej til den gamle mølle</h1><p>Næste handling: Følg stien.</p></html>',
    );
  await page.getByRole("button", { name: "Send til review" }).click();
  await page
    .locator(".task-card")
    .filter({
      has: page.getByRole("heading", { name: correctionTitle, exact: true }),
    })
    .getByRole("link", { name: "Se review" })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Efter: ny version"]')
      .getByRole("heading", { name: "Find vej til den gamle mølle" }),
  ).toBeVisible();
  for (const name of [
    "Aktiv quest har titel og næste handling",
    "Eksisterende menupunkter er bevaret",
    "Questpanelet er læsbart på mobil",
  ])
    await page.getByRole("checkbox", { name }).check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Rettelsen er kontrolleret og kan godkendes.");
  await page.getByRole("button", { name: "Acceptér leverance" }).click();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  await page.getByRole("link", { name: "Opgaver", exact: true }).click();
  await openTask(page, "Gennemgå den færdige oplevelse");
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await page
    .getByText("Bevaret historik · 1 erstattet opgave", { exact: true })
    .click();
  await accessibility(page, `${info.project.name}-correction-history`);
  const result = await exported(page),
    correction = result.tasks.find(
      (task) => task.correctionOf === "task-menu",
    )!;
  expect(result.deliveries[0]).toEqual(original.deliveries[0]);
  expect(result.artifacts.slice(0, original.artifacts.length)).toEqual(
    original.artifacts,
  );
  expect(result.reviews.map((review) => review.decision)).toEqual([
    "changes_requested",
    "accepted",
  ]);
  expect(result.edges).toContainEqual({
    from: correction.id,
    to: "task-polish",
  });
  expect(result.runs.at(-1)?.taskId).toBe("task-polish");
  expect(result.tasks.find((task) => task.id === "task-menu")?.replacedBy).toBe(
    correction.id,
  );
});

test("unstarted dependencies can be removed while locked delivery prerequisites stay visible", async ({
  page,
}, info) => {
  await page.goto("/projects/realmread/tasks");
  await saved(page);
  await page.getByRole("button", { name: "Tilføj afhængighed" }).click();
  await expect(
    page.getByText("Låst af levering", { exact: true }),
  ).toBeVisible();
  await accessibility(page, `${info.project.name}-task-dependencies`);
  const remove = page.getByRole("button", {
    name: "Fjern afhængighed: Gør den aktive quest synlig før Gennemgå den færdige oplevelse",
    exact: true,
  });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await openTask(page, "Gennemgå den færdige oplevelse");
  await page.getByRole("button", { name: "Opret manuel levering" }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page.getByRole("button", { name: "Luk dialog" }).click();
  const result = await exported(page);
  expect(result.edges).toEqual([{ from: "task-design", to: "task-menu" }]);
  expect(result.runs.at(-1)?.taskId).toBe("task-polish");
});
