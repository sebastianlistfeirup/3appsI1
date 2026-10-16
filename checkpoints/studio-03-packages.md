# Studio One S06 — portable packages and unsaved recovery

Written: ZIP v2 with metadata separated from file bytes, bounded background workers, v1 import compatibility, duplicate import as an independent project and recovery export directly from the in-memory document. New edits enforce a 48 MB file-history / 4 MB metadata budget. Legacy persisted data stays readable. UTF-8 BOM and byte/hash consistency are preserved. Full details: `docs/studio-project-packages.md`.

Executed and verified locally on 16 October 2026:

- 36 actual Playwright cases pass in Chromium, Firefox and WebKit: the previous 24 core journeys plus duplicate/copy, actual quota failure, 11.2 MB binary ZIP and BOM-preserving upload in every engine.
- Duplicate dialogs at 1440×900, 1024×768 and 390×844 and the quota recovery screen pass axe in each engine. Their screenshots and JSON are in `reports/studio`.
- The archive suite exercises real incompressible binary bytes, v1/v2 roundtrips, metadata tampering, corrupt input and budget rejection; the complete repository unit gate passes 140 tests.
- `pnpm typecheck` passes, including browser test source now covered by `tsconfig.tools.json`.
- `pnpm build` produces all three app builds successfully. The six existing core Studio accessibility scans also remain green.

The new accessibility cases exposed low contrast in project cards, the import dialog description and older brief rows. Those colors were fixed before the complete green browser gate. A BOM upload also receives explicit byte-level verification; previews alone would not detect the original byte/hash mismatch.

Connected: local IndexedDB and actual browser workers. Hosted storage and cloud backup remain unconnected. A forced `QuotaExceededError` is a controlled browser fixture, not a claim that a real customer filled a disk.
