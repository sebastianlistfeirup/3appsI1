import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  Pool,
  withTrustedUser,
  createWorkspace,
  createProject,
  requestJob,
} from "../../packages/database/src/index";
import { installQueue } from "../../packages/jobs/src/queue";
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const databaseName = `worker_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
databaseUrl.pathname = `/${databaseName}`;
const pool = new Pool({ connectionString: databaseUrl.toString(), max: 5 });
const children = new Set<ChildProcess>();
const runtime: Record<string, string> = {};
beforeAll(async () => {
  // A real global dispatcher must not consume other suites' intentionally unfinished fixtures.
  await admin.query(`create database ${databaseName}`);
  for (const migration of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pool.query(await readFile(`migrations/${migration}`, "utf8"));
  await installQueue(pool);
  for (const [key, role] of Object.entries({
    APP_WORKER_DATABASE_URL: "tre_worker",
    DISPATCHER_DATABASE_URL: "tre_dispatcher",
    QUEUE_DATABASE_URL: "tre_queue",
  })) {
    const login = `runtime_${randomUUID().replaceAll("-", "")}`,
      password = randomUUID();
    await pool.query(
      `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'; grant ${role} to ${login}`,
    );
    const url = new URL(databaseUrl);
    url.username = login;
    url.password = password;
    runtime[key] = url.toString();
  }
});
afterAll(async () => {
  for (const child of children) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  await pool.end();
  await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.end();
});
async function startWorker() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "services/worker/src/main.ts"],
    { env: { ...process.env, ...runtime }, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.add(child);
  let log = "",
    error = "";
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (chunk) => (error += chunk));
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Worker never became ready: ${error}`)),
      10000,
    );
    child.stdout!.on("data", (chunk) => {
      log += chunk;
      if (log.includes("worker.ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      children.delete(child);
      reject(new Error(`Worker exited early (${code}): ${error}`));
    });
  });
  await ready;
  return { child, logs: () => log };
}
async function stopWorker(child: ChildProcess, signal: NodeJS.Signals) {
  const exited = once(child, "exit");
  child.kill(signal);
  const [code, actualSignal] = await exited;
  children.delete(child);
  return { code, signal: actualSignal };
}
async function succeeded(id: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const job = (
      await pool.query(
        "select state,result_version from app.jobs where id=$1",
        [id],
      )
    ).rows[0];
    if (job?.state === "succeeded") return job;
    if (job?.state === "failed") throw new Error("Fixture worker job failed");
    await new Promise((r) => setTimeout(r, 40));
  }
  const state = (
    await pool.query(
      "select j.state,j.actionable_error,o.dispatch_attempt,o.dispatched_at from app.jobs j join app.job_outbox o on o.job_id=j.id where j.id=$1",
      [id],
    )
  ).rows[0];
  const queue = (
    await pool.query("select state,output from queue.job where id=$1", [id])
  ).rows[0];
  throw new Error(
    `Worker did not persist a result before deadline: ${JSON.stringify({ state, queue })}`,
  );
}
it("runs the actual worker with three restricted logins, survives SIGKILL and drains the durable outbox on restart", async () => {
  const owner = randomUUID();
  const f = await withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Actual child process");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Process fixture",
    });
    return { workspace, project };
  });
  const input = {
    workspaceId: f.workspace.id,
    projectId: f.project.id,
    appKey: "studio" as const,
    kind: "manual.validate",
    idempotencyKey: randomUUID(),
    input: { text: '{"realWorker":true}', mime: "application/json" },
    maximumMinor: 0,
  };
  const firstWorker = await startWorker();
  const first = await withTrustedUser(pool, owner, (c) => requestJob(c, input));
  await succeeded(first.id);
  expect(firstWorker.logs()).toContain("job.succeeded");
  const killed = await stopWorker(firstWorker.child, "SIGKILL");
  expect(killed.signal).toBe("SIGKILL");
  const queuedWhileDown = await withTrustedUser(pool, owner, (c) =>
    requestJob(c, {
      ...input,
      idempotencyKey: randomUUID(),
      input: { text: "Queued while worker is down", mime: "text/plain" },
    }),
  );
  const restarted = await startWorker();
  const duplicated = await withTrustedUser(pool, owner, (c) =>
    requestJob(c, input),
  );
  expect(duplicated.id).toBe(first.id);
  await succeeded(queuedWhileDown.id);
  const counts = (
    await pool.query(
      "select count(*)::int as results from app.job_results where project_id=$1",
      [f.project.id],
    )
  ).rows[0];
  expect(counts.results).toBe(2);
  const usage = (
    await pool.query(
      "select count(*)::int as events,sum(amount_minor)::int as cost from app.usage_events where workspace_id=$1",
      [f.workspace.id],
    )
  ).rows[0];
  expect(usage).toEqual({ events: 2, cost: 0 });
  const stopped = await stopWorker(restarted.child, "SIGTERM");
  expect(stopped).toEqual({ code: 0, signal: null });
  expect(restarted.logs()).toContain("worker.stopped");
}, 30000);
