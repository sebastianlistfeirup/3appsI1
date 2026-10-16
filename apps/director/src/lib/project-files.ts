import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  inspectRaster,
  inspectGlb,
  type GlbAsset,
  parseProject,
  type Project,
  type Media,
} from "@tre/scene-format";
export async function sha256(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function exportPackage(project: Project) {
  const bytes = strToU8(JSON.stringify(parseProject(project)));
  const manifest = {
    format: "director-project-package",
    version: 1,
    project: "project.json",
    sha256: await sha256(bytes),
    media: project.media.map((m) => ({
      id: m.id,
      sha256: m.sha256,
      bytes: m.bytes,
    })),
    note: "Originale medier og kameraframes er indlejret i projektfilen. Ingen ekstern download kræves.",
  };
  return zipSync(
    {
      "project.json": bytes,
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    },
    { level: 6 },
  );
}
export async function importPackage(buffer: ArrayBuffer): Promise<Project> {
  if (buffer.byteLength > 100 * 1024 * 1024)
    throw Error("Projektpakken må højst være 100 MB");
  let total = 0;
  let count = 0;
  const files = unzipSync(new Uint8Array(buffer), {
    filter(file) {
      count++;
      total += file.originalSize;
      if (
        count > 2 ||
        !["project.json", "manifest.json"].includes(file.name) ||
        file.originalSize > 150 * 1024 * 1024 ||
        total > 151 * 1024 * 1024
      )
        throw Error("Ugyldig eller for stor projektpakke");
      return true;
    },
  });
  if (!files["project.json"] || !files["manifest.json"])
    throw Error("Projekt og manifest mangler");
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (
    manifest.format !== "director-project-package" ||
    manifest.version !== 1 ||
    manifest.sha256 !== (await sha256(files["project.json"]))
  )
    throw Error("Projektpakkens checksum matcher ikke");
  const project = parseProject(JSON.parse(strFromU8(files["project.json"])));
  await verifyMedia(project);
  return project;
}
export async function verifyMedia(project: Project) {
  const checked = new Map<
    string,
    { url: string; bytes: number; triangles: number }
  >();
  for (const scene of [...project.scenes, project.draft])
    for (const asset of scene.assets) {
      const prior = checked.get(asset.sha256);
      if (
        prior &&
        prior.url === asset.dataUrl &&
        prior.bytes === asset.bytes &&
        prior.triangles === asset.triangles
      )
        continue;
      const bytes = dataUrlBytes(asset.dataUrl);
      if (
        bytes.length !== asset.bytes ||
        (await sha256(bytes)) !== asset.sha256
      )
        throw Error(`GLB-filen ${asset.name} matcher ikke dens checksum`);
      const info = inspectGlb(new Uint8Array(bytes).buffer);
      if (info.triangles !== asset.triangles)
        throw Error("GLB-geometri matcher ikke manifestet");
      checked.set(asset.sha256, {
        url: asset.dataUrl,
        bytes: asset.bytes,
        triangles: asset.triangles,
      });
    }
  for (const shot of project.shots)
    if (shot.frame) inspectRaster(dataUrlBytes(shot.frame));
  for (const media of project.media) {
    const bytes = dataUrlBytes(media.dataUrl);
    if (
      bytes.byteLength !== media.bytes ||
      (await sha256(bytes)) !== media.sha256
    )
      throw Error(`Mediefilen ${media.name} matcher ikke dens checksum`);
  }
}
export function dataUrlBytes(value: string) {
  const decoded = atob(value.slice(value.indexOf(",") + 1));
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
export function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Filen kunne ikke læses"));
    reader.readAsDataURL(file);
  });
}
export async function importMedia(
  file: File,
  rights: Media["rights"],
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
  const bytes = new Uint8Array(await file.arrayBuffer());
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
  );
  let durationFrames: number | undefined;
  if (kind !== "image")
    durationFrames = await new Promise<number>((resolve, reject) => {
      const el = document.createElement(kind === "video" ? "video" : "audio");
      const url = URL.createObjectURL(file);
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(Error("Mediet kunne ikke aflæses inden 10 sekunder"));
      }, 10000);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        if (
          !Number.isFinite(el.duration) ||
          el.duration <= 0 ||
          el.duration > 3600
        )
          reject(Error("Mediets varighed kan ikke bruges"));
        else resolve(Math.floor(el.duration * 24));
      };
      el.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(Error("Browseren kan ikke åbne dette medie"));
      };
      el.src = url;
    });
  else
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.width > 8192 || image.height > 8192)
          reject(Error("Billedet må højst være 8192 × 8192 pixels"));
        else resolve();
      };
      image.onerror = () => reject(Error("Billedet kunne ikke åbnes"));
      image.src = dataUrl;
    });
  return {
    id: `media_${crypto.randomUUID().replaceAll("-", "")}`,
    name: file.name,
    kind,
    mime: declaredMime as Media["mime"],
    dataUrl,
    sha256: await sha256(bytes),
    bytes: bytes.byteLength,
    durationFrames,
    source: "Egen lokal fil",
    rights,
  };
}

export async function importGlb(
  file: File,
  rights: GlbAsset["rights"],
): Promise<GlbAsset> {
  if (!file.name.toLowerCase().endsWith(".glb"))
    throw Error("Vælg en .glb-fil");
  if (file.size > 50 * 1024 * 1024) throw Error("GLB må højst være 50 MB");
  const buffer = await file.arrayBuffer();
  const inspected = inspectGlb(buffer);
  const bytes = new Uint8Array(buffer);
  const dataUrl = await fileDataUrl(
    new File([buffer], file.name, { type: "model/gltf-binary" }),
  );
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { LoadingManager, Mesh } = await import("three");
  const manager = new LoadingManager();
  manager.setURLModifier(() => {
    throw Error("Eksterne GLB-ressourcer er ikke tilladt");
  });
  const parsed = await new GLTFLoader(manager).parseAsync(buffer, "");
  parsed.scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        material.dispose();
    }
  });
  return {
    id: `glb_${crypto.randomUUID().replaceAll("-", "")}`,
    name: file.name,
    dataUrl,
    sha256: await sha256(bytes),
    bytes: bytes.length,
    triangles: inspected.triangles,
    source: "Egen lokal GLB-fil",
    rights,
  };
}
