import { createHash } from "node:crypto";
import { z } from "zod";
import {
  Pool,
  withWorker,
  claimJob,
  getJob,
  heartbeat,
  transitionJob,
  finishJob,
  settleUnsuccessfulJob,
  recordProviderReference,
  type JobRow,
  type Json,
} from "@tre/database";
import { envelopeSchema, type JobEnvelope } from "./queue";
export interface JobOutput {
  manifest: Json;
  actualMinor: number;
}
export interface JobContext {
  signal: AbortSignal;
  idempotencyKey: string;
  recordProviderReference: (reference: string) => Promise<void>;
}
export interface JobHandler {
  id: string;
  costModel: "free" | "metered";
  run: (input: Json, context: JobContext) => Promise<JobOutput>;
}
export class JobFault extends Error {
  constructor(
    public readonly kind: "transient" | "credentials" | "permanent" | "unknown",
    message: string,
    public readonly knownNoCharge = false,
  ) {
    super(message);
    this.name = "JobFault";
  }
}
export interface ProcessorOptions {
  signal?: AbortSignal;
  leaseMs?: number;
  heartbeatMs?: number;
  onEvent?: (event: { type: string; jobId: string; state?: string }) => void;
}
export type HandlerRegistry = ReadonlyMap<string, JobHandler>;
/** Bounded local validator. It does not execute uploaded code or claim a build passed. */
export const manualValidationHandler: JobHandler = {
  id: "manual.validate",
  costModel: "free",
  async run(input, context) {
    context.signal.throwIfAborted();
    const parsed = z
      .object({
        text: z.string().min(1).max(500000),
        mime: z.enum([
          "text/plain",
          "text/markdown",
          "text/html",
          "application/json",
        ]),
        expectedSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new JobFault(
        "permanent",
        "Filen skal have gyldig tekst, understøttet MIME-type og være højst 500.000 tegn.",
        true,
      );
    const bytes = Buffer.from(parsed.data.text, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (parsed.data.expectedSha256 && sha256 !== parsed.data.expectedSha256)
      throw new JobFault(
        "permanent",
        "Filens SHA-256 stemmer ikke overens med den forventede version.",
        true,
      );
    if (parsed.data.mime === "application/json") {
      try {
        JSON.parse(parsed.data.text);
      } catch {
        throw new JobFault(
          "permanent",
          "JSON-filen kan ikke læses. Ret syntaksen og opret en ny version.",
          true,
        );
      }
    }
    return {
      actualMinor: 0,
      manifest: {
        schemaVersion: 1,
        kind: "manual.validation",
        mime: parsed.data.mime,
        bytes: bytes.length,
        sha256,
        checks: {
          utf8: true,
          hash: true,
          jsonSyntax: parsed.data.mime === "application/json" ? true : null,
        },
        codeExecuted: false,
        externalBuildVerified: false,
      },
    };
  },
};
export const localHandlers: HandlerRegistry = new Map([
  [manualValidationHandler.id, manualValidationHandler],
]);
/** App leases are the source of truth. A queue redelivery never blindly reruns an uncertain job. */
export async function processJob(
  pool: Pool,
  envelope: JobEnvelope,
  handlers: HandlerRegistry = localHandlers,
  options: ProcessorOptions = {},
): Promise<void> {
  envelopeSchema.parse(envelope);
  const leaseMs = options.leaseMs ?? 120000;
  const heartbeatMs = options.heartbeatMs ?? 30000;
  if (heartbeatMs < 20 || heartbeatMs >= leaseMs / 2)
    throw new Error(
      "Heartbeat must be positive and comfortably shorter than the lease.",
    );
  const inTenant = <T>(fn: Parameters<typeof withWorker<T>>[2]) =>
    withWorker(pool, envelope.workspaceId, fn);
  const claimed = await inTenant((c) => claimJob(c, envelope.jobId, leaseMs));
  if (!claimed) return;
  const lease = claimed.lease_token!;
  let current: JobRow = claimed;
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  let knownOutput: JobOutput | undefined;
  const handler = handlers.get(claimed.kind);
  const emit = (type: string, state?: string) =>
    options.onEvent?.({ type, jobId: claimed.id, state });
  let heartbeatRunning = false,
    heartbeatFailure: unknown;
  const ticker = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      const active = await inTenant(async (c) => {
        const fresh = await getJob(c, claimed.id);
        if (fresh.cancel_requested)
          controller.abort(new Error("CANCEL_REQUESTED"));
        return heartbeat(c, claimed.id, lease, leaseMs);
      });
      if (!active) {
        heartbeatFailure = new Error("LEASE_LOST");
        controller.abort(heartbeatFailure);
      }
    } catch (error) {
      heartbeatFailure = error;
      controller.abort(error);
    } finally {
      heartbeatRunning = false;
    }
  }, heartbeatMs);
  ticker.unref();
  const remaining = claimed.deadline_at.getTime() - Date.now();
  const deadline = setTimeout(
    () => controller.abort(new Error("DEADLINE_EXCEEDED")),
    Math.max(1, remaining),
  );
  deadline.unref();
  try {
    emit("job.started", "running");
    if (!handler)
      throw new JobFault(
        "credentials",
        "Ingen tilsluttet adapter kan udføre denne jobtype.",
        true,
      );
    // No metered adapter is enabled by this reference worker; paid calls require explicit deployment policy.
    if (handler.costModel !== "free")
      throw new JobFault(
        "credentials",
        "Betalte adaptere er ikke aktiveret i denne workerprofil.",
        true,
      );
    if (remaining <= 0)
      throw new JobFault("permanent", "Jobbets tidsfrist er udløbet.", true);
    signal.throwIfAborted();
    const output = await abortable(
      handler.run(claimed.input, {
        signal,
        idempotencyKey: claimed.id,
        recordProviderReference: async (reference) => {
          current = await inTenant((c) =>
            recordProviderReference(c, claimed.id, lease, reference),
          );
        },
      }),
      signal,
    );
    knownOutput = output;
    if (heartbeatFailure) throw heartbeatFailure;
    current = await inTenant((c) => getJob(c, claimed.id));
    if (current.cancel_requested || signal.aborted) {
      await inTenant((c) =>
        settleUnsuccessfulJob(
          c,
          claimed.id,
          lease,
          current.cancel_requested ? "cancelled" : "failed",
          output.actualMinor,
          current.cancel_requested
            ? "Jobbet blev annulleret. Kendt forbrug er afregnet."
            : "Jobbets tidsfrist er udløbet.",
        ),
      );
      emit("job.stopped");
      return;
    }
    current = await inTenant((c) =>
      transitionJob(c, current, "validating", { leaseToken: lease }),
    );
    await inTenant((c) =>
      finishJob(c, claimed.id, lease, output.manifest, output.actualMinor),
    );
    emit("job.succeeded", "succeeded");
  } catch (error) {
    current = await inTenant((c) => getJob(c, claimed.id));
    if (
      ["succeeded", "failed", "cancelled", "reconcile_required"].includes(
        current.state,
      )
    )
      return;
    if (
      current.lease_token !== lease ||
      !current.lease_until ||
      current.lease_until.getTime() <= Date.now()
    ) {
      // claimJob is also the lease-expiry reconciliation gate. It never starts this active operation again.
      await inTenant((c) => claimJob(c, claimed.id, leaseMs));
      emit("job.reconciliation", "reconcile_required");
      return;
    }
    if (current.cancel_requested && knownOutput) {
      const actualMinor = knownOutput.actualMinor;
      await inTenant((c) =>
        settleUnsuccessfulJob(
          c,
          current.id,
          lease,
          "cancelled",
          actualMinor,
          "Annulleret. Kendt forbrug er afregnet.",
        ),
      );
      return;
    }
    if (error instanceof JobFault && error.knownNoCharge) {
      if (current.cancel_requested) {
        await inTenant((c) =>
          settleUnsuccessfulJob(
            c,
            current.id,
            lease,
            "cancelled",
            0,
            "Annulleret uden forbrug.",
          ),
        );
        return;
      }
      if (error.kind === "credentials") {
        await inTenant((c) =>
          transitionJob(c, current, "blocked_credentials", {
            leaseToken: lease,
            error: error.message,
          }),
        );
        emit("job.blocked", "blocked_credentials");
        return;
      }
      if (
        error.kind === "transient" &&
        current.attempt < 3 &&
        current.deadline_at.getTime() > Date.now() + 30000
      ) {
        await inTenant((c) =>
          transitionJob(c, current, "retry_wait", {
            leaseToken: lease,
            error: error.message,
          }),
        );
        emit("job.retry", "retry_wait");
        throw error;
      }
      await inTenant((c) =>
        settleUnsuccessfulJob(c, current.id, lease, "failed", 0, error.message),
      );
      emit("job.failed", "failed");
      return;
    }
    await inTenant((c) =>
      transitionJob(c, current, "reconcile_required", {
        leaseToken: lease,
        error:
          "Udfaldet er ikke bekræftet. Kontrollér providerstatus før et nyt forsøg.",
      }),
    );
    emit("job.reconciliation", "reconcile_required");
  } finally {
    clearInterval(ticker);
    clearTimeout(deadline);
  }
}

async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () =>
      reject(signal.reason ?? new Error("OPERATION_ABORTED"));
    if (signal.aborted) {
      operation.catch(() => undefined);
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}
