const { chromium } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const fs = require("node:fs");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const path of [
    "overview",
    "brief",
    "tasks",
    "assets",
    "review",
    "runs",
  ]) {
    await p.goto(`http://localhost:3000/projects/realmread/${path}`);
    await p.getByText("Gemt lokalt", { exact: true }).waitFor();
    await p.addScriptTag({
      content: require("node:module").createRequire(
        require.resolve("@axe-core/playwright"),
      )("axe-core").source,
    });
    const results = await p.evaluate(() =>
      axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
        resultTypes: ["violations"],
      }),
    );
    fs.writeFileSync(
      `reports/studio/a11y/${path}.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(
      path,
      JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 4).map((n) => n.target),
        })),
      ),
    );
  }
  await b.close();
})();
