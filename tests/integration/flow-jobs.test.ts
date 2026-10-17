import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Pool,
  withTrustedUser,
  withWorker,
  createWorkspace,
  createProject,
  requestJob,
  claimJob,
  getJob,
  transitionJob,
  cancelJob,
  hashJson,
  type Json,
} from "../../packages/database/src/index";
import { processJob, type JobHandler } from "../../packages/jobs/src/index";
import { flowComparisonHandler } from "../../packages/flow-jobs/src/executor";
import {
  FLOW_JOB_PROFILE,
  parseFlowJobInput,
} from "../../packages/flow-jobs/src/input";
import {
  membershipTemplate,
  seedList,
  ENGINE_VERSION,
  PRNG_VERSION,
} from "../../packages/flow-engine/src/index";
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 8,
});
afterAll(() => pool.end());
const replayable = [{ kind: "flow.compare", appKey: "flowlab" as const }];
const registry = new Map([[flowComparisonHandler.id, flowComparisonHandler]]);
async function fixture(cost = 0, appKey: "flowlab" | "studio" = "flowlab") {
  const owner = randomUUID(),
    baseline = membershipTemplate(),
    scenario = structuredClone(baseline);
  scenario.resources[0]!.capacity += 1;
  const input = {
    schemaVersion: 1,
    profile: FLOW_JOB_PROFILE,
    engineVersion: ENGINE_VERSION,
    prngVersion: PRNG_VERSION,
    baseline,
    scenario,
    seeds: seedList(2026, 30),
  } as unknown as Json;
  return withTrustedUser(pool, owner, async (c) => {
    const workspace = await createWorkspace(c, "Pure recovery fixture");
    const project = await createProject(c, {
      workspaceId: workspace.id,
      appKey,
      name: "Locked flow model",
    });
    await c.query("select app.set_budget($1,100,100)", [workspace.id]);
    const job = await requestJob(c, {
      workspaceId: workspace.id,
      projectId: project.id,
      appKey,
      kind: "flow.compare",
      idempotencyKey: randomUUID(),
      input,
      maximumMinor: cost,
    });
    return {
      owner,
      workspace,
      project,
      job,
      envelope: { workspaceId: workspace.id, jobId: job.id },
    };
  });
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const state = (f: Fixture) =>
  withWorker(pool, f.workspace.id, (c) => getJob(c, f.job.id));
async function expired(f: Fixture, validating = false) {
  await withWorker(pool, f.workspace.id, async (c) => {
    const claimed = (await claimJob(c, f.job.id))!;
    if (validating)
      await transitionJob(c, claimed, "validating", {
        leaseToken: claimed.lease_token!,
      });
  });
  // State-machine fixture only. The actual process test separately waits for natural lease/queue expiry.
  await pool.query(
    "update app.jobs set lease_until=now()-interval '1 second' where id=$1",
    [f.job.id],
  );
}
async function counts(f: Fixture) {
  return (
    await pool.query(
      "select (select count(*)::int from app.job_results where job_id=$1) results,(select count(*)::int from app.usage_events where job_id=$1) usage,(select coalesce(sum(amount_minor),0)::int from app.usage_events where job_id=$1) cost",
      [f.job.id],
    )
  ).rows[0];
}
describe("pure bounded FlowLab jobs with actual PostgreSQL", () => {
  it("keeps an early queue delivery alive until the old app lease naturally expires", async () => {
    const f = await fixture();
    await withWorker(pool, f.workspace.id, (c) => claimJob(c, f.job.id, 200));
    let returned = false;
    const task = processJob(pool, f.envelope, registry, {
      leaseMs: 1000,
      heartbeatMs: 100,
    }).then(() => {
      returned = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(returned).toBe(false);
    expect((await state(f)).attempt).toBe(1);
    await task;
    expect(await state(f)).toMatchObject({ state: "succeeded", attempt: 2 });
    expect(await counts(f)).toEqual({ results: 1, usage: 1, cost: 0 });
  });
  it.each([false, true])(
    "replays expired pure work from running/validating (%s), preserving one result and one settlement",
    async (validating) => {
      const f = await fixture();
      await expired(f, validating);
      await Promise.all([
        processJob(pool, f.envelope, registry),
        processJob(pool, f.envelope, registry),
      ]);
      expect(await state(f)).toMatchObject({
        state: "succeeded",
        attempt: 2,
        input_hash: f.job.input_hash,
      });
      expect(await counts(f)).toEqual({ results: 1, usage: 1, cost: 0 });
      const { manifest } = (
        await pool.query(
          "select manifest from app.job_results where job_id=$1",
          [f.job.id],
        )
      ).rows[0];
      expect(manifest.comparison.seeds).toHaveLength(30);
      expect(manifest.resultSha256).toBe(hashJson(manifest.comparison));
      expect(manifest.inputSha256).toBe(
        hashJson(parseFlowJobInput(f.job.input) as unknown as Json),
      );
      await processJob(pool, f.envelope, registry);
      expect(await counts(f)).toEqual({ results: 1, usage: 1, cost: 0 });
    },
  );
  it("requires trusted app/kind registration, zero reservation and no external reference", async () => {
    for (const variant of [
      "unregistered",
      "cost",
      "reference",
      "wrong-app",
    ] as const) {
      const f = await fixture(
        variant === "cost" ? 20 : 0,
        variant === "wrong-app" ? "studio" : "flowlab",
      );
      await expired(f);
      if (variant === "reference")
        await pool.query(
          "update app.jobs set provider_ref='existing-external-operation' where id=$1",
          [f.job.id],
        );
      await withWorker(pool, f.workspace.id, (c) =>
        claimJob(
          c,
          f.job.id,
          120000,
          variant === "unregistered" ? [] : replayable,
        ),
      );
      expect((await state(f)).state).toBe("reconcile_required");
      expect(
        (
          await pool.query(
            "select state from app.budget_reservations where job_id=$1",
            [f.job.id],
          )
        ).rows[0].state,
      ).toBe("held");
      expect(await counts(f)).toEqual({ results: 0, usage: 0, cost: 0 });
    }
  });
  it.each(["cancelled", "deadline", "attempts"] as const)(
    "settles interrupted pure work with %s once at zero without rerunning",
    async (reason) => {
      const f = await fixture();
      if (reason === "attempts") {
        for (let i = 0; i < 2; i++) {
          await expired(f);
          await withWorker(pool, f.workspace.id, async (c) => {
            const j = await getJob(c, f.job.id);
            await transitionJob(c, j, "retry_wait");
          });
        }
      }
      await expired(f, true);
      if (reason === "cancelled")
        await withTrustedUser(pool, f.owner, async (c) => {
          const j = await getJob(c, f.job.id);
          await cancelJob(c, j.id, Number(j.revision));
        });
      if (reason === "deadline")
        await pool.query(
          "update app.jobs set deadline_at=now()-interval '1 second' where id=$1",
          [f.job.id],
        );
      await processJob(pool, f.envelope, registry);
      expect((await state(f)).state).toBe(
        reason === "cancelled" ? "cancelled" : "failed",
      );
      expect(await counts(f)).toEqual({ results: 0, usage: 1, cost: 0 });
      await processJob(pool, f.envelope, registry);
      expect(await counts(f)).toEqual({ results: 0, usage: 1, cost: 0 });
    },
  );
  it("waits for pure native cleanup before settling a cancellation", async () => {
    const f = await fixture();
    let started!: () => void,
      release!: () => void,
      stopped = false;
    const ready = new Promise<void>((resolve) => (started = resolve)),
      teardown = new Promise<void>((resolve) => (release = resolve));
    const handler: JobHandler = {
      ...flowComparisonHandler,
      run: async (_input, context) => {
        started();
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        await teardown;
        stopped = true;
        throw new Error("Native teardown completed");
      },
    };
    const task = processJob(
      pool,
      f.envelope,
      new Map([[handler.id, handler]]),
      { leaseMs: 1000, heartbeatMs: 30 },
    );
    await ready;
    await withTrustedUser(pool, f.owner, async (c) => {
      const j = await getJob(c, f.job.id);
      await cancelJob(c, j.id, Number(j.revision));
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(stopped).toBe(false);
    expect((await state(f)).state).toBe("running");
    expect((await counts(f)).usage).toBe(0);
    release();
    await task;
    expect(stopped).toBe(true);
    expect((await state(f)).state).toBe("cancelled");
    expect(await counts(f)).toEqual({ results: 0, usage: 1, cost: 0 });
  });
  it("does not claim and abandon a second lease when the first pure computation loses its lease", async () => {
    const f = await fixture();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve));
    const handler: JobHandler = {
      ...flowComparisonHandler,
      run: async (_input, context) => {
        started();
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        throw new Error("stopped");
      },
    };
    const task = processJob(
      pool,
      f.envelope,
      new Map([[handler.id, handler]]),
      { leaseMs: 1000, heartbeatMs: 30 },
    );
    const rejected = expect(task).rejects.toMatchObject({
      kind: "transient",
      knownNoCharge: true,
    });
    await ready;
    await pool.query(
      "update app.jobs set lease_until=now()-interval '1 second' where id=$1",
      [f.job.id],
    );
    await rejected;
    expect(await state(f)).toMatchObject({ state: "running", attempt: 1 });
    await processJob(pool, f.envelope, registry);
    expect(await state(f)).toMatchObject({ state: "succeeded", attempt: 2 });
  });
});
