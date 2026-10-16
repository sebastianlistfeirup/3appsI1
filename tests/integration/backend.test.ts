import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
import {
  createBackendHandler,
  readJson,
} from "../../packages/backend/src/index";
import type { AuthConfig } from "../../packages/auth/src/index";
import {
  Pool,
  assertRuntimePrincipal,
  withTrustedUser,
  withWorker,
  archiveProject,
  requestJob,
  claimJob,
} from "../../packages/database/src/index";
import { processJob } from "../../packages/jobs/src/processor";

const admin = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 10,
});
const login = `web_${randomUUID().replaceAll("-", "")}`;
const password = randomUUID();
let pool: Pool, auth: AuthConfig, privateKey: CryptoKey;
let handle: ReturnType<typeof createBackendHandler>;
const documentSchema = z
  .object({ version: z.literal(1), value: z.string().max(1000) })
  .strict();
const documentConfig = {
  app: "studio" as const,
  validateDocument: (value: unknown) => documentSchema.parse(value),
  createDocument: (name: string) => ({ version: 1, value: name }),
};
beforeAll(async () => {
  await admin.query(
    `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'; grant authenticated to ${login}`,
  );
  const connection = new URL(process.env.TEST_DATABASE_URL!);
  connection.username = login;
  connection.password = password;
  pool = new Pool({ connectionString: connection.toString(), max: 4 });
  const keys = await generateKeyPair("ES256");
  privateKey = keys.privateKey;
  auth = {
    issuer: "https://identity.example.test/auth/v1",
    audience: "authenticated",
    keys: createLocalJWKSet({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: "api-fixture",
          alg: "ES256",
        },
      ],
    }),
  };
  handle = createBackendHandler({ pool, auth, ...documentConfig });
});
afterAll(async () => {
  await pool?.end();
  await admin.end();
});
async function token(user: string, payload: Record<string, unknown> = {}) {
  return new SignJWT({ role: "authenticated", ...payload })
    .setProtectedHeader({ alg: "ES256", kid: "api-fixture" })
    .setIssuer(auth.issuer)
    .setAudience(auth.audience)
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}
async function request(
  user: string,
  path: string,
  method = "GET",
  body?: unknown,
  handler = handle,
) {
  return handler(
    new Request(`https://studio.example.test/api/backend/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await token(user)}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function fixture() {
  const owner = randomUUID();
  const created = await request(owner, "workspaces", "POST", {
    name: "Syntetisk API-test",
  });
  expect(created.status).toBe(201);
  const { workspace } = await created.json();
  const response = await request(owner, "projects", "POST", {
    workspaceId: workspace.id,
    name: "Mit projekt",
  });
  expect(response.status).toBe(201);
  const { project } = await response.json();
  return { owner, workspace, project };
}
function jobInput() {
  return {
    idempotencyKey: randomUUID(),
    kind: "manual.validate",
    input: { text: '{"ok":true}', mime: "application/json" },
  };
}

describe("HTTP boundary with signed identities and restricted PostgreSQL login", () => {
  it("accepts a dedicated principal and refuses administrator, privileged inheritance and mixed roles", async () => {
    await expect(
      assertRuntimePrincipal(pool, "authenticated"),
    ).resolves.toBeUndefined();
    await expect(
      assertRuntimePrincipal(admin, "authenticated"),
    ).rejects.toThrow("Unsafe runtime");
    const privileged = `priv_${randomUUID().replaceAll("-", "")}`;
    await admin.query(
      `create role ${privileged} nologin createrole; grant ${privileged} to ${login}`,
    );
    try {
      await expect(
        assertRuntimePrincipal(pool, "authenticated"),
      ).rejects.toThrow("Unsafe runtime");
    } finally {
      await admin.query(`revoke ${privileged} from ${login}`);
    }
    await admin.query(`grant tre_worker to ${login}`);
    try {
      await expect(
        assertRuntimePrincipal(pool, "authenticated"),
      ).rejects.toThrow("Unsafe runtime");
    } finally {
      await admin.query(`revoke tre_worker from ${login}`);
    }
  });
  it("requires a verified end-user token, never a body-supplied identity", async () => {
    const absent = await handle(
      new Request("https://studio.example.test/api/backend/workspaces"),
    );
    expect(absent.status).toBe(401);
    const forged = await handle(
      new Request("https://studio.example.test/api/backend/workspaces", {
        headers: {
          authorization: `Bearer ${await token(randomUUID(), { role: "service_role" })}`,
        },
      }),
    );
    expect(forged.status).toBe(401);
    const supplied = await request(randomUUID(), "workspaces", "POST", {
      name: "Fixture",
      userId: randomUUID(),
    });
    expect(supplied.status).toBe(400);
  });
  it("creates, lists and updates only the owner’s workspace/project with explicit revision conflicts", async () => {
    const f = await fixture();
    const list = await request(
      f.owner,
      `projects?workspaceId=${f.workspace.id}`,
    );
    expect(
      (await list.json()).projects.map((p: { id: string }) => p.id),
    ).toEqual([f.project.id]);
    const update = {
      expectedRevision: 1,
      name: "Ny version",
      document: { version: 1, value: "Ny tekst" },
    };
    const responses = await Promise.all([
      request(f.owner, `projects/${f.project.id}`, "PATCH", update),
      request(f.owner, `projects/${f.project.id}`, "PATCH", update),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const loaded = await request(f.owner, `projects/${f.project.id}`);
    expect((await loaded.json()).project).toMatchObject({
      name: "Ny version",
      revision: "2",
    });
    expect(loaded.headers.get("cache-control")).toBe("no-store");
    expect(loaded.headers.get("x-request-id")).toMatch(/^[a-f0-9-]+$/);
  });
  it("returns indistinguishable 404s for foreign IDs and separates applications", async () => {
    const f = await fixture(),
      outsider = randomUUID();
    const existing = await request(outsider, `projects/${f.project.id}`),
      absent = await request(outsider, `projects/${randomUUID()}`);
    expect(existing.status).toBe(404);
    expect(absent.status).toBe(404);
    expect((await existing.json()).error.code).toBe(
      (await absent.json()).error.code,
    );
    const foreign = createBackendHandler({
      pool,
      auth,
      ...documentConfig,
      app: "flowlab",
    });
    expect(
      (
        await request(
          f.owner,
          `projects/${f.project.id}`,
          "GET",
          undefined,
          foreign,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await (
          await request(outsider, `projects?workspaceId=${f.workspace.id}`)
        ).json()
      ).projects,
    ).toEqual([]);
  });
  it("allows viewer reads but refuses edits and job creation", async () => {
    const f = await fixture(),
      viewer = randomUUID();
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'viewer')",
        [f.workspace.id, viewer],
      ),
    );
    expect((await request(viewer, `projects/${f.project.id}`)).status).toBe(
      200,
    );
    expect(
      (
        await request(viewer, `projects/${f.project.id}`, "PATCH", {
          expectedRevision: 1,
          name: "Forbidden",
          document: f.project.document,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          viewer,
          `projects/${f.project.id}/jobs`,
          "POST",
          jobInput(),
        )
      ).status,
    ).toBe(403);
  });
  it("deduplicates free validation, exposes its actual result and hides worker leases", async () => {
    const f = await fixture(),
      input = jobInput();
    const first = await request(
      f.owner,
      `projects/${f.project.id}/jobs`,
      "POST",
      input,
    );
    expect(first.status).toBe(202);
    const { job } = await first.json();
    expect(job).not.toHaveProperty("lease_token");
    expect(job).not.toHaveProperty("provider_ref");
    const again = await request(
      f.owner,
      `projects/${f.project.id}/jobs`,
      "POST",
      input,
    );
    expect((await again.json()).job.id).toBe(job.id);
    const changed = await request(
      f.owner,
      `projects/${f.project.id}/jobs`,
      "POST",
      { ...input, input: { ...input.input, text: "{}" } },
    );
    expect(changed.status).toBe(409);
    expect((await request(f.owner, `jobs/${job.id}/result`)).status).toBe(404);
    await processJob(admin, { workspaceId: f.workspace.id, jobId: job.id });
    const result = await request(f.owner, `jobs/${job.id}/result`);
    expect(result.status).toBe(200);
    expect((await result.json()).result.manifest).toMatchObject({
      checks: { jsonSyntax: true, hash: true },
      codeExecuted: false,
      externalBuildVerified: false,
    });
    expect((await request(randomUUID(), `jobs/${job.id}/result`)).status).toBe(
      404,
    );
    const jobs = await request(f.owner, `projects/${f.project.id}/jobs`);
    expect((await jobs.json()).jobs[0]).not.toHaveProperty("lease_token");
  });
  it("rejects client-controlled cost, unsupported adapters and invalid domain documents", async () => {
    const f = await fixture();
    for (const input of [
      { ...jobInput(), maximumMinor: 0 },
      { ...jobInput(), kind: "paid.generate" },
    ])
      expect(
        (await request(f.owner, `projects/${f.project.id}/jobs`, "POST", input))
          .status,
      ).toBe(400);
    expect(
      (
        await request(f.owner, `projects/${f.project.id}`, "PATCH", {
          expectedRevision: 1,
          name: "Bad",
          document: { version: 500 },
        })
      ).status,
    ).toBe(400);
  });
  it("cancels queued jobs through the same scoped and versioned boundary", async () => {
    const f = await fixture();
    const { job } = await (
      await request(
        f.owner,
        `projects/${f.project.id}/jobs`,
        "POST",
        jobInput(),
      )
    ).json();
    expect(
      (
        await request(f.owner, `jobs/${job.id}/cancel`, "POST", {
          expectedRevision: 2,
        })
      ).status,
    ).toBe(409);
    const result = await request(f.owner, `jobs/${job.id}/cancel`, "POST", {
      expectedRevision: 1,
    });
    expect((await result.json()).job.state).toBe("cancelled");
  });
  it("refuses cross-origin bodies and hides infrastructure errors and credentials", async () => {
    const denied = await handle(
      new Request("https://studio.example.test/api/backend/workspaces", {
        headers: {
          origin: "https://foreign.example.test",
          authorization: `Bearer ${await token(randomUUID())}`,
        },
      }),
    );
    expect(denied.status).toBe(403);
    const unsafe = createBackendHandler({
      pool: admin,
      auth,
      ...documentConfig,
    });
    const response = await request(
      randomUUID(),
      "workspaces",
      "GET",
      undefined,
      unsafe,
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toMatch(/postgres|principal|password|tre_test/i);
  });
  it("bounds JSON bytes without trusting Content-Length and rejects invalid UTF-8 or MIME", async () => {
    await expect(
      readJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '"oversized"',
        }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: Uint8Array.of(34, 255, 34),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "content-type": "application/json-malformed" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    const rejected = await request(randomUUID(), "workspaces", "POST", {
      name: "a".repeat(3000),
    });
    expect(rejected.status).toBe(413);
  });
});

describe("Archive ordering and reservations under concurrent transactions", () => {
  it("atomically archives, releases queued reservations, requests active cancellation, and supports guarded restore", async () => {
    const f = await fixture();
    await withTrustedUser(pool, f.owner, (c) =>
      c.query("select app.set_budget($1,100,100)", [f.workspace.id]),
    );
    const input = {
      workspaceId: f.workspace.id,
      projectId: f.project.id,
      appKey: "studio" as const,
      kind: "manual.validate",
      maximumMinor: 20,
      input: { text: "synthetic", mime: "text/plain" },
    };
    const queued = await withTrustedUser(pool, f.owner, (c) =>
      requestJob(c, { ...input, idempotencyKey: randomUUID() }),
    );
    const active = await withTrustedUser(pool, f.owner, (c) =>
      requestJob(c, { ...input, idempotencyKey: randomUUID() }),
    );
    await withWorker(admin, f.workspace.id, (c) => claimJob(c, active.id));
    const archived = await request(
      f.owner,
      `projects/${f.project.id}/archive`,
      "POST",
      { expectedRevision: 1, archived: true },
    );
    expect(archived.status).toBe(200);
    const rows = (
      await admin.query(
        "select j.id,j.state,j.cancel_requested,b.state as budget from app.jobs j join app.budget_reservations b on b.job_id=j.id where j.project_id=$1",
        [f.project.id],
      )
    ).rows;
    expect(rows.find((r) => r.id === queued.id)).toMatchObject({
      state: "cancelled",
      budget: "released",
    });
    expect(rows.find((r) => r.id === active.id)).toMatchObject({
      state: "running",
      cancel_requested: true,
      budget: "held",
    });
    expect(
      (
        await request(
          f.owner,
          `projects/${f.project.id}/jobs`,
          "POST",
          jobInput(),
        )
      ).status,
    ).toBe(404);
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query(
          "update app.projects set archived_at=null,revision=revision+1 where id=$1",
          [f.project.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query(
          "update app.projects set name='changed',revision=revision+1 where id=$1",
          [f.project.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
    expect(
      (
        await request(f.owner, `projects/${f.project.id}/archive`, "POST", {
          expectedRevision: 1,
          archived: false,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(f.owner, `projects/${f.project.id}/archive`, "POST", {
          expectedRevision: 2,
          archived: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          f.owner,
          `projects/${f.project.id}/jobs`,
          "POST",
          jobInput(),
        )
      ).status,
    ).toBe(202);
  });
  it("rechecks archival after waiting for the shared budget lock", async () => {
    const f = await fixture();
    let locked!: () => void, release!: () => void;
    const acquired = new Promise<void>((r) => (locked = r)),
      proceed = new Promise<void>((r) => (release = r));
    const archiving = withTrustedUser(pool, f.owner, async (c) => {
      await c.query("select app.set_budget($1,0,0)", [f.workspace.id]);
      locked();
      await proceed;
      return archiveProject(c, f.project.id, "studio", 1, true);
    });
    await Promise.race([
      acquired,
      archiving.then(() => {
        throw new Error("Archive completed before barrier");
      }),
    ]);
    const pending = request(
      f.owner,
      `projects/${f.project.id}/jobs`,
      "POST",
      jobInput(),
    );
    try {
      const deadline = Date.now() + 4000;
      let waiting = false;
      while (Date.now() < deadline) {
        waiting =
          (
            await admin.query(
              "select 1 from pg_stat_activity where usename=$1 and wait_event_type='Lock'",
              [login],
            )
          ).rowCount! > 0;
        if (waiting) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
    }
    await archiving;
    expect((await pending).status).toBe(404);
    expect(
      (
        await admin.query("select 1 from app.jobs where project_id=$1", [
          f.project.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
