# S16 — exact input versions and portable work packages

Manual runs now explicitly choose at most100 input versions, one per file family. Search and eight-row pagination retain the entire selection. The default still uses current versions, but nothing is silently dropped for a project with more than100 families. Corrections start from the original input plus the actually reviewed output, not later unrelated uploads.

An actual dedicated browser-worker exports the locked task/brief agreement, selected original bytes, provenance, a machine-readable context and SHA-256 manifest. The archive never executes code or pretends to be a full project backup. Historical runs keep their original task snapshot; legacy runs identify their missing task snapshot honestly. Invalid selected bytes stop export. Unselected files are not cloned or included. Abort, unmount, error and the60-second deadline terminate the worker.

Executed: six domain fixtures, all320 workspace tests in52files before the L24 merge, workspace typechecks/tools typecheck and Studio production build. Nine new actual browser cases pass across Chromium, Firefox and WebKit: original-version ZIP with hash verification and reload,101-file selection boundary, and actual worker termination on explicit cancellation/dialog close. Twelve axe scans have zero violations. Three viewports were inspected; a checkbox layout inherited a column direction and has been made an explicit row. The fresh full138-scenario Studio run is in progress.

Evidence: `apps/studio/src/lib/run-package.test.ts`, `tests/e2e/studio-work-package.spec.ts`, `reports/studio/*work-input*`, `reports/studio/a11y/*work-*`. User guide: `docs/studio-work-packages.md`. No cloud/provider connection or paid operation was added.
