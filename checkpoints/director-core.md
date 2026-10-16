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

- GLB validator rejects external URLs, large triangle counts and textured files, but GLB placement/import UI is not implemented. This is not claimed complete.
- Animatic export uses held frames or imported clips. It is not continuous 3D animation.
- Render service must be explicitly enabled and bound to localhost. Host/Origin checks are defense in depth and do not authenticate a public deployment.
- No tenant/viewer claims; D-AT11 awaits a real authenticated backend.
- Rendering currently uses the local Next server lifetime with resumable intermediates. A separately supervised production worker is not connected.
