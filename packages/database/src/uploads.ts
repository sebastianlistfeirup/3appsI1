import { z } from "zod";
import { DomainError, type AppKey } from "@tre/contracts";
import type { PoolClient } from "pg";

export const uploadInputSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    mime: z
      .string()
      .min(1)
      .max(99)
      .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    bytes: z.number().int().nonnegative().max(10_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.string().trim().min(1).max(2000),
    rights: z.enum(["owned", "licensed", "unknown"]),
    artifactId: z.string().uuid().optional(),
  })
  .strict();
export type UploadInput = z.infer<typeof uploadInputSchema>;
export interface UploadRow {
  id: string;
  workspace_id: string;
  project_id: string;
  app_key: AppKey;
  idempotency_key: string;
  artifact_id: string;
  version: number;
  requested_artifact_id: string | null;
  name: string;
  mime: string;
  bytes: string;
  sha256: string;
  source: string;
  rights_status: "owned" | "licensed" | "unknown";
  state: "pending" | "finalized";
  created_by: string;
  created_at: Date;
  finalized_at: Date | null;
}
export async function beginUpload(
  c: PoolClient,
  projectId: string,
  app: AppKey,
  input: UploadInput,
): Promise<UploadRow> {
  const value = uploadInputSchema.parse(input);
  return (
    await c.query<UploadRow>(
      "select * from app.begin_upload($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        projectId,
        app,
        value.idempotencyKey,
        value.name,
        value.mime,
        value.bytes,
        value.sha256,
        value.source,
        value.rights,
        value.artifactId ?? null,
      ],
    )
  ).rows[0]!;
}
export async function getUpload(
  c: PoolClient,
  uploadId: string,
  app: AppKey,
  forWrite = false,
): Promise<UploadRow> {
  z.string().uuid().parse(uploadId);
  const row = (
    await c.query<UploadRow>(
      "select * from app.artifact_uploads where id=$1 and app_key=$2",
      [uploadId, app],
    )
  ).rows[0];
  if (!row)
    throw new DomainError("UPLOAD_NOT_FOUND", "Uploaden findes ikke.", 404);
  if (forWrite) {
    const current = (
      await c.query<{ allowed: boolean; archived_at: Date | null }>(
        "select app.has_role(workspace_id,array['owner','editor']) as allowed,archived_at from app.projects where id=$1 and app_key=$2",
        [row.project_id, app],
      )
    ).rows[0];
    if (!current)
      throw new DomainError("UPLOAD_NOT_FOUND", "Uploaden findes ikke.", 404);
    if (!current.allowed)
      throw new DomainError(
        "FORBIDDEN",
        "Din rolle tillader ikke upload.",
        403,
      );
    if (current.archived_at && row.state !== "finalized")
      throw new DomainError("PROJECT_ARCHIVED", "Projektet er arkiveret.", 409);
  }
  return row;
}
export async function finalizeUpload(
  c: PoolClient,
  uploadId: string,
  app: AppKey,
): Promise<UploadRow> {
  return (
    await c.query<UploadRow>("select * from app.finalize_upload($1,$2)", [
      uploadId,
      app,
    ])
  ).rows[0]!;
}
