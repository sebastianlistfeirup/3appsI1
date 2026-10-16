# Studio One S08 — pause, resume and actionable corrections

Tasks now show their live description, prerequisite tasks, acceptance criteria and locked delivery. An unstarted task can be edited with an expected revision. A manual blocker records a reason; removing it resumes the existing run with identical input versions. Cancelling that run preserves the unresolved blocker. The activity screen explains blocked work before a user enters a delivery form.

Requesting changes creates an explicitly linked correction. Incoming prerequisites are copied and downstream dependencies move to the correction. Accepting the correction therefore lets the next task start. The original task, output files, delivery and review remain available in a separate history section. Completed tasks cannot be reopened and correction ancestry cannot be rewritten. These optional fields preserve existing package compatibility.

Verified locally on 16 October 2026:

- Five domain fixtures cover paused snapshots, cancellation, dependency correction, immutable ancestry and revision conflicts. The complete repository suite passes 172 unit tests after FlowLab L10 and Director storyboards.
- All 51 Studio browser tests pass across Chromium, Firefox and WebKit. The three new journeys exercise edits, actual saved/reloaded blockers, exported run identity, correction → acceptance → successor, immutable exported history and removal of an unstarted dependency.
- Additional tests exercise cancellation while blocked and keyboard focus through the specific delivery link in all three browsers. An initial test navigation race was fixed by waiting for the actual review form before reading its URL.
- Desktop 1440×900, tablet 1024×768 and mobile 390×844 screenshots were inspected. Fifteen additional axe checks (five per browser) have zero violations. The warning badge contrast and mobile toast width were corrected.
- All workspace typechecks and all three production builds pass. Modal keyboard trapping now includes links, hidden controls are excluded, and editing forms receive focus.

Evidence: `tests/e2e/studio-tasks.spec.ts`, `apps/studio/src/lib/tasks.test.ts`, `reports/e2e-results.json`, `reports/studio/*-task-pause-*.png`, and the compact reports in `reports/studio/a11y`.

The app remains a local manual production tool. No code agent, repository connector, paid service or cloud account is represented as connected.
