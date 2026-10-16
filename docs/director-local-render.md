# Director local render profile

Director works in the browser with IndexedDB, an actual Three.js primitive scene, storyboard PDF, JSON and portable ZIP. Its default render capability is disabled. AI adapters, cloud storage, sharing, payment and authenticated workspaces are disconnected.

## Run locally

Install the pinned workspace dependencies, FFmpeg/ffprobe with libx264, AAC, xfade, drawtext and ebur128 support, plus DejaVu Sans at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`.

```sh
DIRECTOR_LOCAL_RENDER=1 pnpm --filter @tre/director exec next dev --hostname 127.0.0.1 --port 3002
```

Open `http://localhost:3002`. Keep this profile bound to loopback. Never expose the opted-in renderer through a public proxy. The route checks explicit opt-in, loopback Host/URL, same Origin and non-cross-site fetch metadata; these checks are not an authentication system. A public/multitenant worker needs verified sessions, memberships, quotas and private artifact storage before activation.

The local output root defaults to `apps/director/.director-render` when started via the app command. `DIRECTOR_RENDER_DIR` can select an absolute persistent directory. Jobs create a private directory, immutable input manifest, checkpoint, validated segment files, assembled MP4, final MP4 and validation JSON. Files remain local. Completed artifacts are not auto-deleted.

## API and bounds

- `GET /api/exports`: actual local capability only.
- `POST /api/exports`: JSON `{ project }`, capped at 64 MiB, returns 202 with job ID. At most one admitted input/job per server process.
- `GET /api/exports/:id`: private local status. After restart, unfinished jobs resume from validated segments under the same manifest; no provider calls occur.
- `DELETE /api/exports/:id`: cancel and terminate active FFmpeg; cancelled jobs cannot publish a download.
- `GET /api/exports/:id?download=1`: available only after codec/resolution/fps/duration/audio/hash validation. UUID paths are validated and filenames are generated.
- `GET /api/exports/:id?artifact=validation.json|captions.srt|captions.vtt|captions.json`: explicit completed-artifact allowlist. Every downloaded artifact is checked against its recorded length and SHA-256; paths and response filenames cannot be supplied freely.

The renderer supports 24 fps, 1280×720, H.264/AAC 48 kHz, 1–30 shots and at most 120 seconds. Each file is at most 50 MiB, with a stricter aggregate render-request limit. It caps process threads, each transcoding step at 120 seconds, assembly at 240 seconds, and 100 retained job directories. A ten-minute total deadline bounds the complete job. The current profile bounds work but is not a cgroup/container resource sandbox.

FFmpeg is spawned with an argument array and `shell:false`. User filenames, filter expressions and executable names are never executed. Input media demuxers are selected from known MIME types, protocols are constrained, local paths are generated, and captions use a generated textfile with expansion disabled. Local project data stays local.

## Export behavior

Shots keep references to immutable scene versions and previous frames; recording a new frame creates a new shot version. A render locks the full project snapshot before work begins. Changes in the editor cannot mutate that manifest. Crossfade reduces the final timeline by the configured overlap, displayed before export. Optional captions distribute the entire dialogue across frame-based two-line cues; scene capture remains an uncaptioned deterministic frame. Sequence preview and MP4 use the same cue timing, with a midpoint handover during crossfades. UTF-8 SRT/VTT and a raw-source cue manifest accompany completed renders. See `docs/director-captions.md` for readability and font limits.

Own voiceover/music supports gain, start/trim/fades in the data contract and music sidechain ducking; the UI exposes import, levels, timeline start, source trim, fades, removal and ducking. A sample limiter limits intentional overdrive; EBU R128 loudness and true peak are measured after final AAC encoding. The export center displays those actual numbers and offers the hashed validation report. AAC may introduce peaks above the limiter's sample threshold; the UI explicitly marks results above −1 dBTP. Loudness is reported, not falsely claimed normalized to −16 LUFS. Empty audio produces a real silent AAC track and is identified by the measured negative-infinite true peak. Browser sequence review plays actual own clips and audio with pause, frame seeking, overlapping visual layers, gain/fades and voice-driven WebAudio ducking. A live meter reads decoded PCM. Browser review is an interactive approximation; the downloaded MP4 remains the validated render. The “Brug klippets lyd” option includes original clip audio in both preview and export; it is off by default. A video without an audio stream contributes silence.

Resumption checks both segment fingerprints and the assembly's exact SHA-256, locked manifest hash and pipeline version. A format-valid file with altered bytes is rebuilt. Completed status records the original film title/revision; after subsequent edits the UI identifies the prior export explicitly, and its downloads continue to refer to the same locked result.

The live 3D view is interactive. The exported animatic holds saved frames; it does not continuously render a moving 3D camera. Imported video is normalized and trimmed during assembly.

## Portable project files

Project JSON retains scene and shot histories with embedded frame/media data. ZIP v2 stores original binaries once under content-addressed filenames, with `project.json` and a SHA-256 manifest. Worker-based import/export validates archive names, lengths, expansion, schema and every original hash while preserving v1 imports. See `docs/director-project-archive.md` for exact limits. This remains local portable storage, without a connected cloud backend.
