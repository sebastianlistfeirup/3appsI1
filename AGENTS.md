# Project instructions

This monorepo implements the user-supplied Masterbibel v1 for Studio One, FlowLab and Director. Read docs/spec for authoritative requirements. The explicit user mandate permits autonomous reversible development and up to two specialists. No new paid external calls; no public production release or customer outreach is authorized.

## Ownership

One coordinator owns root config, lockfile, shared contracts, persistence, database, general worker infrastructure and integration. Specialist tasks use task branches in separate worktrees with explicit allowed_paths. Do not change another owner’s files; propose shared changes to the coordinator. Commit coherent work with a checkpoint.

## Verification

Use pnpm. Domain code requires meaningful deterministic fixtures. UI changes require browser inspection and screenshots at 1440x900, 1024x768 and 390x844. Run affected typechecks, unit tests and production builds before integration. Never describe a mock as a connected integration. Demo mode is synthetic, local and cannot accept payment or customer information. No arbitrary customer code execution.

## Product quality

Use Danish UI, polished responsive layouts, explicit loading/error/empty/save states, labeled inputs, keyboard focus and reduced motion support. Buttons perform real actions or explain a genuine missing capability. Persist local state in IndexedDB with schema validation and revision conflicts. Preserve versions, export real files, and retain the previous good result on failure.

## Handoff

Update task checkpoints, STATUS.md and STATE.json with written / executed / verified / connected distinctions. Evidence must reference actual commands and artifacts. Never commit credentials or generated dependency directories. Source spec excerpts are the supplied PDF transcription; no supplementary ZIP was attached.
