import { Pool, assertRuntimePrincipal } from "@tre/database";
import {
  startQueue,
  dispatchOutbox,
  processJob,
  queueName,
  envelopeSchema,
  localHandlers,
} from "@tre/jobs";
const log = (event: object) =>
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
  );
const observeConnectionErrors = (pool: Pool, purpose: string) => {
  // pg emits a pool-level error when an idle socket is disconnected. Without a
  // listener EventEmitter terminates the process, before the pool can reconnect.
  pool.on("error", () =>
    log({
      event: "database.connection_error",
      purpose,
      message:
        "An idle database connection was lost; the next operation will reconnect.",
    }),
  );
  return pool;
};
const connectionLimits = {
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  lock_timeout: 5000,
};
const required = (key: string) => {
  const value = process.env[key];
  if (!value)
    throw new Error(`${key} is required. See docs/backend-profile.md.`);
  return value;
};
const appPool = observeConnectionErrors(
  new Pool({
    ...connectionLimits,
    connectionString: required("APP_WORKER_DATABASE_URL"),
    max: 4,
    application_name: "tre-app-worker",
  }),
  "worker",
);
const dispatcherPool = observeConnectionErrors(
  new Pool({
    ...connectionLimits,
    connectionString: required("DISPATCHER_DATABASE_URL"),
    max: 2,
    application_name: "tre-outbox",
  }),
  "dispatcher",
);
const queueUrl = required("QUEUE_DATABASE_URL");
const queueCheck = observeConnectionErrors(
  new Pool({ ...connectionLimits, connectionString: queueUrl, max: 1 }),
  "queue-principal-check",
);
try {
  await Promise.all([
    assertRuntimePrincipal(appPool, "tre_worker"),
    assertRuntimePrincipal(dispatcherPool, "tre_dispatcher"),
    assertRuntimePrincipal(queueCheck, "tre_queue"),
  ]);
} finally {
  await queueCheck.end();
}
const boss = await startQueue(queueUrl, { role: "tre_queue" });
boss.on("error", () =>
  log({
    event: "queue.error",
    message:
      "Queue connection or maintenance failed; inspect server diagnostics.",
  }),
);
let dispatching = false,
  stopping = false;
const dispatch = async () => {
  if (dispatching || stopping) return;
  dispatching = true;
  try {
    const count = await dispatchOutbox(dispatcherPool, boss);
    if (count) log({ event: "outbox.dispatched", count });
  } catch {
    log({
      event: "outbox.error",
      message: "Dispatch deferred; the durable outbox will retry.",
    });
  } finally {
    dispatching = false;
  }
};
await boss.work(
  queueName,
  {
    batchSize: 1,
    localConcurrency: 2,
    pollingIntervalSeconds: 2,
    heartbeatRefreshSeconds: 30,
  },
  async (jobs) => {
    for (const job of jobs) {
      const envelope = envelopeSchema.parse(job.data);
      await processJob(appPool, envelope, localHandlers, {
        signal: job.signal,
        onEvent: (event) => log(event),
      });
    }
  },
);
await dispatch();
const timer = setInterval(dispatch, 2000);
log({
  event: "worker.ready",
  profile: "local-free-handlers",
  handlers: [...localHandlers.keys()],
  paidProvidersEnabled: false,
});
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log({ event: "worker.stopping" });
  const deadline = setTimeout(() => {
    log({
      event: "worker.shutdown_timeout",
      message:
        "Shutdown exceeded 25 seconds. Durable jobs retain their recovery state.",
    });
    process.exit(1);
  }, 25000);
  deadline.unref();
  try {
    await boss.stop({ graceful: true, timeout: 15000 });
  } catch {
    process.exitCode = 1;
    log({
      event: "worker.shutdown_error",
      message:
        "Queue shutdown failed; inspect server diagnostics before restart.",
    });
  } finally {
    const closed = await Promise.allSettled([
      appPool.end(),
      dispatcherPool.end(),
    ]);
    if (closed.some((result) => result.status === "rejected"))
      process.exitCode = 1;
    clearTimeout(deadline);
    log({ event: "worker.stopped", exitCode: process.exitCode ?? 0 });
  }
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
