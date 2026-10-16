import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { importProject } from "../../apps/studio/src/lib/archive";

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}
async function accept(page: Page) {
  for (const label of [
    "Aktiv quest har titel og næste handling",
    "Eksisterende menupunkter er bevaret",
    "Questpanelet er læsbart på mobil",
  ])
    await page.getByRole("checkbox", { name: label }).check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill(
      "Preview og versionsdiff gennemgået. Menuen er bevaret og questen kan læses.",
    );
  await page.getByRole("button", { name: "Acceptér leverance" }).click();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
}

test("sample production opens, responsive pages have no overflow, and real previews render", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole("heading", { name: "Realmread." })).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({
      path: `reports/studio/${info.project.name}-overview-${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await open(page, "/projects/realmread/review");
  await expect(
    page
      .frameLocator('iframe[title="Efter: ny version"]')
      .getByText("AKTIV QUEST"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Før", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Før: tidligere version"]')
      .getByText("AKTIV QUEST"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ny version", exact: true }).click();
  await page.screenshot({
    path: `reports/studio/${info.project.name}-review-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("S-AT01/09 accepts a reviewed version, persists after reload and exports a valid ZIP", async ({
  page,
}) => {
  await open(page, "/projects/realmread/review");
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeDisabled();
  await accept(page);
  await page.reload();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tag hele projektet med" }).click();
  const download = await downloadPromise;
  const file = await readFile((await download.path())!);
  const imported = await importProject(new Uint8Array(file));
  expect(imported.reviews[0]!.decision).toBe("accepted");
  expect(imported.artifacts).toHaveLength(4);
  expect(imported.runs[0]!.state).toBe("succeeded");
});

test("S-AT08 request for changes creates a task and preserves the reviewed version", async ({
  page,
}) => {
  await open(page, "/projects/realmread/review");
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Gør questtitlen tydeligere på telefon.");
  await page.getByRole("button", { name: "Bed om en rettelse" }).click();

  await expect(page.getByText("Dit review er gemt.")).toBeVisible();
  await page.getByRole("link", { name: "Se rettelsesopgaven" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Rettelse: En tydelig vej tilbage til eventyret",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Rettelse: En tydelig vej tilbage til eventyret",
    }),
  ).toBeVisible();
});

test("S-AT04 newer brief marks output stale and requires explicit acknowledgment", async ({
  page,
}) => {
  await open(page, "/projects/realmread/brief");
  await page.getByRole("button", { name: "Ny briefversion" }).click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Vis den aktive quest og en kort rutevejledning.");
  await page.getByRole("button", { name: "Gem ny version" }).click();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await open(page, "/projects/realmread/review");
  await expect(page.getByText(/Der findes nyere input/)).toBeVisible();
  for (const name of [
    "Aktiv quest har titel og næste handling",
    "Eksisterende menupunkter er bevaret",
    "Questpanelet er læsbart på mobil",
  ])
    await page.getByRole("checkbox", { name }).check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Accepterer v1 som historisk leverance.");
  await expect(
    page.getByRole("button", { name: "Acceptér leverance" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Jeg accepterer eksplicit leverancen med dens ældre input.",
    })
    .check();
  await page.getByRole("button", { name: "Acceptér leverance" }).click();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
});

test("new project → brief → task → manual file delivery → review completes without developer help", async ({
  page,
}) => {
  await open(page, "/projects");
  await page.getByRole("button", { name: "Nyt projekt", exact: true }).click();
  await page.getByLabel("Projektnavn").fill("Min første webændring");
  await page.getByLabel("Kort beskrivelse").fill("En lille velkomstside.");
  await page
    .getByRole("button", { name: "Opret projekt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skriv din bestilling" }).click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Vis en velkomsttekst på siden.");
  await page.getByLabel("Hvem er det til?").fill("Besøgende");
  await page.getByLabel("Acceptkrav").fill("Velkomstteksten er synlig");
  await page.getByRole("button", { name: "Gem ny version" }).click();
  await page.getByRole("link", { name: "Opgaver", exact: true }).click();
  await page.getByRole("button", { name: "Ny opgave", exact: true }).click();
  await page.getByLabel("Hvad skal laves?").fill("Lav velkomstsiden");
  await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
  await page.getByRole("button", { name: "Levér", exact: true }).click();
  await page.getByRole("button", { name: "Lås input og fortsæt" }).click();
  await page
    .getByLabel("Hvad er ændret?")
    .fill("En lille HTML-side med velkomsttekst.");
  await page
    .getByLabel("Filindhold", { exact: true })
    .fill(
      '<!doctype html><html lang="da"><title>Velkommen</title><h1>Velkommen til mit projekt</h1></html>',
    );
  await page.getByRole("button", { name: "Send til review" }).click();
  await page.getByRole("link", { name: "Se review", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Efter: ny version"]')
      .getByRole("heading", { name: "Velkommen til mit projekt" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Velkomstteksten er synlig" })
    .check();
  await page
    .getByLabel("DIN VURDERING", { exact: true })
    .fill("Teksten er synlig i preview.");
  await page.getByRole("button", { name: "Acceptér leverance" }).click();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
});

test("concurrent tabs detect revision changes instead of overwriting", async ({
  page,
  context,
}) => {
  await open(page, "/settings");
  const other = await context.newPage();
  await open(other, "/settings");
  await other.getByLabel("Workspacenavn").fill("Et nyt navn fra en anden fane");
  await other.getByRole("button", { name: "Gem navn" }).click();
  await expect(other.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/En nyere version er gemt i en anden fane/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Genindlæs gemt version" }).click();
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
});

test("uploaded HTML preview blocks scripts and network subresources", async ({
  page,
}) => {
  await open(page);
  const requests: string[] = [];
  const probe = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string")
    throw new Error("Probe server did not bind");
  const probeUrl = `http://127.0.0.1:${address.port}`;
  try {
    // Prove the browser can reach this real server before testing the sandbox.
    expect(
      await page.evaluate(
        async (url) => (await fetch(url + "/control")).status,
        probeUrl,
      ),
    ).toBe(204);
    expect(requests).toEqual(["/control"]);
    requests.length = 0;
    await page.evaluate(async (target) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("tre-apps-studio-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = db.transaction("documents", "readonly");
      const document = await new Promise<any>((resolve, reject) => {
        const request = read.objectStore("documents").get("workspace");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const artifact = document.data.projects[0].artifacts.find(
        (a: { id: string }) => a.id === "menu-v2",
      );
      artifact.content = `<h1>Kontrolleret preview</h1><img src="${target}/pixel"><script>document.body.dataset.scriptRan="yes";fetch("${target}/script")</script>`;
      const bytes = new TextEncoder().encode(artifact.content);
      artifact.bytes = bytes.length;
      artifact.sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      document.revision++;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put(document);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, probeUrl);
    await page.goto("/projects/realmread/review");
    const frame = page.frameLocator('iframe[title="Efter: ny version"]');
    await expect(
      frame.getByRole("heading", { name: "Kontrolleret preview" }),
    ).toBeVisible();
    await expect(frame.locator("body")).not.toHaveAttribute(
      "data-script-ran",
      "yes",
    );
    await expect
      .poll(() =>
        frame
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).complete),
      )
      .toBe(true);
    // Chromium 156 emits a request event even for CSP-blocked resources. The wire
    // assertion checks actual server receipt, independent of that browser event.
    expect(requests).toEqual([]);
  } finally {
    probe.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("archived projects reject changes without closing the editor or showing false success", async ({
  page,
}) => {
  await open(page, "/projects");
  await page.getByRole("button", { name: "Arkivér Realmread" }).click();
  await open(page, "/projects/realmread/brief");
  await expect(page.getByText(/Dette projekt er arkiveret/)).toBeVisible();
  await page.getByRole("button", { name: "Ny briefversion" }).click();
  await page
    .getByLabel("Hvad vil du opnå?")
    .fill("Må ikke overskrive et arkiv");
  await page.getByRole("button", { name: "Gem ny version" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Projektet er arkiveret" }),
  ).toContainText("Projektet er arkiveret");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Hvad vil du opnå?")).toHaveValue(
    "Må ikke overskrive et arkiv",
  );
  await page.getByRole("button", { name: "Luk dialog" }).click();
  await page.reload();
  await expect(
    page.getByText("Må ikke overskrive et arkiv", { exact: true }),
  ).toHaveCount(0);
});
