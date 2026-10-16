# F04 — Authenticated API, archive ordering and real worker process

Written: framework-neutral `@tre/backend` Request/Response boundary, opt-in Studio Next route, strict product document contract, server-owned free validation pricing, bounded JSON, scoped list/get/update/archive/job/cancel/result endpoints and redacted errors. Browser products remain local DEMO; no hosted account or paid provider was connected.

Executed: actual ES256 signatures and restricted database logins, not a mocked user header. Twelve API/archive tests verify tenant/app boundaries, viewer permissions, concurrent revisions, result visibility, deduplication, unsupported/cost injection rejection, byte limits, invalid UTF-8, origin and error redaction. Archive runs behind the same budget lock as job requests and rechecks after waiting. Direct archival writes are revoked; archived content cannot be edited.

Runtime principals are checked for administrative flags, ownership, inherited privilege and mixed application roles. Real worker startup explicitly sets `tre_queue` for its NOINHERIT queue login. A real child-process test verifies the production worker entry point with three separate restricted logins, a completed validation, SIGKILL, enqueue while stopped, restart, exactly two results/usage events for two logical jobs, and clean SIGTERM. It uses a dedicated fixture database because a global worker correctly consumes all queued work, including unrelated intentionally unfinished test fixtures.

Executed gates on 2026-10-16:

- `pnpm test:db`: **41/41**, five files, actual PostgreSQL 17.10 and pg-boss. No hosted database.
- `pnpm typecheck`: all packages/apps/worker plus tools and integration test TypeScript.
- `pnpm test`: **118/118** domain/auth/persistence fixtures, including locked run inputs and immutable completion times.
- `pnpm build`: all three production builds; Studio includes `/api/backend/[...path]`. Studio rebuilt after the final snapshot guards.
- Actual Next HTTP request to `/api/backend/workspaces` without configuration: **503 BACKEND_NOT_CONNECTED**, `no-store`, no implicit cloud connection.
- Failure-path probe `pnpm test:db --definitely-invalid-option`: correctly exits **1** after database cleanup. Fixed transitive `async-exit-hook` resetting beforeExit to zero. Normal suite rerun green afterwards.

Studio server documents exclude database-owned identity/lifecycle metadata. Domain updates preserve old briefs, assets, evidence and run snapshots. The local UI is not promoted to a cloud client by the existence of the API. See `docs/backend-api.md` and `docs/backend-profile.md` for explicit configuration and remaining limits.
