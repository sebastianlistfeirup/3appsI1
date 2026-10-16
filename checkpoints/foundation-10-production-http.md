# F10 — actual production HTTP, TLS identity and private downloads

Executed the built Next server as a separate process on a disposable loopback port. Its unchanged optional backend configuration used a private filesystem, a restricted PostgreSQL login and actual HTTPS JWKS retrieval. Normal certificate verification stayed enabled through an ephemeral additional CA; no TLS checks were disabled.

The proof creates workspace/project through HTTP, rejects a wrong signature, foreign identity/origin and viewer writes, submits/deduplicates a real job, observes the separate restricted pg-boss worker complete it, and verifies the immutable result and zero-cost usage record. Actual attachment and HEAD requests return exact private binary content; a previously issued link fails immediately after membership revocation. JWKS cache reuse and secret-free application logs are checked.

The first full run passed in approximately seven seconds. After cleanup hardening, the normal proof passed again. An intentional failure after all services were ready returned exit code 1, removed the services and temporary state, and recorded zero database pool errors. Tool typechecking passed. The local test uses the actual production entry points; hosted Supabase, paid providers and public deployment remain unconnected.

See [the precise proof and its limits](../docs/backend-http-proof.md), `reports/backend/http-proof.json` and the deliberately failed `reports/backend/http-proof-failure-probe.json`. Cleanup continues across independent resources even if one shutdown fails, and a failure report never masquerades as a passing result.
