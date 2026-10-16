import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Pool,
  withTrustedUser,
  createWorkspace,
  createProject,
  requestJob,
  getJob,
  cancelJob,
  type Json,
} from "../../packages/database/src/index";
import {
  processJob,
  JobFault,
  localHandlers,
  type JobHandler,
  type JobEnvelope,
} from "../../packages/jobs/src/index";
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 10,
});
afterAll(() => pool.end());
async function fixture(
  input: Json = { text: '{"answer":42}', mime: "application/json" },
  kind = "manual.validate",
  cost = 0,
) {
  const owner = randomUUID();
  return withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Processorfixture");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Manuel validering",
    });
    await c.query("select app.set_budget($1,100,100)", [workspace.id]);
    const job = await requestJob(c, {
      workspaceId: workspace.id,
      projectId: project.id,
      appKey: "studio",
      kind,
      idempotencyKey: randomUUID(),
      input,
      maximumMinor: cost,
    });
    return {
      owner,
      workspace,
      job,
      envelope: {
        jobId: job.id,
        workspaceId: workspace.id,
      } satisfies JobEnvelope,
    };
  });
}
async function state(f: Awaited<ReturnType<typeof fixture>>) {
  return withTrustedUser(pool, f.owner, (c) => getJob(c, f.job.id));
}
const handler = (
  run: JobHandler["run"],
  id = "fixture.operation",
  costModel: JobHandler["costModel"] = "free",
) => new Map([[id, { id, costModel, run }]]);
const reservation = async (id: string) =>
  (
    await pool.query(
      "select state,actual_minor from app.budget_reservations where job_id=$1",
      [id],
    )
  ).rows[0];
describe("Worker state machine against PostgreSQL", () => {
  it("validates a manual file, persists a hashed result, and settles zero cost once", async () => {
    const f = await fixture();
    await processJob(pool, f.envelope);
    const done = await state(f);
    expect(done.state).toBe("succeeded");
    const result = (
      await pool.query(
        "select manifest,sha256 from app.job_results where job_id=$1",
        [f.job.id],
      )
    ).rows[0];
    expect(result.manifest).toMatchObject({
      codeExecuted: false,
      externalBuildVerified: false,
      checks: { jsonSyntax: true },
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    await processJob(pool, f.envelope);
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.usage_events where job_id=$1",
          [f.job.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("rejects a mismatched input hash without publishing any result", async () => {
    const f = await fixture({
      text: "unchanged fixture",
      mime: "text/plain",
      expectedSha256: "0".repeat(64),
    });
    await processJob(pool, f.envelope);
    expect((await state(f)).state).toBe("failed");
    expect(await reservation(f.job.id)).toEqual({
      state: "released",
      actual_minor: "0",
    });
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.job_results where job_id=$1",
          [f.job.id],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("runs only one handler for simultaneous queue deliveries", async () => {
    const f = await fixture({}, "fixture.operation");
    let calls = 0;
    const registry = handler(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return { manifest: { ok: true }, actualMinor: 0 };
    });
    await Promise.all([
      processJob(pool, f.envelope, registry),
      processJob(pool, f.envelope, registry),
    ]);
    expect(calls).toBe(1);
    expect((await state(f)).state).toBe("succeeded");
  });
  it("never resubmits an unknown provider outcome and keeps its reservation", async () => {
    const f = await fixture({}, "fixture.operation", 80);
    let calls = 0;
    const registry = handler(async (_input, context) => {
      calls++;
      await context.recordProviderReference("synthetic-provider-job-123");
      throw new Error("connection closed after submit");
    });
    await processJob(pool, f.envelope, registry);
    await processJob(pool, f.envelope, registry);
    expect(calls).toBe(1);
    expect(await state(f)).toMatchObject({
      state: "reconcile_required",
      provider_ref: "synthetic-provider-job-123",
      attempt: 1,
    });
    expect((await reservation(f.job.id)).state).toBe("held");
  });
  it("bounds explicitly safe transient retries to three attempts", async () => {
    const f = await fixture({}, "fixture.operation");
    let calls = 0;
    const registry = handler(async () => {
      calls++;
      throw new JobFault("transient", "Syntetisk 429 før udførelse", true);
    });
    await expect(processJob(pool, f.envelope, registry)).rejects.toThrow(
      "Syntetisk",
    );
    expect((await state(f)).state).toBe("retry_wait");
    await expect(processJob(pool, f.envelope, registry)).rejects.toThrow(
      "Syntetisk",
    );
    await processJob(pool, f.envelope, registry);
    await processJob(pool, f.envelope, registry);
    expect(calls).toBe(3);
    expect(await state(f)).toMatchObject({ state: "failed", attempt: 3 });
    expect((await reservation(f.job.id)).state).toBe("released");
  });
  it("does not start a paid adapter without deployment authorization", async () => {
    const f = await fixture({}, "fixture.paid", 50);
    let called = false;
    await processJob(
      pool,
      f.envelope,
      handler(
        async () => {
          called = true;
          return { manifest: {}, actualMinor: 5 };
        },
        "fixture.paid",
        "metered",
      ),
    );
    expect(called).toBe(false);
    expect((await state(f)).state).toBe("blocked_credentials");
    expect((await reservation(f.job.id)).state).toBe("held");
  });
  it("rejects a deadline that expired before execution", async () => {
    const f = await fixture({}, "fixture.operation");
    await pool.query(
      "update app.jobs set deadline_at=now()-interval '1 minute' where id=$1",
      [f.job.id],
    );
    let called = false;
    await processJob(
      pool,
      f.envelope,
      handler(async () => {
        called = true;
        return { manifest: {}, actualMinor: 0 };
      }),
    );
    expect(called).toBe(false);
    expect((await state(f)).state).toBe("failed");
  });
  it("observes cancellation during work and publishes no completed result", async () => {
    const f = await fixture({}, "fixture.operation");
    let release: () => void = () => {};
    let started: () => void = () => {};
    const signalStarted = new Promise<void>((r) => (started = r));
    const gate = new Promise<void>((r) => (release = r));
    const registry = handler(async () => {
      started();
      await gate;
      return { manifest: { ok: true }, actualMinor: 0 };
    });
    const task = processJob(pool, f.envelope, registry);
    await signalStarted;
    const running = await state(f);
    await withTrustedUser(pool, f.owner, (c) =>
      cancelJob(c, f.job.id, Number(running.revision)),
    );
    release();
    await task;
    expect((await state(f)).state).toBe("cancelled");
    expect((await reservation(f.job.id)).state).toBe("released");
    expect(
      (
        await pool.query(
          "select count(*)::int count from app.job_results where job_id=$1",
          [f.job.id],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("heartbeats a long-running operation and aborts after lease loss", async () => {
    const f = await fixture({}, "fixture.operation");
    let ready: () => void = () => {};
    const started = new Promise<void>((r) => (ready = r));
    const registry = handler(async (_input, context) => {
      ready();
      await new Promise<void>((resolve) =>
        context.signal.addEventListener("abort", () => resolve(), {
          once: true,
        }),
      );
      return { manifest: { ok: true }, actualMinor: 0 };
    });
    const task = processJob(pool, f.envelope, registry, {
      leaseMs: 1000,
      heartbeatMs: 50,
    });
    await started;
    await new Promise((r) => setTimeout(r, 110));
    const active = await state(f);
    expect(active.lease_until!.getTime() - Date.now()).toBeGreaterThan(800);
    await pool.query(
      "update app.jobs set lease_until=now()-interval '1 second' where id=$1",
      [f.job.id],
    );
    await task;
    expect((await state(f)).state).toBe("reconcile_required");
    expect((await reservation(f.job.id)).state).toBe("held");
  });
});
