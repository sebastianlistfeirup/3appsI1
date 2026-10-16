# Studio One — core checkpoint

2026-10-16, task S01-S04/S09 local portion. Owner: coordinator.

Implemented: independent Next app, Danish responsive production workspace, project create/archive/search, immutable briefs/assets, dependency DAG with cycle checks, manual input snapshots, idempotent manual run creation, uploaded/text output, review/checklists, stale acknowledgment, rejection correction task, history, SHA-256-validated ZIP import/export. Synthetic Realmread sample uses original SVG/HTML art. Fonts self-hosted with OFL licenses. Shared IndexedDB has CAS and cross-tab conflict detection.

Executed and passed: Studio TypeScript check, production build, 11 domain/ZIP fixtures, 6 end-to-end scenarios in Chromium, same 6 in Firefox and WebKit (18/18 total). Automated axe checks report no violations on all six core screens. Screenshots at 1440x900,1024x768,390x844 under reports/studio. Browser errors absent in primary smoke. Real exported ZIP re-imported and validated from browser download.

Current work: stricter archive/import/recovery edge review. WebKit dependencies were extracted without root changes; its bundle wrapper resets LD_LIBRARY_PATH, so absent dependencies were linked into its sys/lib. The host ldconfig preflight cannot see them and is skipped only for that environment; actual WebKit tests execute and pass. The latest tests must be rerun after subsequent changes; this checkpoint does not certify future commits.

Not connected: Supabase/Auth/cloud storage, GitHub App runtime, code agent execution, paid provider adapters and payment. No claim of tenant isolation in the local IndexedDB profile. App is DEMO with manual production flow. A real database/job foundation is next, separately verified before cloud claims.

Next: finish accessibility/browser gates; add data/RLS/job/budget integration fixtures against real local Postgres. Integrate specialist milestones after diff review.
