/** Local Director CLI. No provider calls, auth bypass or production queue claim. */
import { readFile } from "node:fs/promises";
import {
  createRender,
  executeRender,
  getRender,
} from "../../../../apps/director/src/lib/server/local-render";
async function main() {
  const [action, input] = process.argv.slice(2);
  if (!input || !["render", "resume", "status"].includes(action)) {
    throw Error(
      "Brug: pnpm exec tsx services/worker/src/director/local-runner.ts render <project.json> | resume <job-id> | status <job-id>",
    );
  }
  let id = input;
  if (action === "render") {
    const project = JSON.parse(await readFile(input, "utf8"));
    const state = await createRender(project);
    id = state.id;
    process.stdout.write(`${JSON.stringify({ jobId: id })}\n`);
  }
  if (action !== "status") await executeRender(id);
  const result = await getRender(id);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.state === "failed") process.exitCode = 1;
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
