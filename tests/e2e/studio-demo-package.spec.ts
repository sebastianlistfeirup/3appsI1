import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { importProject } from "../../apps/studio/src/lib/archive";
import { artifactBytes } from "../../apps/studio/src/lib/model";
import { accessibility } from "./accessibility";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

test("the shipped cross-app example imports actual files, requires two reviews and preserves every byte", async ({
  page,
}, info) => {
  const bytes = await readFile(
    "examples/foerste-gennemgang/tre-apps-review.zip",
  );
  const manifest = JSON.parse(
    await readFile("examples/foerste-gennemgang/manifest.json", "utf8"),
  );
  expect(digest(bytes)).toBe(manifest.archive.sha256);
  const original = await importProject(new Uint8Array(bytes));
  expect(original.reviews).toHaveLength(0);
  expect(original.deliveries).toHaveLength(2);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/projects");
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "tre-apps-review.zip",
    mimeType: "application/zip",
    buffer: bytes,
  });
  await expect(
    page.getByRole("heading", { name: "Tre apps · første gennemgang." }),
  ).toBeVisible();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const base = `/projects/${original.id}`;
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
    await accessibility(page, `${info.project.name}-three-apps-demo-${label}`);
    await page.screenshot({
      path: `reports/studio/${info.project.name}-three-apps-demo-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto(`${base}/tasks`);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const nextTask = page.locator(".task-card").filter({
    has: page.getByRole("heading", {
      name: "Vælg dit næste rigtige forsøg",
      exact: true,
    }),
  });
  await nextTask.locator(".task-card-main").click();
  await expect(page.getByRole("dialog")).toContainText("Afventer");
  await expect(
    page.getByRole("button", { name: "Opret manuel levering", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  for (const delivery of original.deliveries) {
    await page.goto(`${base}/review/${delivery.id}`);
    await expect(
      page.getByLabel("DIN VURDERING", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Acceptér leverance", exact: true }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: /^Filer/ }).click();
    for (const id of delivery.outputVersionIds) {
      const artifact = original.artifacts.find((item) => item.id === id)!;
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: `Hent ${artifact.name}`, exact: true })
        .click();
      const downloaded = await readFile((await (await pending).path())!);
      expect(digest(downloaded)).toBe(artifact.sha256);
      expect(downloaded.length).toBe(artifact.bytes);
    }
    for (const check of delivery.checks) {
      const checkbox = page.getByRole("checkbox", {
        name: check.label,
        exact: true,
      });
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    await page
      .getByLabel("DIN VURDERING", { exact: true })
      .fill(
        "Eksempelfiler og begrænsninger er gennemgået. Kun denne syntetiske leverance accepteres; ingen faktisk gevinst er dokumenteret.",
      );
    await page
      .getByRole("button", { name: "Acceptér leverance", exact: true })
      .click();
    await expect(
      page.getByText("Accepteret af dig", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  }
  await page.goto(`${base}/tasks`);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await nextTask.locator(".task-card-main").click();
  await expect(
    page.getByRole("button", { name: "Opret manuel levering", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Luk dialog", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.goto(`${base}/overview`);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Eksportér projekt", exact: true })
    .click();
  const result = await importProject(
    new Uint8Array(await readFile((await (await pending).path())!)),
  );
  expect(result.reviews.map((review) => review.decision)).toEqual([
    "accepted",
    "accepted",
  ]);
  expect(result.artifacts).toEqual(original.artifacts);
  for (const file of result.artifacts)
    expect(digest(artifactBytes(file))).toBe(file.sha256);
  expect(errors).toEqual([]);
});
