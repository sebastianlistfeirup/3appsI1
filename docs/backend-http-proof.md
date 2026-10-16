# Actual production HTTP reference proof

`pnpm test:http` exercises the built Studio server over real TCP HTTP, with real HTTPS key discovery, real PostgreSQL and the separate production worker entry point. It uses disposable synthetic local services. It does not contact a hosted Supabase project or claim a deployed customer integration.

Prerequisites: the locked dependencies, OpenSSL, and a current `pnpm --filter @tre/studio build`. Node 24 and the bundled PostgreSQL 17 fixture are used. Existing app servers can remain running because the proof chooses its own loopback ports. Do not run a Studio build concurrently with this proof.

The runner creates an ephemeral certificate with explicit localhost/IP SANs and an ES256 keypair. The production Next process trusts only that additional fixture certificate through `NODE_EXTRA_CA_CERTS`; normal TLS validation remains enabled. An actual HTTPS JWKS endpoint serves only the public signing key. No bearer identity can be supplied through a request body.

The real path is:

1. An unauthenticated request is rejected before key discovery. A wrong signature is rejected after the server retrieves the key over HTTPS.
2. A valid end-user token creates a workspace and Studio project through the actual Next route and domain validator. Foreign identities cannot read it; a viewer can read but cannot write; foreign origins are refused.
3. HTTP job retries yield the same job. The actual separate worker consumes the durable pg-boss outbox using three different restricted database logins. It returns the exact non-ASCII UTF-8 hash and explicit `codeExecuted:false` / `externalBuildVerified:false` evidence. Exactly one zero-cost immutable usage event exists.
4. A fixture publishes real immutable file metadata and bytes through the existing restricted database/storage primitives. This setup is deliberately not described as an HTTP upload endpoint.
5. The actual Next file route issues a one-minute link, delivers all 12,345 original binary bytes as an attachment, and returns the correct HEAD size without a body. Revoking the viewer invalidates the already-issued link.
6. Requests reuse the verified JWKS cache. Application and worker logs are checked for generated credentials/tokens. The worker and server shut down, sockets drain, and the local database, certificate, key and object directory are removed.

`reports/backend/http-proof.json` records current status and actual evidence. A failed run writes failed status instead of leaving a previous success report unqualified. Fixtures never read production database connection variables; they create all four restricted login credentials themselves. Server secrets are passed through child environments, never arguments or report fields. Next telemetry is disabled in the fixture.

`pnpm test:http --failure-probe` deliberately fails after the real server and worker are ready. The expected result is exit code **1** and `cleanup:"completed"` in the separate `http-proof-failure-probe.json`. This confirms a failure cannot be converted into a green CI exit by the embedded database package's transitive exit hook. It is an explicit negative probe. The passing wrapper `pnpm exec tsx tools/backend/check-failure-exit.ts` requires that exact failure, exit code and successful cleanup; GitHub runs the wrapper before the normal proof.

GitHub's Studio browser job runs the proof before its UI tests, against the production app it has just built. The normal browser suite supplies a five-minute outer deadline; HTTP requests, startup checks, processes and database operations also have bounded waits. HTTPS identity is a local protocol fixture, not an exercised Supabase login, refresh session, hosted JWKS rotation or production deployment.
