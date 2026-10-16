import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  createBackendHandler,
  type BackendConfig,
} from "../../packages/backend/src/index";
import type { AuthConfig } from "../../packages/auth/src/index";
import {
  Pool,
  withTrustedUser,
  createWorkspace,
  createProject,
  archiveProject,
} from "../../packages/database/src/index";
import type { PoolClient } from "pg";
import {
  ArtifactDownloadSigner,
  LocalPrivateObjectStore,
  objectKey,
  type PrivateObjectStore,
} from "../../packages/storage/src/index";

const admin = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
const login = `upload_${randomUUID().replaceAll("-", "")}`,
  password = randomUUID();
let pool: Pool,
  auth: AuthConfig,
  key: CryptoKey,
  root: string,
  store: LocalPrivateObjectStore,
  config: BackendConfig;
const signer = new ArtifactDownloadSigner(randomBytes(32));
type Handler = ReturnType<typeof createBackendHandler>;
let handle: Handler;
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  await admin.query(
    `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}';grant authenticated to ${login}`,
  );
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.username = login;
  url.password = password;
  pool = new Pool({ connectionString: url.toString(), max: 8 });
  const keys = await generateKeyPair("ES256");
  key = keys.privateKey;
  auth = {
    issuer: "https://identity.example.test/auth/v1",
    audience: "authenticated",
    keys: createLocalJWKSet({
      keys: [
        { ...(await exportJWK(keys.publicKey)), kid: "uploads", alg: "ES256" },
      ],
    }),
  };
  root = await mkdtemp(join(tmpdir(), "tre-upload-"));
  store = new LocalPrivateObjectStore(root);
  config = {
    pool,
    auth,
    app: "studio",
    validateDocument: () => ({}),
    createDocument: () => ({}),
    storage: { store, signer },
  };
  handle = createBackendHandler(config);
});
afterAll(async () => {
  await pool?.end();
  await admin.end();
  if (root) await rm(root, { recursive: true, force: true });
});
async function jwt(user: string) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "uploads" })
    .setIssuer(auth.issuer)
    .setAudience(auth.audience)
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
async function call(
  user: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    bytes?: Uint8Array;
    headers?: Record<string, string>;
    handler?: Handler;
  } = {},
) {
  return (options.handler ?? handle)(
    new Request(`https://studio.example.test/api/backend/${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${await jwt(user)}`,
        ...(options.body !== undefined
          ? { "content-type": "application/json" }
          : options.bytes
            ? { "content-type": "application/octet-stream" }
            : {}),
        ...options.headers,
      },
      body: options.bytes
        ? Uint8Array.from(options.bytes)
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    }),
  );
}
async function fixture(size = 4097) {
  const owner = randomUUID(),
    editor = randomUUID(),
    viewer = randomUUID(),
    bytes = randomBytes(size);
  const result = await withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Upload-fixture");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Private versioner",
    });
    await c.query(
      "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')",
      [workspace.id, editor, viewer],
    );
    return { workspace, project };
  });
  return {
    ...result,
    owner,
    editor,
    viewer,
    bytes,
    input: {
      idempotencyKey: randomUUID(),
      name: "Æble-🌱.bin",
      mime: "application/octet-stream",
      bytes: bytes.length,
      sha256: digest(bytes),
      source: "Egen syntetisk prøve",
      rights: "owned" as const,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function begin(
  f: Fixture,
  overrides: Record<string, unknown> = {},
  user = f.owner,
) {
  return call(user, `projects/${f.project.id}/uploads`, {
    method: "POST",
    body: { ...f.input, ...overrides },
  });
}
async function reserve(f: Fixture) {
  const r = await begin(f);
  expect(r.status).toBe(202);
  return (await r.json()).upload;
}
async function put(
  f: Fixture,
  id: string,
  options: Parameters<typeof call>[2] = {},
) {
  return call(f.owner, `uploads/${id}/content`, {
    method: "PUT",
    bytes: f.bytes,
    ...options,
  });
}
async function finish(
  f: Fixture,
  id: string,
  options: Parameters<typeof call>[2] = {},
) {
  return call(f.owner, `uploads/${id}/finalize`, {
    method: "POST",
    body: {},
    ...options,
  });
}
async function versions(f: Fixture) {
  return (
    await admin.query(
      "select * from app.artifact_versions where project_id=$1 order by version",
      [f.project.id],
    )
  ).rows;
}
function descriptor(f: Fixture, id: string) {
  return {
    workspaceId: f.workspace.id,
    projectId: f.project.id,
    artifactVersionId: id,
    sha256: f.input.sha256,
    bytes: f.bytes.length,
  };
}

describe("Durable private upload lifecycle on real PostgreSQL and filesystem", () => {
  it("keeps bytes private until finalization and deduplicates concurrent begin, PUT and finalization", async () => {
    const f = await fixture();
    const starts = await Promise.all(Array.from({ length: 5 }, () => begin(f)));
    expect(starts.map((r) => r.status)).toEqual([202, 202, 202, 202, 202]);
    const rows = await Promise.all(starts.map((r) => r.json()));
    const id = rows[0].upload.id;
    expect(new Set(rows.map((r) => r.upload.id)).size).toBe(1);
    expect(
      (await Promise.all(Array.from({ length: 4 }, () => put(f, id)))).map(
        (r) => r.status,
      ),
    ).toEqual([200, 200, 200, 200]);
    expect(await versions(f)).toHaveLength(0);
    expect(
      (
        await call(f.owner, `artifacts/${id}/download-link`, {
          method: "POST",
          body: {},
        })
      ).status,
    ).toBe(404);
    const completed = await Promise.all(
      Array.from({ length: 5 }, () => finish(f, id)),
    );
    expect(completed.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await versions(f)).toHaveLength(1);
    const audit = (
      await admin.query(
        "select action from app.audit_log where object_id=$1 order by id",
        [id],
      )
    ).rows;
    expect(audit.map((row) => row.action)).toEqual([
      "artifact.upload_reserved",
      "artifact.upload_finalized",
    ]);
    const { upload } = await (await begin(f)).json();
    expect(upload).toMatchObject({
      id,
      state: "finalized",
      artifactVersionId: id,
      version: 1,
    });
    const { download } = await (
      await call(f.viewer, `artifacts/${id}/download-link`, {
        method: "POST",
        body: {},
      })
    ).json();
    const binary = await handle(
      new Request(new URL(download.url, "https://studio.example.test")),
    );
    expect(Buffer.from(await binary.arrayBuffer())).toEqual(f.bytes);
    expect((await versions(f))[0]).toMatchObject({
      sha256: f.input.sha256,
      bytes: String(f.bytes.length),
      provenance: {
        name: f.input.name,
        source: f.input.source,
        uploadId: id,
        uploadedBy: f.owner,
      },
    });
  });
  it("binds idempotency to every input field and never adopts a foreign project family", async () => {
    const f = await fixture(),
      foreign = await fixture();
    const upload = await reserve(f);
    for (const changed of [
      { sha256: "a".repeat(64) },
      { rights: "unknown" },
      { source: "Anden kilde" },
      { name: "anden.bin" },
      { mime: "text/plain" },
      { bytes: 1 },
    ]) {
      const response = await begin(f, changed);
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    }
    await put(f, upload.id);
    await finish(f, upload.id);
    expect(
      (await begin(foreign, { artifactId: upload.artifact_id })).status,
    ).toBe(404);
    const second = await begin(f, {
      idempotencyKey: randomUUID(),
      artifactId: upload.artifact_id,
    });
    expect(second.status).toBe(202);
    expect((await second.json()).upload.version).toBe(2);
    expect(await versions(f)).toHaveLength(1);
  });
  it("serializes quota reservations and counts committed, pending and legacy insertions once", async () => {
    const f = await fixture(60);
    await admin.query(
      "update app.workspace_budgets set object_limit_bytes=100 where workspace_id=$1",
      [f.workspace.id],
    );
    const both = await Promise.all([
      begin(f),
      begin(f, { idempotencyKey: randomUUID() }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([202, 429]);
    const { upload } = await both.find((r) => r.status === 202)!.json();
    await put(f, upload.id);
    expect((await finish(f, upload.id)).status).toBe(200);
    expect((await begin(f, { idempotencyKey: randomUUID() })).status).toBe(429);
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query(
          "insert into app.artifact_versions(workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status) values($1,$2,$3,1,$4,'text/plain',41,$5,'{}','owned')",
          [
            f.workspace.id,
            f.project.id,
            randomUUID(),
            "a".repeat(64),
            `${f.workspace.id}/${f.project.id}/legacy`,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" });
    expect(await versions(f)).toHaveLength(1);
  });
  it("authorizes before filesystem I/O, including viewer, foreign tenant, revoked member and wrong app", async () => {
    const f = await fixture(),
      upload = await reserve(f);
    let reads = 0,
      writes = 0;
    const guarded: PrivateObjectStore = {
      readVerified: async (d) => {
        reads++;
        return store.readVerified(d);
      },
      putVerified: async (d, b) => {
        writes++;
        return store.putVerified(d, b);
      },
    };
    const h = createBackendHandler({
      ...config,
      storage: { store: guarded, signer },
    });
    expect((await begin(f, {}, f.viewer)).status).toBe(403);
    for (const [user, status] of [
      [f.viewer, 403],
      [randomUUID(), 404],
    ] as const) {
      expect(
        (
          await call(user, `uploads/${upload.id}/content`, {
            method: "PUT",
            bytes: f.bytes,
            handler: h,
          })
        ).status,
      ).toBe(status);
      expect(
        (
          await call(user, `uploads/${upload.id}/finalize`, {
            method: "POST",
            body: {},
            handler: h,
          })
        ).status,
      ).toBe(status);
    }
    expect(
      (
        await call(f.owner, `uploads/${upload.id}`, {
          handler: createBackendHandler({ ...config, app: "director" }),
        })
      ).status,
    ).toBe(404);
    await admin.query(
      "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
      [f.workspace.id, f.editor],
    );
    expect(
      (
        await call(f.editor, `uploads/${upload.id}/content`, {
          method: "PUT",
          bytes: f.bytes,
          handler: h,
        })
      ).status,
    ).toBe(404);
    expect({ reads, writes }).toEqual({ reads: 0, writes: 0 });
  });
  it("rejects malformed bytes without publishing metadata and permits a corrected retry", async () => {
    const f = await fixture(32),
      upload = await reserve(f);
    for (const [bytes, status] of [
      [randomBytes(32), 409],
      [randomBytes(33), 413],
      [randomBytes(31), 409],
    ] as const) {
      expect((await put(f, upload.id, { bytes })).status).toBe(status);
    }
    expect(
      (await put(f, upload.id, { headers: { "content-encoding": "gzip" } }))
        .status,
    ).toBe(415);
    expect(
      (
        await put(f, upload.id, {
          headers: { "content-range": "bytes 0-31/32" },
        })
      ).status,
    ).toBe(415);
    expect(
      (await put(f, upload.id, { headers: { "content-length": "31" } })).status,
    ).toBe(409);
    expect((await finish(f, upload.id)).status).toBe(404);
    expect(await versions(f)).toHaveLength(0);
    expect((await put(f, upload.id)).status).toBe(200);
    expect((await finish(f, upload.id)).status).toBe(200);
  });
  it("supports empty files and validates the bounded descriptor before any reservation", async () => {
    const f = await fixture(0),
      upload = await reserve(f);
    expect((await put(f, upload.id)).status).toBe(200);
    expect((await finish(f, upload.id)).status).toBe(200);
    for (const change of [
      { bytes: 10_000_001 },
      { bytes: -1 },
      { bytes: 1.5 },
      { source: " " },
      { mime: "text/html\r\nX:bad" },
      { storageKey: "../../public" },
      { rights: "guessed" },
    ]) {
      expect(
        (await begin(f, { idempotencyKey: randomUUID(), ...change })).status,
      ).toBe(400);
    }
    const rows = (
      await admin.query(
        "select * from app.artifact_uploads where project_id=$1",
        [f.project.id],
      )
    ).rows;
    expect(rows).toHaveLength(1);
  });
  it("cancels an interrupted request stream while keeping the reservation usable", async () => {
    const f = await fixture(100),
      upload = await reserve(f),
      controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(f.bytes.subarray(0, 50));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(
      `https://studio.example.test/api/backend/uploads/${upload.id}/content`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${await jwt(f.owner)}`,
          "content-type": "application/octet-stream",
        },
        body,
        signal: controller.signal,
        duplex: "half",
      } as RequestInit,
    );
    const pending = handle(request);
    setTimeout(() => controller.abort(), 30);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(cancelled).toBe(true);
    expect(await versions(f)).toHaveLength(0);
    expect((await put(f, upload.id)).status).toBe(200);
    expect((await finish(f, upload.id)).status).toBe(200);
  });
  it("rejects a descriptor above the selected adapter ceiling before reserving quota", async () => {
    const f = await fixture(200);
    const h = createBackendHandler({
      ...config,
      storage: {
        signer,
        store: new LocalPrivateObjectStore(join(root, "small-adapter"), 100),
      },
    });
    const r = await call(f.owner, `projects/${f.project.id}/uploads`, {
      method: "POST",
      body: f.input,
      handler: h,
    });
    expect(r.status).toBe(413);
    expect(
      (
        await admin.query(
          "select * from app.artifact_uploads where project_id=$1",
          [f.project.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("survives archive after byte publication without exposing a partial version", async () => {
    const f = await fixture(),
      upload = await reserve(f);
    const h = createBackendHandler({
      ...config,
      storage: {
        signer,
        store: {
          readVerified: (d) => store.readVerified(d),
          putVerified: async (d, b) => {
            const written = await store.putVerified(d, b);
            await withTrustedUser(pool, f.owner, (c) =>
              archiveProject(c, f.project.id, "studio", 1, true),
            );
            return written;
          },
        },
      },
    });
    expect((await put(f, upload.id, { handler: h })).status).toBe(409);
    expect(await versions(f)).toHaveLength(0);
    expect((await finish(f, upload.id)).status).toBe(409);
    expect(await store.readVerified(descriptor(f, upload.id))).toEqual(f.bytes);
    await withTrustedUser(pool, f.owner, (c) =>
      archiveProject(c, f.project.id, "studio", 2, false),
    );
    expect((await finish(f, upload.id)).status).toBe(200);
    await withTrustedUser(pool, f.owner, (c) =>
      archiveProject(c, f.project.id, "studio", 3, true),
    );
    expect((await finish(f, upload.id)).status).toBe(200);
  });
  it("rechecks membership after file verification before the final database commit", async () => {
    const f = await fixture(),
      upload = await reserve(f);
    await put(f, upload.id);
    const h = createBackendHandler({
      ...config,
      storage: {
        signer,
        store: {
          putVerified: (d, b) => store.putVerified(d, b),
          readVerified: async (d) => {
            const bytes = await store.readVerified(d);
            await admin.query(
              "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
              [f.workspace.id, f.editor],
            );
            return bytes;
          },
        },
      },
    });
    const response = await call(f.editor, `uploads/${upload.id}/finalize`, {
      method: "POST",
      body: {},
      handler: h,
    });
    expect(response.status).toBe(404);
    expect(await versions(f)).toHaveLength(0);
    expect((await finish(f, upload.id)).status).toBe(200);
  });
  it("recovers a genuinely committed transaction whose acknowledgement was lost", async () => {
    const f = await fixture(),
      upload = await reserve(f);
    await put(f, upload.id);
    let lost = false;
    const uncertainPool = {
      query: pool.query.bind(pool),
      connect: async () => {
        const client = await pool.connect();
        let finishing = false;
        return {
          query: async (text: string, values?: unknown[]) => {
            const result = await client.query(text, values);
            if (text.includes("app.finalize_upload")) finishing = true;
            if (text === "commit" && finishing && !lost) {
              lost = true;
              throw new Error(
                "Synthetic transport failure after actual PostgreSQL COMMIT",
              );
            }
            return result;
          },
          release: () => client.release(),
        } as PoolClient;
      },
    } as unknown as Pool;
    const h = createBackendHandler({ ...config, pool: uncertainPool });
    expect((await finish(f, upload.id, { handler: h })).status).toBe(503);
    expect(lost).toBe(true);
    expect(await versions(f)).toHaveLength(1);
    expect(
      await readFile(join(root, objectKey(descriptor(f, upload.id)))),
    ).toEqual(f.bytes);
    const retried = await finish(f, upload.id);
    expect(retried.status).toBe(200);
    expect((await retried.json()).upload.id).toBe(upload.id);
    expect(await versions(f)).toHaveLength(1);
  });
  it("refuses missing/corrupt private bytes while preserving the durable reservation", async () => {
    const f = await fixture(),
      upload = await reserve(f);
    await put(f, upload.id);
    const path = join(root, objectKey(descriptor(f, upload.id)));
    await writeFile(path, randomBytes(f.bytes.length));
    expect((await finish(f, upload.id)).status).toBe(409);
    expect(await versions(f)).toHaveLength(0);
    expect((await put(f, upload.id)).status).toBe(409);
    expect(
      (await (await call(f.owner, `uploads/${upload.id}`)).json()).upload.state,
    ).toBe("pending");
  });
  it("bounds open reservations and keeps unfinished uploads discoverable after a client restart", async () => {
    const f = await fixture(0);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await begin(f, { idempotencyKey: `pending-${i}` });
      expect(r.status).toBe(202);
      ids.push((await r.json()).upload.id);
    }
    const excess = await begin(f, { idempotencyKey: "overflow" });
    expect(excess.status).toBe(429);
    expect((await excess.json()).error.code).toBe("UPLOAD_LIMIT");
    const rows = await (
      await call(f.owner, `projects/${f.project.id}/uploads`)
    ).json();
    expect(rows.uploads).toHaveLength(20);
    const h = createBackendHandler(config);
    expect((await put(f, ids[0], { handler: h })).status).toBe(200);
    expect((await finish(f, ids[0], { handler: h })).status).toBe(200);
    expect((await begin(f, { idempotencyKey: "overflow" })).status).toBe(202);
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query(
          "update app.artifact_uploads set state='finalized',finalized_at=now() where id=$1",
          [ids[1]],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
