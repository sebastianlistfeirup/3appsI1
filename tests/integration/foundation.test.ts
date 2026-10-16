import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Pool,
  withTrustedUser,
  withWorker,
  transaction,
  createWorkspace,
  createProject,
  getProject,
  updateProject,
  requestJob,
  getJob,
  getArtifact,
  claimJob,
  transitionJob,
  finishJob,
  heartbeat,
  hashJson,
  type RequestJob,
} from "../../packages/database/src/index";

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "Run pnpm test:db to provision an isolated PostgreSQL database.",
  );
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 12,
});
afterAll(() => pool.end());
async function fixture(budget = 100) {
  const owner = randomUUID();
  return withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Isolationstest");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Et rigtigt projekt",
      document: { version: 1 },
    });
    await c.query("select app.set_budget($1,$2,$2)", [workspace.id, budget]);
    return { owner, workspace, project };
  });
}
function jobInput(
  f: Awaited<ReturnType<typeof fixture>>,
  maximumMinor = 70,
): RequestJob {
  return {
    workspaceId: f.workspace.id,
    projectId: f.project.id,
    appKey: "studio",
    kind: "manual.validate",
    idempotencyKey: randomUUID(),
    input: { prompt: "syntetisk fixture" },
    maximumMinor,
  };
}
async function start(
  f: Awaited<ReturnType<typeof fixture>>,
  maximumMinor = 70,
) {
  const input = jobInput(f, maximumMinor);
  const job = await withTrustedUser(pool, f.owner, (c) => requestJob(c, input));
  return { job, input };
}
async function readyToFinish(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
) {
  const running = await withWorker(pool, f.workspace.id, (c) =>
    claimJob(c, id),
  );
  expect(running).toBeTruthy();
  return withWorker(pool, f.workspace.id, (c) =>
    transitionJob(c, running!, "validating", {
      leaseToken: running!.lease_token!,
    }),
  );
}

describe("Real PostgreSQL tenant boundaries and durable budgets", () => {
  it("uses non-owning runtime roles with FORCE RLS on every application table", async () => {
    const roles = (
      await pool.query(
        "select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname in ('authenticated','tre_worker')",
      )
    ).rows;
    expect(roles).toHaveLength(2);
    for (const r of roles)
      expect(r).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcanlogin: false,
      });
    const tables = (
      await pool.query(
        "select c.relrowsecurity,c.relforcerowsecurity,r.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='app' and c.relkind='r'",
      )
    ).rows;
    expect(tables.length).toBeGreaterThan(10);
    for (const t of tables) {
      expect(t.relrowsecurity).toBe(true);
      expect(t.relforcerowsecurity).toBe(true);
      expect(["authenticated", "tre_worker"]).not.toContain(t.rolname);
    }
  });
  it("hides foreign project, job, version and storage key behind 404s", async () => {
    const a = await fixture(),
      b = await fixture();
    const { job } = await start(a);
    const asset = await withTrustedUser(
      pool,
      a.owner,
      async (c) =>
        (
          await c.query(
            "insert into app.artifact_versions(workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status) values($1,$2,$3,1,$4,'text/plain',4,$5,'{}','owned') returning id",
            [
              a.workspace.id,
              a.project.id,
              randomUUID(),
              "a".repeat(64),
              `${a.workspace.id}/${a.project.id}/${randomUUID()}/v1`,
            ],
          )
        ).rows[0],
    );
    await expect(
      withTrustedUser(pool, b.owner, (c) =>
        getProject(c, a.project.id, "studio"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withTrustedUser(pool, b.owner, (c) => getJob(c, job.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withTrustedUser(pool, b.owner, (c) => getArtifact(c, asset.id)),
    ).rejects.toMatchObject({ status: 404 });
    const visible = await withTrustedUser(
      pool,
      b.owner,
      async (c) => (await c.query("select * from app.jobs")).rows,
    );
    expect(visible).toEqual([]);
  });
  it("separates products and rejects cross-workspace foreign keys", async () => {
    const a = await fixture(),
      b = await fixture();
    await expect(
      withTrustedUser(pool, a.owner, (c) =>
        getProject(c, a.project.id, "flowlab"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withTrustedUser(pool, a.owner, (c) =>
        requestJob(c, { ...jobInput(a), appKey: "director" }),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(
      withTrustedUser(pool, a.owner, (c) =>
        c.query(
          "insert into app.artifact_versions(workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status) values($1,$2,$3,1,$4,'text/plain',4,$5,'{}','owned')",
          [
            a.workspace.id,
            b.project.id,
            randomUUID(),
            "a".repeat(64),
            `${a.workspace.id}/${b.project.id}/v1`,
          ],
        ),
      ),
    ).rejects.toBeTruthy();
  });
  it("allows viewer reads but rejects project writes, job requests and role escalation", async () => {
    const f = await fixture(),
      viewer = randomUUID();
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'viewer')",
        [f.workspace.id, viewer],
      ),
    );
    expect(
      (
        await withTrustedUser(pool, viewer, (c) =>
          getProject(c, f.project.id, "studio"),
        )
      ).name,
    ).toBe(f.project.name);
    await expect(
      withTrustedUser(pool, viewer, (c) =>
        updateProject(c, f.project.id, "studio", 1, {
          name: "Overtagelse",
          document: {},
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withTrustedUser(pool, viewer, (c) =>
        createProject(c, {
          workspaceId: f.workspace.id,
          appKey: "director",
          name: "Nej",
        }),
      ),
    ).rejects.toBeTruthy();
    await expect(
      withTrustedUser(pool, viewer, (c) => requestJob(c, jobInput(f))),
    ).rejects.toMatchObject({ status: 403 });
    const changed = await withTrustedUser(pool, viewer, (c) =>
      c.query(
        "update app.memberships set role='owner' where user_id=$1 returning *",
        [viewer],
      ),
    );
    expect(changed.rowCount).toBe(0);
  });
  it("revokes membership immediately and preserves the final owner", async () => {
    const f = await fixture(),
      editor = randomUUID();
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'editor')",
        [f.workspace.id, editor],
      ),
    );
    expect(
      (
        await withTrustedUser(pool, editor, (c) =>
          getProject(c, f.project.id, "studio"),
        )
      ).id,
    ).toBe(f.project.id);
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
        [f.workspace.id, editor],
      ),
    );
    await expect(
      withTrustedUser(pool, editor, (c) =>
        getProject(c, f.project.id, "studio"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query(
          "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
          [f.workspace.id, f.owner],
        ),
      ),
    ).rejects.toMatchObject({ code: "LAST_OWNER" });
  });
  it("commits exactly one concurrent revision and records its audit event", async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled(
      ["Første", "Andet"].map((name) =>
        withTrustedUser(pool, f.owner, (c) =>
          updateProject(c, f.project.id, "studio", 1, {
            name,
            document: { name },
          }),
        ),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const project = await withTrustedUser(pool, f.owner, (c) =>
      getProject(c, f.project.id, "studio"),
    );
    expect(Number(project.revision)).toBe(2);
    const events = await withTrustedUser(
      pool,
      f.owner,
      async (c) =>
        (
          await c.query(
            "select action,before_revision,after_revision from app.audit_log where object_id=$1",
            [f.project.id],
          )
        ).rows,
    );
    expect(events).toEqual([
      { action: "project.updated", before_revision: "1", after_revision: "2" },
    ]);
  });
  it("reserves once for duplicate requests and rejects changed input even with a forged matching hash", async () => {
    const f = await fixture();
    const input = jobInput(f);
    const jobs = await Promise.all(
      [1, 2].map(() =>
        withTrustedUser(pool, f.owner, (c) => requestJob(c, input)),
      ),
    );
    expect(jobs[0]!.id).toBe(jobs[1]!.id);
    const counts = (
      await pool.query(
        "select (select count(*) from app.budget_reservations where workspace_id=$1)::int reservations,(select count(*) from app.job_outbox where workspace_id=$1)::int outbox",
        [f.workspace.id],
      )
    ).rows[0];
    expect(counts).toEqual({ reservations: 1, outbox: 1 });
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        requestJob(c, { ...input, input: { changed: true } }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query("select * from app.request_job($1,$2,$3,$4,$5,$6,$7,$8)", [
          input.workspaceId,
          input.projectId,
          input.appKey,
          input.kind,
          input.idempotencyKey,
          { changed: true },
          jobs[0]!.input_hash,
          input.maximumMinor,
        ]),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("serializes two budget requests and never over-reserves", async () => {
    const f = await fixture(100);
    const outcomes = await Promise.allSettled(
      [jobInput(f, 70), jobInput(f, 70)].map((i) =>
        withTrustedUser(pool, f.owner, (c) => requestJob(c, i)),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(
      (o) => o.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(
      Number(
        (
          await pool.query(
            "select sum(reserved_minor) amount from app.budget_reservations where workspace_id=$1 and state='held'",
            [f.workspace.id],
          )
        ).rows[0].amount,
      ),
    ).toBe(70);
  });
  it("settles one immutable result and one actual usage event, releasing the unused reservation", async () => {
    const f = await fixture(100),
      { job } = await start(f, 70);
    const validating = await readyToFinish(f, job.id);
    const manifest = { files: [{ sha256: "a".repeat(64) }] };
    const done = await withWorker(pool, f.workspace.id, (c) =>
      finishJob(c, job.id, validating.lease_token!, manifest, 40),
    );
    expect(done.state).toBe("succeeded");
    expect(done.result_version).toBeTruthy();
    expect(
      (
        await withWorker(pool, f.workspace.id, (c) =>
          finishJob(c, job.id, validating.lease_token!, manifest, 40),
        )
      ).result_version,
    ).toBe(done.result_version);
    await expect(
      withWorker(pool, f.workspace.id, (c) =>
        finishJob(c, job.id, validating.lease_token!, { changed: true }, 40),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const usage = (
      await pool.query(
        "select amount_minor from app.usage_events where job_id=$1",
        [job.id],
      )
    ).rows;
    expect(usage).toEqual([{ amount_minor: "40" }]);
    await expect(
      withTrustedUser(pool, f.owner, (c) => requestJob(c, jobInput(f, 61))),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(
      (
        await withTrustedUser(pool, f.owner, (c) =>
          requestJob(c, jobInput(f, 60)),
        )
      ).state,
    ).toBe("queued");
    await expect(
      pool.query("update app.job_results set manifest='{}' where job_id=$1", [
        job.id,
      ]),
    ).rejects.toThrow("IMMUTABLE_VERSION");
    await expect(
      pool.query("delete from app.usage_events where job_id=$1", [job.id]),
    ).rejects.toThrow("IMMUTABLE_VERSION");
  });
  it("keeps an uncertain expired lease reserved and requires reconciliation before any second submission", async () => {
    const f = await fixture(),
      { job } = await start(f);
    const running = await withWorker(pool, f.workspace.id, (c) =>
      claimJob(c, job.id),
    );
    expect(
      await withWorker(pool, f.workspace.id, (c) =>
        heartbeat(c, job.id, randomUUID()),
      ),
    ).toBe(false);
    await pool.query(
      "update app.jobs set lease_until=now()-interval '1 second' where id=$1",
      [job.id],
    );
    expect(
      await withWorker(pool, f.workspace.id, (c) => claimJob(c, job.id)),
    ).toBeNull();
    expect(
      await withWorker(pool, f.workspace.id, (c) => claimJob(c, job.id)),
    ).toBeNull();
    const status = await withTrustedUser(pool, f.owner, (c) =>
      getJob(c, job.id),
    );
    expect(status).toMatchObject({
      state: "reconcile_required",
      attempt: 1,
      lease_token: running!.lease_token,
    });
    expect(
      (
        await pool.query(
          "select state from app.budget_reservations where job_id=$1",
          [job.id],
        )
      ).rows[0].state,
    ).toBe("held");
    await expect(
      withTrustedUser(pool, f.owner, (c) => requestJob(c, jobInput(f, 31))),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("enforces worker tenant context, fails closed without context and rejects input mutation and illegal transitions", async () => {
    const a = await fixture(),
      b = await fixture(),
      { job } = await start(a);
    expect(
      await withWorker(pool, b.workspace.id, (c) => claimJob(c, job.id)),
    ).toBeNull();
    const noContext = await transaction(pool, async (c) => {
      await c.query("set local role tre_worker");
      return (await c.query("select id from app.jobs")).rows;
    });
    expect(noContext).toEqual([]);
    await expect(
      withWorker(pool, a.workspace.id, (c) =>
        c.query("update app.jobs set input='{}' where id=$1", [job.id]),
      ),
    ).rejects.toThrow("IMMUTABLE_JOB_INPUT");
    await expect(
      withWorker(pool, a.workspace.id, (c) =>
        c.query(
          "update app.jobs set state='validating',revision=revision+1 where id=$1",
          [job.id],
        ),
      ),
    ).rejects.toThrow("ILLEGAL_JOB_TRANSITION");
    const claims = await Promise.all(
      [1, 2].map(() =>
        withWorker(pool, a.workspace.id, (c) => claimJob(c, job.id)),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("rolls back every reservation, outbox item and job when a request transaction fails", async () => {
    const f = await fixture();
    await expect(
      withTrustedUser(pool, f.owner, async (c) => {
        await requestJob(c, jobInput(f));
        throw new Error("simulated response preparation failure");
      }),
    ).rejects.toThrow("simulated");
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.jobs where workspace_id=$1",
          [f.workspace.id],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.budget_reservations where workspace_id=$1",
          [f.workspace.id],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.job_outbox where workspace_id=$1",
          [f.workspace.id],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("hashes semantically equal canonical object inputs identically", () => {
    expect(hashJson({ z: 1, a: { second: true, first: 2 } })).toBe(
      hashJson({ a: { first: 2, second: true }, z: 1 }),
    );
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]));
  });
});
