# Optional Studio server API

The browser apps open in local **DEMO / MANUAL** mode. The Studio server also contains an opt-in API at `/api/backend/*`; it is disabled with a `503 BACKEND_NOT_CONNECTED` response by default. No browser document is uploaded automatically, and this milestone does not provide a hosted login or cloud-sync screen.

Enable the separate server profile only with `TRE_BACKEND_ENABLED=1`, `APP_DATABASE_URL` and `SUPABASE_URL` in server environment variables. `SUPABASE_URL` must be an HTTPS origin with asymmetric JWKS. The runtime database login must be a non-owning, non-superuser, non-BYPASSRLS principal with only `authenticated` membership. The gateway refuses administrator credentials, dangerous inherited roles and mixed worker/web roles. Use the numbered migrations with a separate migration administrator first.

Every request requires `Authorization: Bearer <valid end-user access token>`. The verified signature, issuer, audience, authenticated role, expiration and UUID subject determine identity. A body-supplied user ID is never accepted. Browser requests must be same origin; all responses use `Cache-Control: no-store`. Logs contain request IDs, product, status and error codes, not documents, tokens, database URLs or provider responses.

| Method | Path after `/api/backend/`    | Input / behavior                                                                                                |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `workspaces`                  | Current user's active memberships                                                                               |
| POST   | `workspaces`                  | `{ "name": "Mit arbejdsrum" }`; initial budget is zero                                                          |
| GET    | `projects?workspaceId=<uuid>` | At most 100 visible Studio projects                                                                             |
| POST   | `projects`                    | `{ "workspaceId": "...", "name": "...", "document": {...} }`; document optional                                 |
| GET    | `projects/<uuid>`             | Visible project, or 404 for missing/foreign/wrong-app IDs                                                       |
| PATCH  | `projects/<uuid>`             | `{ "expectedRevision": 1, "name": "...", "document": {...} }`                                                   |
| POST   | `projects/<uuid>/archive`     | `{ "expectedRevision": 1, "archived": true }`; cancels queued server jobs, requests cancellation of active jobs |
| GET    | `projects/<uuid>/jobs`        | At most 100 visible jobs, without worker leases or private provider references                                  |
| POST   | `projects/<uuid>/jobs`        | Free `manual.validate` only; server sets maximum cost to zero                                                   |
| GET    | `jobs/<uuid>`                 | Current state and revision                                                                                      |
| POST   | `jobs/<uuid>/cancel`          | `{ "expectedRevision": 1 }`                                                                                     |
| GET    | `jobs/<uuid>/result`          | Actual immutable validation manifest; 404 until one exists                                                      |

Database identity, name, revision, creation time and archival time live on the project row. The Studio `document` contains description, profile, briefs, artifacts, tasks, edges, manual runs, deliveries, reviews and activity. Those metadata fields cannot be duplicated in the document. Schema and reference checks apply before writes; previous briefs, assets, deliveries, reviews, activity and run snapshots cannot be rewritten or deleted. This is a server contract for a future cloud client; the existing local editor continues to use its validated IndexedDB format.

Example job body:

```json
{
  "idempotencyKey": "a-stable-client-request-id",
  "kind": "manual.validate",
  "input": {
    "text": "{\"ok\":true}",
    "mime": "application/json"
  }
}
```

Supported MIME types are `text/plain`, `text/markdown`, `text/html` and `application/json`. Optional `expectedSha256` checks exact UTF-8 content. The worker returns SHA-256, byte length, MIME and JSON syntax evidence with `codeExecuted:false` and `externalBuildVerified:false`. It never executes uploaded HTML/code or contacts a paid provider. Run the separate worker from [backend-profile.md](backend-profile.md) to process queued jobs.

JSON bodies are capped at 1 MB; simple workspace/archive/cancel requests at 2 KB. Bodies are received before opening a transaction. PostgreSQL bigint revisions are returned as decimal strings; send a validated safe integer as `expectedRevision`. A conflict returns 409, and the client must reload and reconcile rather than overwrite. Idempotency keys are workspace-scoped and cannot be reused with different input.

Archiving and job reservation share a lock. A job waiting behind a committed archive rechecks project visibility and cannot start. Unknown active outcomes retain their budget reservation. The real-database suite exercises this ordering, tenant isolation, concurrent revision conflicts, malformed bodies, immutable results and actual restricted principals. Synthetic JWT fixtures use locally generated asymmetric keys; they do not demonstrate a hosted Supabase connection.

This API still needs hosted login/UI integration, private object storage and production operating controls before a connected release. The 1 MB document limit deliberately excludes large binary project uploads; local ZIP exports continue to carry the full local project.
