import {
  readMediaFile,
  probeMedia,
  withDecodedImage,
  checkMediaAbort,
  type MediaTaskOptions,
} from "./media-lifecycle";
import {
  parseEmbeddedGlb,
  disposeModelResources,
  validateGlbImages,
} from "./glb-resources";
import { sha256, dataUrlBytes } from "./binary";
import { verifyProjectMedia } from "./project-validation";
import {
  inspectRaster,
  inspectGlb,
  type GlbAsset,
  type Project,
  type Media,
} from "@tre/scene-format";
export { sha256, dataUrlBytes } from "./binary";
export { exportPackage, importPackage } from "./project-archive";
export async function verifyMedia(project: Project) {
  await verifyProjectMedia(project);
  await validateProjectTextures(project);
}
/** Decode textures after a worker has already checked all file hashes and geometry. */
export async function validateProjectTextures(project: Project) {
  if (typeof document === "undefined") return;
  const checked = new Set<string>();
  for (const scene of [...project.scenes, project.draft])
    for (const asset of scene.assets) {
      if (checked.has(asset.dataUrl)) continue;
      const buffer = dataUrlBytes(asset.dataUrl).buffer;
      const info = inspectGlb(buffer);
      if (info.images.length) await validateGlbImages(buffer, info);
      checked.add(asset.dataUrl);
    }
}
export function fileDataUrl(
  file: File,
  options: MediaTaskOptions = {},
): Promise<string> {
  return readMediaFile(file, "url", options);
}
export async function importMedia(
  file: File,
  rights: Media["rights"],
  options: MediaTaskOptions = {},
): Promise<Media> {
  if (file.size > 50 * 1024 * 1024)
    throw Error("En mediefil må højst være 50 MB");
  const kinds: Record<string, Media["kind"]> = {
    "image/png": "image",
    "image/jpeg": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/ogg": "audio",
    "audio/webm": "audio",
  };
  const declaredMime = ["audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(
    file.type,
  )
    ? "audio/wav"
    : file.type;
  const kind = kinds[declaredMime];
  if (!kind) throw Error("Vælg PNG, JPEG, MP4, WebM, WAV, MP3, M4A eller OGG");
  const bytes = new Uint8Array(await readMediaFile(file, "bytes", options));
  if (
    kind === "image" &&
    !(
      (bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71) ||
      (bytes[0] === 255 && bytes[1] === 216)
    )
  )
    throw Error("Billedets indhold matcher ikke filtypen");
  if (kind === "image") {
    const info = inspectRaster(bytes);
    if (declaredMime !== `image/${info.format}`)
      throw Error("Billedets format matcher ikke filtypen");
  }
  const signature = (at: number, text: string) =>
    text.split("").every((c, i) => bytes[at + i] === c.charCodeAt(0));
  const mime = declaredMime;
  if (
    (mime === "audio/wav" && !(signature(0, "RIFF") && signature(8, "WAVE"))) ||
    (mime === "audio/mpeg" &&
      !(
        signature(0, "ID3") ||
        (bytes[0] === 255 && (bytes[1] & 224) === 224)
      )) ||
    (["video/mp4", "audio/mp4"].includes(mime) && !signature(4, "ftyp")) ||
    (["video/webm", "audio/webm"].includes(mime) &&
      ![26, 69, 223, 163].every((v, i) => bytes[i] === v)) ||
    (mime === "audio/ogg" && !signature(0, "OggS"))
  )
    throw Error("Mediets indhold matcher ikke filtypen");
  const dataUrl = await fileDataUrl(
    new File([bytes], file.name, { type: declaredMime }),
    options,
  );
  let durationFrames: number | undefined;
  if (kind !== "image") durationFrames = await probeMedia(file, kind, options);
  else
    await withDecodedImage(
      dataUrl,
      (image) => {
        if (image.naturalWidth > 8192 || image.naturalHeight > 8192)
          throw Error("Billedet må højst være 8192 × 8192 pixels");
      },
      options,
    );
  const hash = await sha256(bytes);
  checkMediaAbort(options.signal);
  return {
    id: `media_${crypto.randomUUID().replaceAll("-", "")}`,
    name: file.name,
    kind,
    mime: declaredMime as Media["mime"],
    dataUrl,
    sha256: hash,
    bytes: bytes.byteLength,
    durationFrames,
    source: "Egen lokal fil",
    rights,
  };
}

export async function importGlb(
  file: File,
  rights: GlbAsset["rights"],
  options: MediaTaskOptions = {},
): Promise<GlbAsset> {
  if (!file.name.toLowerCase().endsWith(".glb"))
    throw Error("Vælg en .glb-fil");
  if (file.size > 50 * 1024 * 1024) throw Error("GLB må højst være 50 MB");
  const buffer = await readMediaFile(file, "bytes", options);
  const inspected = inspectGlb(buffer);
  const bytes = new Uint8Array(buffer);
  const dataUrl = await fileDataUrl(
    new File([buffer], file.name, { type: "model/gltf-binary" }),
    options,
  );
  const parsed = await parseEmbeddedGlb(buffer, options.signal);
  disposeModelResources(parsed.scenes);
  const hash = await sha256(bytes);
  checkMediaAbort(options.signal);
  return {
    id: `glb_${crypto.randomUUID().replaceAll("-", "")}`,
    name: file.name,
    dataUrl,
    sha256: hash,
    bytes: bytes.length,
    triangles: inspected.triangles,
    textureBytes: inspected.textureBytes,
    source: "Egen lokal GLB-fil",
    rights,
  };
}
