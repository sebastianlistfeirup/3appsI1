# F11 — durable private upload lifecycle

Written: migration 0004, FORCE-RLS upload reservations, immutable finalization/audit, shared quota locking, bounded binary HTTP route and recovery protocol. Byte storage and metadata are separate durable steps; unknown commit acknowledgement never deletes a file. Studio's optional server exports PUT; its browser demo is unchanged.

Executed: 61 integration tests across seven actual PostgreSQL suites; 238 unit tests; all workspace/tools typechecks; Studio production build. Thirteen new upload cases include concurrency, quota, auth/archive/revocation races, stream cancellation, integrity, adapter ceiling and a genuinely committed transaction followed by injected acknowledgement loss. The actual HTTP proof passes 21 checks, including SIGKILL/restart between PUT and finalization. Two-cluster pg_dump/pg_restore preserves 27 app/queue tables, two published files and one unpublished upload, which is finalized after restore without reupload. All temporary-service cleanup passes.

Verified locally: these commands and current reports. The preceding complete GitHub run 38978012084 on 23d0bdc is green; run 38979772042 on 462f0b2 covers newer UI/HTTP/archive work but does not yet include F11. No claim of remote F11 verification until pushed and completed.

Connected: no hosted identity, cloud storage or paid service. Pending reservations retain quota indefinitely; automated cancellation/garbage collection and production throttling remain explicit operational gaps. See [upload protocol](../docs/durable-uploads.md) and current machine-readable reports.
