# L06 — CSV interpretation, provenance and cancellation

Implemented and executed locally on 2026-10-16. No cloud service is connected.

The prior preview could survive changing its time unit or column mapping. Saving then attached the changed interpretation to the old parsed result. The data workshop now invalidates the preview, hash and exclusion decision whenever interpretation changes. A new file terminates any previous import; callbacks must belong to the current worker. Cancel immediately terminates work while keeping the last saved dataset. Same-file selection works again. Simulation callbacks also reject stale workers, and importing a model cancels the prior simulation before rerunning imported input.

Activity suggestions use a labeled native input/datalist with at most 200 options, searching the complete list. Unique activities and duration distributions are memoized. A source cannot silently retain holdout confirmations from a different dataset. Quality-check JSON now records the actual filename, SHA-256 and time unit. CSV accepts a BOM before quoted headers across chunks and rejects mapped IDs/names over 100 characters or containing control characters with explicit row errors. An unknown final activity is an explicit holdout error.

Executed gates:

- `pnpm --filter @tre/flow-engine typecheck` and `pnpm --filter @tre/flowlab typecheck` pass.
- `pnpm exec vitest run packages/flow-engine/src apps/flowlab/src/lib packages/persistence/src`: 63 tests pass, including BOM, identifier and holdout regressions. `reports/flowlab/engine-tests.txt`.
- `pnpm --filter @tre/flowlab build`: production build passes. `reports/flowlab/build.txt`.
- `node apps/flowlab/tests/import-state-check.mjs`, repeated with `FLOWLAB_BROWSER=firefox` and `FLOWLAB_BROWSER=webkit`: 15 checks per browser, 45 total, across 1440×900 / 1024×768 / 390×844. Real 100,000-row, 5,877,828-byte CSV cancellation and replacement; old source survives; new hash matches; 1,000 activity names stay bounded/searchable; no page errors or overflow. `reports/flowlab/import-state-{chromium,firefox,webkit}.json` and matching screenshots.
- `pnpm exec tsx apps/flowlab/tests/holdout-check.ts`: exact golden holdout, report provenance, reload and accessibility pass at all three sizes.
- `node apps/flowlab/tests/accessibility-check.mjs`: 18 screens, zero WCAG2AA/21AA violations.

Desktop and mobile screenshots were visually inspected. Browser scripts support installed Playwright Chromium when system Chromium is absent; `FLOWLAB_BROWSER` selects the engine. The host's extracted WebKit/Firefox libraries require `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` in this workspace only.

Remaining follow-up: compact, reliable model-package round trips and long unbroken PDF text. This checkpoint does not claim those are complete.
