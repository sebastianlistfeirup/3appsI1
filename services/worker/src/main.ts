import { Pool, assertRuntimePrincipal } from "@tre/database";
import {
  startQueue,
  dispatchOutbox,
  processJob,
  queueName,
  envelopeSchema,
  localHandlers,
} from "@tre/jobs";
const required = (key: string) => {
  const value = process.env[key];
  if (!value)
    throw new Error(`${key} is required. See docs/backend-profile.md.`);
  return value;
};
const appPool = new Pool({
  connectionString: required("APP_WORKER_DATABASE_URL"),
  max: 4,
  application_name: "tre-app-worker",
});
const dispatcherPool = new Pool({
  connectionString: required("DISPATCHER_DATABASE_URL"),
  max: 2,
  application_name: "tre-outbox",
});
const queueUrl = required("QUEUE_DATABASE_URL");
const queueCheck = new Pool({ connectionString: queueUrl, max: 1 });
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
const log = (event: object) =>
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
  );
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
  await boss.stop({ graceful: true, timeout: 15000 });
  await Promise.all([appPool.end(), dispatcherPool.end()]);
  log({ event: "worker.stopped" });
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
