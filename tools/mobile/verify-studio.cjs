const { createRequire } = require("node:module");
const path = require("node:path");
const repoRoot = path.resolve(__dirname, "../..");
const requireRepo = createRequire(path.join(repoRoot, "package.json"));
const { chromium, webkit, firefox, expect } = requireRepo("@playwright/test");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { unzipSync } = createRequire(
  path.join(repoRoot, "apps/studio/package.json"),
)("fflate");
const engine = process.argv[2] || "chromium";
const base = process.env.STUDIO_QA_URL || "http://127.0.0.1:3020";
const output = path.resolve(
  process.env.STUDIO_QA_OUTPUT ||
    path.join(
      repoRoot,
      "reports/mobile/studio",
      `${process.env.SITES_TOKEN ? "hosted-" : ""}${engine}`,
    ),
);
mkdirSync(output, { recursive: true });
(async () => {
  const proxyUrl =
    process.env.SITES_TOKEN && process.env.HTTPS_PROXY
      ? new URL(process.env.HTTPS_PROXY)
      : null;
  const proxy = proxyUrl
    ? {
        server: `${proxyUrl.protocol}//${proxyUrl.host}`,
        bypass: process.env.NO_PROXY,
        ...(proxyUrl.username
          ? {
              username: decodeURIComponent(proxyUrl.username),
              password: decodeURIComponent(proxyUrl.password),
            }
          : {}),
      }
    : undefined;
  const browser = await { chromium, webkit, firefox }[engine].launch({
    args: engine === "chromium" ? ["--no-sandbox"] : [],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    ...(engine === "firefox" ? {} : { isMobile: true }),
    acceptDownloads: true,
    proxy,
  });
  if (process.env.SITES_TOKEN)
    await context.route("**/*", async (route) => {
      const headers = { ...route.request().headers() };
      for (const key of Object.keys(headers))
        if (key.toLowerCase() === "oai-sites-authorization")
          delete headers[key];
      if (new URL(route.request().url()).origin !== new URL(base).origin)
        return route.continue({ headers });
      headers["OAI-Sites-Authorization"] = `Bearer ${process.env.SITES_TOKEN}`;
      try {
        const response = await route.fetch({ headers, maxRedirects: 0 });
        await route.fulfill({ response });
      } catch {
        await route.abort("failed");
      }
    });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [],
    httpErrors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400)
      httpErrors.push({ url: r.url(), status: r.status() });
  });
  async function saved() {
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  }
  async function go(path) {
    await page.goto(base + "/?view=" + encodeURIComponent(path));
    await saved();
  }
  async function audit(label) {
    console.log(engine + ": " + label);
    await page.addScriptTag({
      content: createRequire(requireRepo.resolve("@axe-core/playwright"))(
        "axe-core",
      ).source,
    });
    const violations = await page.evaluate(
      async () =>
        (
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    checks.push({
      label,
      violations: violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      overflow,
    });
    expect(violations, JSON.stringify(checks.at(-1))).toEqual([]);
    expect(overflow).toBe(false);
  }
  await page.goto(base + "/proev/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "virkelighed.",
  );
  await expect(page.getByRole("link", { name: "Åbn FlowLab" })).toHaveAttribute(
    "href",
    "https://tre-apps-flowlab-sebastian.salty-venus-6590.chatgpt.site",
  );
  for (const [label, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 1024, 768],
    ["desktop", 1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await audit("hub-" + label);
    await page.screenshot({
      path: output + "/hub-" + label + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(engine + ": open studio");
  await page.getByRole("link", { name: "Åbn Studio One" }).tap();
  console.log(engine + ": studio tapped");
  await saved();
  await expect(page.getByRole("heading", { name: "Realmread." })).toBeVisible();
  for (const [label, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 1024, 768],
    ["desktop", 1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const section of [
      "overview",
      "brief",
      "tasks",
      "assets",
      "review",
      "runs",
    ]) {
      await go("/projects/realmread/" + section);
      await audit(section + "-" + label);
      if (section === "overview" || section === "review")
        await page.screenshot({
          path: output + "/" + section + "-" + label + ".png",
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/projects/realmread/review");
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
  console.log(engine + ": review task link");
  const taskUrl = page.url();
  expect(new URL(taskUrl).searchParams.get("view")).toContain("/tasks");
  await page.reload();
  await saved();
  await expect(
    page.getByRole("heading", {
      name: "Rettelse: En tydelig vej tilbage til eventyret",
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", {
      name: "En tydelig vej tilbage til eventyret.",
    }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", {
      name: "Rettelse: En tydelig vej tilbage til eventyret",
    }),
  ).toBeVisible();
  await go("/projects");
  await page.getByRole("button", { name: "Nyt projekt", exact: true }).click();
  await page.getByLabel("Projektnavn").fill("Min telefonprøve");
  await page.getByLabel("Kort beskrivelse").fill("Et ægte mobilforløb.");
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
  await saved();
  await page.getByRole("button", { name: "Åbn navigation" }).click();
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
  await saved();
  console.log(engine + ": manual delivery accepted");
  const bookmark = page.url();
  await page.reload();
  await saved();
  await expect(page.getByText("Accepteret af dig")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tag hele projektet med" }).click();
  const download = await downloadEvent;
  const zipPath = output + "/phone-project.zip";
  await download.saveAs(zipPath);
  const zip = unzipSync(readFileSync(zipPath));
  expect(Object.keys(zip).length).toBeGreaterThan(3);
  writeFileSync(
    output + "/archive-entries.json",
    JSON.stringify(Object.keys(zip), null, 2),
  );
  await audit("new-project-accepted-mobile");
  await page.screenshot({
    path: output + "/new-project-accepted-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(httpErrors).toEqual([]);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        engine,
        version: browser.version(),
        base,
        bookmark,
        errors,
        httpErrors,
        checks,
        passed: [
          "hub-links",
          "touch-navigation",
          "new-project",
          "brief",
          "manual-delivery",
          "review",
          "download-zip",
          "reload-query-bookmark",
          "review-task-link",
          "back-forward",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      engine,
      base,
      passed: true,
      audits: checks.length,
      output,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(
    String(e.message)
      .split(process.env.SITES_TOKEN || "__no_secret__")
      .join("[redacted]"),
  );
  process.exit(1);
});
