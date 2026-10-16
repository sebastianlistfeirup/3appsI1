import { chromiumExecutable, directorUrl } from "./browser.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutable,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const checks = [],
  errors = [];
const ready = async (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
};
const rename = async (page, title) => {
  await page
    .getByRole("navigation", { name: "Produktionsvisning" })
    .getByRole("button", { name: "Historie", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Produktionens titel", exact: true })
    .fill(title);
  await page
    .getByRole("textbox", { name: "Produktionens titel", exact: true })
    .press("Tab");
};
const copy = async (page) => {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Gem lokal kopi", exact: true })
    .click();
  return JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
};
try {
  const context = await browser.newContext();
  const a = await context.newPage(),
    b = await context.newPage();
  await ready(a);
  await ready(b);
  await rename(b, "Gemt i den anden fane");
  await expect(b.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await expect(
    a.getByRole("button", { name: "Gem lokal kopi", exact: true }),
  ).toBeVisible();
  await rename(a, "Min bevarede lokale konfliktkopi");
  const recovery = await copy(a);
  assert.equal(recovery.title, "Min bevarede lokale konfliktkopi");
  assert.equal(recovery.sequence.length, 5);
  assert.ok(
    recovery.sequence.every(
      (id) => recovery.shots.find((s) => s.id === id)?.frame,
    ),
  );
  await expect(a.locator(".toast")).toContainText("lokal kopi");
  await a
    .getByRole("button", { name: "Genindlæs gemt version", exact: true })
    .click();
  await expect(a.getByRole("heading", { level: 1 })).toContainText(
    "Gemt i den anden fane",
  );
  checks.push(
    "two real tabs: conflict preserves local edits in downloadable JSON; explicit reload reads newer saved copy",
  );
  await context.close();
  const quota = await browser.newPage();
  await ready(quota);
  await quota.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents")
        throw new DOMException(
          "Test: lagerkvoten er opbrugt",
          "QuotaExceededError",
        );
      return original.apply(this, args);
    };
  });
  await rename(quota, "Vigtig kopi efter fuldt lager");
  await expect(
    quota.getByRole("button", { name: "Gem lokal kopi", exact: true }),
  ).toBeVisible();
  const backup = await copy(quota);
  assert.equal(backup.title, "Vigtig kopi efter fuldt lager");
  await expect(quota.locator(".toast")).toContainText("lokal kopi");
  await quota.evaluate(() => window.restorePut());
  await quota
    .getByRole("button", { name: "Genindlæs gemt version", exact: true })
    .click();
  await expect(quota.getByRole("heading", { level: 1 })).toContainText(
    "Det sidste signal",
  );
  checks.push(
    "injected actual IndexedDB write failure: unsaved in-memory JSON survives rejecting flush; persisted copy unchanged",
  );
  await quota.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "reports/director/storage-recovery.json",
    JSON.stringify(
      { checks, pageErrors: errors, verifiedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log("Director storage recovery passed");
} finally {
  await browser.close();
}
