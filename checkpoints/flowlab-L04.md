# FlowLab L04 — independent holdout, provenance and cross-browser evidence

## Written

The data workshop now compares a frozen baseline against an explicitly independent holdout period. It requires a final-completion activity, an exactly compatible observation duration and at least 30 complete baseline seeds. Unique observed throughput, median lead, backlog and defensible queue time are calculated from actual imported events. Missing arrivals, excluded rows, ambiguous final events and inconsistent arrivals remain visible. Planned waiting is never relabeled as queue waiting. The 15% pilot target is shown only for this period, with a small-sample notice where relevant.

Manual observed-median transfer now selects one observed activity and records the source hash. The same source cannot subsequently establish an independent holdout. Saved assessments retain model/engine/seeds/period/source and show historical status after baseline changes. Workspace imports discard untrusted assessments. The PDF and JSON include the assessment; a matching cleaned dataset is bundled as CSV and JSON for reproduction.

CSV parsing now ignores quoted delimiters, rejects ambiguous/unknown mappings, unnamed columns, unsafe timestamps and finish-before-arrival even without start. Inherited object properties cannot become mapped fields. Worker decoding rejects invalid UTF-8. After saving a dataset, the import form closes to make space for analysis.

All five browser scripts select Chromium portably: explicit environment path, system binary if present, otherwise Playwright's installed browser. The main browser script also supports Firefox and WebKit. Shared persistence fix 4b93720 was incorporated unchanged (local cherry-pick c731faf).

## Executed / verified

- Engine/FlowLab typechecks and production build pass.
- Domain/report/shared persistence tests pass: 55 tests. Eight dedicated holdout cases cover exact golden values, independence, missing/excluded data, final-activity throughput, pilot failure, period/batch incompatibility, planned-wait exclusion and ambiguous case histories.
- Actual Chromium holdout journey at 1440×900, 1024×768 and 390×844: import workspace + streamed CSV; missing-confirmation failure; exact throughput 3 / lead median 2 min / mean queue 0.5 min / backlog 0; successful pilot result; reload; export; reused-training-file rejection. Zero page errors, horizontal overflow or axe WCAG2AA/21AA violations.
- Existing nine-step data/model/report/conflict journey and canvas keyboard/drag checks pass with the new shared persistence controller.
- Actual Firefox and WebKit runs cover all three viewports, four core screens, worker results, PDF/ZIP downloads and persistence: zero errors. Per-browser screenshots and JSON evidence under `reports/flowlab/firefox` and `reports/flowlab/webkit`.
- Standard six-screen × three-viewport accessibility pass remains zero violations. Detailed output is reduced to engine/environment/violations metadata; the summary preserves every checked screen.
- Holdout PDF was extracted and visually inspected. A dedicated report test verifies cleaned CSV, source hash, underlying observations and historical baseline distinction.

## Connected / limitations

Local IndexedDB and actual browser workers only. No cloud auth/payment or real customer integration. Independence and log completeness require the user's truthful process knowledge; a hash detects exact-source reuse and does not prove causal or statistical independence. A target-met period is not automatic, universal calibration. Full browser journeys beyond the core screens currently run in Chromium; Firefox/WebKit cover the main comparison/export/persistence path.

## Next

Audit zero-completion comparisons, censored queue accounting and adversarial model IDs; improve model package roundtrips and large-file guardrails; deepen editable scenario/workspace behavior and stress evidence.
