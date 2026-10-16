import * as THREE from "three";
import { inspectGlb, type GlbInspection } from "@tre/scene-format";
import {
  boundedMediaStep,
  checkMediaAbort,
  withDecodedImage,
} from "./media-lifecycle";

/** Validate browser decoding before GLTFLoader can silently discard a bad texture. */
export async function validateGlbImages(
  buffer: ArrayBuffer,
  inspection: GlbInspection,
  signal?: AbortSignal,
) {
  for (const image of inspection.images) {
    checkMediaAbort(signal);
    const blob = new Blob(
      [buffer.slice(image.offset, image.offset + image.bytes)],
      { type: image.mime },
    );
    const url = URL.createObjectURL(blob);
    try {
      if (image.mime === "image/png") {
        const bytes = new Uint8Array(buffer, image.offset, image.bytes),
          view = new DataView(buffer, image.offset, image.bytes),
          parts: BlobPart[] = [];
        let at = 8;
        while (at + 12 <= bytes.length) {
          const length = view.getUint32(at),
            type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
          if (type === "IDAT")
            parts.push(
              buffer.slice(
                image.offset + at + 8,
                image.offset + at + 8 + length,
              ),
            );
          at += length + 12;
        }
        const reader = new Blob(parts)
          .stream()
          .pipeThrough(new DecompressionStream("deflate"))
          .getReader();
        // Includes 16-bit RGBA and Adam7 row-filter overhead; bound streaming output before image allocation.
        const maxBytes = image.width * image.height * 8 + image.height * 8 + 64;
        let decodedBytes = 0;
        try {
          while (true) {
            const chunk = await boundedMediaStep(reader.read(), signal);
            if (chunk.done) break;
            decodedBytes += chunk.value.byteLength;
            if (decodedBytes > maxBytes)
              throw Error("PNG-teksturen kræver for meget afkodet hukommelse");
          }
          if (!decodedBytes) throw Error("PNG-teksturen er tom");
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      await withDecodedImage(
        url,
        (decoded) => {
          if (
            decoded.naturalWidth !== image.width ||
            decoded.naturalHeight !== image.height
          )
            throw Error(
              "Teksturens afkodede dimensioner matcher ikke headeren",
            );
        },
        { signal },
      );
    } catch (error) {
      checkMediaAbort(signal);
      throw Error(
        "GLB-teksturen kunne ikke afkodes som et gyldigt PNG/JPEG-billede",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Metadata has no URIs; only GLTFLoader's own same-origin embedded-image blobs may resolve. */
export async function parseEmbeddedGlb(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
) {
  checkMediaAbort(signal);
  const inspection = inspectGlb(buffer);
  await validateGlbImages(buffer, inspection, signal);
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");
  const manager = new THREE.LoadingManager();
  const urls = new Set<string>();
  let finished = false;
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") && new URL(url).origin === location.origin) {
      if (finished) {
        URL.revokeObjectURL(url);
        throw Error("Modelindlæsningen er afsluttet");
      }
      urls.add(url);
      return url;
    }
    throw Error("Eksterne GLB-ressourcer er ikke tilladt");
  });
  let failed = false;
  manager.onError = () => {
    failed = true;
  };
  checkMediaAbort(signal);
  const parsed = new GLTFLoader(manager).parseAsync(buffer, "");
  const gltf = await boundedMediaStep(parsed, signal, (value) =>
    disposeModelResources(value.scenes),
  ).finally(() => {
    finished = true;
    for (const url of urls) URL.revokeObjectURL(url);
  });
  if (failed) {
    disposeModelResources(gltf.scenes);
    throw Error("GLB-teksturen kunne ikke indlæses");
  }
  return gltf;
}

/** Shared instance resources are disposed once; decoded ImageBitmaps are explicitly closed. */
export function disposeModelResources(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(),
    images = new Set<ImageBitmap>();
  for (const root of roots)
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line
      ) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      }
    });
  for (const material of materials)
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) {
        textures.add(value);
        if (
          typeof ImageBitmap !== "undefined" &&
          value.image instanceof ImageBitmap
        )
          images.add(value.image);
      }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  for (const image of images) image.close();
}
