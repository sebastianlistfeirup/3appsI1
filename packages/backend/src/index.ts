import { randomUUID } from "node:crypto";
import { z } from "zod";
import { uploadRoute } from "./uploads";
import { DomainError, type AppKey } from "@tre/contracts";
import { verifyBearer, type AuthConfig } from "@tre/auth";
import {
  ArtifactDownloadSigner,
  objectKey,
  type ObjectDescriptor,
  type PrivateObjectStore,
} from "@tre/storage";
import {
  Pool,
  withTrustedUser,
  assertRuntimePrincipal,
  createWorkspace,
  createProject,
  getProject,
  updateProject,
  archiveProject,
  requestJob,
  getJob,
  getArtifact,
  cancelJob,
  type ArtifactRow,
  type Json,
  type JobRow,
} from "@tre/database";
export interface BackendConfig {
  pool: Pool;
  auth: AuthConfig;
  app: AppKey;
  validateDocument: (value: unknown) => Json;
  createDocument: (name: string) => Json;
  validateUpdate?: (previous: Json, next: Json) => void;
  /** Optional app-owned, free-only job allowlist. Server estimates always remain zero. */
  validateJob?: (kind: string, input: unknown) => Json;
  storage?: { store: PrivateObjectStore; signer: ArtifactDownloadSigner };
  log?: (event: {
    requestId: string;
    app: AppKey;
    code: string;
    status: number;
  }) => void;
}
const id = z.string().uuid(),
  revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const createSchema = z
  .object({
    workspaceId: id,
    name: z.string().trim().min(1).max(100),
    document: z.json().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    expectedRevision: revision,
    name: z.string().trim().min(1).max(100),
    document: z.json(),
  })
  .strict();
const manualSchema = z
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
  .strict();
const jobSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(200),
    kind: z.string().min(1).max(100),
    input: z.json(),
  })
  .strict();
export async function readJson(
  request: Request,
  limit = 1_000_000,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase()
      .match(/^application\/json$/)
  )
    throw new DomainError(
      "JSON_REQUIRED",
      "Send JSON med den korrekte indholdstype.",
      415,
    );
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit)
    throw new DomainError("PAYLOAD_TOO_LARGE", "Anmodningen er for stor.", 413);
  if (!request.body)
    throw new DomainError("INVALID_INPUT", "JSON mangler.", 400);
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new DomainError(
          "PAYLOAD_TOO_LARGE",
          "Anmodningen er for stor.",
          413,
        );
      }
      parts.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new DomainError(
      "INVALID_JSON",
      "JSON kan ikke læses. Ret filen og prøv igen.",
      400,
    );
  }
}
function publicJob(job: JobRow) {
  const {
    lease_token: _lease,
    lease_until: _until,
    provider_ref: _provider,
    ...publicFields
  } = job;
  return publicFields;
}
function response(body: unknown, status = 200, requestId?: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
  });
}
function artifactDescriptor(row: ArtifactRow): ObjectDescriptor {
  const descriptor = {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    artifactVersionId: row.id,
    sha256: row.sha256,
    bytes: Number(row.bytes),
  };
  if (row.storage_key !== objectKey(descriptor))
    throw new DomainError(
      "OBJECT_REFERENCE",
      "Filens lagerreference stemmer ikke. Den er ikke udleveret.",
      409,
    );
  return descriptor;
}
function requireStorage(config: BackendConfig) {
  if (!config.storage)
    throw new DomainError(
      "STORAGE_NOT_CONNECTED",
      "Det private fillager er ikke tilsluttet.",
      503,
    );
  return config.storage;
}
/** Standard Request/Response makes the same authorization path testable against real Postgres.
 * The caller supplies the app's domain validator; configuration never accepts a client user ID. */
export function createBackendHandler(config: BackendConfig) {
  let principal: Promise<void> | undefined;
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url),
        prefix = "/api/backend/";
      if (!url.pathname.startsWith(prefix))
        throw new DomainError("NOT_FOUND", "Siden findes ikke.", 404);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new DomainError(
          "ORIGIN_REJECTED",
          "Denne oprindelse er ikke tilladt.",
          403,
        );
      const parts = url.pathname
          .slice(prefix.length)
          .split("/")
          .filter(Boolean),
        method = request.method;
      const isDownload =
        parts.length === 3 &&
        parts[0] === "artifacts" &&
        parts[2] === "download" &&
        ["GET", "HEAD"].includes(method);
      // This narrow capability is accepted only by the immutable file endpoint.
      // It never authenticates workspace/project/job operations.
      const download = isDownload
        ? (() => {
            if (url.searchParams.size !== 1 || !url.searchParams.has("token"))
              throw new DomainError(
                "INVALID_DOWNLOAD_LINK",
                "Downloadlinket er ugyldigt eller udløbet. Hent et nyt fra projektet.",
                401,
              );
            return requireStorage(config).signer.verify(
              url.searchParams.get("token")!,
              config.app,
              parts[1]!,
            );
          })()
        : undefined;
      const identity =
        download ??
        (await verifyBearer(request.headers.get("authorization"), config.auth));
      principal ??= assertRuntimePrincipal(config.pool, "authenticated").catch(
        (error) => {
          principal = undefined;
          throw error;
        },
      );
      await principal;
      if (download) {
        const descriptor = await withTrustedUser(
          config.pool,
          identity.userId,
          async (c) => {
            // Recheck current membership on redemption, including revoked users.
            const row = await getArtifact(c, download.artifactVersionId);
            await getProject(c, row.project_id, config.app);
            const current = artifactDescriptor(row);
            if (
              current.workspaceId !== download.workspaceId ||
              current.projectId !== download.projectId ||
              current.sha256 !== download.sha256 ||
              current.bytes !== download.bytes
            )
              throw new DomainError(
                "OBJECT_REFERENCE",
                "Downloadlinkets filreference stemmer ikke.",
                409,
              );
            return current;
          },
        );
        // Release the database connection before filesystem I/O. Verify every
        // byte before creating a response; corrupted data never reaches clients.
        const bytes =
          await requireStorage(config).store.readVerified(descriptor);
        return new Response(method === "HEAD" ? null : Uint8Array.from(bytes), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="artifact-${descriptor.artifactVersionId}.bin"`,
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
            "Referrer-Policy": "no-referrer",
            "X-Request-Id": requestId,
          },
        });
      }
      const uploadResponse = await uploadRoute(
        config,
        request,
        parts,
        identity.userId,
        requestId,
      );
      if (uploadResponse) return uploadResponse;
      // Receive and bound the body before opening a database transaction.
      const body = ["POST", "PATCH"].includes(method)
        ? await readJson(
            request,
            ["workspaces", "artifacts"].includes(parts[0] ?? "") ||
              ["archive", "cancel"].includes(parts[2] ?? "")
              ? 2000
              : 1_000_000,
          )
        : undefined;
      return await withTrustedUser(config.pool, identity.userId, async (c) => {
        if (
          parts.length === 3 &&
          parts[0] === "artifacts" &&
          parts[2] === "download-link" &&
          method === "POST"
        ) {
          z.object({}).strict().parse(body);
          const row = await getArtifact(c, id.parse(parts[1]));
          await getProject(c, row.project_id, config.app);
          const descriptor = artifactDescriptor(row);
          const { token, expiresAt } = requireStorage(config).signer.issue({
            ...descriptor,
            app: config.app,
            userId: identity.userId,
          });
          return response(
            {
              download: {
                url: `${prefix}artifacts/${descriptor.artifactVersionId}/download?token=${token}`,
                expiresAt,
                sha256: descriptor.sha256,
                bytes: descriptor.bytes,
              },
            },
            200,
            requestId,
          );
        }
        if (parts.length === 1 && parts[0] === "workspaces") {
          if (method === "GET") {
            const rows = (
              await c.query(
                "select w.id,w.name,w.plan_key,m.role from app.workspaces w join app.memberships m on m.workspace_id=w.id where m.user_id=app.request_user_id() and m.revoked_at is null order by w.created_at",
              )
            ).rows;
            return response({ workspaces: rows }, 200, requestId);
          }
          if (method === "POST") {
            const input = z
              .object({ name: z.string().trim().min(1).max(100) })
              .strict()
              .parse(body);
            return response(
              { workspace: await createWorkspace(c, input.name) },
              201,
              requestId,
            );
          }
        }
        if (parts.length === 1 && parts[0] === "projects") {
          if (method === "GET") {
            const workspace = id.parse(url.searchParams.get("workspaceId"));
            const rows = (
              await c.query(
                "select id,workspace_id,app_key,name,revision,archived_at,updated_at from app.projects where workspace_id=$1 and app_key=$2 order by updated_at desc limit 100",
                [workspace, config.app],
              )
            ).rows;
            return response({ projects: rows }, 200, requestId);
          }
          if (method === "POST") {
            const input = createSchema.parse(body);
            const document = config.validateDocument(
              input.document ?? config.createDocument(input.name),
            );
            return response(
              {
                project: await createProject(c, {
                  workspaceId: input.workspaceId,
                  appKey: config.app,
                  name: input.name,
                  document,
                }),
              },
              201,
              requestId,
            );
          }
        }
        if (parts[0] === "projects" && parts[1]) {
          const projectId = id.parse(parts[1]);
          if (parts.length === 2 && method === "GET")
            return response(
              { project: await getProject(c, projectId, config.app) },
              200,
              requestId,
            );
          if (parts.length === 2 && method === "PATCH") {
            const input = updateSchema.parse(body);
            const previous = await getProject(c, projectId, config.app);
            const document = config.validateDocument(input.document);
            config.validateUpdate?.(previous.document, document);
            return response(
              {
                project: await updateProject(
                  c,
                  projectId,
                  config.app,
                  input.expectedRevision,
                  { name: input.name, document },
                ),
              },
              200,
              requestId,
            );
          }
          if (
            parts.length === 3 &&
            parts[2] === "archive" &&
            method === "POST"
          ) {
            const input = z
              .object({ expectedRevision: revision, archived: z.boolean() })
              .strict()
              .parse(body);
            return response(
              {
                project: await archiveProject(
                  c,
                  projectId,
                  config.app,
                  input.expectedRevision,
                  input.archived,
                ),
              },
              200,
              requestId,
            );
          }
          if (parts.length === 3 && parts[2] === "jobs") {
            await getProject(c, projectId, config.app);
            if (method === "GET")
              return response(
                {
                  jobs: (
                    await c.query(
                      "select * from app.jobs where project_id=$1 and app_key=$2 order by created_at desc limit 100",
                      [projectId, config.app],
                    )
                  ).rows.map(publicJob),
                },
                200,
                requestId,
              );
            if (method === "POST") {
              if (config.app !== "studio" && !config.validateJob)
                throw new DomainError(
                  "CAPABILITY_NOT_CONNECTED",
                  "Denne app har endnu ingen tilsluttet serveradapter.",
                  409,
                );
              const input = jobSchema.parse(body);
              const jobInput = config.validateJob
                ? config.validateJob(input.kind, input.input)
                : (() => {
                    if (input.kind !== "manual.validate")
                      throw new DomainError(
                        "INVALID_INPUT",
                        "Denne jobtype er ikke tilsluttet.",
                        400,
                      );
                    return manualSchema.parse(input.input);
                  })();
              const project = await getProject(c, projectId, config.app);
              // Estimate is server-owned. Clients cannot submit prices or activate paid adapters.
              return response(
                {
                  job: publicJob(
                    await requestJob(c, {
                      workspaceId: project.workspace_id,
                      projectId,
                      appKey: config.app,
                      kind: input.kind,
                      idempotencyKey: input.idempotencyKey,
                      input: jobInput,
                      maximumMinor: 0,
                    }),
                  ),
                },
                202,
                requestId,
              );
            }
          }
        }
        if (parts[0] === "jobs" && parts[1]) {
          const job = await getJob(c, id.parse(parts[1]));
          if (job.app_key !== config.app)
            throw new DomainError("NOT_FOUND", "Jobbet findes ikke.", 404);
          if (parts.length === 2 && method === "GET")
            return response({ job: publicJob(job) }, 200, requestId);
          if (parts.length === 3 && parts[2] === "result" && method === "GET") {
            const result = (
              await c.query(
                "select id,job_id,manifest,sha256,created_at from app.job_results where job_id=$1 and id=$2",
                [job.id, job.result_version],
              )
            ).rows[0];
            if (!result)
              throw new DomainError(
                "RESULT_NOT_FOUND",
                "Jobbet har endnu ikke et resultat.",
                404,
              );
            return response({ result }, 200, requestId);
          }
          if (
            parts.length === 3 &&
            parts[2] === "cancel" &&
            method === "POST"
          ) {
            const input = z
              .object({ expectedRevision: revision })
              .strict()
              .parse(body);
            return response(
              {
                job: publicJob(
                  await cancelJob(c, job.id, input.expectedRevision),
                ),
              },
              200,
              requestId,
            );
          }
        }
        throw new DomainError("NOT_FOUND", "Endpointet findes ikke.", 404);
      });
    } catch (error) {
      const sqlCode =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined;
      const status =
        error instanceof DomainError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : sqlCode === "42501"
              ? 403
              : sqlCode === "23505"
                ? 409
                : sqlCode === "23514" || sqlCode === "23503"
                  ? 400
                  : 503;
      const code =
        error instanceof DomainError
          ? error.code
          : error instanceof z.ZodError
            ? "INVALID_INPUT"
            : status === 403
              ? "FORBIDDEN"
              : status === 409
                ? "CONFLICT"
                : status === 400
                  ? "INVALID_INPUT"
                  : "BACKEND_UNAVAILABLE";
      const message =
        error instanceof DomainError
          ? error.message
          : status === 400
            ? "Felterne eller filreferencerne er ugyldige."
            : status === 403
              ? "Du har ikke adgang til denne handling."
              : status === 409
                ? "Der findes allerede en tilsvarende version."
                : "Serverforbindelsen kunne ikke bruges. Prøv igen senere.";
      config.log?.({ requestId, app: config.app, code, status });
      return response(
        { error: { code, message, requestId } },
        status,
        requestId,
      );
    }
  };
}
export const disconnectedBackend = () =>
  response(
    {
      error: {
        code: "BACKEND_NOT_CONNECTED",
        message: "Cloudprofilen er ikke tilsluttet. Brug den lokale demo.",
      },
    },
    503,
  );
