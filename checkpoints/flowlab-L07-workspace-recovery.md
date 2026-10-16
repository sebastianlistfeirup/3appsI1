# L07 — Recoverable workspace packages and long PDF text

Implemented and executed locally on 2026-10-16. All operations are local; no cloud integration is claimed.

A real 20-node, 10,000-case simulation generated a workspace above the previous 20 MB import limit because exports included the computed event details. Model-package exports now contain compact inputs, data, narrative and version snapshots, with simulation results exported separately in the report package. Export/import runs in a dedicated worker with cancel and readable errors. The import limit is 128 MB. Imported simulation and holdout claims are discarded; CSV rows are validated again and their duration/period summaries recalculated from their explicit unit. Actual input changes during import prevent that import from replacing the newer work.

Version numbers remain unique after passing 30 snapshots. New snapshots respect a visible 16 MB storage budget. When that budget would be exceeded, existing history remains intact and the app explains how to export and remove a snapshot. Individual removal is undoable. Selecting an imported model also selects a valid editable activity. Opening a fresh template terminates the previous simulation.

PDF generation wraps long unbroken words within measured font bounds, preserves complete long names/narrative in an appendix, and prevents trailing diagnostic text from overflowing a page. The data workshop now displays sub-minute medians in seconds or milliseconds instead of rounding a positive duration to 0.0 minutes.

Executed verification:

- FlowLab and engine typechecks pass. Production build passes.
- `pnpm exec vitest run packages/flow-engine/src apps/flowlab/src/lib packages/persistence/src`: 69 tests pass. A genuine 10,000-case / 20-node engine result exceeds 20 MB in the old export and round-trips as a model package below 2 MB; malformed/forged dataset summaries and snapshot retention are covered.
- `node apps/flowlab/tests/workspace-check.mjs` in Chromium, Firefox and WebKit: 6 checks each across 1440×900, 1024×768 and 390×844; no page errors or overflow. Covers downloaded-file round trip, rerun, narrative/snapshot preservation, undoable removal, malformed input, cancellation and concurrent edits. The race fixture delays delivery to the real worker; it never supplies fake worker results.
- `pnpm exec tsx apps/flowlab/tests/report-layout-check.ts`: actual 30-pair golden report, 200-character alternative name, 100-character model name, 4,000-character unbroken hypothesis and nearly 10,000-character Danish decision. Eight PDF pages; all 568 extracted words within printable margins; Danish characters and text endings preserved. Evidence: `reports/flowlab/report-layout-check.json`, PDF and page-three render.
- Browser journey: 9 checks pass, including two-tab conflict and PDF/JSON KPI consistency. Holdout passes at all three sizes. Accessibility: 18 screens, zero WCAG2AA/21AA violations.

Evidence is under `reports/flowlab/`; mobile/tablet workspace views and the PDF appendix were visually inspected. Browser test commands use `FLOWLAB_BROWSER` and portable Chromium detection.

Remaining: retain separate cleaned training/holdout versions across later imports; distinguish current inputs from historical results in report export. These are the next audit targets, not completed claims.
