# FlowLab holdout contract

A holdout checks a frozen baseline; it never fits the model automatically. The local application supports synthetic pilot data and does not claim a connected digital twin.

1. Save a validated CSV with `case_id`, known `arrived_at`, activity events and explicit final completions. Time interpretation is ISO with timezone, seconds or minutes, chosen at import.
2. Select a period whose duration exactly equals the model observation window, and the activity that proves a case has completed. Intermediate activity completions are not throughput.
3. Confirm that the period was not used to tune the model and that the log includes all arrivals, activity visits and final completions, including unfinished cases. A source file previously transferred to a model assumption is rejected as an independent holdout.
4. Run at least 30 completed, distinct seeds of the current baseline. The assessment stores the model, engine version, seeds, source version ID, SHA-256, period and confirmations.
5. Inspect actual unique completions, median lead time, remaining backlog and queue time alongside simulation output. Missing arrivals, excluded rows, ambiguous final events and inconsistent case arrivals block a successful status. No values are imputed.

The pilot target is absolute relative error ≤15% for throughput and median lead time. It is a product target, not a statistical confidence interval or a guarantee of future performance. A zero observed value is only a zero relative error if simulation is also zero; otherwise the relative error is unavailable. No completed observed cases cannot establish a lead-time target. Small observed samples receive a visible warning.

Queue time is available only with complete chronological activity records that match model activity names/IDs, ending at the final completion, and no planned-wait nodes. It sums arrival-to-first-start and between-activity gaps. Activity elapsed time includes calendar pauses. If these assumptions cannot be established, queue time is unavailable rather than conflated with planned waiting. Backlog counts unique cases arriving before the window end with no final completion by that end; an arrival exactly at the end is excluded. Completions exactly at the end count, matching the engine contract.

The assessment is a period-specific result. Model changes make it visibly historical. PDF/JSON include its status, source, missing data and matching/historical relationship to the report baseline. The app retains the current cleaned dataset and up to three archived versions within 32 MB. A new import that requires deleting an old version must be explicitly accepted; the user can export all versions first. Restoration and removal are undoable. Manual transfer to a model requires saving the data version first. Reports resolve holdout data by its exact version ID, including archived versions. When the corresponding cleaned dataset is still available, the report ZIP includes `holdout-renset.csv` and `report.json` contains the exact parsed dataset, units and original source hash. Spreadsheet-formula-like text is prefixed with an apostrophe in CSV exports; JSON preserves original strings. If the source version is removed, the UI and exported report explain that the raw holdout rows are unavailable. A changed model blocks current-report export until another complete comparison is run. Structural input equality ignores object-key order. Uploaded workspaces discard imported assessments and simulation results and require fresh evaluation. All retained data versions are validated again.

Evidence: `packages/flow-engine/src/calibration.test.ts`, `apps/flowlab/tests/holdout-check.ts`, `reports/flowlab/holdout-check.json`, `reports/flowlab/holdout-report.pdf`.

## Daily evidence status

The compact status beneath the model title always refers explicitly to the **baseline**. It distinguishes no assessment, an incomplete assessment, a missed pilot target, a matching successful pilot assessment and a historical assessment. Matching requires the exact frozen baseline and current engine version. A scenario edit does not invalidate an unchanged baseline assessment, and the UI explicitly states that the alternative has not been independently assessed. Metadata such as `evidence: calibrated` does not create proof.

Expand the status to inspect the source, observed completions, seed count and exact period, with UTC stated for ISO timestamps. Missing cleaned source data appears even in the collapsed summary and in report diagnostics. Undoing the removal restores that source. Changing the baseline removes the green current status; undo can restore it only by restoring the matching model. A prior successful result remains available as historical evidence.

The report uses its own frozen baseline and engine version for this status. PDF footers retain the synthetic/imported basis and add the baseline holdout relationship. A successful holdout means only that the selected period met the recorded error threshold; the application has not automatically fitted or calibrated the model. The default threshold remains a 15% pilot target, not a universal validation standard.

Additional evidence: `apps/flowlab/src/lib/evidence-status.test.ts`, `apps/flowlab/tests/evidence-status-check.ts`, `reports/flowlab/*-evidence-status-check.json` and `*-evidence-report.pdf`.
