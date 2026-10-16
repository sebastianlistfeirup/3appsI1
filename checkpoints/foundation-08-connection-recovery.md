# F08 — actual worker connection recovery

The worker process previously exited with code 1 when PostgreSQL terminated an idle application-pool session. This was reproduced with the actual entry point, three restricted logins, a completed job, and `pg_terminate_backend` against the worker's own fixture database. The new process fixture failed before the change and passed afterwards.

Application, dispatcher and principal-check pools now have idle error listeners that log a fixed message and connection purpose without raw errors, connection strings or credentials. Subsequent operations reconnect through the pool. Application and queue connections have five-second connection and lock limits and a fifteen-second statement limit. Graceful worker shutdown is bounded by an outer twenty-five-second deadline and reports a nonzero exit if cleanup fails.

The final isolated PostgreSQL suite passes **42 integration tests**. The new fixture confirms that the same worker remains alive after actual idle sessions are terminated, completes the next job, retains the first result and idempotency identity, creates exactly two results and two zero-cost usage events, and exits cleanly on SIGTERM. `reports/database/worker-reconnect.json` records the actual terminated connection classes and checks.

This is connection-loss verification. It does not claim a complete hosted database restart, a cloud failover, or safe repetition of an unknown paid operation. Existing lease, reservation and reconciliation behavior remains responsible for uncertain outcomes. No paid provider is connected.
