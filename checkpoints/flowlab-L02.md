# FlowLab L02 — local end-to-end laboratory

## Written

Danish FlowLab UI with a bright teal visual system; a React Flow canvas and keyboard/touch list editor; editable activity distributions, resource pools/capacity/cost/calendar, probability or case-type routing, planned waits and bounded rework. Mobile starts with a readable list and a direct capacity control. Model validation points to affected nodes. Undo/redo supports keyboard shortcuts.

Paired comparisons execute in a dedicated Web Worker with 30 seeds. Every chart is computed from engine output. The UI retains prior results on error/cancellation, marks stale snapshots, displays paired 10–90 percentile simulation spread and explains metric definitions/censoring. Cancellation immediately terminates the active worker and retains completed pairs as explicitly partial JSON.

Local persistence uses the shared IndexedDB revision/CAS API, validates documents, exposes save/error/conflict states, preserves snapshots and allows workspace export/import. Imported result data is discarded and recalculated from model input rather than trusted.

The data workshop streams CSV parsing in a worker, maps allowed columns, validates explicit timezone/relative units, marks exact row errors, requires explicit exclusion, stores a cleaned dataset and allows a deliberate observed-median-to-model transfer. It never claims automatic calibration. Fonts are licensed and self-hosted; no external runtime font request is required.

Reports export actual vector PDF, full JSON, numeric CSV, model snapshots and a reproducibility README in ZIP. Long narratives are preserved in appendices. All KPI values use the same report object as underlying JSON.

## Executed / verified

- `pnpm --filter @tre/flow-engine typecheck`
- `pnpm --filter @tre/flowlab typecheck`
- `pnpm exec vitest run packages/flow-engine/src apps/flowlab/src/lib`: 29 tests passing.
- `pnpm --filter @tre/flowlab build`: production build passes, recorded in `reports/flowlab/build.txt`.
- `node apps/flowlab/tests/browser-check.mjs`: actual Chromium production-server inspection at 1440×900, 1024×768 and 390×844; model/scenario/results/report screenshots; no page errors or horizontal overflow; PDF/ZIP downloads and persistence.
- `node apps/flowlab/tests/journey-check.mjs`: 9 checks pass. Capacity edit + stale results + undo; rerun + version save; negative CSV row/exclusion/save; real observed median applied; two-tab conflict and reload; all rendered PDF KPIs matched JSON; report decision survived reload; empty and invalid-routing states at all three sizes.
- `pnpm exec tsx apps/flowlab/tests/benchmark.ts 30`: 10,000 cases × 20 nodes × 30 replications, 22,203,270 events, 35.58 s total / 1.186 s mean, peak RSS 564,420 KiB. Actual machine and distribution recorded in `reports/flowlab/benchmark-30.json`. Workload completed 10,000 unique cases in each run and conserved cases. This is Node on the documented AMD EPYC host, not a mobile performance claim.

## Connected / limitations

Connected only to local IndexedDB and actual browser workers. No cloud auth, tenant database, payment, telemetry, paid providers or public deployment. FL-AT11 tenant/viewer proof remains coordinator/backend work. Chromium is verified; Firefox/WebKit not yet verified. The PDF is correct and readable with a standard PDF renderer; embedded typography is the next export-hardening stage. Holdout calibration remains explicit next work; imported data stays visibly uncalibrated. Full case traces are retained for the first paired run; later batch runs retain metrics, queue samples and resource aggregates to bound report size.

## Next

Embed licensed PDF fonts; audit adversarial engine/graph cases and imported report contracts; implement useful holdout comparison; investigate overload performance and accessible input contrast. Then repeat affected gates and record next checkpoint.
