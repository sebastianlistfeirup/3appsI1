/** Creates two disposable local clusters. Never reads production connection variables. */
import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
  chmod,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import assert from "node:assert/strict";
import {
  Pool,
  withTrustedUser,
  withWorker,
  createWorkspace,
  createProject,
  updateProject,
  requestJob,
  getProject,
  getArtifact,
  getJob,
  claimJob,
  recordProviderReference,
  assertRuntimePrincipal,
} from "../../packages/database/src/index";
import {
  installQueue,
  startQueue,
  dispatchOutbox,
  processJob,
  localHandlers,
  queueName,
  envelopeSchema,
  type PgBoss,
} from "../../packages/jobs/src/index";

const startedAt = new Date().toISOString();
const directory = await mkdtemp(join(tmpdir(), "tre-restore-drill-"));
const adminName = "tre_restore_fixture";
const runtimeRoles = [
  "authenticated",
  "tre_worker",
  "tre_dispatcher",
  "tre_queue",
] as const;
const pools: Pool[] = [];
const connections = new Map<Pool, Set<unknown>>();
const clusters: EmbeddedPostgres[] = [];
const queues: PgBoss[] = [];
// Keep the fixture alive until its explicit cleanup has finished, including
// pg-boss's unreferenced shutdown delay and actual PostgreSQL socket closure.
const keepAlive = setInterval(() => {}, 1000);
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const binary = (name: string) =>
  process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, name) : name;
let exitCode = 1;
let verification: Record<string, unknown> | undefined;
let poolErrors = 0;

function trackedPool(connectionString: string, max: number, label: string) {
  const pool = new Pool({ connectionString, max }),
    clients = new Set<unknown>();
  connections.set(pool, clients);
  pool.on("connect", (client) => clients.add(client));
  pool.on("remove", (client) => clients.delete(client));
  pool.on("error", (error) => {
    poolErrors++;
    console.error(
      `Unexpected ${label} pool error: ${(error as { code?: string }).code ?? "database error"}`,
    );
  });
  pools.push(pool);
  return pool;
}
async function closePool(pool: Pool) {
  // pg-pool 3.14 resolves end() after removing clients from its array, before
  // their TCP close callbacks. Stopping the server immediately can race them.
  let timeout: NodeJS.Timeout | undefined;
  let listener: (() => void) | undefined;
  const drained = new Promise<void>((resolveDrain, reject) => {
    const check = () => {
      if (!connections.get(pool)?.size) resolveDrain();
    };
    listener = check;
    pool.on("remove", check);
    timeout = setTimeout(
      () =>
        reject(new Error("Database sockets did not close within five seconds")),
      5000,
    );
    check();
  });
  try {
    await Promise.all([pool.end(), drained]);
  } finally {
    clearTimeout(timeout);
    if (listener) pool.off("remove", listener);
  }
}

async function command(
  name: string,
  args: string[],
  env: Record<string, string> = {},
) {
  return new Promise<string>((resolveCommand, reject) => {
    const child = spawn(binary(name), args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-65536);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-65536);
    });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("error", () => {
      clearTimeout(deadline);
      reject(
        new Error(
          `${name} could not start. Install PostgreSQL 17+ client tools or set PG_BIN_DIR.`,
        ),
      );
    });
    child.on("exit", (code) => {
      clearTimeout(deadline);
      if (code === 0) resolveCommand(stdout.trim());
      else
        reject(
          new Error(
            `${name} failed (${code}): ${stderr.replaceAll(env.PGPASSWORD ?? "never-a-secret", "[redacted]")}`,
          ),
        );
    });
  });
}
async function freshCluster(label: string) {
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object");
      server.close(() => resolvePort(address.port));
    });
  });
  const password = randomBytes(24).toString("hex");
  const server = new EmbeddedPostgres({
    databaseDir: join(directory, label),
    user: adminName,
    password,
    port,
    persistent: false,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  clusters.push(server);
  await server.initialise();
  await server.start();
  const connection = new URL(
    `postgresql://${adminName}@127.0.0.1:${port}/postgres`,
  );
  connection.password = password;
  const pool = trackedPool(connection.toString(), 5, `${label} admin`);
  return {
    server,
    pool,
    connection,
    env: {
      PGHOST: "127.0.0.1",
      PGPORT: String(port),
      PGUSER: adminName,
      PGPASSWORD: password,
      PGDATABASE: "postgres",
    },
  };
}
async function snapshot(pool: Pool) {
  const tables = (
    await pool.query<{ schema: string; name: string }>(
      "select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app','queue') and c.relkind in ('r','p') order by 1,2",
    )
  ).rows;
  const rows: Record<string, string[]> = {};
  for (const table of tables) {
    // Names originate from PostgreSQL's catalog; quote identifiers nevertheless.
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    rows[`${table.schema}.${table.name}`] = (
      await pool.query<{ row: string }>(
        `select row_to_json(t)::text row from ${quote(table.schema)}.${quote(table.name)} t order by row_to_json(t)::text`,
      )
    ).rows.map((r) => r.row);
  }
  return rows;
}
function objectPath(root: string, key: string) {
  if (
    key.includes("\\") ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe backup object key");
  const path = resolve(root, key);
  if (!path.startsWith(resolve(root) + sep))
    throw new Error("Backup object escapes its root");
  return path;
}
async function restricted(
  target: Awaited<ReturnType<typeof freshCluster>>,
  role: (typeof runtimeRoles)[number],
) {
  const login = `restore_${randomUUID().replaceAll("-", "")}`,
    password = randomBytes(24).toString("hex");
  await target.pool.query(
    `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'; grant ${role} to ${login}`,
  );
  const connection = new URL(target.connection);
  connection.username = login;
  connection.password = password;
  const pool = trackedPool(connection.toString(), 3, role);
  await assertRuntimePrincipal(pool, role);
  return { pool, url: connection.toString() };
}

try {
  const tools = {
    dump: await command("pg_dump", ["--version"]),
    restore: await command("pg_restore", ["--version"]),
  };
  const source = await freshCluster("source");
  const migrations = (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations)
    await source.pool.query(
      await readFile(join("migrations", migration), "utf8"),
    );
  await installQueue(source.pool);
  const owner = randomUUID(),
    stranger = randomUUID();
  const fixture = await withTrustedUser(source.pool, owner, async (client) => {
    const workspace = await createWorkspace(
      client,
      "Syntetisk gendannelsesprøve",
    );
    const created = await createProject(client, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Bevar hele historien",
      document: {
        schemaVersion: 1,
        text: "Ændringer, godkendelser og ældre versioner",
      },
    });
    const project = await updateProject(client, created.id, "studio", 1, {
      name: created.name,
      document: {
        schemaVersion: 1,
        text: "Den opdaterede version skal gendannes sammen med revisionssporet.",
      },
    });
    await client.query("select app.set_budget($1,100,100)", [workspace.id]);
    const jobs = [];
    for (const name of ["completed", "pending", "uncertain"])
      jobs.push(
        await requestJob(client, {
          workspaceId: workspace.id,
          projectId: project.id,
          appKey: "studio",
          kind: "manual.validate",
          idempotencyKey: name,
          input: {
            text: JSON.stringify({ fixture: name }),
            mime: "application/json",
          },
          maximumMinor: name === "uncertain" ? 49 : 0,
        }),
      );
    return {
      workspace,
      project,
      completed: jobs[0]!,
      pending: jobs[1]!,
      uncertain: jobs[2]!,
    };
  });
  const sourceObjects = join(directory, "source-objects"),
    backupObjects = join(directory, "backup-objects"),
    restoredObjects = join(directory, "restored-objects");
  for (const [version, content] of [
    "Første version med danske tegn: æøå.",
    "Anden version. Den første skal blive bevaret.",
  ].entries()) {
    const bytes = Buffer.from(content),
      assetId = `${fixture.workspace.id}/${fixture.project.id}/notes/v${version + 1}.txt`;
    const path = objectPath(sourceObjects, assetId);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    await withTrustedUser(source.pool, owner, (client) =>
      client.query(
        "insert into app.artifact_versions(workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status) values($1,$2,$3,$4,$5,'text/plain',$6,$7,$8,'owned')",
        [
          fixture.workspace.id,
          fixture.project.id,
          fixture.project.id,
          version + 1,
          sha256(bytes),
          bytes.length,
          assetId,
          { source: "synthetic-restore-fixture" },
        ],
      ),
    );
  }
  await processJob(source.pool, {
    jobId: fixture.completed.id,
    workspaceId: fixture.workspace.id,
  });
  await withWorker(source.pool, fixture.workspace.id, async (client) => {
    const run = await claimJob(client, fixture.uncertain.id);
    assert(run?.lease_token);
    await recordProviderReference(
      client,
      run.id,
      run.lease_token,
      "synthetic-no-provider-call",
    );
  });
  await source.pool.query(
    "update app.jobs set lease_until=now()-interval '1 second' where id=$1",
    [fixture.uncertain.id],
  );
  const sourceQueue = await startQueue(source.connection.toString(), {
    role: "tre_queue",
    supervise: false,
  });
  queues.push(sourceQueue);
  await dispatchOutbox(source.pool, sourceQueue);
  await sourceQueue.stop({ graceful: false });
  queues.pop();
  // There are no writers beyond this point. A deployed backup needs the same
  // explicit consistency boundary across the database and private object store.
  const checkpointAt = new Date().toISOString(),
    before = await snapshot(source.pool);
  assert.equal(before["app.audit_log"]!.length, 1);
  const assets = (
    await source.pool.query<{
      id: string;
      storage_key: string;
      sha256: string;
      bytes: string;
    }>(
      "select id,storage_key,sha256,bytes from app.artifact_versions order by storage_key",
    )
  ).rows;
  for (const asset of assets) {
    const bytes = await readFile(objectPath(sourceObjects, asset.storage_key));
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.length, Number(asset.bytes));
    const path = objectPath(backupObjects, asset.storage_key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
  }
  const archive = join(directory, "database.dump"),
    dumpAt = performance.now();
  await command(
    "pg_dump",
    ["--format=custom", "--file", archive, "--no-password"],
    source.env,
  );
  await chmod(archive, 0o600);
  const dumpMs = Math.round(performance.now() - dumpAt),
    archiveHash = sha256(await readFile(archive));
  const manifestFile = join(directory, "backup-manifest.json");
  await writeFile(
    manifestFile,
    JSON.stringify({
      schemaVersion: 1,
      checkpointAt,
      databaseSha256: archiveHash,
      objects: assets.map((asset) => ({
        key: asset.storage_key,
        sha256: asset.sha256,
        bytes: Number(asset.bytes),
      })),
    }),
    { mode: 0o600 },
  );
  await closePool(source.pool);
  pools.splice(pools.indexOf(source.pool), 1);
  await source.server.stop();
  clusters.splice(clusters.indexOf(source.server), 1);
  await rm(sourceObjects, { recursive: true }); // Original objects genuinely unavailable during restoration.

  const target = await freshCluster("fresh-target");
  for (const role of runtimeRoles)
    await target.pool.query(
      `create role ${role} nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls`,
    );
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    databaseSha256: string;
    objects: Array<{ key: string; sha256: string; bytes: number }>;
  };
  assert.equal(sha256(await readFile(archive)), manifest.databaseSha256);
  const recoveryAt = performance.now();
  // Preserve ownership and grants: --no-owner would silently remove queue-role ownership.
  await command(
    "pg_restore",
    [
      "--exit-on-error",
      "--single-transaction",
      "--dbname",
      "postgres",
      "--no-password",
      archive,
    ],
    target.env,
  );
  assert.deepEqual(await snapshot(target.pool), before);
  for (const asset of manifest.objects) {
    const bytes = await readFile(objectPath(backupObjects, asset.key));
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.length, Number(asset.bytes));
    const path = objectPath(restoredObjects, asset.key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    assert.equal(sha256(await readFile(path)), asset.sha256);
  }
  const app = await restricted(target, "authenticated"),
    worker = await restricted(target, "tre_worker"),
    dispatcher = await restricted(target, "tre_dispatcher"),
    queue = await restricted(target, "tre_queue");
  const restored = await withTrustedUser(app.pool, owner, (client) =>
    getProject(client, fixture.project.id, "studio"),
  );
  assert.deepEqual(restored.document, fixture.project.document);
  await assert.rejects(
    withTrustedUser(app.pool, stranger, (client) =>
      getProject(client, fixture.project.id, "studio"),
    ),
    { status: 404 },
  );
  await assert.rejects(
    withTrustedUser(app.pool, stranger, (client) =>
      getArtifact(client, assets[0]!.id),
    ),
    { status: 404 },
  );
  const policies = (
    await target.pool.query(
      "select c.relrowsecurity,c.relforcerowsecurity,r.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='app' and c.relkind='r'",
    )
  ).rows;
  assert(policies.length >= 13);
  for (const policy of policies) {
    assert(policy.relrowsecurity && policy.relforcerowsecurity);
    assert(!runtimeRoles.includes(policy.rolname));
  }
  const restoredQueue = await startQueue(queue.url, {
    role: "tre_queue",
    supervise: false,
  });
  queues.push(restoredQueue);
  assert.equal(await dispatchOutbox(dispatcher.pool, restoredQueue), 0);
  let executed = 0;
  const handler = localHandlers.get("manual.validate")!;
  const measured = new Map([
    [
      handler.id,
      {
        ...handler,
        run: (...args: Parameters<typeof handler.run>) => {
          executed++;
          return handler.run(...args);
        },
      },
    ],
  ]);
  for (const row of await restoredQueue.fetch(queueName, { batchSize: 10 })) {
    await processJob(worker.pool, envelopeSchema.parse(row.data), measured);
    await restoredQueue.complete(queueName, row.id);
  }
  assert.equal(
    executed,
    1,
    "Only the pending free validation may run after restore",
  );
  const state = await withTrustedUser(app.pool, owner, async (client) => ({
    completed: await getJob(client, fixture.completed.id),
    pending: await getJob(client, fixture.pending.id),
    uncertain: await getJob(client, fixture.uncertain.id),
  }));
  assert.equal(state.completed.state, "succeeded");
  assert.equal(state.completed.attempt, 1);
  assert.equal(state.pending.state, "succeeded");
  assert.equal(state.pending.attempt, 1);
  assert.equal(state.uncertain.state, "reconcile_required");
  assert.equal(state.uncertain.attempt, 1);
  assert.equal(state.uncertain.provider_ref, "synthetic-no-provider-call");
  const held = (
    await target.pool.query(
      "select state,reserved_minor from app.budget_reservations where job_id=$1",
      [fixture.uncertain.id],
    )
  ).rows[0];
  assert.equal(held.state, "held");
  assert.equal(Number(held.reserved_minor), 49);
  assert.equal(
    (await target.pool.query("select count(*)::int count from app.job_results"))
      .rows[0].count,
    2,
  );
  const duplicate = await withTrustedUser(app.pool, owner, (client) =>
    requestJob(client, {
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      appKey: "studio",
      kind: "manual.validate",
      idempotencyKey: "pending",
      input: fixture.pending.input,
      maximumMinor: 0,
    }),
  );
  assert.equal(duplicate.id, fixture.pending.id);
  const recoveryMs = Math.round(performance.now() - recoveryAt);
  verification = {
    startedAt,
    verifiedAt: new Date().toISOString(),
    checkpointAt,
    profile: "two-disposable-local-clusters",
    cloudConnected: false,
    postgresVersion: (await target.pool.query("select version()")).rows[0]
      .version,
    tools,
    migrations,
    dumpBytes: (await stat(archive)).size,
    archiveSha256: archiveHash,
    dumpMs,
    recoveryMs,
    tableRowsAtCheckpoint: Object.fromEntries(
      Object.entries(before).map(([name, rows]) => [name, rows.length]),
    ),
    restoredObjectVersions: assets.length,
    observedLostRows: 0,
    observedLostObjects: 0,
    scope:
      "Quiesced synthetic snapshot; original cluster stopped and original objects removed before restore. Recovery time excludes fresh cluster provisioning. No production RPO/RTO promise.",
    checks: [
      "Every app and queue row equals the pre-backup snapshot",
      "Original immutable object bytes and SHA-256 restored",
      "All app tables retain FORCE RLS and non-runtime ownership",
      "Four dedicated restricted runtime logins accepted",
      "Foreign project and object access return 404",
      "Durable queue resumes one pending validation exactly once",
      "Completed validation is not repeated",
      "Unknown outcome retains provider reference and budget hold for reconciliation",
      "Same idempotency key returns the original job",
      "No external provider call or payment",
    ],
  };
  exitCode = 0;
} catch (error) {
  console.error(
    "Restore drill failed:",
    error instanceof Error ? error.message : "unknown error",
  );
} finally {
  for (const queue of queues)
    await queue.stop({ graceful: false }).catch(() => {
      exitCode = 1;
    });
  for (const pool of pools)
    await closePool(pool).catch(() => {
      exitCode = 1;
    });
  for (const cluster of clusters)
    await cluster.stop().catch(() => {
      exitCode = 1;
    });
  await rm(directory, { recursive: true, force: true });
  clearInterval(keepAlive);
}
if (poolErrors) exitCode = 1;
await mkdir("reports/database", { recursive: true });
await writeFile(
  "reports/database/restore-drill.json",
  JSON.stringify(
    {
      ...verification,
      finishedAt: new Date().toISOString(),
      exitCode,
      cleanupVerified: exitCode === 0,
      poolErrors,
    },
    null,
    2,
  ),
);
console.log(
  exitCode === 0
    ? `Restore drill passed, including cleanup. Recovery: ${verification?.recoveryMs}ms.`
    : "Restore drill failed; see reports/database/restore-drill.json.",
);
// embedded-postgres's exit hook otherwise turns a failed beforeExit into zero.
process.exit(exitCode);
