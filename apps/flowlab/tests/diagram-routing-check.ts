import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { createExampleTemplate } from "../src/lib/templates";

async function main() {
  const engine = (process.env.FLOWLAB_BROWSER ?? "chromium") as
    "chromium" | "firefox" | "webkit";
  const browser = await { chromium, firefox, webkit }[engine].launch(
    engine === "chromium"
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {},
  );
  const require = createRequire(import.meta.url);
  const axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
  const results: unknown[] = [],
    errors: string[] = [];
  try {
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["tablet", 1024, 768],
      ["mobile", 390, 844],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height },
        acceptDownloads: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://localhost:3001", { waitUntil: "networkidle" });
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      const library = async () => {
        if (name === "mobile")
          await page
            .getByRole("button", { name: "Åbn navigation", exact: true })
            .click();
        await page
          .getByRole("button", { name: "Modelbibliotek", exact: true })
          .click();
      };
      const showCanvas = async () => {
        await page.getByRole("tab", { name: "Model", exact: true }).click();
        const toggle = page.getByRole("button", {
          name: "Vis canvas",
          exact: true,
        });
        if (await toggle.isVisible()) await toggle.click();
        await expect(page.locator(".react-flow__node")).toHaveCount(6);
      };
      if (name === "mobile")
        await page
          .getByRole("button", { name: "Vis canvas", exact: true })
          .click();
      const initialSource = page.locator(
        '.react-flow__node[data-id="arrival"]',
      );
      await expect(initialSource).toContainText(
        "Gns. 4,8 min mellem nye sager",
      );
      await expect(initialSource).toContainText(
        "Loft 250 nye · 0 i startrestkø",
      );
      await expect(initialSource).not.toContainText("/ dag");
      const doc = createExampleTemplate("rework");
      for (const model of [doc.baseline, doc.scenario]) {
        if (model.arrivals.type !== "explicit")
          throw new Error("Expected manual arrivals");
        model.arrivals.cases.push(
          { id: "boundary", time: model.horizon, caseType: "ansøgning" },
          { id: "later", time: model.horizon + 1, caseType: "ansøgning" },
        );
      }
      await library();
      await page
        .getByLabel("Importér modelpakke", { exact: true })
        .setInputFiles({
          name: "diagram.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(doc)),
        });
      await expect(
        page.getByText("Modellen er importeret;", { exact: false }),
      ).toBeVisible();
      await showCanvas();
      await expect(
        page.getByText("30 parrede replikationer", { exact: false }),
      ).toBeVisible();
      await expect(initialSource).toContainText("20 ankomster i perioden");
      await expect(initialSource).toContainText("2 uden for perioden");
      await expect(
        page.locator('.react-flow__node[data-id="process"]'),
      ).toContainText("Typisk 12,0 min");
      await expect(
        page.locator('.react-flow__node[data-id="wait"]'),
      ).toContainText("30,0 min");
      const close = page.getByRole("button", {
        name: "Luk besked",
        exact: true,
      });
      if (await close.isVisible()) await close.click();
      await page
        .getByRole("heading", {
          name: "Ansøgninger og genarbejde.",
          exact: true,
        })
        .click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator(".editor-panel").screenshot({
        path: `reports/flowlab/${engine}-${name}-diagram-routing.png`,
      });
      // Inspect actual SVG geometry after the browser resolves every port and transform.
      const geometry = await page
        .locator(".react-flow__edge")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const path = element.querySelector(
              ".react-flow__edge-path",
            ) as SVGPathElement;
            const matrix = path.getScreenCTM()!;
            const total = path.getTotalLength();
            const start = path.getPointAtLength(0).matrixTransform(matrix);
            const end = path.getPointAtLength(total).matrixTransform(matrix);
            const collisions = new Set<string>();
            for (let distance = 4; distance < total - 4; distance += 4) {
              const point = path
                .getPointAtLength(distance)
                .matrixTransform(matrix);
              for (const node of document.querySelectorAll(
                ".react-flow__node",
              )) {
                const box = node.getBoundingClientRect();
                if (
                  point.x > box.left + 3 &&
                  point.x < box.right - 3 &&
                  point.y > box.top + 3 &&
                  point.y < box.bottom - 3
                )
                  collisions.add((node as HTMLElement).dataset.id!);
              }
            }
            return {
              id: (element as SVGElement).dataset.id,
              start: { x: start.x, y: start.y },
              end: { x: end.x, y: end.y },
              collisions: [...collisions],
              label: element.getAttribute("aria-label"),
            };
          }),
        );
      expect(geometry).toHaveLength(6);
      expect(geometry.flatMap((edge) => edge.collisions)).toEqual([]);
      const down = geometry.find((edge) => edge.id === "needs-rework")!;
      const left = geometry.find((edge) => edge.id === "rework-wait")!;
      const up = geometry.find((edge) => edge.id === "wait-process")!;
      expect(Math.abs(down.start.x - down.end.x)).toBeLessThan(1);
      expect(down.end.y).toBeGreaterThan(down.start.y);
      expect(left.end.x).toBeLessThan(left.start.x);
      expect(Math.abs(up.start.x - up.end.x)).toBeLessThan(1);
      expect(up.end.y).toBeLessThan(up.start.y);
      await expect(
        page.locator('.react-flow__edge[data-id="wait-process"]'),
      ).toHaveAccessibleName("Fra Afventer afklaring til Behandl ansøgning");
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            iframes: false,
            resultTypes: ["violations"],
          })
        ).violations.map((item: any) => ({
          id: item.id,
          targets: item.nodes.map((node: any) => node.target),
        })),
      );
      expect(violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (name === "desktop") {
        const from = await page
          .locator(
            '.react-flow__node[data-id="route"] .primary-port[data-handleid="source-right"]',
          )
          .boundingBox();
        const to = await page
          .locator(
            '.react-flow__node[data-id="wait"] .primary-port[data-handleid="target-left"]',
          )
          .boundingBox();
        if (!from || !to) throw new Error("Connection ports are not visible");
        await page.mouse.move(
          from.x + from.width / 2,
          from.y + from.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
          steps: 10,
        });
        await page.mouse.up();
        await expect(page.locator(".react-flow__edge")).toHaveCount(7);
        await page
          .getByRole("button", { name: "Fortryd ændring", exact: true })
          .click();
        await expect(page.locator(".react-flow__edge")).toHaveCount(6);
      }
      // A keyboard move persists and stays undoable without changing model semantics.
      const waitNode = page.locator('.react-flow__node[data-id="wait"]');
      await waitNode.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("textbox", { name: "Navn", exact: true }),
      ).toHaveValue("Afventer afklaring");
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(230px, 310px\)/,
      );
      await expect(waitNode).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(225px, 310px\)/,
      );
      await expect(waitNode).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(220px, 310px\)/,
      );
      await expect(waitNode).toBeFocused();
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(225px, 310px\)/,
      );
      await page
        .getByRole("button", { name: "Fortryd ændring", exact: true })
        .click();
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(230px, 310px\)/,
      );
      await page
        .getByRole("button", { name: "Gentag ændring", exact: true })
        .click();
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(225px, 310px\)/,
      );
      await page
        .getByRole("button", { name: "Gentag ændring", exact: true })
        .click();
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(220px, 310px\)/,
      );
      await expect(
        page.getByText("Gemt lokalt", { exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await showCanvas();
      await expect(waitNode).toHaveAttribute(
        "style",
        /translate\(220px, 310px\)/,
      );
      await library();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Eksportér arbejdsrum", exact: true })
        .click();
      const exported = JSON.parse(
        await readFile((await (await pending).path())!, "utf8"),
      );
      expect(exported.scenario.edges).toEqual(doc.scenario.edges);
      expect(exported.baseline.nodes).toEqual(doc.baseline.nodes);
      expect(exported.scenario.arrivals).toEqual(doc.scenario.arrivals);
      results.push({
        viewport: name,
        geometry,
        violations,
        checks: [
          "Measured SVG loop goes down, left and up without crossing node interiors",
          "Input summaries reflect horizon, backlog and duration distribution",
          "Keyboard move, undo/redo and durable reload pass; export preserves semantic graph",
        ],
      });
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `reports/flowlab/${engine}-diagram-routing-check.json`,
      JSON.stringify(
        { executedAt: new Date().toISOString(), results, errors },
        null,
        2,
      ),
    );
    console.log(
      `${engine}: diagram direction, truthful source summaries, keyboard persistence and axe pass at all three viewports`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
