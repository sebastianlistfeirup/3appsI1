import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  appKeySchema,
  assertJobTransition,
  DomainError,
  type AppKey,
  type JobState,
} from "@tre/contracts";
export { Pool } from "pg";
export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k]!)}`)
    .join(",")}}`;
}
export const hashJson = (input: Json) =>
  createHash("sha256").update(canonicalJson(input)).digest("hex");
const uuid = z.string().uuid();
export interface ProjectRow {
  id: string;
  workspace_id: string;
  app_key: AppKey;
  name: string;
  document: Json;
  revision: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
export interface JobRow {
  id: string;
  workspace_id: string;
  project_id: string;
  app_key: AppKey;
  kind: string;
  state: JobState;
  revision: string;
  idempotency_key: string;
  input: Json;
  input_hash: string;
  attempt: number;
  lease_token: string | null;
  lease_until: Date | null;
  provider_ref: string | null;
  result_version: string | null;
  cancel_requested: boolean;
  actionable_error: string | null;
  created_at: Date;
  updated_at: Date;
  deadline_at: Date;
  next_attempt_at: Date | null;
}
export interface RequestJob {
  workspaceId: string;
  projectId: string;
  appKey: AppKey;
  kind: string;
  idempotencyKey: string;
  input: Json;
  maximumMinor: number;
}
const requestSchema = z.object({
  workspaceId: uuid,
  projectId: uuid,
  appKey: appKeySchema,
  kind: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(200),
  input: z.json(),
  maximumMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
function databaseError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Database operation failed";
  const codes: Record<string, [number, string]> = {
    FORBIDDEN: [403, "Du har ikke adgang til denne handling."],
    AUTH_REQUIRED: [401, "Log ind for at fortsætte."],
    PROJECT_NOT_FOUND: [404, "Projektet findes ikke."],
    PROJECT_ARCHIVED: [409, "Projektet er arkiveret."],
    BUDGET_EXCEEDED: [429, "Jobbet overskrider det tilgængelige budget."],
    IDEMPOTENCY_CONFLICT: [
      409,
      "Bestillings-id’et er allerede brugt med andet input.",
    ],
    REVISION_CONFLICT: [409, "Der findes en nyere version."],
    IMMUTABLE_VERSION: [409, "Gem en ny version i stedet for at overskrive."],
    LAST_OWNER: [409, "Arbejdsrummet skal have mindst én ejer."],
    STORAGE_QUOTA_EXCEEDED: [
      429,
      "Filområdet er fyldt. Afvent mere lagerplads før en ny upload.",
    ],
    UPLOAD_LIMIT: [
      429,
      "Afslut eksisterende uploads først. Der kan være højst 20 åbne uploads i arbejdsrummet.",
    ],
    UPLOAD_NOT_FOUND: [404, "Uploaden findes ikke."],
    ARTIFACT_NOT_FOUND: [404, "Filfamilien findes ikke i projektet."],
  };
  if (codes[message]) {
    const [status, text] = codes[message]!;
    throw new DomainError(message, text, status);
  }
  throw error;
}
/** Server-only boundary. Caller MUST verify a session/JWT before providing this user ID.
 * Browser-supplied workspace/user IDs are never authentication. This does not verify tokens. */
export async function withTrustedUser<T>(
  pool: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  uuid.parse(userId);
  return transaction(pool, async (client) => {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    return fn(client);
  });
}
/** Queue worker only: a dedicated non-owning role, tenant context scoped to one transaction. */
export async function withWorker<T>(
  pool: Pool,
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  uuid.parse(workspaceId);
  return transaction(pool, async (client) => {
    await client.query("set local role tre_worker");
    await client.query("select set_config('app.worker_workspace_id',$1,true)", [
      workspaceId,
    ]);
    return fn(client);
  });
}
export async function transaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return databaseError(error);
  } finally {
    client.release();
  }
}
export async function createWorkspace(client: PoolClient, name: string) {
  z.string().trim().min(1).max(100).parse(name);
  return (
    await client.query<{ id: string; name: string }>(
      "select * from app.create_workspace($1)",
      [name.trim()],
    )
  ).rows[0]!;
}
export async function createProject(
  client: PoolClient,
  input: { workspaceId: string; appKey: AppKey; name: string; document?: Json },
): Promise<ProjectRow> {
  uuid.parse(input.workspaceId);
  appKeySchema.parse(input.appKey);
  const name = z.string().trim().min(1).max(100).parse(input.name);
  const document = z.json().parse(input.document ?? {});
  return (
    await client.query<ProjectRow>(
      "insert into app.projects(workspace_id,app_key,name,document) values($1,$2,$3,$4) returning *",
      [input.workspaceId, input.appKey, name, document],
    )
  ).rows[0]!;
}
export async function getProject(
  client: PoolClient,
  id: string,
  appKey: AppKey,
): Promise<ProjectRow> {
  uuid.parse(id);
  appKeySchema.parse(appKey);
  const result = await client.query<ProjectRow>(
    "select * from app.projects where id=$1 and app_key=$2",
    [id, appKey],
  );
  if (!result.rows[0])
    throw new DomainError("NOT_FOUND", "Projektet findes ikke.", 404);
  return result.rows[0];
}
export async function updateProject(
  client: PoolClient,
  id: string,
  appKey: AppKey,
  expectedRevision: number,
  input: { name: string; document: Json },
): Promise<ProjectRow> {
  const previous = await getProject(client, id, appKey);
  if (
    !(
      await client.query(
        "select app.has_role($1,array['owner','editor']) as allowed",
        [previous.workspace_id],
      )
    ).rows[0]?.allowed
  )
    throw new DomainError(
      "FORBIDDEN",
      "Du har ikke adgang til denne handling.",
      403,
    );
  if (previous.archived_at)
    throw new DomainError("ARCHIVED", "Projektet er arkiveret.", 409);
  z.number().int().positive().parse(expectedRevision);
  const name = z.string().trim().min(1).max(100).parse(input.name);
  const document = z.json().parse(input.document);
  const result = await client.query<ProjectRow>(
    "update app.projects set name=$1,document=$2,revision=revision+1 where id=$3 and app_key=$4 and revision=$5 returning *",
    [name, document, id, appKey, expectedRevision],
  );
  if (!result.rows[0])
    throw new DomainError(
      "REVISION_CONFLICT",
      "Der findes en nyere version, eller din rolle tillader ikke ændringen.",
      409,
    );
  return result.rows[0];
}
export async function requestJob(
  client: PoolClient,
  input: RequestJob,
): Promise<JobRow> {
  requestSchema.parse(input);
  const hash = hashJson({
    projectId: input.projectId,
    appKey: input.appKey,
    kind: input.kind,
    input: input.input,
    maximumMinor: input.maximumMinor,
  });
  return (
    await client.query<JobRow>(
      "select * from app.request_job($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        input.workspaceId,
        input.projectId,
        input.appKey,
        input.kind,
        input.idempotencyKey,
        input.input,
        hash,
        input.maximumMinor,
      ],
    )
  ).rows[0]!;
}
export async function getJob(client: PoolClient, id: string): Promise<JobRow> {
  uuid.parse(id);
  const result = await client.query<JobRow>(
    "select * from app.jobs where id=$1",
    [id],
  );
  if (!result.rows[0])
    throw new DomainError("NOT_FOUND", "Jobbet findes ikke.", 404);
  return result.rows[0];
}
export interface ArtifactRow {
  id: string;
  workspace_id: string;
  project_id: string;
  storage_key: string;
  sha256: string;
  mime: string;
  bytes: string;
  rights_status: "owned" | "licensed" | "unknown";
}
export async function getArtifact(
  client: PoolClient,
  id: string,
): Promise<ArtifactRow> {
  uuid.parse(id);
  const result = await client.query<ArtifactRow>(
    "select id,workspace_id,project_id,storage_key,sha256,mime,bytes,rights_status from app.artifact_versions where id=$1",
    [id],
  );
  if (!result.rows[0])
    throw new DomainError("NOT_FOUND", "Filen findes ikke.", 404);
  return result.rows[0];
}
export async function claimJob(
  client: PoolClient,
  id: string,
  leaseMs = 120000,
  replayable: ReadonlyArray<{ kind: string; appKey: AppKey }> = [],
): Promise<JobRow | null> {
  uuid.parse(id);
  z.number().int().min(100).max(600000).parse(leaseMs);
  const visible = (
    await client.query<JobRow>("select * from app.jobs where id=$1", [id])
  ).rows[0];
  if (!visible) return null;
  const replayConfigured = replayable.some(
    (entry) => entry.kind === visible.kind && entry.appKey === visible.app_key,
  );
  // Recovery may settle a zero-cost cancellation. Preserve budget → job lock order.
  if (replayConfigured)
    await client.query(
      "select workspace_id from app.workspace_budgets where workspace_id=$1 for update",
      [visible.workspace_id],
    );
  const result = await client.query<JobRow>(
    "select * from app.jobs where id=$1 for update",
    [id],
  );
  let job = result.rows[0];
  if (!job) return null;
  if (["running", "validating"].includes(job.state)) {
    if (!job.lease_until || job.lease_until.getTime() > Date.now()) return null;
    const reservation =
      replayConfigured && !job.provider_ref
        ? (
            await client.query<{ reserved_minor: string; state: string }>(
              "select reserved_minor,state from app.budget_reservations where job_id=$1",
              [id],
            )
          ).rows[0]
        : undefined;
    if (
      !reservation ||
      Number(reservation.reserved_minor) !== 0 ||
      reservation.state !== "held"
    ) {
      await transitionJob(client, job, "reconcile_required", {
        error:
          "Arbejderens lease udløb. Kontrollér eksisterende providerjob før genbestilling.",
      });
      return null;
    }
    if (
      job.cancel_requested ||
      job.attempt >= 3 ||
      job.deadline_at.getTime() <= Date.now()
    ) {
      const recoveryLease = randomUUID();
      job = (
        await client.query<JobRow>(
          "update app.jobs set revision=revision+1,lease_token=$2,lease_until=now()+($3*interval '1 millisecond'),updated_at=now() where id=$1 returning *",
          [id, recoveryLease, leaseMs],
        )
      ).rows[0]!;
      await recordJobEvent(client, job, "job.pure_recovery");
      await settleUnsuccessfulJob(
        client,
        id,
        recoveryLease,
        job.cancel_requested ? "cancelled" : "failed",
        0,
        job.cancel_requested
          ? "Den afbrudte simulering blev annulleret uden eksternt forbrug."
          : "Den afbrudte simulering nåede sin forsøgsgrænse eller tidsfrist. Opret et nyt job med en mindre model.",
      );
      return null;
    }
    job = await transitionJob(client, job, "retry_wait", {
      error:
        "Den afbrudte, rene beregning genstartes fra det samme låste input uden eksterne kald.",
    });
  }
  if (
    !["queued", "retry_wait"].includes(job.state) ||
    job.cancel_requested ||
    job.attempt >= 3
  )
    return null;
  const lease = randomUUID();
  const updated = (
    await client.query<JobRow>(
      "update app.jobs set state='running',revision=revision+1,attempt=attempt+1,lease_token=$2,lease_until=now()+($3*interval '1 millisecond'),updated_at=now() where id=$1 returning *",
      [id, lease, leaseMs],
    )
  ).rows[0]!;
  await recordJobEvent(client, updated, "job.started");
  return updated;
}
async function recordJobEvent(client: PoolClient, job: JobRow, type: string) {
  await client.query(
    "insert into app.job_events(workspace_id,job_id,job_revision,type) values($1,$2,$3,$4)",
    [job.workspace_id, job.id, job.revision, type],
  );
}
export async function transitionJob(
  client: PoolClient,
  job: JobRow,
  state: JobState,
  options: { error?: string; providerRef?: string; leaseToken?: string } = {},
): Promise<JobRow> {
  assertJobTransition(job.state, state);
  if (
    options.leaseToken &&
    (job.lease_token !== options.leaseToken ||
      !job.lease_until ||
      job.lease_until.getTime() <= Date.now())
  )
    throw new DomainError(
      "LEASE_LOST",
      "Jobbet tilhører en anden worker.",
      409,
    );
  const updated = (
    await client.query<JobRow>(
      "update app.jobs set state=$1,revision=revision+1,actionable_error=$2,provider_ref=coalesce($3,provider_ref),updated_at=now() where id=$4 and revision=$5 returning *",
      [
        state,
        options.error ?? null,
        options.providerRef ?? null,
        job.id,
        job.revision,
      ],
    )
  ).rows[0];
  if (!updated)
    throw new DomainError("REVISION_CONFLICT", "Jobversionen er ændret.", 409);
  await recordJobEvent(client, updated, `job.${state}`);
  return updated;
}
export async function heartbeat(
  client: PoolClient,
  id: string,
  leaseToken: string,
  leaseMs = 120000,
): Promise<boolean> {
  z.number().int().min(100).max(600000).parse(leaseMs);
  const result = await client.query(
    "update app.jobs set lease_until=now()+($3*interval '1 millisecond'),updated_at=now() where id=$1 and lease_token=$2 and state in ('running','validating') and lease_until>now() returning id",
    [id, leaseToken, leaseMs],
  );
  return Boolean(result.rows[0]);
}
export async function finishJob(
  client: PoolClient,
  id: string,
  leaseToken: string,
  manifest: Json,
  actualMinor: number,
): Promise<JobRow> {
  z.json().parse(manifest);
  z.number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(actualMinor);
  const visible = await getJob(client, id);
  await client.query(
    "select workspace_id from app.workspace_budgets where workspace_id=$1 for update",
    [visible.workspace_id],
  );
  const job = (
    await client.query<JobRow>(
      "select * from app.jobs where id=$1 for update",
      [id],
    )
  ).rows[0];
  if (!job) throw new DomainError("NOT_FOUND", "Jobbet findes ikke.", 404);
  if (job.state === "succeeded") {
    const completed = (
      await client.query<{ sha256: string; actual_minor: string }>(
        "select r.sha256,b.actual_minor from app.job_results r join app.budget_reservations b on b.job_id=r.job_id where r.job_id=$1",
        [id],
      )
    ).rows[0];
    if (
      completed?.sha256 !== hashJson(manifest) ||
      Number(completed.actual_minor) !== actualMinor
    )
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "Jobbet er allerede afsluttet med et andet resultat eller forbrug.",
        409,
      );
    return job;
  }
  if (
    job.state !== "validating" ||
    job.lease_token !== leaseToken ||
    !job.lease_until ||
    job.lease_until.getTime() <= Date.now()
  )
    throw new DomainError(
      "LEASE_LOST",
      "Workerens lease er udløbet eller jobbet er i forkert tilstand.",
      409,
    );
  if (job.cancel_requested)
    throw new DomainError(
      "CANCEL_REQUESTED",
      "Jobbet er blevet annulleret.",
      409,
    );
  const reservation = (
    await client.query<{ reserved_minor: string; state: string; day: string }>(
      "select reserved_minor,state,day from app.budget_reservations where job_id=$1 for update",
      [id],
    )
  ).rows[0]!;
  if (
    reservation.state !== "held" ||
    actualMinor > Number(reservation.reserved_minor)
  )
    throw new DomainError(
      "COST_EXCEEDS_RESERVATION",
      "Det faktiske forbrug overstiger reservationen.",
      409,
    );
  const result = (
    await client.query<{ id: string }>(
      "insert into app.job_results(workspace_id,project_id,job_id,manifest,sha256) values($1,$2,$3,$4,$5) returning id",
      [job.workspace_id, job.project_id, job.id, manifest, hashJson(manifest)],
    )
  ).rows[0]!;
  await client.query(
    "insert into app.usage_events(workspace_id,job_id,source_event_id,amount_minor,day) values($1,$2,$3,$4,$5)",
    [
      job.workspace_id,
      job.id,
      `job:${job.id}:settled`,
      actualMinor,
      reservation.day,
    ],
  );
  await client.query(
    "update app.budget_reservations set state='settled',actual_minor=$2,updated_at=now() where job_id=$1",
    [id, actualMinor],
  );
  const updated = (
    await client.query<JobRow>(
      "update app.jobs set state='succeeded',revision=revision+1,result_version=$2,lease_until=null,updated_at=now() where id=$1 returning *",
      [id, result.id],
    )
  ).rows[0]!;
  await recordJobEvent(client, updated, "job.succeeded");
  return updated;
}

/** Only call when the operation's final cost is known, including confirmed zero-cost failure.
 * Unknown provider outcomes must use reconcile_required and retain the reservation. */
export async function settleUnsuccessfulJob(
  client: PoolClient,
  id: string,
  leaseToken: string,
  state: "failed" | "cancelled",
  actualMinor: number,
  message: string,
): Promise<JobRow> {
  z.number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(actualMinor);
  const visible = await getJob(client, id);
  await client.query(
    "select workspace_id from app.workspace_budgets where workspace_id=$1 for update",
    [visible.workspace_id],
  );
  const job = (
    await client.query<JobRow>(
      "select * from app.jobs where id=$1 for update",
      [id],
    )
  ).rows[0]!;
  if (["failed", "cancelled"].includes(job.state)) return job;
  if (
    job.lease_token !== leaseToken ||
    !job.lease_until ||
    job.lease_until.getTime() <= Date.now()
  )
    throw new DomainError("LEASE_LOST", "Workerens lease er udløbet.", 409);
  assertJobTransition(job.state, state);
  const reservation = (
    await client.query<{ reserved_minor: string; state: string; day: string }>(
      "select reserved_minor,state,day from app.budget_reservations where job_id=$1 for update",
      [id],
    )
  ).rows[0]!;
  if (
    reservation.state !== "held" ||
    actualMinor > Number(reservation.reserved_minor)
  )
    throw new DomainError(
      "COST_EXCEEDS_RESERVATION",
      "Forbruget overstiger reservationen.",
      409,
    );
  await client.query(
    "insert into app.usage_events(workspace_id,job_id,source_event_id,amount_minor,day) values($1,$2,$3,$4,$5)",
    [job.workspace_id, id, `job:${id}:settled`, actualMinor, reservation.day],
  );
  await client.query(
    "update app.budget_reservations set state=$2,actual_minor=$3,updated_at=now() where job_id=$1",
    [id, actualMinor === 0 ? "released" : "settled", actualMinor],
  );
  const updated = (
    await client.query<JobRow>(
      "update app.jobs set state=$2,revision=revision+1,lease_until=null,actionable_error=$3,updated_at=now() where id=$1 returning *",
      [id, state, message.slice(0, 1000)],
    )
  ).rows[0]!;
  await recordJobEvent(client, updated, `job.${state}`);
  return updated;
}
export async function recordProviderReference(
  client: PoolClient,
  id: string,
  leaseToken: string,
  reference: string,
): Promise<JobRow> {
  z.string().min(1).max(500).parse(reference);
  const job = await getJob(client, id);
  if (job.provider_ref && job.provider_ref !== reference)
    throw new DomainError(
      "PROVIDER_REFERENCE_CONFLICT",
      "Jobbet har allerede en anden providerreference.",
      409,
    );
  return transitionJob(client, job, job.state, {
    providerRef: reference,
    leaseToken,
  });
}
export async function cancelJob(
  client: PoolClient,
  id: string,
  expectedRevision: number,
): Promise<JobRow> {
  uuid.parse(id);
  z.number().int().positive().parse(expectedRevision);
  return (
    await client.query<JobRow>("select * from app.cancel_job($1,$2)", [
      id,
      expectedRevision,
    ])
  ).rows[0]!;
}

/** Refuse accidentally configured migration/admin credentials at runtime. */
export async function assertRuntimePrincipal(
  pool: Pool,
  role: "authenticated" | "tre_worker" | "tre_dispatcher" | "tre_queue",
): Promise<void> {
  const row = (
    await pool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      member: boolean;
      owns_app: boolean;
      dangerous_membership: boolean;
      other_runtime_role: boolean;
    }>(
      "select r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,pg_has_role(current_user,$1,'MEMBER') as member,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relowner=r.oid) as owns_app,exists(select 1 from pg_roles inherited where pg_has_role(current_user,inherited.oid,'MEMBER') and (inherited.rolsuper or inherited.rolbypassrls or inherited.rolcreaterole or inherited.rolcreatedb or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relowner=inherited.oid))) as dangerous_membership,exists(select 1 from pg_roles other where other.rolname in ('authenticated','tre_worker','tre_dispatcher','tre_queue') and other.rolname<>$1 and pg_has_role(current_user,other.oid,'MEMBER')) as other_runtime_role from pg_roles r where rolname=current_user",
      [role],
    )
  ).rows[0];
  if (
    !row ||
    row.rolsuper ||
    row.rolbypassrls ||
    row.rolcreaterole ||
    row.rolcreatedb ||
    row.owns_app ||
    row.dangerous_membership ||
    row.other_runtime_role ||
    !row.member
  )
    throw new Error(
      `Unsafe runtime database principal for ${role}. Provision a separate restricted login; migration credentials are not allowed.`,
    );
}
export async function archiveProject(
  client: PoolClient,
  id: string,
  appKey: AppKey,
  expectedRevision: number,
  archived = true,
): Promise<ProjectRow> {
  uuid.parse(id);
  appKeySchema.parse(appKey);
  z.number().int().positive().parse(expectedRevision);
  return (
    await client.query<ProjectRow>(
      "select * from app.archive_project($1,$2,$3,$4)",
      [id, appKey, expectedRevision, archived],
    )
  ).rows[0]!;
}
export {
  uploadInputSchema,
  beginUpload,
  getUpload,
  finalizeUpload,
  type UploadInput,
  type UploadRow,
} from "./uploads";
