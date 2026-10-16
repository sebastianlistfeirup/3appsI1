# Foundation F07 — actual database and file recovery

Implemented a disposable two-cluster restore drill using standard PostgreSQL client tools. The source database, queue and real object files are unavailable during recovery. A fresh target receives the archive with its original ownership and grants. The drill compares all 26 application/queue tables at the checkpoint, restores two file versions with exact checksums, verifies restricted tenant access, resumes one pending free job and retains an unresolved operation for reconciliation without repeating the completed operation.

The first execution passed the data assertions but revealed a shutdown race: `pg-pool.end()` resolves after removing clients from its own array, before their socket-close callbacks. The final harness tracks `connect`/`remove` events and waits for the actual connections to drain before stopping PostgreSQL. It records failure if a pool error or cleanup failure occurs and publishes success only after cleanup. Credentials and object payloads are not written to the report.

Executed locally with PostgreSQL 17.10 and `pg_dump`/`pg_restore` 17.11. The completed run restored 26 tables and two objects with zero observed row or object loss; recovery from archive into the already provisioned target took 206 ms. This is a small synthetic checkpoint, not a production recovery promise. Subsequent report timestamps and measured duration are authoritative for later executions.

`pnpm test:restore` and `docs/backup-restore.md` document the workflow. CI is configured to install the signed PostgreSQL 17 client and perform this gate, but that remote gate has not yet executed at this checkpoint. No hosted database, external identity backup or cloud object store is connected.
