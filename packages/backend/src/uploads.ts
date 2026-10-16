import { z } from "zod";
import { DomainError } from "@tre/contracts";
import {
  withTrustedUser,
  beginUpload,
  finalizeUpload,
  getUpload,
  getProject,
  uploadInputSchema,
  type UploadRow,
} from "@tre/database";
import type { ObjectDescriptor } from "@tre/storage";
import type { BackendConfig } from "./index";
import { readJson } from "./index";
const uuid = z.string().uuid();
const descriptor = (row: UploadRow): ObjectDescriptor => ({
  workspaceId: row.workspace_id,
  projectId: row.project_id,
  artifactVersionId: row.id,
  sha256: row.sha256,
  bytes: Number(row.bytes),
});
function publicUpload(row: UploadRow) {
  const { created_by: _user, requested_artifact_id: _requested, ...rest } = row;
  return {
    ...rest,
    bytes: Number(row.bytes),
    artifactVersionId: row.state === "finalized" ? row.id : null,
  };
}

/** Whole-object retry, bounded before allocation, without holding a SQL connection.
 * A reservation is not a bearer token: every attempt authenticates current membership. */
async function readContent(
  request: Request,
  expected: number,
): Promise<Uint8Array> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/octet-stream" ||
    request.headers.has("content-range") ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  )
    throw new DomainError(
      "BINARY_REQUIRED",
      "Send hele filen som application/octet-stream uden komprimering eller delområder.",
      415,
    );
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) !== expected)
  )
    throw new DomainError(
      "OBJECT_INTEGRITY",
      "Filens angivne størrelse stemmer ikke med reservationen.",
      409,
    );
  if (!request.body) {
    if (expected === 0) return new Uint8Array();
    throw new DomainError("OBJECT_INTEGRITY", "Filens indhold mangler.", 409);
  }
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0,
    stopped = false;
  const abort = () => {
    stopped = true;
    void reader.cancel().catch(() => undefined);
  };
  const deadline = setTimeout(abort, 30_000);
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    if (request.signal.aborted) abort();
    for (;;) {
      const chunk = await reader.read();
      if (stopped)
        throw new DomainError(
          "UPLOAD_INTERRUPTED",
          "Uploaden blev afbrudt. Send den samme fil igen med samme upload-id.",
          408,
        );
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > expected)
        throw new DomainError(
          "PAYLOAD_TOO_LARGE",
          "Uploaden overskrider den reserverede størrelse.",
          413,
        );
      parts.push(chunk.value);
    }
    if (size !== expected)
      throw new DomainError(
        "OBJECT_INTEGRITY",
        "Filen er afkortet. Prøv den samme upload igen.",
        409,
      );
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
export async function uploadRoute(
  config: BackendConfig,
  request: Request,
  parts: string[],
  userId: string,
  requestId: string,
): Promise<Response | undefined> {
  const method = request.method;
  const projectUploads =
    parts.length === 3 &&
    parts[0] === "projects" &&
    parts[2] === "uploads" &&
    ["GET", "POST"].includes(method);
  const upload =
    parts[0] === "uploads" &&
    ((parts.length === 2 && method === "GET") ||
      (parts.length === 3 &&
        ((parts[2] === "content" && method === "PUT") ||
          (parts[2] === "finalize" && method === "POST"))));
  if (!projectUploads && !upload) return;
  if (!config.storage)
    throw new DomainError(
      "STORAGE_NOT_CONNECTED",
      "Det private fillager er ikke tilsluttet.",
      503,
    );
  const storage = config.storage;
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  if (projectUploads) {
    const projectId = uuid.parse(parts[1]);
    const input =
      method === "POST"
        ? uploadInputSchema.parse(await readJson(request, 12_000))
        : undefined;
    if (input && input.bytes > (storage.store.maximumObjectBytes ?? 10_000_000))
      throw new DomainError(
        "OBJECT_TOO_LARGE",
        "Filen overskrider det konfigurerede serverloft.",
        413,
      );
    return withTrustedUser(config.pool, userId, async (c) => {
      await getProject(c, projectId, config.app);
      if (input)
        return reply(
          {
            upload: publicUpload(
              await beginUpload(c, projectId, config.app, input),
            ),
          },
          202,
        );
      const rows = (
        await c.query<UploadRow>(
          "select * from app.artifact_uploads where project_id=$1 and app_key=$2 order by (state='pending') desc,created_at desc limit 100",
          [projectId, config.app],
        )
      ).rows;
      return reply({ uploads: rows.map(publicUpload) });
    });
  }
  const uploadId = uuid.parse(parts[1]);
  if (method === "GET")
    return withTrustedUser(config.pool, userId, async (c) =>
      reply({ upload: publicUpload(await getUpload(c, uploadId, config.app)) }),
    );
  if (method === "POST")
    z.object({})
      .strict()
      .parse(await readJson(request, 2000));
  const row = await withTrustedUser(config.pool, userId, (c) =>
    getUpload(c, uploadId, config.app, true),
  );
  const d = descriptor(row);
  if (method === "PUT") {
    const bytes = await readContent(request, d.bytes);
    await storage.store.putVerified(d, bytes);
    // Membership/archive can change while bytes are in transit. Do not acknowledge
    // a publication; only finalize can create a downloadable immutable version.
    const current = await withTrustedUser(config.pool, userId, (c) =>
      getUpload(c, uploadId, config.app, true),
    );
    return reply({ upload: publicUpload(current), contentVerified: true });
  }
  // All I/O completes before the final short transaction. No compensating delete:
  // an ambiguous COMMIT is recovered by retrying the durable upload ID.
  await storage.store.readVerified(d);
  const completed = await withTrustedUser(config.pool, userId, (c) =>
    finalizeUpload(c, uploadId, config.app),
  );
  return reply({ upload: publicUpload(completed) });
}
