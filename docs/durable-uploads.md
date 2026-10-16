# Durable private uploads

Migration 0004 adds a durable `artifact_uploads` reservation with FORCE RLS. Every endpoint requires the verified end-user JWT and same-origin check. Owners/editors can write; viewers can inspect status and download finalized versions. The optional backend remains disabled by default; no browser document is uploaded automatically.

## Protocol

1. `POST /api/backend/projects/{projectId}/uploads` reserves a version with JSON `{idempotencyKey,name,mime,bytes,sha256,source,rights,artifactId?}`. The request is capped at 12 KB, source at 2,000 characters and file at 10,000,000 bytes (or a smaller adapter ceiling). `rights` is an explicit `owned`, `licensed` or `unknown` claim. An optional existing file family must belong to the project. The server allocates version UUID, family/version and canonical object key. No client path is accepted.
2. `PUT /api/backend/uploads/{uploadId}/content` sends the whole file as `application/octet-stream`. Size and hash must match. Transfer has a 30-second bound, observes cancellation and rejects compression/partial ranges. Current membership is checked before receiving bytes and again before acknowledging; no database connection is held during transfer or disk I/O. Bytes alone are not a downloadable artifact.
3. `POST /api/backend/uploads/{uploadId}/finalize` with `{}` rechecks stored bytes, then membership and archive state in a short transaction. It inserts one immutable version and marks the reservation finalized in the same commit. Reservation/finalization each create one immutable audit entry, including concurrent retries.

`GET /api/backend/uploads/{uploadId}` retrieves durable status. `GET /api/backend/projects/{projectId}/uploads` lists up to 100 uploads with pending reservations first. The same begin key and identical metadata return the original reservation; changed metadata returns 409. Content and finalization are independently retryable. Recovery after durable PUT needs no reupload; an interrupted transfer resends the entire file. This is stage recovery, not chunked upload.

## Quota and recovery

`workspace_budgets.object_limit_bytes` defaults to 100,000,000. A budget lock serializes committed artifact bytes plus all pending reservations, with at most twenty pending uploads. A trigger also checks existing worker/legacy artifact inserts. Finalization converts its reservation into committed usage without charging twice. Only migration/operational administrators can adjust this limit. The quota covers canonical object declarations, not filesystem metadata, temporary staging copies or a hard filesystem partition quota.

Pending reservations deliberately do not expire or release quota automatically: expiry alone could discard accounting while unpublished bytes remain. They stay discoverable and recoverable, including after archival followed by restoration. Cancellation, abandoned-file collection and administrative cleanup are **not implemented**. Operators must resolve abandoned reservations before hosted use.

Errors and ambiguous database commits never trigger compensating file deletion. If COMMIT succeeded and its acknowledgement was lost, retry returns the original version. Existing corrupt bytes are never overwritten. Missing/corrupt bytes cannot be finalized or downloaded. Read-only acknowledgement of an already finalized upload remains possible after project archival; new finalization is blocked.

## Executed evidence

- `tests/integration/artifact-upload.test.ts`: thirteen actual PostgreSQL/filesystem cases cover concurrent begin/PUT/finalize, quota serialization including legacy writes, exact audit counts, corrupted/truncated/oversized bytes, empty files, interrupted streams, role/app/tenant boundaries, archive/revocation between I/O and commit, adapter limits, pending-list recovery and protected state writes. A transport error is injected **after an actual PostgreSQL COMMIT**, then retry confirms exactly one retained version.
- `pnpm test:http`: actual production HTTP reserves and sends bytes, then SIGKILLs Next. A new Next process reads the pending reservation, finalizes without reupload, repeats finalization and downloads exact original bytes through the signed route.
- `pnpm test:restore`: a quiesced snapshot includes two published files and one unpublished upload with its reservation. After the original database is stopped and original objects removed, a fresh cluster and private directory restore all three. The pending upload finalizes twice into one version without reupload.

Hosted identity, browser cloud synchronization, remote object storage, abandoned-object collection, production rate limiting and hosted operating procedures remain unconnected.
