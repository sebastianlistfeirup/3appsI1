# Director D01–D05 checkpoint

Owner: Director specialist. Branch task/D01-director-core. Foundation: 1166ae3 + esbuild install fix 046de4a (cherry-picked as 664bf29).

## Written

- Zod project/scene/camera/shot/media contracts; right-handed Y-up transforms, normalized quaternions, immutable scene and shot revisions, integer-frame timeline.
- Actual procedural Three.js observation deck, two original primitive characters, five cameras. 2D-plan fallback edits the same scene data.
- Danish responsive editor: scene/camera/object/shot inspectors, scene saves, undo/redo, shot reordering/duration/crossfade, script and warm storyboard views.
- Shared IndexedDB CAS persistence, conflict copy/reload, project JSON and hashed ZIP roundtrip, actual PDF generation with embedded JPEG frames.
- Own image/video/audio import with size/MIME/hash checks and private-draft rights metadata. AI voice explicitly disconnected.
- Local-only opt-in FFmpeg route with queued job status, filesystem manifest/checkpoint, segment validation/reuse, 720p H.264/AAC, crossfades, own audio/ducking, optional caption burn-in. This render path is written and being exercised next; it is not a cloud worker.

## Executed and verified

- `pnpm exec vitest run packages/scene-format/src/index.test.ts`: 9 tests passed (D-AT01/02/03/04/07/08 plus validation).
- `pnpm --filter @tre/scene-format typecheck`: passed.
- `pnpm --filter @tre/director typecheck`: passed before caption addition; rerun underway.
- `pnpm --filter @tre/director build`: passed, with runtime filesystem tracing warnings being corrected.
- Chromium opened actual app at 1440×900; first live scene and five actual renderer frames captured: `reports/director/desktop-initial.png`.

## Connected

Local browser IndexedDB only. WebGL renderer and local file exports are real. No cloud auth/storage, payment, AI provider, external generation or customer data integration.

## Next concrete actions

1. Exercise real 60-second MP4 through UI; verify ffprobe and contact sheet; test half-second crossfade and own audio.
2. Exercise kill/restart recovery and prove segment reuse; persist render handle across browser restart.
3. Run desktop/tablet/mobile browser acceptance flow, inspect screenshots, verify export/import/empty/error states and keyboard handling.
4. Harden import and route limits, fix any revealed UI or rendering defects, production build, final evidence manifest.

## Known limits

- Static embedded GLB import/render is implemented. Embedded static PNG/JPEG textures up to 2K are now supported; animated/rigged/compressed models remain explicitly unsupported in this profile.
- Animatic export uses held frames or imported clips. It is not continuous 3D animation.
- Render service must be explicitly enabled and bound to localhost. Host/Origin checks are defense in depth and do not authenticate a public deployment.
- No tenant/viewer claims; D-AT11 awaits a real authenticated backend.
- Rendering currently uses the local Next server lifetime with resumable intermediates. A separately supervised production worker is not connected.

## Second milestone evidence (20:06 UTC)

- Actual browser/UI render and download succeeded: 60.000 seconds, 1280×720, 24 fps, H.264/AAC. Captioned sample MP4, ffprobe JSON, contact sheet and completed-export screenshot are in reports/director.
- Actual storyboard PDF extracted with pdftotext; Danish æ/ø/å, frames, dialogue, scene and shot IDs retained. Portable ZIP downloaded.
- D-AT06 passed: CLI worker+child process group SIGKILL after two transcodes, restart same manifest, two verified segments reused with unchanged modification times; final crossfade output 1,428 frames / 59.5 seconds. reports/director/recovery.json.
- Real imported 30 fps clip, source trim, 0.5-second crossfade, synthetic voice+music, ducking/fades and 48 kHz AAC passed. Loudness measured -26.1 LUFS, true peak -21.4 dBFS in the synthetic test. reports/director/media-pipeline.json.
- 16 domain/archive/raster/local-route tests passed. Actual desktop/tablet/mobile scene/storyboard/2D screenshots show no horizontal overflow or browser page errors.
- Fixed real FFmpeg xfade failure: in this installed build, setpts clears frame-rate metadata. An isolated reproduction established that pixel-format conversion and setpts must precede fps. Fixed pipeline is verified by the actual 59.5-second movie, not just timeline arithmetic.
- Cancellation and a ten-minute total job deadline added; cancellation smoke-test is being recorded.
- Coordinator requested next block: complete textureless GLB import/render safely, preserve work on malformed imports, complete interactive browser and cross-engine gates. These remain active work.

## Third milestone — static GLB, accessibility and browser resilience

- Actual embedded GLB import, Three.js rendering, placement/recoloring, immutable asset snapshots and ZIP roundtrip added. Validates byte bounds/alignment, finite vertices, index ranges, cyclic/repeated-parent graphs, decoded allocation and instanced triangle budgets before loading. Original `fixtures/director-relay.glb` verifies the real loader path.
- Full Chromium editor flow passed: scene immutability, keyboard undo, actual GLB frame, malformed model preserving all data, duration/crossfade/reorder, reload, ZIP with GLB roundtrip, empty and failed import states at three sizes.
- All ten axe WCAG2A/2AA/2.1AA scans passed: scene/storyboard/story/export/import on desktop and mobile. This is an automated result, not a claim of complete accessibility conformance. Small helper text increased to 11px, core controls to 12px and mobile form inputs to 16px. Native dark controls, readable contrast, modal inert/focus trapping, mobile undo and lighting controls added.
- WebGL absence now creates explicitly labeled 720p 2D floor-plan frames, so first-run storyboard/export works rather than remaining frame-less. The actual browser tests disable WebGL before application startup.
- 22 deterministic tests and Director typecheck passed; optimized production build passed. Cross-engine browser flow evidence is being finalized in `reports/director/cross-browser.json`.
- Import profile and truthful limits documented in `docs/director-imports.md`.

Cross-engine gate found a real shared-persistence race before completion: React StrictMode started two concurrent initial reloads; fast 2D auto-capture saved revision 2 and five valid frames, then the later reload applied the original frame-less document to the UI. Chromium native and forced no-WebGL flows, plus Firefox native, passed. Firefox forced no-WebGL and WebKit exposed the race. Coordinator confirmed the cause and is implementing a shared single-flight/mutation guard with deterministic regression. Remaining flows will rerun after that fix; no six-engine-path pass is claimed at this checkpoint.

## Fourth milestone — real media review and recoverable local work

The shared persistence race is fixed by coordinator commit 4b93720 (integrated in this branch as ff75e02). All six Chromium/Firefox/WebKit native and explicitly no-WebGL paths passed after the fix. The original late-initial-read failure no longer replaces captured frames.

- Added actual trimmed-video playback, frame-position seeking, held paused frames, overlapping-shot crossfades, real voice/music playback, start/source/fade controls, measured WebAudio output and voice-driven music ducking. Space toggles playback; arrow keys move one frame, Shift+arrow one second when not editing a field.
- Optional original clip audio is explicit per shot and is preserved both in browser review and FFmpeg assembly, with timeline placement, trim and crossfade envelopes. Two actual CLI exports prove AAC-decoded PCM RMS 0.088 when enabled and 0 when disabled.
- Chromium, Firefox and WebKit completed real file imports, active audio contexts, nonzero decoded PCM, measured music gain reduction, advancing trimmed video, pause and exact half-crossfade seeks. WebKit's real `audio/vnd.wave` file type is safely canonicalized to WAV. Linux headless Firefox required a real local PulseAudio null sink; the independent minimal reproduction and full application both then ran. The environment setup is documented, never replaced with simulated audio.
- A real UI export combines a trimmed original clip, original clip audio, two audio tracks and a crossfade: 7.5 seconds of H.264/AAC at 1280×720/24 fps. Export remains an animatic/clip assembly, not continuous 3D animation.
- Recovery exports now tolerate rejecting persistence flush and download the current validated in-memory document. A real two-tab conflict and injected IndexedDB write-quota failure prove that local edits can be exported and that explicit reload restores the saved copy without overwriting it.
- Browser scripts use a portable Chromium path and `DIRECTOR_TEST_URL`. `docs/director-verification.md` separates a short daily gate from sequential render/recovery/media gates, with exact headless audio setup.
- 26 deterministic tests, Director TypeScript and optimized production build passed. The expanded media accessibility scan caught marginal volume-label contrast and the labels were corrected.

Final fourth-milestone production-server gates passed: six core browser paths; full editor import/roundtrip flow; two storage recovery scenarios; three real media browser flows; ten baseline axe scans plus twelve media/dialog scans with **zero violations**. Chromium UI rendered and downloaded the verified 7.5-second MP4. All evidence is local, reproduced without AI/provider calls.

## Fifth milestone — actual embedded 2K model textures

- Static GLB now accepts embedded PNG/JPEG textures up to 2048×2048, with bounded images/samplers, UV/material references, decoded image allocation per model/scene, source hashes and immutable asset metadata. Model instances share geometry and textures within a renderer; material tints stay per instance. Scene disposal closes ImageBitmaps and releases geometry/materials/textures. Removing unused draft models frees their draft budget while old scenes and Undo retain them.
- Original generated 12-triangle PNG and JPEG crate fixtures are actually imported and rendered; Chromium's screenshot shows both textured models in the set. Fixture source is committed and uses no external asset library.
- Adversarial imports revealed different browser tolerance for damaged PNG data. The profile now verifies PNG chunk bounds/CRC, rejects APNG, and performs bounded streaming zlib decompression before image decoding; it also treats GLTFLoader image failures as fatal. A deliberately invalid compressed payload with a correctly recomputed PNG chunk CRC is rejected in all three browser flows while preserving the entire scene.
- 32 deterministic tests and production build pass. Real Chromium/Firefox/WebKit flows cover PNG/JPEG import, saved texture budgets, captured frames, invalid compressed payload, forged budget metadata, ZIP roundtrip, reload, draft cleanup and undo. Chromium uses real 3D capture; Firefox/WebKit use their available renderer or the explicitly labeled fallback. No external HTTP requests occur.
- `docs/director-imports.md` documents the supported profile and its resource boundaries; it does not equate base decoded RGBA allocation with all GPU/mipmap overhead.

## Sixth milestone — independent production library

- Added the actual local production library with new empty/sample films, independently editable duplicates, project import as a new film, search, raw safety backups and restoration of the last-opened film. Existing single-film documents remain compatible. An IndexedDB cursor builds summaries one document at a time, without maintaining a second index or retaining every film's media in memory.
- Switching films requires a completed save. Real quota injection verifies that unsaved work stays in the editor and can be downloaded; failed creation/import preserves all existing films. Invalid or future-format documents remain visible and downloadable without being opened as a default sample.
- Found and fixed an own-media data-loss bug: initial capture and bulk camera updates could replace imported images or videos when no camera frames existed. Both operations now preserve own media; automatic missing-frame capture renders the shot's already pinned scene/camera, and explicit replacement has a clear label. Bulk capture retains the selected timeline position and yields between frames so progress can paint.
- 37 deterministic tests, Director/scene-format TypeScript and optimized production build pass. Chromium, Firefox and WebKit each completed the actual library flow, including own-image-only import/reload/bulk-update regression and independent old-project equality checks. Six WCAG2A/2AA/2.1AA axe scans per browser have zero violations; desktop/tablet/mobile layouts have no horizontal overflow. Library screenshots were visually inspected.
- This remains a local browser library, without cloud synchronization or shared workspace claims. Deletion is intentionally not part of this milestone; every existing document remains recoverable.

## Seventh milestone — usable, faithful storyboard files

- Replaced the basic PDF writer with a portable, embedded-font storyboard. Long dialogue and notes now continue onto additional pages instead of being silently cut. Danish, Greek and Cyrillic text is actually extracted and verified; unsupported glyphs are visibly represented by Unicode codes and preserved verbatim in the manifest.
- Fixed stale camera pictures in imported-video storyboards. Both the shot thumbnail and PDF poster follow the actual clip trim. A real red-then-blue H.264 clip exported at four seconds yields a blue embedded JPEG in Chromium, Firefox and WebKit. The gate extracts the JPEG, measures its pixels and compares its hash with the attached manifest. WebKit's detached video falsely reported a usable seeked frame while returning transparent canvas pixels; a minimal DOM attachment, always cleaned up, fixes the real rendering path.
- Added complete attached JSON manifests with original text, camera/scene/object/asset references, source hashes, timeline/trim ranges, audio settings and embedded poster hashes. Export uses a validated snapshot and leaves persisted state unchanged. A decoder failure shows an explicit missing picture and warning rather than substituting an old camera frame.
- 39 deterministic tests, TypeScript and optimized production build passed. All three actual storyboard browser flows passed; Chromium's real media review regression and ten baseline axe scans also passed. The PDF's visual board and text continuation were inspected as rasterized artifacts. Browser-seek precision and the untagged PDF accessibility boundary are documented honestly.
