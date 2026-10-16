import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Pool,
  transaction,
  withTrustedUser,
  withWorker,
  createWorkspace,
  createProject,
  requestJob,
  getJob,
  claimJob,
} from "../../packages/database/src/index";
import {
  installQueue,
  startQueue,
  dispatchOutbox,
  queueName,
  type PgBoss,
} from "../../packages/jobs/src/index";
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 10,
});
let boss: PgBoss;
beforeAll(async () => {
  await installQueue(pool);
  boss = await startQueue(process.env.TEST_DATABASE_URL!, {
    supervise: false,
    role: "tre_queue",
  });
});
afterAll(async () => {
  await boss?.stop({ graceful: false });
  await pool.end();
});
async function fixture() {
  const owner = randomUUID();
  return withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Køfixture");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey: "studio",
      name: "Lokalt job",
    });
    const job = await requestJob(c, {
      workspaceId: workspace.id,
      projectId: project.id,
      appKey: "studio",
      kind: "manual.validate",
      idempotencyKey: randomUUID(),
      input: { text: "syntetisk" },
      maximumMinor: 0,
    });
    return { owner, workspace, project, job };
  });
}
describe("Real pg-boss durable outbox and cancellation", () => {
  it("delivers an app job once to the isolated queue schema", async () => {
    const f = await fixture();
    await dispatchOutbox(pool, boss, 100);
    const queued = await boss.getJobById(queueName, f.job.id);
    expect(queued?.data).toEqual({
      jobId: f.job.id,
      workspaceId: f.workspace.id,
    });
    expect(
      (
        await pool.query(
          "select dispatched_at from app.job_outbox where job_id=$1",
          [f.job.id],
        )
      ).rows[0].dispatched_at,
    ).toBeTruthy();
  });
  it("survives a crash between queue send and outbox acknowledgement without duplicating a job", async () => {
    await dispatchOutbox(pool, boss, 100);
    const f = await fixture();
    await expect(
      dispatchOutbox(pool, boss, 100, {
        afterSend: async (row) => {
          if (row.job_id === f.job.id)
            throw new Error("simulated process crash after durable send");
        },
      }),
    ).rejects.toThrow("simulated process crash");
    expect(
      (
        await pool.query(
          "select dispatched_at from app.job_outbox where job_id=$1",
          [f.job.id],
        )
      ).rows[0].dispatched_at,
    ).toBeNull();
    await pool.query(
      "update app.job_outbox set dispatch_until=now()-interval '1 second' where job_id=$1",
      [f.job.id],
    );
    await dispatchOutbox(pool, boss, 100);
    expect(
      (
        await pool.query(
          "select count(*)::int count from queue.job where id=$1",
          [f.job.id],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "select dispatched_at from app.job_outbox where job_id=$1",
          [f.job.id],
        )
      ).rows[0].dispatched_at,
    ).toBeTruthy();
  });
  it("gives the dispatcher routing functions but no direct customer-table access", async () => {
    await expect(
      transaction(pool, async (c) => {
        await c.query("set local role tre_dispatcher");
        return c.query("select document from app.projects");
      }),
    ).rejects.toThrow("permission denied");
    await expect(
      transaction(pool, async (c) => {
        await c.query("set local role tre_queue");
        return c.query("select input from app.jobs");
      }),
    ).rejects.toThrow("permission denied");
  });
  it("cancels a queued operation and releases the reservation atomically", async () => {
    const f = await fixture();
    const cancelled = await withTrustedUser(
      pool,
      f.owner,
      async (c) =>
        (await c.query("select * from app.cancel_job($1,$2)", [f.job.id, 1]))
          .rows[0],
    );
    expect(cancelled.state).toBe("cancelled");
    expect(
      (
        await pool.query(
          "select state from app.budget_reservations where job_id=$1",
          [f.job.id],
        )
      ).rows[0].state,
    ).toBe("released");
    expect(
      await withWorker(pool, f.workspace.id, (c) => claimJob(c, f.job.id)),
    ).toBeNull();
  });
  it("retains money for an active operation when cancellation is requested", async () => {
    const f = await fixture();
    const running = await withWorker(pool, f.workspace.id, (c) =>
      claimJob(c, f.job.id),
    );
    const cancelled = await withTrustedUser(
      pool,
      f.owner,
      async (c) =>
        (
          await c.query("select * from app.cancel_job($1,$2)", [
            f.job.id,
            running!.revision,
          ])
        ).rows[0],
    );
    expect(cancelled).toMatchObject({
      state: "running",
      cancel_requested: true,
    });
    expect(
      (
        await pool.query(
          "select state from app.budget_reservations where job_id=$1",
          [f.job.id],
        )
      ).rows[0].state,
    ).toBe("held");
    await expect(
      withTrustedUser(pool, f.owner, (c) =>
        c.query("select * from app.cancel_job($1,$2)", [f.job.id, 1]),
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("preserves queued jobs across stop and restart of the real queue client", async () => {
    const f = await fixture();
    await dispatchOutbox(pool, boss, 100);
    await boss.stop({ graceful: false });
    boss = await startQueue(process.env.TEST_DATABASE_URL!, {
      supervise: false,
      role: "tre_queue",
    });
    expect((await boss.getJobById(queueName, f.job.id))?.data).toEqual({
      jobId: f.job.id,
      workspaceId: f.workspace.id,
    });
    expect(
      (await withTrustedUser(pool, f.owner, (c) => getJob(c, f.job.id))).state,
    ).toBe("queued");
  });
});
