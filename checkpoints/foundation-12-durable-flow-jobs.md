# F12 — bounded FlowLab jobs, native cancellation and actual crash recovery

Written: `@tre/flow-jobs`, explicit 30-seed server profile, native Worker thread with bounded deadline/heap and awaited termination, actual worker registry, opt-in FlowLab Next API, additive migration 0005, trusted pure-job recovery and early-redelivery waiting. Local browser simulation remains unchanged and does not upload data.

Executed and verified locally on 17 October 2026:

- All workspace/tool typechecks; 287 unit tests in 45 files, including four actual native-worker fixtures and exact equality with the existing browser engine.
- Full PostgreSQL integration suite: **71 tests in eight files**, five migrations. Covers real cancellation teardown, early redelivery before natural app-lease expiry, running/validating recovery, concurrency, no-cost safety gate, attempts/deadline/cancellation and existing RLS/upload/unknown-provider regressions.
- Actual separate `services/worker/src/main.ts`, three restricted runtime logins, pg-boss and a native simulation: SIGKILL after **one completed seedpair**. The replacement process waits for **natural** queue/lease expiry and finishes all 30 pairs in attempt 2. Latest run recovered after **125,638 ms**, with one result, one usage event, zero external cost and checked hashes. No SQL expiry edits in this process fixture. See `reports/database/flow-worker-crash-recovery.json`.
- Actual production FlowLab build and HTTP proof: **22 checks**, real HTTPS JWKS with normal TLS, restricted API/worker identities, valid 30-pair result, invalid-input rejection, real upload and Next SIGKILL/restart, exact private download and membership revocation. See `reports/backend/flowlab-http-proof.json`.
- Studio production build and unchanged Studio HTTP boundary checked separately after the shared adapter extension.
- Backup/restore with all five migrations, 27 app/queue tables, two published file versions and one pending upload still passes; original source is removed before restore. The small, already-provisioned fixture's 251 ms recovery is not a production RTO.

Recovery design: permission comes from the installed free handler's app-scoped, side-effect-free contract, never the request body. A zero held reservation and absence of provider reference are mandatory. SQL additionally narrows interrupted validation replay to `flowlab` / `flow.compare`. A killed pure calculation recomputes the full run. Existing uncertain external operations keep reconciliation and reservations.

Defects caught during implementation: Node 24's default TS loader did not resolve source-module extensionless imports in a native thread; explicit `tsx/esm/api` registration in a `.mjs` bootstrap fixed the actual execution. A second issue was the gap between queue and app heartbeat clocks: an early queue delivery must wait, not return success while the crashed job still owns a live app lease. A natural-expiry integration regression now covers it.

Connected: local real processes/DB only. Hosted login, browser cloud-client UI, remote storage, production resource limits and external paid providers remain unconnected. Progress is structured log output; partial seed results are not persisted checkpoints. Native V8 limits do not cap total process RSS.

Also integrated: FlowLab L21 diagram/keyboard fixes (`6c7af79`) and Director D18 export archive (`d667cc2`), with their new browser/native gates in the CI runner. GitHub run `38983623108` on prior `c2cd08b` is fully green across core and five browser jobs; this checkpoint requires its own fresh remote run after push.
