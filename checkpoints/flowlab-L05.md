# FlowLab L05 — conserved overload, unavailable metrics and adversarial audit

## Written

Engine version `flow-des/1.2.0` replaces the global shifting queue with compact per-pool queues while selecting globally earliest eligible FCFS heads. This preserves event assignment order and prevents repeated copying of a 100,000-case backlog. Ongoing queued cases now expose elapsed waiting at the censoring time; completed-case KPI denominators remain unchanged. Total Poisson arrivals plus initial backlog are bounded together. Queue-by-node records safely handle object-like identifiers, while `__proto__` node IDs are rejected because the persistence validator cannot roundtrip that key safely.

Baseline and scenario headline metrics now retain each side's available runs when the other side has no completions. Paired deltas still require both values and report their actual pair count. Unavailable values are never fabricated as zero. The result screen and PDF explain engine diagnostics in Danish. New scenario-only resource pools are included in resource comparison. Sub-minute diagram durations remain visible as seconds; canvas controls have Danish accessible names.

## Executed / verified

- 60 tests pass, including exact golden fixtures, zero-completion comparison, censored queue accounting, object-like IDs, combined case bounds and blank/null CSV export behavior. Engine/FlowLab typechecks and production build pass.
- Differential audit against immutable pre-refactor engine commit `8d21bf7`: 60 varied capacities, arrival rates, initial backlogs, durations, calendars and seeds produce matching metrics, traces, event counts, timelines and normalized queue samples. Only censored waiting-case queue time is intentionally excluded because that is the documented accounting fix. Script/evidence: `apps/flowlab/tests/engine-audit.ts`, `reports/flowlab/engine-audit.json`.
- Actual 100,000 simultaneous arrivals, one worker, 1 ms service: 100,000 unique completions, no backlog, utilization 1; 2.00 s on the recorded host. No timing assertion is used as a correctness test.
- Actual 20-node × 10,000-case × 30-replication benchmark: 30.83 s total / 1.028 s mean; 17,078,131 events; peak RSS 583,412 KiB; 10,000 completions every run. Host/workload distribution recorded in `reports/flowlab/benchmark-30.json`.
- Browser edge journey: zero-capacity alternative preserves the known 70.9 min baseline, displays unavailable scenario lead time and zero paired lead metrics, and exports the diagnostic into a real PDF. Evidence: `reports/flowlab/edge-results-check.json` and `zero-capacity-report.pdf`.
- Existing nine-step journey, holdout journey in all three sizes, main Chromium/Firefox/WebKit paths and 18-screen axe checks pass. Updated screenshots retain actual calculated output.

## Connected / limitations

Local mode only. Numeric behavior and browser workers are real; no customer deployment, tenant cloud connection or payment is implied. The benchmark is for the documented Linux/Node host, not a mobile performance claim. Independence/complete logging for holdout still require process knowledge.

## Next

Harden import-state invalidation and cancellation, large workspace roundtrips, long-text PDF wrapping and bounded local dataset/version retention; expand editing and scenario coverage.
