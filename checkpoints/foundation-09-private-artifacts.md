# F09 — private immutable files and short download links

Implemented `@tre/storage` with canonical metadata-derived keys, actual private Linux filesystem publication/read verification and one-minute HMAC capabilities. The optional Studio backend issues authorized links and rechecks actual database membership when they are redeemed. Local demo state stays local.

Executed: full workspace typecheck; 215 unit tests in the full run, then the final ten-test storage suite after canonical-path normalization; 48 PostgreSQL integrations including six real API/storage cases; Studio production build. The new unit suite initially passed all nine tests, including ten concurrent publications and corrupt-existing-file refusal. The final path-normalization fixture and affected backend typecheck also passed. No frontend interaction was changed.

Verified: exact binary and HEAD, no-store attachment headers, revoked viewer blocked before disk access, foreign app/ID isolation, expiry/tamper/key rotation, immutable non-overwriting publication, private modes, symlink refusal, corrupted/missing-file errors, and archived historical reads. The API uses a restricted database login and signed ES256 test identities. See [private artifact contract](../docs/private-artifacts.md).

Not connected: hosted object storage/auth, browser cloud upload, upload reservation/finalization, billing or external providers. No customer data, secrets or paid calls were involved. This is a locally verified reference backend; it does not promote the demo apps to a hosted release.
