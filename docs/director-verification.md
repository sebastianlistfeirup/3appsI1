# Director verification gates

Run from the monorepo root with pinned pnpm dependencies. Browser scripts use `DIRECTOR_TEST_URL` (default `http://localhost:3002`). Chromium, Firefox and WebKit use Playwright's package-pinned engines by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` only when intentionally testing an OS browser. The suite never silently substitutes a preinstalled Chromium.

## Daily gate

```sh
pnpm exec vitest run packages/scene-format/src apps/director/src/lib
pnpm --filter @tre/director typecheck
pnpm --filter @tre/director build
```

After starting the app on loopback, preferably the production build in CI:

```sh
pnpm exec node apps/director/tests/cross-browser.mjs
pnpm exec node apps/director/tests/editor-flow.mjs
pnpm exec node apps/director/tests/textured-glb-flow.mjs
pnpm exec node apps/director/tests/storage-recovery.mjs
pnpm exec node apps/director/tests/a11y-smoke.mjs
LIBRARY_ENGINE=chromium pnpm exec node apps/director/tests/library-flow.mjs
LIBRARY_ENGINE=firefox pnpm exec node apps/director/tests/library-flow.mjs
LIBRARY_ENGINE=webkit pnpm exec node apps/director/tests/library-flow.mjs
STORYBOARD_ENGINE=chromium pnpm exec node apps/director/tests/storyboard-flow.mjs
STORYBOARD_ENGINE=firefox pnpm exec node apps/director/tests/storyboard-flow.mjs
STORYBOARD_ENGINE=webkit pnpm exec node apps/director/tests/storyboard-flow.mjs
VERSIONS_ENGINE=chromium pnpm exec node apps/director/tests/versions-flow.mjs
VERSIONS_ENGINE=firefox pnpm exec node apps/director/tests/versions-flow.mjs
VERSIONS_ENGINE=webkit pnpm exec node apps/director/tests/versions-flow.mjs
LOCATION_ENGINE=chromium pnpm exec node apps/director/tests/locations-flow.mjs
LOCATION_ENGINE=firefox pnpm exec node apps/director/tests/locations-flow.mjs
LOCATION_ENGINE=webkit pnpm exec node apps/director/tests/locations-flow.mjs
```

Cross-browser covers Chromium, Firefox and WebKit with native capabilities and with WebGL explicitly disabled: initial frames, immutable edit, undo, GLB load/capture, reload, modal focus/Escape, storyboard and page errors. Editor flow adds malformed imports, full ZIP/GLB roundtrip, duration/crossfade/reorder and responsive empty/error states. Axe checks ten desktop/mobile views and dialogs against WCAG2A/2AA/2.1AA tags. Automated scans do not constitute a full accessibility certification.

The textured-GLB gate logs every major phase to the console and incrementally persists `<engine>-textured-glb-trace.json`, including browser version, bounded console diagnostics and the exact failed phase. Actions/navigation, IndexedDB evaluation, download completion, screenshots and browser cleanup have local deadlines; a 180-second watchdog fails the process instead of silently hanging the CI job. The overall CI timeout remains an additional guard. No acceptance assertion is skipped after a timeout.

The production-library flow creates independent empty and sample films, duplicates and edits a copy, restores the last-opened film, imports a project as a new film and preserves invalid/future documents for raw backup. It injects a real IndexedDB quota error and proves a rejected save blocks switching films while the current memory copy remains downloadable. It also imports an own-image-only film with no camera frames and verifies that reload and bulk camera capture preserve the actual media. Every engine checks desktop/tablet/mobile overflow and six automated accessibility states.

The storyboard gate uses an actual red-then-blue clip and checks that source trim produces the blue PDF image, full long multilingual dialogue/notes survive, the embedded manifest matches the sources and actual image hashes, and export leaves the project unchanged. See `docs/director-storyboard.md` for the browser-decoding boundary and required Poppler commands.

The versions gate exercises selective camera updates, full cut restoration with automatic preservation, side-by-side shot history, independent duplication, saved audio settings and adversarial historical references. Six accessibility states run per engine. It has a 240-second process watchdog and five-second cleanup deadline; see `docs/director-versions.md`.

## Render and recovery gate

The local server must be started with `DIRECTOR_LOCAL_RENDER=1` and bound to `127.0.0.1`. Install FFmpeg, ffprobe, libx264/AAC filters, DejaVu Sans, and Poppler for optional PDF text checks. Run render jobs sequentially because the server deliberately admits one at a time.

```sh
pnpm exec node apps/director/tests/render-smoke.mjs
pnpm exec node apps/director/tests/recovery-smoke.mjs
pnpm exec node apps/director/tests/media-ui-flow.mjs
pnpm exec node apps/director/tests/clip-audio-smoke.mjs
pnpm exec node apps/director/tests/cancellation-smoke.mjs
pnpm exec node --import tsx apps/director/tests/sequence-render-smoke.mjs
```

The actual 60-second output is checked with ffprobe. Recovery SIGKILLs a CLI worker and its child process group after two completed segments, then verifies those exact validated intermediates were reused. Clip-audio testing decodes the resulting AAC to PCM and distinguishes a nonzero original tone from real silence when clip audio is disabled. No external providers or paid calls occur.

Additional browser media preview gates can avoid a duplicate server render:

```sh
DIRECTOR_SKIP_RENDER=1 MEDIA_ENGINE=firefox pnpm exec node apps/director/tests/media-ui-flow.mjs
DIRECTOR_SKIP_RENDER=1 MEDIA_ENGINE=webkit pnpm exec node apps/director/tests/media-ui-flow.mjs
```

Linux headless Firefox needs a working audio backend. A private local PulseAudio null sink is sufficient: it still runs real decoding and WebAudio PCM processing, without producing sound in CI. Install `pulseaudio` (for example with the CI runner’s apt setup), then start the isolated test daemon before the media gate:

```sh
mkdir -p /tmp/director-ci-pulse
chmod 700 /tmp/director-ci-pulse
PULSE_RUNTIME_PATH=/tmp/director-ci-pulse pulseaudio -n --daemonize=yes --exit-idle-time=-1 --use-pid-file=no \
  -L "module-null-sink sink_name=director_test" \
  -L "module-native-protocol-unix socket=/tmp/director-ci-pulse/native auth-anonymous=1"
export PULSE_SERVER=unix:/tmp/director-ci-pulse/native
```

The socket is inside the private directory; no TCP listener is created. This environment used extracted Debian PulseAudio17 packages without sudo, with the same modules and a private socket. Before the sink, Firefox’s minimal standalone AudioContext stayed suspended despite a real button gesture; after the sink both that independent check and the full app gate ran. Do not suppress or fake this assertion.

These exercise actual local video/audio decoding, an advancing trimmed video clock, running WebAudio, measured PCM energy, voice-driven music gain reduction, pause, exact-frame seeking and the halfway crossfade. Browser codec support is tested, not inferred from MIME metadata. Each media gate also scans the audio dialog and desktop/tablet/mobile preview for axe WCAG2A/2AA/2.1AA violations.

Do not build into the same `.next` output while a browser acceptance gate is running against that development server. Finish the build, then launch the server used by the gate. Evidence is written under `reports/director`; generated render job directories stay ignored.

## Diagnosing real codec differences

`media-ui-flow.mjs` saves its exact generated MP4 input, SHA-256, ffprobe metadata, FFmpeg version, browser version, `canPlayType` values and media-error diagnostics before import. Failed CI runs can therefore preserve and replay the actual failing bytes. The files are named `<engine>-media-input.mp4` and `<engine>-media-diagnostic.json` under `reports/director`.

```sh
pnpm exec node apps/director/tests/codec-probe.mjs reports/director/chromium-media-input.mp4
```

This standalone probe tries the system Chromium when present, Playwright's default headless browser and its full Chrome for Testing executable, and records actual metadata and a decoded video frame. On this Debian13 environment all three opened the same H.264/AAC fixture; the full media UI flow also passed both pinned Playwright variants. An initial Ubuntu24.04 CI run rejected its locally generated MP4, so an operating-system/FFmpeg/browser difference remains under investigation. No assertion is disabled and no browser/codec limitation is inferred only from `canPlayType`.

The Ubuntu CI runner exposed why implicit OS-browser selection was unsafe: its freshly recorded Chromium was **155.0.8059.0**, while the same job installed the pinned **156.0.8078.4 / revision 1248**. The helper now selects the pinned browser by default. The actual Ubuntu FFmpeg **6.1.1-3ubuntu5** binaries were also reproduced locally, in isolated library wrappers; both FFmpeg6 and Debian7 fixtures passed the complete blue-frame PDF gate on pinned Chromium156. This narrows the investigation without claiming that a browser version alone proves a codec limitation. The storyboard gate now saves its precise input and incremental native media events/current-time/error diagnostics, with the same decoding and PDF-pixel assertions. Use `DIRECTOR_STORYBOARD_INPUT=/path/to/failing.mp4` to replay exact bytes, or `DIRECTOR_FFMPEG_PATH` / `DIRECTOR_FFPROBE_PATH` to exercise a specific toolchain.

Store lokale biblioteker og afbrudte billeddecodes:

```bash
node apps/director/tests/large-library-flow.mjs
LIBRARY_ENGINE=firefox node apps/director/tests/large-library-flow.mjs
LIBRARY_ENGINE=webkit node apps/director/tests/large-library-flow.mjs
```

Testen bruger >20 MB ægte, seedede PNG-originaler og validerer, at covers er
små afledte filer, mens originaldokumenter og recovery-download er uændrede.

Workerbaseret projektpakke, deduplikation og fuld import/eksport:

```bash
node apps/director/tests/archive-flow.mjs
ARCHIVE_ENGINE=firefox node apps/director/tests/archive-flow.mjs
ARCHIVE_ENGINE=webkit node apps/director/tests/archive-flow.mjs
```

Hver gate bruger >15 MB originale PNG-filer, GLB og immutable versioner;
beviser rigtig worker, afbrydelse, originale hashes, komplet v2-roundtrip,
v1-kompatibilitet og bevaret arbejde ved fejl. Lokal watchdog er fire
minutter; en fem minutters CI-command-timeout er et passende ekstra loft.
Se `docs/director-project-archive.md` for format, grænser og afgrænsninger.
