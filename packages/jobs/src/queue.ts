import { PgBoss, getConstructionPlans } from "pg-boss";
import { Pool, transaction } from "@tre/database";
import { z } from "zod";
export { PgBoss, getConstructionPlans };
export const queueName = "tre-app-jobs";
export const envelopeSchema = z
  .object({ jobId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict();
export type JobEnvelope = z.infer<typeof envelopeSchema>;
export interface OutboxRow {
  job_id: string;
  workspace_id: string;
  dispatch_token: string;
}
/** Migration administrator only. Runtime queue credentials cannot reach app tables. */
export async function installQueue(pool: Pool) {
  await transaction(pool, async (c) => {
    await c.query("set local role tre_queue");
    await c.query(getConstructionPlans("queue", { createSchema: false }));
  });
}
/** Queues are already migrated; application processes must never auto-migrate production. */
export async function startQueue(
  connectionString: string,
  options: { supervise?: boolean; role?: "tre_queue" } = {},
) {
  const boss = new PgBoss({
    connectionString,
    schema: "queue",
    migrate: false,
    supervise: options.supervise ?? true,
    schedule: false,
    application_name: "tre-queue",
    options: options.role ? "-c role=tre_queue" : undefined,
  });
  // Callers may add a structured error logger; never log raw payloads or connection strings.
  boss.on("error", () => {});
  await boss.start();
  await boss.createQueue(queueName, {
    policy: "standard",
    retryLimit: 2,
    retryDelay: 2,
    retryBackoff: true,
    retryDelayMax: 30,
    expireInSeconds: 1800,
    heartbeatSeconds: 120,
    retentionSeconds: 86400,
    deleteAfterSeconds: 604800,
  });
  return boss;
}
/** Durable outbox bridges application and queue databases. Crash after send is deduplicated
 * by the same queue job UUID; app leases and terminal states form the second boundary. */
export async function dispatchOutbox(
  pool: Pool,
  boss: PgBoss,
  limit = 25,
  hooks: { afterSend?: (row: OutboxRow) => Promise<void> } = {},
): Promise<number> {
  const rows = await transaction(pool, async (c) => {
    await c.query("set local role tre_dispatcher");
    return (
      await c.query<OutboxRow>("select * from app.claim_outbox($1)", [limit])
    ).rows;
  });
  let acknowledged = 0;
  for (const row of rows) {
    const envelope: JobEnvelope = {
      jobId: row.job_id,
      workspaceId: row.workspace_id,
    };
    await boss.send(queueName, envelope, { id: row.job_id });
    await hooks.afterSend?.(row);
    const ack = await transaction(pool, async (c) => {
      await c.query("set local role tre_dispatcher");
      return (
        await c.query<{ ack_outbox: boolean }>("select app.ack_outbox($1,$2)", [
          row.job_id,
          row.dispatch_token,
        ])
      ).rows[0]?.ack_outbox;
    });
    if (ack) acknowledged++;
  }
  return acknowledged;
}
