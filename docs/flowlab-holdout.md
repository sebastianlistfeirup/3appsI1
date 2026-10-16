# FlowLab holdout contract

A holdout checks a frozen baseline; it never fits the model automatically. The local application supports synthetic pilot data and does not claim a connected digital twin.

1. Save a validated CSV with `case_id`, known `arrived_at`, activity events and explicit final completions. Time interpretation is ISO with timezone, seconds or minutes, chosen at import.
2. Select a period whose duration exactly equals the model observation window, and the activity that proves a case has completed. Intermediate activity completions are not throughput.
3. Confirm that the period was not used to tune the model and that the log includes all arrivals, activity visits and final completions, including unfinished cases. A source file previously transferred to a model assumption is rejected as an independent holdout.
4. Run at least 30 completed, distinct seeds of the current baseline. The assessment stores the model, engine version, seeds, source SHA-256, period and confirmations.
5. Inspect actual unique completions, median lead time, remaining backlog and queue time alongside simulation output. Missing arrivals, excluded rows, ambiguous final events and inconsistent case arrivals block a successful status. No values are imputed.

The pilot target is absolute relative error ≤15% for throughput and median lead time. It is a product target, not a statistical confidence interval or a guarantee of future performance. A zero observed value is only a zero relative error if simulation is also zero; otherwise the relative error is unavailable. No completed observed cases cannot establish a lead-time target. Small observed samples receive a visible warning.

Queue time is available only with complete chronological activity records that match model activity names/IDs, ending at the final completion, and no planned-wait nodes. It sums arrival-to-first-start and between-activity gaps. Activity elapsed time includes calendar pauses. If these assumptions cannot be established, queue time is unavailable rather than conflated with planned waiting. Backlog counts unique cases arriving before the window end with no final completion by that end; an arrival exactly at the end is excluded. Completions exactly at the end count, matching the engine contract.

The assessment is a period-specific result. Model changes make it visibly historical. PDF/JSON include its status, source, missing data and matching/historical relationship to the report baseline. When the corresponding cleaned dataset is still available, the report ZIP includes `holdout-renset.csv` and `report.json` contains the exact parsed dataset, units and original source hash. Spreadsheet-formula-like text is prefixed with an apostrophe in CSV exports; JSON preserves original strings. Uploaded workspaces discard imported assessments and simulation results and require fresh evaluation.

Evidence: `packages/flow-engine/src/calibration.test.ts`, `apps/flowlab/tests/holdout-check.ts`, `reports/flowlab/holdout-check.json`, `reports/flowlab/holdout-report.pdf`.
