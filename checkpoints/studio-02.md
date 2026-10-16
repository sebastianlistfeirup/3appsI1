# Studio One S03–S04 / defensive review and archive behavior

Verified locally after the shared persistence race fix:

- Archived projects cancel pending manual submissions and reject new mutations. Restoring creates a new audit event; historic versions remain untouched.
- A rejected editor action leaves the form and its input open. Success messages no longer hide a domain error.
- Async actions carry the expected project revision. Historic briefs, files, deliveries, reviews and activity cannot be rewritten through the shared project mutator.
- Duplicate request IDs cannot change task, and one task cannot have two active submissions. Delivery evidence must cover every acceptance criterion from its locked brief.
- Project/record IDs cannot contain path traversal or route separators.
- HTML preview uses both an empty iframe sandbox and a network-blocking CSP. Actual Chromium/Firefox/WebKit tests verified that uploaded scripts and remote image requests were blocked while preview content remained visible.

Evidence: 16 domain tests pass; 24 browser cases pass (eight journeys × three engines), six axe scans have zero violations, and the production build succeeds. `reports/e2e-results.json` is the completed run. The first new archive test exposed an ambiguous test selector matching Next's route announcer as well as the intended alert; the selector was corrected and the complete suite passed. No application failure was hidden.
