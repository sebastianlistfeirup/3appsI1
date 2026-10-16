# L08 — Daily data versions and current-input reports

Implemented and exercised on 2026-10-16. Local IndexedDB mode; no connected customer system is implied.

The data workshop now keeps the current cleaned dataset and up to three historical versions within a visible 32 MB budget. Each retains parsed rows, quality results, explicit time unit, original source hash and its own version ID. Restore changes the dataset without silently changing model assumptions. Removing an archived version and retention cleanup can be undone. A fifth version, or an import crossing the byte limit, requires explicit agreement to the named removals; a working workspace export is available before that choice. Manual transfer to a model requires saving the source version first.

A holdout records the exact source version ID. A report still includes its original cleaned rows after another dataset becomes current; identical source hashes with different interpretations cannot substitute another version. Removing a source leaves a clear notice in the UI and report. Imported workspace archives are revalidated and recomputed, with distinct IDs and an aggregate storage budget.

A current report cannot combine newly changed model input with an old simulation result. Export is blocked until the paired comparison completes again. The previous complete result remains visible with its existing warning. Model equality ignores object-key ordering, preventing valid template inputs from being incorrectly marked as changed. A selected editable node also survives model import/reload correctly.

Executed:

- Production build and app/engine typechecks pass.
- Unit/domain suite: 75 tests pass, including the real 32 MB limit using valid large CSV data, count retention and explicit consent, source-ID matching, archive restore/roundtrip, missing-source report diagnostics and stale-input rejection.
- `pnpm exec tsx apps/flowlab/tests/data-history-check.ts`, Chromium/Firefox/WebKit: 7 logical checks × 3 viewports per browser. Exact archived golden source is present in the real report ZIP after three subsequent imports; fifth-version backup/consent, undo, restore, reload and rerun are verified. All nine populated-history screens have zero WCAG2AA/21AA violations and no page errors/overflow. Evidence: `reports/flowlab/data-history-*.json`, archived-source ZIPs, full screenshots and version-panel detail captures.
- CSV state browser regression: 15 checks pass. Full browser journey: 9 checks pass, including two-tab conflicts and matching PDF/JSON KPI values.
- Mobile version-panel screenshot was inspected and refined to give filenames, dates and actions sufficient room.

The shared storage-error improvement 0890bba was separately cherry-picked as b89d185; the coordinator already owns that change.

Next product work: explain individual cases from real event evidence, improve the paired-run distribution display and short-window chart labels, and retain the daily experiment context (seed, named alternative and hypothesis) across reload/version restore.
