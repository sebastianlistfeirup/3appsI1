# Studio One S07 — exact input comparisons and every output

Review now selects every delivered file and compares it with the exact version in the run's locked input snapshot. Uploading an intermediate version after a run starts no longer changes the before-image. A newly delivered file has no invented baseline. Both input and output can be downloaded directly.

The text comparison preserves original line endings, byte-order marks and final-newline differences. It keeps unchanged sections between separated edits, shows original line numbers and collapses long unchanged sections. Patience anchors and bounded LCS avoid an unbounded quadratic allocation. Ambiguous large gaps are explicitly marked as a coarse replacement; very large files retain downloads and explain the preview limit. Rendering proceeds in 400-line batches. These are display choices; file content and history do not change.

Executed and verified locally:

- Six domain fixtures, including 200 deterministic lossless reconstruction cases, separated edits in a 2,000-line file, CRLF/EOF differences and an intervening file version.
- 42 browser cases pass: 14 per engine in Chromium, Firefox and WebKit. The new cases use real imported ZIPs, exact input downloads, all output files, pagination and oversized comparisons.
- The diff screen at desktop/tablet/mobile and its file list pass axe in all three engines. Actual screenshots are in `reports/studio/*-comparison-*.png`.
- The complete unit suite passes 156 tests after integrating FlowLab dataset history and Director's production library. All workspace typechecks pass.
- All three production builds pass. A final line-ending checkbox correction has an additional three-browser regression; it remains possible to toggle the markers off and on.

The new screen coverage exposed insufficient contrast in the stale-input acknowledgment and file metadata; the colors were corrected. Accessibility reports now retain the engine, browser, viewport, execution time and violations without duplicating thousands of irrelevant rule nodes.

Connected scope remains local files, IndexedDB and browser workers. No external build, repository or provider is represented as connected.
