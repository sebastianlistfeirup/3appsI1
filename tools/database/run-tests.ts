import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
const directory = await mkdtemp(join(tmpdir(), "tre-apps-db-"));
const port = await new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const address = s.address();
    const port = typeof address === "object" && address ? address.port : 0;
    s.close(() => resolve(port));
  });
});
const password = randomBytes(24).toString("hex");
const db = new EmbeddedPostgres({
  databaseDir: directory,
  user: "tre_test",
  password,
  port,
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let code = 1;
const started = new Date().toISOString();
try {
  await db.initialise();
  await db.start();
  const client = db.getPgClient();
  await client.connect();
  const version = (await client.query("select version()")).rows[0].version;
  const migrations = (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const name of migrations)
    await client.query(await readFile(join("migrations", name), "utf8"));
  await client.end();
  console.log(
    `Database ready: ${version}. Applied ${migrations.length} migrations.`,
  );
  code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.db.config.ts",
        ...process.argv.slice(2),
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          TEST_DATABASE_URL: `postgresql://tre_test:${password}@127.0.0.1:${port}/postgres`,
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (status) => resolve(status ?? 1));
  });
  await mkdir("reports/database", { recursive: true });
  await writeFile(
    "reports/database/latest.json",
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        postgresVersion: version,
        migrations,
        exitCode: code,
        profile: "isolated-local-postgres",
        cloudConnected: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "Database verification failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  code = 1;
} finally {
  try {
    await db.stop();
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    console.error(
      "Fixture cleanup failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    code = 1;
  }
}
// embedded-postgres's async-exit-hook hardcodes beforeExit=0. Cleanup is complete;
// explicitly preserve Vitest's status so a failing suite cannot make CI green.
process.exit(code);
