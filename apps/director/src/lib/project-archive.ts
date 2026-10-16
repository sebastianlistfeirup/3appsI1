import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";
import { z } from "zod";
import { parseProject, type Project } from "@tre/scene-format";
import { dataUrlBytes, sha256 } from "./binary";
import { verifyProjectMedia } from "./project-validation";

const MiB = 1024 * 1024;
export const ARCHIVE_LIMITS = {
  archiveBytes: 100 * MiB,
  expandedProjectBytes: 150 * MiB,
  totalExtractedBytes: 151 * MiB,
  metadataBytes: 16 * MiB,
  manifestBytes: MiB,
  blobBytes: 50 * MiB,
  blobs: 1250,
};
export type ArchiveProgress = {
  phase: "packing" | "unpacking" | "checking";
  completed: number;
  total: number;
};
type Progress = (value: ArchiveProgress) => void;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z
  .object({
    format: z.literal("director-project-package"),
    version: z.literal(2),
    project: z.literal("project.json"),
    sha256: hashSchema,
    expandedBytes: z
      .number()
      .int()
      .positive()
      .max(ARCHIVE_LIMITS.expandedProjectBytes),
    blobs: z
      .array(
        z
          .object({
            sha256: hashSchema,
            bytes: z.number().int().positive().max(ARCHIVE_LIMITS.blobBytes),
          })
          .strict(),
      )
      .max(ARCHIVE_LIMITS.blobs),
  })
  .strict();
const allowedMimes = new Set([
  "image/png",
  "image/jpeg",
  "model/gltf-binary",
  "video/mp4",
  "video/webm",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
]);
type Slot = { record: Record<string, unknown>; key: "dataUrl" | "frame" };
/** Only schema-defined media fields may become blob references. No recursive arbitrary-object rewriting. */
function slots(value: unknown): Slot[] {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Ugyldig projektstruktur");
    return value as Record<string, unknown>;
  };
  const array = (value: unknown, max: number): unknown[] => {
    if (!Array.isArray(value) || value.length > max)
      throw Error("Projektet har for mange filer eller versioner");
    return value;
  };
  const project = object(value),
    result: Slot[] = [];
  for (const scene of [project.draft, ...array(project.scenes, 100)])
    for (const asset of array(object(scene).assets ?? [], 10))
      result.push({ record: object(asset), key: "dataUrl" });
  for (const shot of array(project.shots, 200)) {
    const record = object(shot);
    if (record.frame !== null) result.push({ record, key: "frame" });
  }
  for (const media of array(project.media, 40))
    result.push({ record: object(media), key: "dataUrl" });
  return result;
}
function encodedBytes(bytes: Uint8Array) {
  let value = "";
  for (let at = 0; at < bytes.length; at += 32768)
    value += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return btoa(value);
}
function ensureExpanded(bytes: number) {
  if (bytes > ARCHIVE_LIMITS.expandedProjectBytes)
    throw Error(
      "Det udpakkede projekt må højst være 150 MB. Din film er bevaret; brug Projekt-JSON til en rå sikkerhedskopi.",
    );
}
export async function exportPackage(project: Project, progress?: Progress) {
  const compact = parseProject(project),
    mediaSlots = slots(compact);
  const files: Zippable = Object.create(null),
    blobs = new Map<string, number>();
  const references = new Map<string, string>(),
    canonicalLengths = new Map<string, number>();
  let expansion = 0,
    totalBytes = 0;
  progress?.({ phase: "checking", completed: 0, total: mediaSlots.length });
  await verifyProjectMedia(compact);
  for (const [index, slot] of mediaSlots.entries()) {
    const value = slot.record[slot.key];
    if (typeof value !== "string") throw Error("Projektets mediefil mangler");
    let reference = references.get(value);
    if (!reference) {
      const mime = /^data:([^;]+);base64,/.exec(value)?.[1];
      if (!mime || !allowedMimes.has(mime))
        throw Error("Projektet indeholder en ukendt medietype");
      const bytes = dataUrlBytes(value);
      if (!bytes.length || bytes.length > ARCHIVE_LIMITS.blobBytes)
        throw Error("En mediefil må højst være 50 MB");
      const hash = await sha256(bytes);
      reference = `director-blob:${hash}:${mime}`;
      references.set(value, reference);
      canonicalLengths.set(
        reference,
        `data:${mime};base64,`.length + Math.ceil(bytes.length / 3) * 4,
      );
      if (!blobs.has(hash)) {
        totalBytes += bytes.length;
        if (totalBytes > ARCHIVE_LIMITS.archiveBytes)
          throw Error("Projektpakken må højst være 100 MB");
        blobs.set(hash, bytes.length);
        // Media is already compressed; store originals once, without needless recompression.
        files[`assets/${hash}`] = [bytes, { level: 0 }];
      }
    }
    expansion += canonicalLengths.get(reference)! - reference.length;
    ensureExpanded(expansion);
    slot.record[slot.key] = reference;
    progress?.({
      phase: "checking",
      completed: index + 1,
      total: mediaSlots.length,
    });
  }
  const bytes = strToU8(JSON.stringify(compact));
  if (bytes.length > ARCHIVE_LIMITS.metadataBytes)
    throw Error("Projektets metadata er for store");
  const expandedBytes = bytes.length + expansion;
  ensureExpanded(expandedBytes);
  const manifest = manifestSchema.parse({
    format: "director-project-package",
    version: 2,
    project: "project.json",
    sha256: await sha256(bytes),
    expandedBytes,
    blobs: [...blobs].map(([sha256, bytes]) => ({ sha256, bytes })),
  });
  files["project.json"] = bytes;
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  progress?.({ phase: "packing", completed: 0, total: blobs.size });
  const zip = zipSync(files, { level: 6 });
  if (zip.length > ARCHIVE_LIMITS.archiveBytes)
    throw Error("Projektpakken må højst være 100 MB");
  return zip;
}
export async function importPackage(
  buffer: ArrayBuffer,
  progress?: Progress,
): Promise<Project> {
  if (buffer.byteLength > ARCHIVE_LIMITS.archiveBytes)
    throw Error("Projektpakken må højst være 100 MB");
  progress?.({ phase: "unpacking", completed: 0, total: 0 });
  let total = 0;
  const names = new Map<string, number>();
  const files = unzipSync(new Uint8Array(buffer), {
    filter(file) {
      const isBlob = /^assets\/[a-f0-9]{64}$/.test(file.name);
      total += file.originalSize;
      if (
        names.has(file.name) ||
        names.size >= ARCHIVE_LIMITS.blobs + 2 ||
        (!isBlob && !["project.json", "manifest.json"].includes(file.name)) ||
        !Number.isSafeInteger(file.originalSize) ||
        file.originalSize < 1 ||
        file.originalSize >
          (isBlob
            ? ARCHIVE_LIMITS.blobBytes
            : file.name === "manifest.json"
              ? ARCHIVE_LIMITS.manifestBytes
              : ARCHIVE_LIMITS.expandedProjectBytes) ||
        total > ARCHIVE_LIMITS.totalExtractedBytes
      )
        throw Error("Ugyldig eller for stor projektpakke");
      names.set(file.name, file.originalSize);
      return true;
    },
  });
  if (!files["project.json"] || !files["manifest.json"])
    throw Error("Projekt og manifest mangler");
  for (const [name, size] of names)
    if (files[name]?.length !== size)
      throw Error("ZIP-filens længde matcher ikke manifestet");
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (
    manifest?.format !== "director-project-package" ||
    ![1, 2].includes(manifest.version) ||
    manifest.sha256 !== (await sha256(files["project.json"]))
  )
    throw Error("Projektpakkens version eller checksum matcher ikke");
  const raw = JSON.parse(strFromU8(files["project.json"]));
  if (manifest.version === 1) {
    if (names.size !== 2)
      throw Error("Den tidligere projektpakke indeholder ukendte filer");
  } else {
    const result = manifestSchema.safeParse(manifest);
    if (!result.success) throw Error("Projektpakkens manifest er ugyldigt");
    if (files["project.json"].length > ARCHIVE_LIMITS.metadataBytes)
      throw Error("Projektets metadata er for store");
    const declared = new Map(
      result.data.blobs.map((blob) => [blob.sha256, blob.bytes]),
    );
    if (
      declared.size !== result.data.blobs.length ||
      names.size !== declared.size + 2
    )
      throw Error("Projektpakken har dublerede eller ukendte filer");
    for (const [index, [hash, size]] of [...declared].entries()) {
      const bytes = files[`assets/${hash}`];
      if (!bytes || bytes.length !== size || (await sha256(bytes)) !== hash)
        throw Error("Mediefilens checksum matcher ikke projektpakken");
      progress?.({
        phase: "checking",
        completed: index + 1,
        total: declared.size,
      });
    }
    let expandedBytes = strToU8(JSON.stringify(raw)).length;
    const urls = new Map<string, string>(),
      used = new Set<string>();
    for (const slot of slots(raw)) {
      const reference = slot.record[slot.key];
      const match =
        typeof reference === "string" &&
        /^director-blob:([a-f0-9]{64}):([a-z0-9/+.-]+)$/.exec(reference);
      if (!match || !allowedMimes.has(match[2]) || !declared.has(match[1]))
        throw Error("Projektets mediereference mangler eller er ugyldig");
      let url = urls.get(reference as string);
      if (!url) {
        url = `data:${match[2]};base64,${encodedBytes(files[`assets/${match[1]}`])}`;
        urls.set(reference as string, url);
      }
      expandedBytes += url.length - (reference as string).length;
      ensureExpanded(expandedBytes);
      slot.record[slot.key] = url;
      used.add(match[1]);
    }
    if (
      used.size !== declared.size ||
      expandedBytes !== result.data.expandedBytes
    )
      throw Error(
        "Projektpakkens referencer eller udpakkede størrelse matcher ikke",
      );
  }
  const project = parseProject(raw);
  await verifyProjectMedia(project);
  return project;
}
