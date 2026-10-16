/** Actual production Next HTTP → HTTPS JWKS → restricted PostgreSQL → separate
 * pg-boss worker → verified private download. Disposable synthetic services only. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer as createHttpsServer, type Server } from "node:https";
import { createServer as createNetServer } from "node:net";
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
  chmod,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import EmbeddedPostgres from "embedded-postgres";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Pool, withTrustedUser } from "../../packages/database/src/index";
import { installQueue } from "../../packages/jobs/src/queue";
const startedAt = new Date().toISOString(),
  repository = resolve(".");
const root = await mkdtemp(join(tmpdir(), "tre-http-proof-"));
const secrets: string[] = [],
  children: ChildProcess[] = [],
  logs: string[] = [],
  pools: Pool[] = [];
const connected = new Map<Pool, Set<unknown>>();
const checks: string[] = [];
const keepAlive = setInterval(() => {}, 1000);
let database: EmbeddedPostgres | undefined, identity: Server | undefined;
let exitCode = 1,
  poolErrors = 0,
  jwksRequests = 0;
const failureProbe = process.argv.includes("--failure-probe");
let failureReason: string | undefined,
  cleanupComplete = false;
let evidence: Record<string, unknown> | undefined;
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function secret(value = randomBytes(32).toString("hex")) {
  secrets.push(value);
  return value;
}
function safe(message: string) {
  for (const value of secrets)
    message = message.replaceAll(value, "[redacted]");
  return message.replace(/token=[^\s"&]+/g, "token=[redacted]");
}
function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
  checks.push(label);
}
async function port() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const chosen = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(chosen));
    });
  });
}
function poolFor(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  const clients = new Set<unknown>();
  connected.set(pool, clients);
  pool.on("connect", (client) => clients.add(client));
  pool.on("remove", (client) => clients.delete(client));
  pool.on("error", () => {
    poolErrors++;
  });
  pools.push(pool);
  return pool;
}
async function closePool(pool: Pool) {
  let timeout: NodeJS.Timeout | undefined;
  let listener: () => void = () => {};
  const drained = new Promise<void>((resolveDrain, reject) => {
    listener = () => {
      if (!connected.get(pool)?.size) resolveDrain();
    };
    pool.on("remove", listener);
    timeout = setTimeout(
      () => reject(new Error("HTTP fixture database sockets did not close")),
      5000,
    );
    listener();
  });
  try {
    await Promise.all([pool.end(), drained]);
  } finally {
    clearTimeout(timeout);
    pool.off("remove", listener);
  }
}
function childProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
  cwd = repository,
) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const index = logs.push("") - 1;
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk) => {
      logs[index] = (logs[index] + chunk.toString()).slice(-100_000);
    });
  child.on("error", (error) => {
    logs[index] += safe(error.message);
  });
  return { child, log: () => logs[index]! };
}
async function command(name: string, args: string[]) {
  const { child, log } = childProcess(name, args);
  await new Promise<void>((resolveCommand, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${name} exceeded its fixture deadline`));
    }, 30000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error(`${name} could not start`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolveCommand()
        : reject(new Error(`${name} failed: ${safe(log())}`));
    });
  });
}
async function until(
  condition: () => Promise<boolean>,
  label: string,
  milliseconds = 15000,
) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(80);
  }
  throw new Error(`${label} exceeded ${milliseconds} ms`);
}
async function stop(child: ChildProcess, milliseconds: number) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  await new Promise<void>((resolveStop, reject) => {
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      child.kill("SIGKILL");
    }, milliseconds);
    child.once("close", () => {
      clearTimeout(timer);
      forced
        ? reject(new Error("A fixture process needed forced shutdown"))
        : resolveStop();
    });
    child.kill("SIGTERM");
  });
}
try {
  if (process.argv.slice(2).some((argument) => argument !== "--failure-probe"))
    throw new Error("Unknown HTTP proof argument.");
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw new Error("This proof requires normal TLS certificate validation.");
  await access(join(repository, "apps/studio/.next/BUILD_ID"));
  const dbPort = await port(),
    appPort = await port();
  const password = secret();
  database = new EmbeddedPostgres({
    databaseDir: join(root, "postgres"),
    user: "tre_http_fixture",
    password,
    port: dbPort,
    persistent: false,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await database.initialise();
  await database.start();
  const adminUrl = `postgresql://tre_http_fixture:${password}@127.0.0.1:${dbPort}/postgres`,
    admin = poolFor(adminUrl);
  const migrations = (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations)
    await admin.query(await readFile(join("migrations", migration), "utf8"));
  await installQueue(admin);
  const runtime: Record<string, string> = {};
  for (const [variable, role] of Object.entries({
    APP_DATABASE_URL: "authenticated",
    APP_WORKER_DATABASE_URL: "tre_worker",
    DISPATCHER_DATABASE_URL: "tre_dispatcher",
    QUEUE_DATABASE_URL: "tre_queue",
  })) {
    const login = `http_${randomUUID().replaceAll("-", "")}`,
      pass = secret();
    await admin.query(
      `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${pass}'; grant ${role} to ${login}`,
    );
    const connection = new URL(adminUrl);
    connection.username = login;
    connection.password = pass;
    runtime[variable] = connection.toString();
  }
  const web = poolFor(runtime.APP_DATABASE_URL!);
  const certificate = join(root, "fixture-cert.pem"),
    certificateKey = join(root, "fixture-key.pem");
  await command("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
    "-keyout",
    certificateKey,
    "-out",
    certificate,
  ]);
  await chmod(certificateKey, 0o600);
  const signing = await generateKeyPair("ES256"),
    rogue = await generateKeyPair("ES256");
  const jwks = {
    keys: [
      {
        ...(await exportJWK(signing.publicKey)),
        kid: "real-https-fixture",
        alg: "ES256",
        use: "sig",
      },
    ],
  };
  identity = createHttpsServer(
    { key: await readFile(certificateKey), cert: await readFile(certificate) },
    (request, response) => {
      if (
        request.url !== "/auth/v1/.well-known/jwks.json" ||
        request.method !== "GET"
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      jwksRequests++;
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(jwks));
    },
  );
  await new Promise<void>((resolveIdentity, reject) => {
    identity!.once("error", reject);
    identity!.listen(0, "127.0.0.1", resolveIdentity);
  });
  const identityAddress = identity.address();
  assert(identityAddress && typeof identityAddress === "object");
  const identityOrigin = `https://127.0.0.1:${identityAddress.port}`,
    origin = `http://127.0.0.1:${appPort}`;
  const artifactSigningKey = secret();
  const startApp = () =>
    childProcess(
      process.execPath,
      [
        join(repository, "apps/studio/node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      {
        TRE_BACKEND_ENABLED: "1",
        APP_DATABASE_URL: runtime.APP_DATABASE_URL,
        SUPABASE_URL: identityOrigin,
        TRE_PRIVATE_OBJECT_DIR: join(root, "objects"),
        TRE_ARTIFACT_SIGNING_KEY: artifactSigningKey,
        NODE_EXTRA_CA_CERTS: certificate,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      join(repository, "apps/studio"),
    );
  let app = startApp();
  const waitForApp = () =>
    until(
      async () => {
        if (app.child.exitCode !== null)
          throw new Error(
            `Production server exited before readiness: ${safe(app.log())}`,
          );
        try {
          return (
            await fetch(`${origin}/api/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          return false;
        }
      },
      "Production Next readiness",
      30000,
    );
  await waitForApp();
  const owner = randomUUID(),
    stranger = randomUUID(),
    viewer = randomUUID();
  async function jwt(user: string, privateKey = signing.privateKey) {
    return secret(
      await new SignJWT({ role: "authenticated" })
        .setProtectedHeader({ alg: "ES256", kid: "real-https-fixture" })
        .setIssuer(`${identityOrigin}/auth/v1`)
        .setAudience("authenticated")
        .setSubject(user)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
    );
  }
  const ownerJwt = await jwt(owner),
    viewerJwt = await jwt(viewer),
    strangerJwt = await jwt(stranger);
  async function api(
    path: string,
    options: {
      token?: string;
      method?: string;
      body?: unknown;
      bytes?: Uint8Array;
      status?: number;
      origin?: string;
    } = {},
  ) {
    const response = await fetch(`${origin}/api/backend/${path}`, {
      method: options.method ?? "GET",
      signal: AbortSignal.timeout(10000),
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.bytes !== undefined
          ? { "content-type": "application/octet-stream" }
          : options.body !== undefined
            ? { "content-type": "application/json" }
            : {}),
        ...(options.origin ? { origin: options.origin } : {}),
      },
      ...(options.bytes !== undefined
        ? { body: Uint8Array.from(options.bytes) }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
    });
    if (options.status !== undefined && response.status !== options.status)
      throw new Error(
        `HTTP ${options.method ?? "GET"} ${path.split("?")[0]} expected ${options.status}, received ${response.status}: ${safe(await response.text())}`,
      );
    check(
      response.headers.get("cache-control") === "no-store",
      "API response is not cached",
    );
    return response;
  }
  await (await api("workspaces", { status: 401 })).arrayBuffer();
  check(
    jwksRequests === 0,
    "Unauthenticated request rejected before contacting identity server",
  );
  await (
    await api("workspaces", {
      token: await jwt(owner, rogue.privateKey),
      status: 401,
    })
  ).arrayBuffer();
  check(
    jwksRequests === 1,
    "Next fetched real JWKS through certificate-validated HTTPS",
  );
  const { workspace } = await (
    await api("workspaces", {
      token: ownerJwt,
      method: "POST",
      body: { name: "HTTP-referenceprøve" },
      status: 201,
    })
  ).json();
  const { project } = await (
    await api("projects", {
      token: ownerJwt,
      method: "POST",
      body: {
        workspaceId: workspace.id,
        name: "Syntetisk produktion gennem HTTP",
      },
      status: 201,
    })
  ).json();
  check(
    project.app_key === "studio" && project.document.profile === "web",
    "Actual Studio document validator created the project",
  );
  await (
    await api(`projects/${project.id}`, { token: strangerJwt, status: 404 })
  ).arrayBuffer();
  await (
    await api("workspaces", {
      token: ownerJwt,
      origin: "https://foreign.example.test",
      status: 403,
    })
  ).arrayBuffer();
  await withTrustedUser(web, owner, (client) =>
    client.query(
      "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'viewer')",
      [workspace.id, viewer],
    ),
  );
  await (
    await api(`projects/${project.id}`, { token: viewerJwt, status: 200 })
  ).arrayBuffer();
  await (
    await api(`projects/${project.id}`, {
      token: viewerJwt,
      method: "PATCH",
      body: {
        expectedRevision: 1,
        name: "Forbidden",
        document: project.document,
      },
      status: 403,
    })
  ).arrayBuffer();
  const worker = childProcess(
    process.execPath,
    ["--import", "tsx", "services/worker/src/main.ts"],
    runtime,
  );
  await until(async () => {
    if (worker.child.exitCode !== null)
      throw new Error(`Worker exited: ${safe(worker.log())}`);
    return worker.log().includes("worker.ready");
  }, "Restricted worker readiness");
  if (failureProbe)
    throw new Error("Intentional failure after real services became ready.");
  const content = '{"message":"Æble · 東京 🌱","synthetic":true}\n',
    hash = digest(Buffer.from(content));
  const input = {
    idempotencyKey: randomUUID(),
    kind: "manual.validate",
    input: { text: content, mime: "application/json", expectedSha256: hash },
  };
  const { job } = await (
    await api(`projects/${project.id}/jobs`, {
      token: ownerJwt,
      method: "POST",
      body: input,
      status: 202,
    })
  ).json();
  const repeated = await (
    await api(`projects/${project.id}/jobs`, {
      token: ownerJwt,
      method: "POST",
      body: input,
      status: 202,
    })
  ).json();
  check(repeated.job.id === job.id, "Actual HTTP retries keep one logical job");
  check(
    !("lease_token" in job) && !("provider_ref" in job),
    "HTTP job response hides private worker fields",
  );
  await until(
    async () => {
      const value = await (
        await api(`jobs/${job.id}`, { token: ownerJwt, status: 200 })
      ).json();
      return value.job.state === "succeeded";
    },
    "Actual HTTP worker result",
    15000,
  );
  const { result } = await (
    await api(`jobs/${job.id}/result`, { token: ownerJwt, status: 200 })
  ).json();
  check(
    result.manifest.sha256 === hash &&
      result.manifest.externalBuildVerified === false &&
      result.manifest.codeExecuted === false,
    "Worker returned exact UTF-8 digest and explicit execution limits",
  );
  const accounting = (
    await admin.query(
      "select count(*)::int as count,sum(amount_minor)::int as cost from app.usage_events where workspace_id=$1",
      [workspace.id],
    )
  ).rows[0];
  check(
    accounting.count === 1 && accounting.cost === 0,
    "One immutable usage record and zero external cost",
  );
  const bytes = randomBytes(12345);
  const uploadInput = {
    idempotencyKey: randomUUID(),
    name: "HTTP-prøve-æøå.bin",
    mime: "application/octet-stream",
    bytes: bytes.length,
    sha256: digest(bytes),
    source: "Syntetiske tilfældige prøvebytes",
    rights: "owned",
  };
  const uploadPath = `projects/${project.id}/uploads`;
  await (
    await api(uploadPath, {
      token: viewerJwt,
      method: "POST",
      body: uploadInput,
      status: 403,
    })
  ).arrayBuffer();
  const { upload } = await (
    await api(uploadPath, {
      token: ownerJwt,
      method: "POST",
      body: uploadInput,
      status: 202,
    })
  ).json();
  const contentPath = `uploads/${upload.id}/content`,
    finalizePath = `uploads/${upload.id}/finalize`;
  await (
    await api(contentPath, {
      token: ownerJwt,
      method: "PUT",
      bytes,
      status: 200,
    })
  ).arrayBuffer();
  await (
    await api(`artifacts/${upload.id}/download-link`, {
      token: ownerJwt,
      method: "POST",
      body: {},
      status: 404,
    })
  ).arrayBuffer();
  check(
    (
      await admin.query(
        "select count(*)::int as count from app.artifact_versions where project_id=$1",
        [project.id],
      )
    ).rows[0].count === 0,
    "Actual HTTP upload remains private and unpublished before finalization",
  );
  // Terminate the real Next process between durable file publication and SQL
  // finalization. Recovery gets its identity/metadata from PostgreSQL, not memory.
  const previousPid = app.child.pid;
  await new Promise<void>((resolveCrash, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Production server crash did not settle")),
      5000,
    );
    app.child.once("close", () => {
      clearTimeout(timer);
      resolveCrash();
    });
    app.child.kill("SIGKILL");
  });
  check(
    app.child.signalCode === "SIGKILL",
    "Actual production Next process was killed after durable upload bytes",
  );
  app = startApp();
  await waitForApp();
  check(
    app.child.pid !== previousPid,
    "Upload recovery runs in a new production Next process",
  );
  const recovered = await (
    await api(`uploads/${upload.id}`, { token: ownerJwt, status: 200 })
  ).json();
  check(
    recovered.upload.state === "pending" &&
      recovered.upload.sha256 === uploadInput.sha256,
    "New HTTP process discovers the existing durable upload reservation",
  );
  const complete = await (
    await api(finalizePath, {
      token: ownerJwt,
      method: "POST",
      body: {},
      status: 200,
    })
  ).json();
  const duplicate = await (
    await api(finalizePath, {
      token: ownerJwt,
      method: "POST",
      body: {},
      status: 200,
    })
  ).json();
  check(
    complete.upload.state === "finalized" &&
      duplicate.upload.artifactVersionId === upload.id,
    "HTTP finalization recovers existing bytes without reupload and safely repeats",
  );
  check(
    (
      await admin.query(
        "select count(*)::int as count from app.artifact_versions where project_id=$1",
        [project.id],
      )
    ).rows[0].count === 1,
    "Retried HTTP finalization publishes exactly one immutable version",
  );
  const descriptor = {
    artifactVersionId: upload.id,
    sha256: uploadInput.sha256,
  };
  const linkPath = `artifacts/${descriptor.artifactVersionId}/download-link`;
  const { download } = await (
    await api(linkPath, {
      token: viewerJwt,
      method: "POST",
      body: {},
      status: 200,
    })
  ).json();
  secrets.push(download.url.split("token=")[1]);
  const binary = await fetch(new URL(download.url, origin), {
    signal: AbortSignal.timeout(10000),
  });
  check(
    binary.status === 200 &&
      binary.headers.get("content-disposition")?.startsWith("attachment"),
    "Signed file is served through the actual Next attachment route",
  );
  check(
    digest(new Uint8Array(await binary.arrayBuffer())) === descriptor.sha256,
    "HTTP download contains every original byte",
  );
  const head = await fetch(new URL(download.url, origin), {
    method: "HEAD",
    signal: AbortSignal.timeout(10000),
  });
  check(
    head.status === 200 &&
      Number(head.headers.get("content-length")) === bytes.length &&
      (await head.arrayBuffer()).byteLength === 0,
    "Actual HTTP HEAD preserves exact size without a body",
  );
  await withTrustedUser(web, owner, (client) =>
    client.query(
      "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
      [workspace.id, viewer],
    ),
  );
  const revoked = await fetch(new URL(download.url, origin), {
    signal: AbortSignal.timeout(10000),
  });
  check(
    revoked.status === 404,
    "Already-issued HTTP download is refused after membership revocation",
  );
  await revoked.arrayBuffer();
  await (
    await api(linkPath, {
      token: strangerJwt,
      method: "POST",
      body: {},
      status: 404,
    })
  ).arrayBuffer();
  check(
    jwksRequests === 2,
    "Each production process fetches verified JWKS once and reuses its cache",
  );
  await stop(worker.child, 28000);
  check(
    worker.child.exitCode === 0 && worker.log().includes("worker.stopped"),
    "Actual worker terminates gracefully after its HTTP job",
  );
  await stop(app.child, 5000);
  check(
    logs.every((log) => secrets.every((value) => !log.includes(value))),
    "Application and worker logs contain no fixture credentials or tokens",
  );
  evidence = {
    startedAt,
    finishedAt: new Date().toISOString(),
    profile: "isolated-production-http",
    identity: "ephemeral HTTPS JWKS fixture; normal TLS validation",
    hostedAuthConnected: false,
    cloudConnected: false,
    migrations,
    jwksRequests,
    checks: [...new Set(checks)],
    immutableUsageEvents: accounting.count,
    actualCostMinor: accounting.cost,
    downloadedBytes: bytes.length,
    privateFileIntegrity: true,
    uploadThroughHttp: true,
    processKilledBetweenUploadAndFinalize: true,
  };
  exitCode = 0;
} catch (error) {
  failureReason = safe(
    error instanceof Error ? error.message : "Unknown fixture error",
  );
  console.error("HTTP proof failed:", failureReason);
} finally {
  const failures: string[] = [];
  async function cleanup(label: string, action: () => Promise<void>) {
    try {
      await action();
    } catch {
      failures.push(label);
    }
  }
  for (const child of [...children].reverse())
    await cleanup("child shutdown", () => stop(child, 5000));
  if (identity?.listening)
    await cleanup("identity shutdown", async () => {
      identity!.closeAllConnections();
      await new Promise<void>((resolveClose, reject) =>
        identity!.close((error) => (error ? reject(error) : resolveClose())),
      );
    });
  for (const pool of [...pools].reverse())
    await cleanup("database connection shutdown", () => closePool(pool));
  if (database) await cleanup("PostgreSQL shutdown", () => database!.stop());
  await cleanup("temporary directory removal", () =>
    rm(root, { recursive: true, force: true }),
  );
  if (poolErrors !== 0) failures.push("idle database error");
  cleanupComplete = failures.length === 0;
  if (!cleanupComplete) {
    exitCode = 1;
    console.error("HTTP fixture cleanup failed:", failures.join(", "));
  }
  clearInterval(keepAlive);
}
try {
  await mkdir("reports/backend", { recursive: true });
  await writeFile(
    `reports/backend/http-proof${failureProbe ? "-failure-probe" : ""}.json`,
    JSON.stringify(
      {
        ...evidence,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: exitCode === 0 ? "passed" : "failed",
        failureProbe,
        ...(failureReason ? { failureReason } : {}),
        checks: [...new Set(checks)],
        cleanup: cleanupComplete ? "completed" : "failed",
        poolErrors,
        cloudConnected: false,
      },
      null,
      2,
    ),
  );
} catch {
  exitCode = 1;
  console.error("HTTP proof evidence could not be written.");
}
if (exitCode === 0)
  console.log(
    `Production HTTP proof passed: ${new Set(checks).size} checks, actual TLS/JWT/API/worker/private-file flow; cleanup complete.`,
  );
// Preserve failure status despite embedded-postgres's transitive beforeExit hook.
process.exit(exitCode);
