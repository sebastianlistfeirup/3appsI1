# S17 — bounded, searchable production history

Run history displays eight entries per page; activity displays twenty. Search includes historical owners and task titles from the immutable run snapshot, with current task text only as the explicit legacy fallback. Status filters and counts retain all records. Direct links reveal and focus the exact run across pages, after reload, and after a later hash change. Unknown links have a visible explanation. This is read-only presentation and does not prune data.

Executed against the production build: all 144 Studio browser scenarios passed in Chromium, Firefox and WebKit (9.3 minutes). The six new cases import a real project with 1,000 runs and 10,000 events, verify bounded DOM size, search historical owner and old revision, follow deep links, export an old run work package and verify the full project export still contains every record. Nine new viewport-specific axe scans have zero violations; desktop and mobile screenshots were inspected. Studio build/typecheck and tools typecheck are green.

Evidence: `tests/e2e/studio-history.spec.ts`, `reports/e2e-results.json`, `reports/studio/*long-history*`, `reports/studio/a11y/*long-history*`. User guide: `docs/studio-history.md`.
