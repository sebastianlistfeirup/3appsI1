# FlowLab L03 — engine audit, accessible editor and embedded PDF typography

## Written

Motor version is `flow-des/1.1.0`. Activity capacity/cost aggregates now remain exact when visual timelines are capped. Planned waits still in progress count only elapsed time. Explicit case IDs cannot silently change warmup cohorts. Runtime conservation checks compare actual queues, occupancy and case states. Calendars use bounded, precomputed intervals; dispatch events at identical times are deduplicated and queues stay in stable FCFS order without repeatedly sorting blocked queues. Trace/timeline truncation is explicit. Imported graph IDs, routing fields and non-activity costs receive stricter validation.

Comparison assembly rejects duplicate seeds and mixed model/engine/window versions. Report creation recalculates aggregate metrics from the paired runs and rejects altered aggregates. Old engine snapshots are visibly stale and require a rerun.

The PDF embeds licensed DM Sans and Manrope fonts and uses actual glyph widths. Danish text, long narrative appendices and the same numeric report object are preserved. The PDF package loads only when exporting, with visible preparation/error state.

Helper text is at least 12 CSS px, diagram labels are larger, chart axes use an actual responsive SVG coordinate system, and colors were adjusted against their real backgrounds. Arrow/Home/End tab navigation and keyboard-scrollable result tables work. Canvas pointer dragging now persists positions; adding a normal step after a selected linear step inserts it into the graph.

## Executed / verified

- Engine and FlowLab TypeScript checks pass.
- `pnpm exec vitest run packages/flow-engine/src apps/flowlab/src/lib`: 36 tests pass, including the original numerical golden contract and new adversarial cases for capped timelines, exact horizon boundaries, censored waits, overload and report integrity.
- Production build passes (`reports/flowlab/build.txt`).
- `node apps/flowlab/tests/accessibility-check.mjs`: actual axe WCAG 2.0 AA + 2.1 AA checks on six screens at all three required viewports: **18/18 with zero violations and no page overflow**. Per-screen evidence under `reports/flowlab/a11y/`; summary in `reports/flowlab/accessibility.json`. This is automated evidence, not a claim of full manual WCAG certification.
- Browser screenshot and nine-step data/model/report/conflict journey pass. Real PDF text extraction matches every baseline/scenario KPI to ZIP JSON. Screenshots are refreshed for 1440×900, 1024×768, 390×844 and visually inspected.
- `node apps/flowlab/tests/canvas-check.mjs`: actual pointer drag, position after reload and keyboard tablist navigation pass (`reports/flowlab/canvas-keyboard.json`).
- Actual 20-node, 10,000-case, 30-replication benchmark with version 1.1.0: 17,078,131 events; 38.43 s total / 1.281 s mean; peak RSS 588,252 KiB; 10,000 unique completions in every run. Host and run distribution recorded in `reports/flowlab/benchmark-30.json`. Other development processes were active on the shared host; this is not a mobile benchmark.

## Connected / limitations

Still an actual local browser application, not a cloud service. Tenant authorization/auth/billing remain outside this app's local mode. Holdout comparison is the next stage; imports continue to say not calibrated. Cross-browser verification beyond Chromium is pending. Automated accessibility checks do not replace keyboard/screen-reader user testing.
