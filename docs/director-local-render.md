# Director local render profile

Director works in the browser with IndexedDB, an actual Three.js primitive scene, storyboard PDF, JSON and portable ZIP. Its default render capability is disabled. AI adapters, cloud storage, sharing, payment and authenticated workspaces are disconnected.

## Run locally

Install the pinned workspace dependencies, FFmpeg/ffprobe with libx264, AAC, xfade, drawtext and ebur128 support, plus DejaVu Sans at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`.

```sh
DIRECTOR_LOCAL_RENDER=1 pnpm --filter @tre/director exec next dev --hostname 127.0.0.1 --port 3002
```

Open `http://127.0.0.1:3002`. Keep this profile bound to loopback. Never expose the opted-in renderer through a public proxy. The route checks explicit opt-in, loopback Host/URL, same Origin and non-cross-site fetch metadata; these checks are not an authentication system. A public/multitenant worker needs verified sessions, memberships, quotas and private artifact storage before activation.

The local output root defaults to `apps/director/.director-render` when started via the app command. `DIRECTOR_RENDER_DIR` can select an absolute persistent directory. Jobs create a private directory, immutable input manifest, checkpoint, validated segment files, assembled MP4, final MP4 and validation JSON. Files remain local. Completed artifacts are not auto-deleted.

## API and bounds

- `GET /api/exports`: actual local capability only.
- `POST /api/exports`: JSON `{ project }`, capped at 64 MiB, returns 202 with job ID. At most one admitted input/job per server process.
- `GET /api/exports/:id`: private local status. After restart, unfinished jobs resume from validated segments under the same manifest; no provider calls occur.
- `GET /api/exports/:id?download=1`: available only after codec/resolution/fps/duration/audio/hash validation. UUID paths are validated and filenames are generated.

The renderer supports 24 fps, 1280×720, H.264/AAC 48 kHz, 1–30 shots and at most 120 seconds. Each file is at most 50 MiB, with a stricter aggregate render-request limit. It caps process threads, each transcoding step at 120 seconds, assembly at 240 seconds, and 100 retained job directories. The current profile bounds work but is not a cgroup/container resource sandbox.

FFmpeg is spawned with an argument array and `shell:false`. User filenames, filter expressions and executable names are never executed. Input media demuxers are selected from known MIME types, protocols are constrained, local paths are generated, and captions use a generated textfile with expansion disabled. Local project data stays local.

## Export behavior

Shots keep references to immutable scene versions and previous frames; recording a new frame creates a new shot version. A render locks the full project snapshot before work begins. Changes in the editor cannot mutate that manifest. Crossfade reduces the final timeline by the configured overlap, displayed before export. Optional captions burn the shot dialogue into the exported segment; scene preview remains an uncaptioned deterministic frame.

Own voiceover/music supports gain, start/trim/fades in the data contract and music sidechain ducking; the current UI exposes import, levels, removal and ducking. A limiter prevents intentional overdrive; EBU R128 loudness and peak are measured on the result. Loudness is reported, not falsely claimed normalized to -16 LUFS. Empty audio produces a real silent AAC track. Browser sequence review is labeled still-picture review and does not claim synchronized source-audio playback; MP4 contains the actual audio.

The live 3D view is interactive. The exported animatic holds saved frames; it does not continuously render a moving 3D camera. Imported video is normalized and trimmed during assembly.

## Portable project files

Project JSON retains scene and shot histories with embedded frame/media data. ZIP includes `project.json` and a SHA-256 manifest; importing validates archive file count, names, uncompressed sizes, project schema and every embedded media hash. This is a deliberately simple self-contained v1 format. A future storage backend should deduplicate immutable images/assets instead of repeating data URLs in revision snapshots.
