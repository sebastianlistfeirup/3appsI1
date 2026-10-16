# Backend reference profile

The three browser products run without credentials in explicitly labeled local demo mode. This backend is a separately verified foundation; no hosted Supabase project, customer account or paid provider has been connected by this session.

## Verified local behavior

`pnpm test:db` creates an isolated PostgreSQL 17.10 database, applies all numbered migrations and verifies real row-level security, immutable results, expected revisions, reservations, queue delivery and worker recovery decisions. The fixture database is stopped and removed afterwards. `reports/database/latest.json` records the actual run.

Application tables live in `app`. pg-boss 12.38.0 owns `queue`; its jobs carry only workspace/job UUIDs. A durable outbox connects these schemas (and can connect separate databases) without assuming a distributed transaction. If a process dies after queue send but before acknowledgement, the same queue job UUID is reused. Application leases and final states prevent a second logical execution.

A job reserves its maximum cost under a workspace lock, and settles an immutable usage event with its result. An unknown outcome enters `reconcile_required`; its reservation remains held. Known no-charge transient failures receive at most three attempts. The queue applies exponential backoff and jitter, while application attempts/deadlines remain the final bound. Heartbeat is 30 seconds, lease 120 seconds, default deadline 20 minutes. Cancellation of an active operation retains the reservation until the outcome is known.

The supplied worker only enables `manual.validate`: bounded text/JSON syntax and SHA-256 validation. It does **not** execute customer code, verify an external build, or call a paid provider. Unconfigured job types appear as `blocked_credentials`. Director's working FFmpeg renderer has its own opt-in local execution profile; see [director-local-render.md](director-local-render.md).

## Roles and deployment responsibilities

Migrations run with a migration administrator. Runtime credentials must be separate:

| Connection                | Allowed role     | Purpose                                                           |
| ------------------------- | ---------------- | ----------------------------------------------------------------- |
| Web application           | `authenticated`  | Verified end-user context; RLS for every request                  |
| `APP_WORKER_DATABASE_URL` | `tre_worker`     | Transaction-local workspace context and app job/result operations |
| `DISPATCHER_DATABASE_URL` | `tre_dispatcher` | Only narrow outbox claim/ack functions; no direct customer tables |
| `QUEUE_DATABASE_URL`      | `tre_queue`      | Queue schema only; no application tables                          |

Provision non-superuser login principals with membership in the indicated role; do not give them application-table ownership, `BYPASSRLS`, `CREATEROLE` or migration credentials. `withTrustedUser` sets an already verified user ID and is **not** an authentication function. `@tre/auth` verifies asymmetric ES256/RS256 JWT signatures, issuer, audience, UUID subject and expiration against explicit keys. The Supabase adapter uses its HTTPS JWKS endpoint; no remote identity endpoint was called during synthetic tests.

Install the pinned queue schema once with `installQueue` using migration credentials. Runtime pg-boss instances use `migrate:false`. Run the separate process with `pnpm --filter @tre/worker start` after supplying the three URLs. Do not put these secrets in `NEXT_PUBLIC_*` variables or commit them. Process supervision, private object storage, production rate limits, credential rotation and a restore rehearsal must be configured before a connected release.

## Evidence limits

The tests use actual PostgreSQL and the actual pg-boss package. Simulated network failures and provider references are explicitly synthetic fixtures; they do not demonstrate a live provider contract. Hosted identity, payment, provider circuit breakers and administrative reconciliation UI are not yet connected. A green local backend suite does not promote all three apps to `CONNECTED` or `PRIVATE_BETA`.
