import { z } from "zod";
export const appKeySchema = z.enum(["studio", "flowlab", "director"]);
export type AppKey = z.infer<typeof appKeySchema>;
export const jobStateSchema = z.enum([
  "queued",
  "running",
  "validating",
  "succeeded",
  "retry_wait",
  "blocked_credentials",
  "blocked_budget",
  "failed",
  "cancelled",
  "reconcile_required",
]);
export type JobState = z.infer<typeof jobStateSchema>;
export const jobTransitions: Record<JobState, readonly JobState[]> = {
  queued: [
    "running",
    "cancelled",
    "blocked_credentials",
    "blocked_budget",
    "failed",
  ],
  running: [
    "validating",
    "retry_wait",
    "blocked_credentials",
    "failed",
    "cancelled",
    "reconcile_required",
  ],
  validating: ["succeeded", "failed", "cancelled", "reconcile_required"],
  succeeded: [],
  retry_wait: ["queued", "running", "failed", "cancelled"],
  blocked_credentials: ["queued", "cancelled"],
  blocked_budget: ["queued", "cancelled"],
  failed: [],
  cancelled: [],
  reconcile_required: ["validating", "failed", "cancelled"],
};
export function assertJobTransition(from: JobState, to: JobState) {
  if (from !== to && !jobTransitions[from].includes(to))
    throw new Error(`Illegal job transition: ${from} → ${to}`);
}
export const terminalStates: ReadonlySet<JobState> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);
export const providerCapabilitySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  accessMethod: z.enum(["manual", "local", "api", "github_app"]),
  operations: z.array(z.string()),
  costModel: z.enum(["free", "metered"]),
  dataPolicy: z.string().min(1),
  status: z.enum(["available", "not_connected", "disabled"]),
  lastSmokeTest: z.string().datetime().nullable(),
  idempotentSubmit: z.boolean(),
  cancellable: z.boolean(),
  maximumInputBytes: z.number().int().positive(),
});
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export interface ProviderAdapter<Input, Output> {
  capabilities(): ProviderCapability;
  validateAccess(): Promise<{ ok: boolean; reason?: string }>;
  estimate(input: Input): Promise<{ maximumMinor: number; currency: "DKK" }>;
  submit(input: Input, idempotencyKey: string): Promise<{ reference: string }>;
  status(
    reference: string,
  ): Promise<"running" | "succeeded" | "failed" | "unknown">;
  cancel(reference: string): Promise<{ cancelled: boolean }>;
  collect(reference: string): Promise<Output>;
}
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
