import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { RenderCapability } from "../render-capability";

export const CAPTION_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const requiredFilters = [
  "scale",
  "pad",
  "setsar",
  "fps",
  "format",
  "drawtext",
  "setpts",
  "xfade",
  "concat",
  "atrim",
  "asetpts",
  "aresample",
  "aformat",
  "volume",
  "afade",
  "adelay",
  "apad",
  "asplit",
  "sidechaincompress",
  "amix",
  "alimiter",
  "ebur128",
];
type Options = {
  env?: NodeJS.ProcessEnv;
  fontPath?: string;
  timeoutMs?: number;
};

function command(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted)
      return reject(Error("Kontrollen overskred sin tidsgrænse"));
    const child = spawn(name, args, {
      env: { ...env, OMP_NUM_THREADS: "2" },
      shell: false,
      signal,
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let outputLimit = false;
    const read = (chunk: Buffer) => {
      if (outputLimit) return;
      if (output.length + chunk.byteLength > 1024 * 1024) {
        outputLimit = true;
        child.kill("SIGKILL");
        reject(Error("Renderkontrollen gav et for stort svar"));
        return;
      }
      output += chunk.toString();
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        Error(
          error.code === "ENOENT"
            ? `${name} er ikke installeret eller findes ikke i serverens PATH`
            : signal.aborted
              ? "Kontrollen overskred sin tidsgrænse"
              : `${name} kunne ikke startes`,
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            Error(
              signal.aborted
                ? "Kontrollen overskred sin tidsgrænse"
                : `${name} kunne ikke gennemføre prøverenderingen`,
            ),
          ),
    );
  });
}

/** Local synthetic encode/decode only. Call after the HTTP loopback gate. */
export async function inspectRenderProfile(
  options: Options = {},
): Promise<RenderCapability> {
  const env = options.env ?? process.env;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 25000,
  );
  const result: RenderCapability = {
    available: false,
    profile: "local-only",
    cloudConnected: false,
    checkedAt: new Date().toISOString(),
    reason: "",
    checks: [],
  };
  let directory: string | undefined;
  const run = (name: string, args: string[]) =>
    command(name, args, env, controller.signal);
  try {
    result.ffmpeg = (await run("ffmpeg", ["-version"]))
      .split("\n")[0]
      .slice(0, 250);
    result.ffprobe = (await run("ffprobe", ["-version"]))
      .split("\n")[0]
      .slice(0, 250);
    result.checks!.push("FFmpeg og FFprobe starter");
    const filters = await run("ffmpeg", ["-hide_banner", "-filters"]);
    const missing = requiredFilters.filter(
      (name) => !new RegExp(`^\\s*[.A-Z|]+\\s+${name}\\s`, "m").test(filters),
    );
    if (missing.length)
      throw Error(`FFmpeg mangler filtre: ${missing.join(", ")}`);
    result.checks!.push("Billede-, overgangs-, tekst- og lydfiltre findes");
    const path = options.fontPath ?? CAPTION_FONT;
    const stat = await fs.stat(/* turbopackIgnore: true */ path).catch(() => {
      throw Error("Skrifttypen DejaVu Sans mangler på render-serveren");
    });
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
      throw Error("Skrifttypen kan ikke bruges til undertekster");
    const font = await fs.readFile(/* turbopackIgnore: true */ path);
    try {
      const parsed = fontkit.create(font);
      for (const letter of "ÆØÅæøåDirector") {
        if (!parsed.hasGlyphForCodePoint(letter.codePointAt(0)!))
          throw Error("missing glyph");
      }
      if (
        !parsed
          .layout("Æ Ø Å · Director")
          .glyphs.every(
            (glyph) =>
              glyph.path.toSVG().length > 0 || glyph.codePoints.includes(32),
          )
      )
        throw Error("invalid glyph outline");
    } catch {
      throw Error("Skrifttypen kunne ikke afkodes med danske bogstaver");
    }
    result.fontSha256 = createHash("sha256").update(font).digest("hex");
    directory = await fs.mkdtemp(join(tmpdir(), "director-profile-"));
    await fs.chmod(directory, 0o700);
    const fontCopy = join(directory, "font.ttf");
    await fs.writeFile(fontCopy, font, { mode: 0o600 });
    const movie = join(directory, "probe.mp4");
    const chain = [
      "[0:v]format=yuv444p,setsar=1,setpts=PTS-STARTPTS,fps=24[a]",
      "[1:v]format=yuv444p,setsar=1,setpts=PTS-STARTPTS,fps=24[b]",
      `[a][b]xfade=transition=fade:duration=0.25:offset=0.5,drawtext=fontfile='${fontCopy}':text='Æ Ø Å · Director':expansion=none:fontsize=28:fontcolor=white:x=40:y=40,format=yuv420p[v]`,
      "[2:a]atrim=duration=1.25,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.5,afade=t=in:d=0.05,alimiter=limit=0.891:level=false[aout]",
    ].join(";");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-threads",
      "2",
      "-filter_complex_threads",
      "1",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=1280x720:r=24:d=0.75",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=1280x720:r=24:d=0.75",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=1.25",
      "-filter_complex",
      chain,
      "-map",
      "[v]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-threads",
      "2",
      "-frames:v",
      "30",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-t",
      "1.25",
      movie,
    ]);
    const data = JSON.parse(
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        movie,
      ]),
    );
    const video = data.streams?.find(
      (stream: any) => stream.codec_type === "video",
    );
    const audio = data.streams?.find(
      (stream: any) => stream.codec_type === "audio",
    );
    if (
      video?.codec_name !== "h264" ||
      video.width !== 1280 ||
      video.height !== 720 ||
      video.avg_frame_rate !== "24/1" ||
      Number(video.nb_frames) !== 30 ||
      Math.abs(Number(video.duration) - 1.25) > 0.001 ||
      audio?.codec_name !== "aac" ||
      Number(audio.sample_rate) !== 48000 ||
      audio.channels !== 2
    ) {
      throw Error("Prøvefilen matcher ikke 720p / 24 fps / H.264 / AAC 48 kHz");
    }
    result.checks!.push(
      "30 faktiske H.264-frames, crossfade og dansk tekst kodet",
      "AAC stereo / 48 kHz og varighed verificeret af FFprobe",
    );
    const measured = await run("ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-threads",
      "2",
      "-i",
      movie,
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ]);
    if (
      !/I:\s+-?[\d.]+ LUFS/.test(measured) ||
      !/Peak:\s+-?[\d.]+ dBFS/.test(measured)
    )
      throw Error("Prøvefilens lyd kunne ikke måles");
    result.checks!.push(
      "Filmens billede og lyd er afkodet; lyden er målt med EBU R128",
    );
    result.available = true;
    result.reason = "Lokal render er afprøvet og klar";
  } catch (error) {
    result.reason =
      error instanceof Error
        ? error.message
        : "Den lokale renderprofil kunne ikke kontrolleres";
  } finally {
    clearTimeout(timer);
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
  return result;
}

type Cache = {
  key: string;
  promise?: Promise<RenderCapability>;
  result?: RenderCapability;
  expires: number;
};
const state = globalThis as typeof globalThis & { directorProfile?: Cache };
/** One bounded probe per process. Refresh cannot launch repeated concurrent work. */
export function renderCapability(refresh = false): Promise<RenderCapability> {
  const key = process.env.PATH ?? "";
  let cache = state.directorProfile;
  if (!cache || cache.key !== key)
    cache = state.directorProfile = { key, expires: 0 };
  if (cache.promise) return cache.promise;
  const age = cache.result?.checkedAt
    ? Date.now() - Date.parse(cache.result.checkedAt)
    : Infinity;
  if (cache.result && Date.now() < cache.expires && (!refresh || age < 10000))
    return Promise.resolve(cache.result);
  const current = cache;
  current.promise = inspectRenderProfile()
    .then((result) => {
      current.result = result;
      current.expires = Date.now() + (result.available ? 300000 : 15000);
      return result;
    })
    .finally(() => {
      current.promise = undefined;
    });
  return current.promise;
}
