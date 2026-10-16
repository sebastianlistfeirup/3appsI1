# CI codec failure: verified cause and replay

The GitHub Director job at commit `32dad93` reproduced the storyboard failure while preserving the actual bytes and native browser diagnostics. The runner selected `/usr/bin/chromium` **155.0.8059.0**, although Playwright had installed its pinned Chromium **156.0.8078.4 / revision 1248**. That OS browser reported an empty H.264 `canPlayType` result and then a real media failure:

```text
MediaError 4
PipelineStatus::DEMUXER_ERROR_NO_SUPPORTED_STREAMS:
FFmpegDemuxer: no supported streams
```

The decoder never reached metadata or a seek: duration was unavailable, readyState was 0, and the application correctly displayed “Klippreview kan ikke vises”. The earlier `currentTime === 4` timeout was a downstream symptom.

The **exact same** Ubuntu FFmpeg6.1.1 source file, SHA-256 `dd91c7386a3fddf292c3917f6d14a1b867b83f3c612cb735bf2ed1f80988c31d`, decoded to an actual frame in the local pinned HeadlessChrome156, full Chrome for Testing156 and Debian system Chromium154. Director's browser helper now uses the package-pinned engine by default. OS-browser testing requires the explicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override. No codec, seek, pixel or export assertion was removed.

The failed CI diagnostics and original bytes are committed as `reports/director/ci-os-chromium155-storyboard-{failure.json,input.mp4}`. The independent probe replay is `reports/director/ci-input-replay-codec-probe.json`. The full storyboard replay is `reports/director/ci-input-replay-storyboard.json`; it verifies the actual blue image at four seconds, extracted image SHA, multilingual PDF text, unchanged project and subsequent trim back to one second.

```sh
node apps/director/tests/codec-probe.mjs reports/director/ci-os-chromium155-storyboard-input.mp4
DIRECTOR_STORYBOARD_INPUT=reports/director/ci-os-chromium155-storyboard-input.mp4 node apps/director/tests/storyboard-flow.mjs
```

This identifies the unsupported browser build used by that runner. It does not generalize the limitation to every Chromium155 or OS Chromium build. A separate local test using Ubuntu's real `ffmpeg_6.1.1-3ubuntu5` packages also passed the full PDF gate, with evidence under `ubuntu-ffmpeg6-storyboard-*`.
