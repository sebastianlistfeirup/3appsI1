# S12 — durable review drafts and exact delivery boundaries

Review comments and checked passed criteria now survive immediate navigation, reload and project ZIP roundtrip without accepting a delivery. Each immutable delivery has a separate draft. Standalone JSON import validates project, delivery, exact output IDs and criterion references before applying anything. Final acceptance or a correction removes the draft atomically with the actual review; invalid actions leave it available. Stale-input acknowledgment is deliberately not serialized and resets when the input changes or the page reloads.

The form distinguishes pending, durably saved, failed and conflicted persistence. Quota failure leaves the current text downloadable and reimportable. Reload visibly returns to saved data. Archived drafts are read-only. The form flushes when focus leaves the section, avoiding a Firefox pointer race where a storage-error banner could move a checkbox during its click. Explicit input labels preserve the same accessible name after a textarea gains content.

The delivery selector uses Next navigation, preserving the draft flush. Base64 HTML/SVG outputs now decode exact original bytes for the existing sandbox; an actual SVG displays Danish text while its embedded script stays blocked.

Executed: workspace typechecks, 254 unit tests in 38 files, Studio production build, and the complete Studio browser suite (84 tests across Chromium, Firefox and WebKit). The new five flows per browser cover real IndexedDB, actual downloads, forced quota errors, separate drafts across two deliveries and real sandboxed SVG. The Firefox quota case also passed three repeated runs after the focus fix. Twelve new axe checks have zero violations; screenshots at 1440×900, 1024×768 and 390×844 are under `reports/studio/*-review-draft-*.png`. All three sizes were visually inspected. No external service is connected by this change.

Evidence: `apps/studio/src/lib/review-drafts.test.ts`, `tests/e2e/studio-review-drafts.spec.ts`, `reports/studio/a11y/*review-draft*`, `reports/e2e-results.json` and `docs/studio-review-drafts.md`.
