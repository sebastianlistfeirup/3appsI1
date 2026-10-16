import { expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const axeSource = createRequire(require.resolve("@axe-core/playwright"))(
  "axe-core",
).source;
export async function accessibility(page: Page, label: string) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    (
      window as unknown as {
        axe: {
          run: (
            target: Document,
            options: unknown,
          ) => Promise<{
            testEngine: unknown;
            testEnvironment: unknown;
            violations: unknown[];
          }>;
        };
      }
    ).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      iframes: false,
      resultTypes: ["violations"],
    }),
  );
  await mkdir("reports/studio/a11y", { recursive: true });
  await writeFile(
    `reports/studio/a11y/${label}.json`,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        label,
        engine: result.testEngine,
        environment: result.testEnvironment,
        violations: result.violations,
      },
      null,
      2,
    ),
  );
  expect(result.violations).toEqual([]);
}
