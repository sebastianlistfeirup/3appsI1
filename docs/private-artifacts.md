# Private artifact reference storage

The optional Studio server profile can upload and read real immutable files from a dedicated private local directory. This is a verified local storage implementation, **not** a connected Supabase Storage or S3 service. The browser demo remains independent and never uploads its data automatically.

## Storage boundary

`@tre/storage` derives each key from persisted server metadata:

```text
workspace UUID / project UUID / artifact-version UUID / SHA-256
```

No HTTP input can select a filesystem path. Descriptor UUIDs are canonicalized to lowercase, SHA-256 is lowercase hexadecimal, and bytes are an exact integer. The local adapter defaults to a 10,000,000-byte object ceiling; the reusable implementation permits an explicitly configured ceiling up to the database's 50,000,000-byte maximum. There is no silent truncation.

The dedicated root and every descendant directory must be private (`0700`); files use `0600`. Symbolic links are refused, including replacement of the root after initialization. Input bytes are snapshotted and hash-checked before creating any file. A temporary file is fully written and fsynced, then atomically published with a non-overwriting hard link. Concurrent retries publish exactly one complete object. An existing corrupt object is an error, never an excuse to overwrite a version. Temporary files from completed or rejected calls are removed. A process killed during writing can leave an unreferenced `.staging-*` file; automatic garbage collection is not implemented.

Reads check regular-file status, private permissions, exact size, a bounded byte read, EOF and SHA-256 before returning data. The API releases its database transaction before disk I/O. These primitives target the tested Linux/POSIX filesystem and a trusted server OS account; they are not an isolation boundary against another process running as that same OS user.

## API

With a verified end-user JWT:

```http
POST /api/backend/artifacts/{artifactVersionId}/download-link
Authorization: Bearer <end-user JWT>
Content-Type: application/json

{}
```

The server checks current RLS membership and the project's app, verifies the persisted key against canonical metadata, and returns a relative URL, expiry, size and checksum. A client-supplied storage path or user ID is rejected. Owners, editors and viewers can read; revoked or foreign users receive 404. Archived projects keep their historical files readable.

The URL is a narrowly scoped HMAC-SHA-256 capability valid for sixty seconds:

```http
GET /api/backend/artifacts/{artifactVersionId}/download?token=<capability>
```

It authorizes only this immutable file in this application. It cannot authenticate project, workspace or job endpoints. The signature binds the user, workspace, project, version, digest, byte count, app and exact expiry. Redemption checks membership **again at request time**, so revoking a member invalidates their issued links without waiting for expiry. A forwarded link can be used within its short lifetime while the bound member remains authorized; treat it as a secret URL, not as a login session. Signatures authenticate the contents and do not encrypt them.

GET returns the complete verified binary as an attachment with `application/octet-stream`, exact content length, `no-store`, `nosniff`, sandbox CSP and `no-referrer`. HEAD performs the same authorization and integrity checks without a response body. Byte-range requests currently receive the complete 200 response; partial streaming is not implemented. Corrupt, missing, mismatched or expired artifacts return bounded, actionable JSON errors. Application logs contain only request ID, app, status and error code. Reverse proxies must redact query strings on this route.

## Optional server configuration

The existing `TRE_BACKEND_ENABLED=1`, restricted `APP_DATABASE_URL` and HTTPS `SUPABASE_URL` are still required. Add both server-only values together:

- `TRE_PRIVATE_OBJECT_DIR`: absolute dedicated directory outside every web/public directory, accessible only by the server OS user.
- `TRE_ARTIFACT_SIGNING_KEY`: 64 lowercase hexadecimal characters representing 32 random bytes, supplied through secret configuration. Never prefix it with `NEXT_PUBLIC_`.

A missing pair or malformed key fails closed. Replacing the signing key invalidates outstanding links; there is deliberately no old-key grace period. The root is checked on each use, and invalid permissions fail closed. No credentials or example signing secrets are committed.

## Evidence and remaining boundaries

`packages/storage/src/storage.test.ts` uses actual filesystem writes, concurrent publication, corruption, truncation, permissions and symbolic links. It also verifies token expiry, tampering, app/version binding, key rotation and clock rollback.

`tests/integration/artifact-download.test.ts` uses an actual restricted PostgreSQL login, ES256 JWTs and actual stored bytes. It verifies binary/HEAD delivery, viewer access and immediate revocation, foreign/missing IDs, application isolation, malformed references, expired links, corruption, missing files, archived reads and disconnected configuration. `pnpm test:db` runs it alongside the other database gates.

The [durable upload protocol](durable-uploads.md) now reserves, receives and finalizes actual private files through authenticated HTTP. Its tests include concurrent retries, quota locks, revocation/archive between I/O and commit, lost commit acknowledgement, actual process death and restoration of an unpublished file. No local browser project is uploaded automatically. Browser cloud synchronization, abandoned-object collection, production rate limiting, remote storage, proxy settings and hosted restore rehearsal remain separate work.
