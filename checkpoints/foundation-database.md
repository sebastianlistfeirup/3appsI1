# F03 — verified PostgreSQL foundation

Status: EXECUTED / VERIFIED locally, not connected to a hosted database or customer identity service.

- Migration `0001_foundation.sql` creates tenant-scoped app records, immutable versions/results/usage, row-level authorization, audit revisions and bounded job states.
- `authenticated` and `tre_worker` are non-login, non-owner roles without superuser/BYPASSRLS. Trusted server code must verify identity before setting user context. Worker context is transaction-local.
- Job creation, idempotency, budget reservation and outbox insertion share a transaction. Budget updates serialize on the workspace budget row. Duplicate completion must match both result hash and actual cost.
- Expired leases enter `reconcile_required` and keep their reservation. This checkpoint does not yet contain a production queue or provider reconciliation adapter.
- `pnpm test:db` provisions a fresh isolated PostgreSQL 17.10 server, applies migrations, runs 13 real integration tests, stops the server and deletes the fixture database. No shared/customer database is touched.
- Verified: cross-tenant 404, app scoping, viewer restrictions, membership revocation, final-owner protection, concurrent revision conflict, duplicate submission, forged idempotency input, concurrent budget cap, exactly-once cost/result settlement, expired lease, worker role/context, immutable data and transaction rollback.
- `pnpm --filter @tre/database typecheck` passes. Evidence: `reports/database/latest.json`.

Deployment still requires verified sessions/JWTs, least-privilege login provisioning, private object storage, queue process supervision and restore rehearsal. A caller-provided user ID is explicitly not authentication.
