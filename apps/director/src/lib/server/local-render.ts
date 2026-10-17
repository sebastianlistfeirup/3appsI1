import { createHash, randomUUID } from "node:crypto";
import { promises as fs, constants } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { CAPTION_FONT } from "./render-profile";
import { buildCaptionTrack, captionFile, type CaptionCue } from "../captions";
import {
  inspectRaster,
  parseProject,
  orderedShots,
  totalFrames,
  timeline,
  matchingSequenceVersion,
  type Project,
  type Media,
  type Shot,
} from "@tre/scene-format";

import {
  renderStateSchema,
  type RenderState,
  type RenderHistory,
} from "../render-state";
export type { RenderState } from "../render-state";
const PIPELINE_VERSION = "director-animatic-3.0";
// Runtime data must not be traced into a deployment bundle.
const ROOT = process.env.DIRECTOR_RENDER_DIR
  ? resolve(/* turbopackIgnore: true */ process.env.DIRECTOR_RENDER_DIR)
  : join(process.cwd(), ".director-render");
const globalState = globalThis as typeof globalThis & {
  directorActive?: Set<string>;
  directorReading?: boolean;
  directorControllers?: Map<string, AbortController>;
  directorRenderContext?: AsyncLocalStorage<AbortSignal>;
};
const active = (globalState.directorActive ??= new Set<string>());
const controllers = (globalState.directorControllers ??= new Map<
  string,
  AbortController
>());
const renderContext = (globalState.directorRenderContext ??=
  new AsyncLocalStorage<AbortSignal>());
const sha = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
const safeId = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Ugyldigt render-id");
  return id;
};
const dir = (id: string) => join(/* turbopackIgnore: true */ ROOT, safeId(id));
const now = () => new Date().toISOString();
export function localRenderAvailable(request: Request) {
  if (process.env.DIRECTOR_LOCAL_RENDER !== "1") return false;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
  if (
    !host ||
    !local.test(host) ||
    !local.test(url.host) ||
    request.headers.has("forwarded")
  )
    return false;
  // Next adds the direct socket peer to x-forwarded-for even without a proxy.
  const forwarded = request.headers.get("x-forwarded-for");
  if (
    forwarded &&
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwarded)
  )
    return false;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && forwardedHost !== host) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return true;
}
async function atomic(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, path);
}
export async function getRender(id: string): Promise<RenderState> {
  const file = await fs.open(
    join(dir(id), "status.json"),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const bytes = Buffer.alloc(128 * 1024 + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 128 * 1024) throw Error("Eksportstatus er for stor");
    const state = renderStateSchema.parse(
      JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")),
    );
    if (state.id !== id) throw Error("Eksportstatus matcher ikke job-id");
    return state;
  } finally {
    await file.close();
  }
}
export async function renderHistory(projectId: string): Promise<RenderHistory> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId))
    throw Error("Ugyldigt projekt-id");
  await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
  const entries = await fs.readdir(/* turbopackIgnore: true */ ROOT, {
    withFileTypes: true,
  });
  const disk = await fs.statfs(ROOT);
  const result: RenderHistory = {
    jobs: [],
    legacyJobs: 0,
    unreadableJobs: 0,
    storage: {
      occupiedEntries: entries.length,
      maxJobs: 100,
      freeBytes: Number(disk.bavail) * Number(disk.bsize),
      minimumFreeBytes: 512 * 1024 * 1024,
      automaticDeletion: false,
    },
  };
  // The renderer admits at most 100 directory entries. Never read manifests/media to list jobs.
  for (const entry of entries.slice(0, 100)) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    try {
      const state = await getRender(entry.name);
      if (!state.source) result.legacyJobs++;
      else if (state.source.projectId === projectId) result.jobs.push(state);
    } catch {
      result.unreadableJobs++;
    }
  }
  result.jobs.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
  return result;
}

async function update(id: string, patch: Partial<RenderState>) {
  const previous = await getRender(id);
  if (previous.state === "cancelled" && patch.state !== "cancelled")
    throw Error("Eksporten er annulleret");
  const state = { ...previous, ...patch, updatedAt: now() };
  await atomic(join(dir(id), "status.json"), state);
  return state;
}
export function claimRenderInput() {
  if (active.size || globalState.directorReading) return false;
  globalState.directorReading = true;
  return true;
}
export function releaseRenderInput() {
  globalState.directorReading = false;
}
export async function readBoundedJson(request: Request) {
  const max = 64 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > max)
    throw Error("Renderinput må højst være 64 MB inklusive indlejrede medier");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Manifest mangler");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw Error("Renderinput må højst være 64 MB");
    }
    parts.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export async function createRender(input: unknown) {
  if (active.size)
    throw Error(
      "En lokal eksport er allerede i gang. Vent, til den er færdig.",
    );
  const id = randomUUID();
  active.add(id);
  try {
    const p = parseProject(input);
    if (!p.sequence.length) throw Error("Sekvensen er tom");
    const captions = buildCaptionTrack(p);
    if (p.captions && captions.errors.length)
      throw Error(captions.errors.join(" "));
    for (const shot of orderedShots(p))
      if (!shot.frame && !shot.mediaId)
        throw Error(`Kameraframe mangler: ${shot.name}`);
    const manifest = JSON.stringify(p);
    if (Buffer.byteLength(manifest) > 64 * 1024 * 1024)
      throw Error("Renderinput er for stort");
    await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(/* turbopackIgnore: true */ ROOT);
    const disk = await fs.statfs(ROOT);
    if (Number(disk.bavail) * Number(disk.bsize) < 512 * 1024 * 1024)
      throw Error("Der er under 512 MB ledig diskplads til lokal render");
    if (entries.length >= 100)
      throw Error(
        "Den lokale rendermappe har nået loftet på 100 jobs. Arkivér færdige filer før næste eksport.",
      );
    await fs.mkdir(dir(id), { mode: 0o700 });
    await fs.writeFile(join(dir(id), "manifest.json"), manifest, {
      mode: 0o400,
    });
    const savedSequence = matchingSequenceVersion(p);
    const state: RenderState = {
      id,
      state: "queued",
      phase: "Manifest låst. Klar til lokal render.",
      createdAt: now(),
      updatedAt: now(),
      manifestHash: sha(manifest),
      expectedFrames: totalFrames(p),
      source: { projectId: p.id, title: p.title, revision: p.revision },
      captions: {
        burnedIn: p.captions,
        cues: captions.cues.length,
        warningShots: captions.warnings.length,
        errors: captions.errors,
      },
      ...(savedSequence
        ? {
            sequenceVersion: {
              id: savedSequence.id,
              version: savedSequence.version,
              name: savedSequence.name,
            },
          }
        : {}),
    };
    await atomic(join(dir(id), "status.json"), state);
    return state;
  } catch (error) {
    active.delete(id);
    throw error;
  }
}
export function reserveResume(id: string) {
  safeId(id);
  if (active.has(id) || active.size) return false;
  active.add(id);
  return true;
}
export function isRenderActive(id: string) {
  return active.has(id);
}
function run(
  command: string,
  args: string[],
  timeout = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const signal = renderContext.getStore();
    if (signal?.aborted) {
      reject(Error("Eksporten er stoppet"));
      return;
    }
    const child = spawn(command, args, {
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, OMP_NUM_THREADS: "2" },
    });
    let stdout = "",
      stderr = "",
      killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (c) => {
      stdout = (stdout + c).slice(-1024 * 1024);
    });
    child.stderr.on("data", (c) => {
      stderr = (stderr + c).slice(-128 * 1024);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout || stderr);
      else
        reject(
          Error(
            killed
              ? "Rendertrinnet overskred sin tidsgrænse"
              : `${command} fejlede (${code}): ${stderr.slice(-2500)}`,
          ),
        );
    });
  });
}
async function probe(path: string) {
  return JSON.parse(
    await run(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      15000,
    ),
  );
}
function ratio(value: string) {
  const [a, b] = value.split("/").map(Number);
  return a / (b || 1);
}
export async function validateMovie(
  path: string,
  frames: number,
  audio = true,
) {
  const metadata = await probe(path);
  const video = metadata.streams.find((s: any) => s.codec_type === "video"),
    sound = metadata.streams.find((s: any) => s.codec_type === "audio");
  const duration = Number(video?.duration ?? metadata.format.duration);
  if (
    !video ||
    video.codec_name !== "h264" ||
    video.width !== 1280 ||
    video.height !== 720 ||
    ratio(video.avg_frame_rate) !== 24 ||
    Math.abs(duration - frames / 24) > 1 / 24 + 0.001
  )
    throw Error(
      "Den færdige film matcher ikke manifestets format eller varighed",
    );
  if (
    audio &&
    (!sound ||
      sound.codec_name !== "aac" ||
      Number(sound.sample_rate) !== 48000)
  )
    throw Error("Filmens lydspor matcher ikke AAC / 48 kHz");
  return {
    duration,
    width: video.width,
    height: video.height,
    fps: ratio(video.avg_frame_rate),
    audioSampleRate: Number(sound?.sample_rate ?? 0),
    codec: video.codec_name,
    audioCodec: sound?.codec_name ?? "",
    sha256: sha(await fs.readFile(path)),
  };
}
function decodeDataUrl(value: string, max = 50 * 1024 * 1024) {
  const content = value.slice(value.indexOf(",") + 1);
  const bytes = Buffer.from(content, "base64");
  if (bytes.length > max)
    throw Error("Mediet overskrider den lokale størrelsesgrænse");
  return bytes;
}
const formats: Record<string, string> = {
  "video/mp4": "mov",
  "video/webm": "matroska",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "mov",
  "audio/ogg": "ogg",
  "audio/webm": "matroska",
};
async function writeMedia(jobDir: string, media: Media) {
  const bytes = decodeDataUrl(media.dataUrl);
  if (bytes.length !== media.bytes || sha(bytes) !== media.sha256)
    throw Error(`Mediehash matcher ikke: ${media.name}`);
  const path = join(jobDir, `asset-${media.sha256}.bin`);
  try {
    await fs.writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const existing = await fs.readFile(path);
    if (sha(existing) !== media.sha256)
      throw Error("Tidligere mediefil er beskadiget");
  }
  return path;
}
const ffbase = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-y",
  "-threads",
  "2",
  "-filter_threads",
  "1",
  "-filter_complex_threads",
  "1",
];
async function segment(
  jobDir: string,
  p: Project,
  shot: Shot,
  index: number,
  cues: CaptionCue[],
) {
  const m = p.media.find((m) => m.id === shot.mediaId);
  const start = timeline(p)[index].startFrame;
  const captions = p.captions
    ? cues
        .filter((cue) => cue.shotId === shot.id)
        .map((cue) => ({
          ...cue,
          startFrame: cue.startFrame - start,
          endFrame: cue.endFrame - start,
        }))
    : [];
  const fingerprint = sha(
    JSON.stringify({
      frame: shot.frame,
      media: m?.sha256,
      in: shot.sourceIn,
      duration: shot.durationFrames,
      captions,
      renderer: PIPELINE_VERSION,
    }),
  );
  const out = join(jobDir, `segment-${index}-${fingerprint}.mp4`);
  try {
    const previous = JSON.parse(await fs.readFile(`${out}.json`, "utf8"));
    const checked = await validateMovie(out, shot.durationFrames, false);
    if (
      previous.fingerprint === fingerprint &&
      previous.sha256 === checked.sha256
    )
      return { path: out, reused: true };
  } catch {}
  const inputArgs: string[] = [];
  if (m?.kind === "video") {
    const path = await writeMedia(jobDir, m);
    inputArgs.push(
      "-protocol_whitelist",
      "file,pipe",
      "-f",
      formats[m.mime],
      "-ss",
      String(shot.sourceIn / 24),
      "-i",
      path,
    );
  } else {
    const data = m?.kind === "image" ? m.dataUrl : shot.frame;
    if (!data) throw Error("Stillbillede mangler");
    const bytes = decodeDataUrl(data, m ? 50 * 1024 * 1024 : 5 * 1024 * 1024);
    inspectRaster(bytes);
    if (m && (bytes.length !== m.bytes || sha(bytes) !== m.sha256))
      throw Error("Billedets hash matcher ikke");
    const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71,
      jpeg = bytes[0] === 255 && bytes[1] === 216;
    if (!png && !jpeg) throw Error("Ugyldigt kameraframe");
    const path = join(jobDir, `frame-${index}.${png ? "png" : "jpg"}`);
    await fs.writeFile(path, bytes, { mode: 0o600 });
    inputArgs.push(
      "-loop",
      "1",
      "-framerate",
      "24",
      "-f",
      "image2",
      "-i",
      path,
    );
  }
  let videoFilter =
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p";
  for (const [cueIndex, cue] of captions.entries()) {
    const captionPath = join(jobDir, `caption-${index}-${cueIndex}.txt`);
    await fs.writeFile(captionPath, cue.text, {
      mode: 0o600,
    });
    const escaped = captionPath
      .replaceAll("\\", "\\\\")
      .replaceAll(":", "\\:")
      .replaceAll("'", "\\'");
    videoFilter += `,drawtext=fontfile=${CAPTION_FONT}:textfile='${escaped}':expansion=none:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:line_spacing=7:x=(w-text_w)/2:y=h-text_h-42:enable='gte(n,${cue.startFrame})*lt(n,${cue.endFrame})'`;
  }
  await run("ffmpeg", [
    ...ffbase,
    ...inputArgs,
    "-an",
    "-vf",
    videoFilter,
    "-frames:v",
    String(shot.durationFrames),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-r",
    "24",
    "-video_track_timescale",
    "24000",
    out,
  ]);
  const validated = await validateMovie(out, shot.durationFrames, false);
  await atomic(`${out}.json`, { fingerprint, ...validated });
  return { path: out, reused: false };
}
async function assemble(jobDir: string, p: Project, segments: string[]) {
  const shots = orderedShots(p),
    args = [...ffbase];
  for (const path of segments) args.push("-i", path);
  // setpts may clear frame-rate metadata. fps MUST follow setpts before xfade.
  const filters: string[] = [];
  let label = "v0";
  filters.push("[0:v]format=yuv444p,setsar=1,setpts=PTS-STARTPTS,fps=24[v0]");
  let cumulative = shots[0].durationFrames / 24;
  for (let i = 1; i < shots.length; i++) {
    filters.push(
      `[${i}:v]format=yuv444p,setsar=1,setpts=PTS-STARTPTS,fps=24[in${i}]`,
    );
    const out = `v${i}`,
      overlap = shots[i].transitionFrames / 24;
    if (overlap > 0)
      filters.push(
        `[${label}][in${i}]xfade=transition=fade:duration=${overlap}:offset=${cumulative - overlap}[joined${i}]`,
      );
    else filters.push(`[${label}][in${i}]concat=n=2:v=1:a=0[joined${i}]`);
    filters.push(`[joined${i}]fps=24[${out}]`);
    cumulative += shots[i].durationFrames / 24 - overlap;
    label = out;
  }
  const duration = totalFrames(p) / 24;
  let inputIndex = segments.length;
  const audioLabels: string[] = [];
  for (const key of ["voice", "music"] as const) {
    const track = p[key];
    if (!track) continue;
    const media = p.media.find((m) => m.id === track.mediaId)!;
    const output = `${key}base`;
    const available = Math.max(
      0,
      Math.min(
        duration - track.startFrame / 24,
        ((media.durationFrames ?? Math.ceil(duration * 24)) - track.sourceIn) /
          24,
      ),
    );
    if (available <= 0) continue;
    const path = await writeMedia(jobDir, media);
    args.push(
      "-protocol_whitelist",
      "file,pipe",
      "-f",
      formats[media.mime],
      "-i",
      path,
    );
    const fade = Math.min(track.fadeFrames / 24, available / 2);
    filters.push(
      `[${inputIndex}:a]atrim=start=${track.sourceIn / 24}:duration=${available},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${track.volume},afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, available - fade)}:d=${fade},adelay=${Math.round((track.startFrame / 24) * 1000)}|${Math.round((track.startFrame / 24) * 1000)},apad,atrim=duration=${duration}[${output}]`,
    );
    audioLabels.push(output);
    inputIndex++;
  }
  let audio = "silence";
  if (!audioLabels.length) {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    filters.push(`[${inputIndex}:a]atrim=duration=${duration}[silence]`);
    inputIndex++;
  } else if (audioLabels.length === 1) audio = audioLabels[0];
  else {
    if (
      p.music?.duck &&
      audioLabels.includes("voicebase") &&
      audioLabels.includes("musicbase")
    ) {
      filters.push(
        "[voicebase]asplit=2[voiceout][sidechain]",
        "[musicbase][sidechain]sidechaincompress=threshold=0.04:ratio=6:attack=80:release=600[ducked]",
        "[voiceout][ducked]amix=inputs=2:normalize=0[mix]",
      );
    } else filters.push("[voicebase][musicbase]amix=inputs=2:normalize=0[mix]");
    audio = "mix";
  }
  const clipLabels: string[] = [];
  const timedShots = timeline(p);
  for (let i = 0; i < timedShots.length; i++) {
    const shot = timedShots[i],
      media = p.media.find((m) => m.id === shot.mediaId);
    if (!shot.clipAudio || media?.kind !== "video") continue;
    const path = await writeMedia(jobDir, media);
    const info = JSON.parse(
      await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-f",
          formats[media.mime],
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "json",
          path,
        ],
        20000,
      ),
    );
    if (
      !info.streams?.some(
        (stream: { codec_type?: string }) => stream.codec_type === "audio",
      )
    )
      continue;
    args.push(
      "-protocol_whitelist",
      "file,pipe",
      "-f",
      formats[media.mime],
      "-i",
      path,
    );
    const length = shot.durationFrames / 24,
      fadeIn = shot.transitionFrames / 24,
      fadeOut = (timedShots[i + 1]?.transitionFrames ?? 0) / 24,
      delay = Math.round((shot.startFrame / 24) * 1000),
      output = `clipaudio${i}`;
    let chain = `[${inputIndex}:a]atrim=start=${shot.sourceIn / 24}:duration=${length},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`;
    if (fadeIn) chain += `,afade=t=in:d=${fadeIn}`;
    if (fadeOut) chain += `,afade=t=out:st=${length - fadeOut}:d=${fadeOut}`;
    chain += `,adelay=${delay}|${delay},apad,atrim=duration=${duration}[${output}]`;
    filters.push(chain);
    clipLabels.push(output);
    inputIndex++;
  }
  if (clipLabels.length) {
    filters.push(
      `[${audio}]${clipLabels.map((label) => `[${label}]`).join("")}amix=inputs=${clipLabels.length + 1}:normalize=0[combinedaudio]`,
    );
    audio = "combinedaudio";
  }
  filters.push(
    `[${audio}]alimiter=limit=0.891:level=false,aresample=48000[aout]`,
  );
  const out = join(jobDir, "assembly.mp4");
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${label}]`,
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "24",
    "-frames:v",
    String(totalFrames(p)),
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-b:a",
    "192k",
    "-t",
    String(duration),
    "-movflags",
    "+faststart",
    "-metadata",
    `comment=Director animatic; manifest=${sha(JSON.stringify(p))}`,
    out,
  );
  await run("ffmpeg", args, 240000);
  return out;
}
export async function cancelRender(id: string) {
  const current = await getRender(id);
  if (["succeeded", "failed", "cancelled"].includes(current.state))
    return current;
  controllers.get(id)?.abort("user_cancel");
  return update(id, {
    state: "cancelled",
    phase: "Eksporten er annulleret. Tidligere film er bevaret.",
  });
}
export async function executeRender(id: string) {
  active.add(id);
  const controller = new AbortController();
  controllers.set(id, controller);
  const deadline = setTimeout(
    () =>
      controller.abort(
        Error("Eksporten overskred den samlede tidsgrænse på 10 minutter"),
      ),
    600000,
  );
  return renderContext.run(controller.signal, async () => {
    let reused = 0;
    try {
      const jobDir = dir(id),
        raw = await fs.readFile(join(jobDir, "manifest.json"), "utf8");
      const saved = await getRender(id);
      if (saved.state === "cancelled") return;
      if (sha(raw) !== saved.manifestHash)
        throw Error("Manifestet er ændret efter låsning");
      const p = parseProject(JSON.parse(raw));
      const source = { projectId: p.id, title: p.title, revision: p.revision };
      const captions = buildCaptionTrack(p);
      if (p.captions && captions.errors.length)
        throw Error(captions.errors.join(" "));
      await update(id, {
        state: "running",
        phase: "Kontrollerer medier og kameraframes",
        error: undefined,
      });
      const segments: string[] = [];
      const shots = orderedShots(p);
      for (let i = 0; i < shots.length; i++) {
        await update(id, {
          phase: `Forbereder shot ${i + 1} af ${shots.length}`,
        });
        const result = await segment(jobDir, p, shots[i], i, captions.cues);
        segments.push(result.path);
        if (result.reused) reused++;
        await atomic(join(jobDir, "checkpoint.json"), {
          manifestHash: saved.manifestHash,
          segments,
          reused,
          phase: "segments",
        });
      }
      await update(id, {
        phase: "Samler billeder, overgange og lyd",
        reusedSegments: reused,
      });
      let output = join(jobDir, "assembly.mp4");
      const assemblyFingerprint = sha(
        `${saved.manifestHash}:${PIPELINE_VERSION}`,
      );
      try {
        const previous = JSON.parse(
          await fs.readFile(join(jobDir, "assembly.json"), "utf8"),
        );
        const validated = await validateMovie(output, totalFrames(p));
        if (
          previous.fingerprint !== assemblyFingerprint ||
          previous.sha256 !== validated.sha256
        )
          throw Error(
            "Tidligere samling matcher ikke manifest og renderprofil",
          );
      } catch {
        output = await assemble(jobDir, p, segments);
        const validated = await validateMovie(output, totalFrames(p));
        await atomic(join(jobDir, "assembly.json"), {
          fingerprint: assemblyFingerprint,
          ...validated,
        });
      }
      await update(id, {
        state: "validating",
        phase: "Måler codec, opløsning, varighed og lyd",
      });
      const metadata: NonNullable<RenderState["metadata"]> =
        renderStateSchema.shape.metadata
          .unwrap()
          .parse(await validateMovie(output, totalFrames(p)));
      const loudness = await run(
        "ffmpeg",
        [
          "-hide_banner",
          "-nostdin",
          "-i",
          output,
          "-vn",
          "-af",
          "ebur128=peak=true",
          "-f",
          "null",
          "-",
        ],
        120000,
      );
      const integrated = [...loudness.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(
        -1,
      )?.[1];
      const peak = [...loudness.matchAll(/Peak:\s+(-?inf|-?[\d.]+) dBFS/g)].at(
        -1,
      )?.[1];
      if (
        !integrated ||
        !peak ||
        !Number.isFinite(Number(integrated)) ||
        (peak !== "-inf" && !Number.isFinite(Number(peak)))
      )
        throw Error("Lydmålingen kunne ikke verificeres");
      metadata.loudnessLufs = Number(integrated);
      metadata.audioSilent = peak === "-inf";
      if (peak !== "-inf") metadata.truePeakDbfs = Number(peak);
      await fs.copyFile(output, join(jobDir, "film.mp4"));
      const artifacts: NonNullable<RenderState["artifacts"]> = {};
      const saveArtifact = async (name: string, value: string) => {
        await fs.writeFile(join(jobDir, name), value, { mode: 0o600 });
        artifacts[name] = {
          sha256: sha(value),
          bytes: Buffer.byteLength(value),
        };
      };
      if (!captions.errors.length && captions.cues.length) {
        await saveArtifact("captions.srt", captionFile(p, "srt"));
        await saveArtifact("captions.vtt", captionFile(p, "vtt"));
      }
      await saveArtifact(
        "captions.json",
        JSON.stringify(
          {
            fps: p.fps,
            handover: "visual-crossfade-midpoint",
            burnedIn: p.captions,
            sources: shots.map((shot) => ({
              shotId: shot.id,
              text: shot.dialogue,
            })),
            ...captions,
          },
          null,
          2,
        ),
      );
      await saveArtifact(
        "validation.json",
        JSON.stringify(
          {
            ...metadata,
            manifestHash: saved.manifestHash,
            rendererVersion: PIPELINE_VERSION,
            source,
            expectedFrames: totalFrames(p),
            verifiedAt: now(),
            captions: {
              burnedIn: p.captions,
              cues: captions.cues.length,
              warnings: captions.warnings,
              errors: captions.errors,
            },
            artifacts,
            loudnessMeasurement: loudness.slice(-5000),
          },
          null,
          2,
        ),
      );
      await update(id, {
        state: "succeeded",
        phase: "MP4 er produceret og kontrolleret med ffprobe.",
        metadata,
        source,
        reusedSegments: reused,
        captions: {
          burnedIn: p.captions,
          cues: captions.cues.length,
          warningShots: captions.warnings.length,
          errors: captions.errors,
        },
        artifacts,
      });
    } catch (error) {
      const cancelled =
        controller.signal.reason === "user_cancel" ||
        (await getRender(id).catch(() => null))?.state === "cancelled";
      await update(id, {
        state: cancelled ? "cancelled" : "failed",
        phase: "Den tidligere gode eksport er bevaret.",
        error: cancelled
          ? undefined
          : controller.signal.reason instanceof Error
            ? controller.signal.reason.message
            : error instanceof Error
              ? error.message
              : "Ukendt renderfejl",
      }).catch(() => {});
    } finally {
      active.delete(id);
      controllers.delete(id);
      clearTimeout(deadline);
    }
  });
}
export async function movieFile(id: string) {
  const state = await getRender(id);
  if (state.state !== "succeeded") throw Error("Filmen er ikke færdig");
  const bytes = await fs.readFile(join(dir(id), "film.mp4"));
  if (sha(bytes) !== state.metadata?.sha256)
    throw Error("Eksportfilens checksum matcher ikke");
  return bytes;
}
export async function renderArtifact(id: string, name: string) {
  if (
    ![
      "captions.srt",
      "captions.vtt",
      "captions.json",
      "validation.json",
    ].includes(name)
  )
    throw Error("Ukendt eksportfil");
  const state = await getRender(id),
    expected = state.artifacts?.[name];
  if (state.state !== "succeeded" || !expected)
    throw Error("Eksportfilen er ikke klar");
  const bytes = await fs.readFile(join(dir(id), name));
  if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256)
    throw Error("Eksportfilens checksum matcher ikke");
  return bytes;
}
