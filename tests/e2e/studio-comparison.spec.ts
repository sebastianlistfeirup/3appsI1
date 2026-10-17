import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSample } from "../../apps/studio/src/lib/sample";
import { exportProject } from "../../apps/studio/src/lib/archive";
import { sha256, type Artifact } from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";

async function comparisonProject(before: string, after: string) {
  const project = createSample().projects[0]!;
  project.id = "comparison";
  project.name = "Præcist review";
  const input = project.artifacts.find((a) => a.id === "menu-v1")!,
    output = project.artifacts.find((a) => a.id === "menu-v2")!;
  async function set(file: Artifact, content: string) {
    file.name = "ændringer.txt";
    file.mime = "text/plain";
    file.content = content;
    file.encoding = "utf8";
    file.sha256 = await sha256(new TextEncoder().encode(content));
    file.bytes = new TextEncoder().encode(content).length;
  }
  await set(input, before);
  await set(output, after);
  output.version = 3;
  const intermediate = { ...input, id: "intermediate", version: 2 };
  await set(intermediate, "Denne senere upload var aldrig input til opgaven.");
  project.artifacts.push(intermediate);
  return exportProject(project);
}

test("review selects every output and compares the locked input across intervening versions", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const a = Array.from(
      { length: 2000 },
      (_, i) => `Oprindelig linje ${i + 1}\n`,
    ),
    b = [...a];
  b[1] = "Ny tekst i starten\n";
  b[1998] = "Ny tekst i slutningen\n";
  const before = a.join(""),
    after = b.join("");
  await page.goto("/projects");
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "review.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await comparisonProject(before, after)),
  });
  await expect(
    page.getByRole("heading", { name: "Præcist review." }),
  ).toBeVisible();
  // Exercise the user’s client navigation. A forced document replacement here
  // aborts WebKit’s just-started Next prefetches and reports unload errors.
  await page.locator('a[href="/projects/comparison/review"]').first().click();
  await expect(page.getByLabel("Fil til gennemgang")).toHaveValue("menu-v2");
  await expect(page.locator(".comparison-baseline")).toContainText(
    "Låst input v1 → leveret v3",
  );
  await page.getByRole("tab", { name: "Kodediff" }).click();
  await expect(page.locator(".diff-options strong")).toHaveText(
    "+2 tilføjet · −2 fjernet",
  );
  await expect(page.locator(".diff-gap")).toContainText("uændrede linjer");
  await expect(
    page.locator(".diff-line.same").filter({ hasText: "Oprindelig linje 3" }),
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
    await accessibility(page, `${info.project.name}-comparison-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-comparison-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Hent låst input: ændringer.txt v1",
      exact: true,
    })
    .click();
  expect(await readFile((await (await download).path())!, "utf8")).toBe(before);
  await page.getByLabel("Vis alle linjer", { exact: true }).check();
  await expect(page.locator(".diff-line")).toHaveCount(400);
  await page.getByRole("button", { name: /Vis næste 400 linjer/ }).click();
  await expect(page.locator(".diff-line")).toHaveCount(800);
  await page.getByLabel("Fil til gennemgang").selectOption("notes-v1");
  await expect(page.locator(".comparison-baseline")).toContainText(
    "Ny fil · intet tidligere input",
  );
  await expect(page.locator(".diff-options strong")).toContainText(
    "−0 fjernet",
  );
  await page.getByRole("tab", { name: /Filer/ }).click();
  await accessibility(page, `${info.project.name}-comparison-files`);
  await page
    .getByRole("button", { name: "Gennemgå ændringer.txt", exact: true })
    .click();
  await expect(page.getByLabel("Fil til gennemgang")).toHaveValue("menu-v2");
  await expect(page.locator(".diff-options strong")).toHaveText(
    "+2 tilføjet · −2 fjernet",
  );
  expect(errors).toEqual([]);
});

test("line-ending changes are visible and oversized comparisons keep downloads available", async ({
  page,
}) => {
  await page.goto("/projects");
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "endings.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await comparisonProject("A\r\nB", "A\nB\n")),
  });
  await expect(
    page.getByRole("heading", { name: "Præcist review." }),
  ).toBeVisible();
  // Exercise the user’s client navigation. A forced document replacement here
  // aborts WebKit’s just-started Next prefetches and reports unload errors.
  await page.locator('a[href="/projects/comparison/review"]').first().click();
  await page.getByRole("tab", { name: "Kodediff" }).click();
  await expect(
    page.locator(".diff-eol").filter({ hasText: /^CRLF$/ }),
  ).toBeVisible();
  await expect(
    page.locator(".diff-eol").filter({ hasText: "∅" }),
  ).toBeVisible();
  await expect(page.locator(".diff-options strong")).toHaveText(
    "+2 tilføjet · −2 fjernet",
  );
  await expect(
    page.getByLabel("Vis linjeskift", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Vis linjeskift", { exact: true }).uncheck();
  await expect(page.locator(".diff-eol")).toHaveCount(0);
  await page.getByLabel("Vis linjeskift", { exact: true }).check();
  await page.goto("/projects");
  // setInputFiles can target SSR markup before its change handler is hydrated.
  // The loaded/saved workspace is the actual interactive readiness signal.
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "large.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      await comparisonProject("A".repeat(160000), "B".repeat(160000)),
    ),
  });
  await page.getByRole("button", { name: "Åbn som kopi" }).click();
  await expect(
    page.getByRole("heading", { name: "Præcist review (kopi)." }),
  ).toBeVisible();
  const projectPath = new URL(page.url()).pathname.replace(/\/overview$/, "");
  await page.goto(`${projectPath}/review`);
  await page.getByRole("tab", { name: "Kodediff" }).click();
  await expect(
    page.getByText("Filerne er for store til kodediff her.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Hent låst input: ændringer.txt v1",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Hent leveret fil: ændringer.txt v3",
      exact: true,
    }),
  ).toBeEnabled();
});
