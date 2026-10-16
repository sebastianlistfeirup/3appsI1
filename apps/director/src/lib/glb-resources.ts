import * as THREE from "three";
import { inspectGlb, type GlbInspection } from "@tre/scene-format";

/** Validate browser decoding before GLTFLoader can silently discard a bad texture. */
export async function validateGlbImages(
  buffer: ArrayBuffer,
  inspection: GlbInspection,
) {
  for (const image of inspection.images) {
    const blob = new Blob(
      [buffer.slice(image.offset, image.offset + image.bytes)],
      { type: image.mime },
    );
    const url = URL.createObjectURL(blob);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const decoded = new Image();
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
            const chunk = await reader.read();
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
      decoded.src = url;
      await Promise.race([
        decoded.decode(),
        new Promise<never>(
          (_, reject) =>
            (timer = setTimeout(
              () => reject(Error("Teksturafkodning tog for lang tid")),
              15000,
            )),
        ),
      ]);
      if (
        decoded.naturalWidth !== image.width ||
        decoded.naturalHeight !== image.height
      )
        throw Error("Teksturens afkodede dimensioner matcher ikke headeren");
    } catch {
      throw Error(
        "GLB-teksturen kunne ikke afkodes som et gyldigt PNG/JPEG-billede",
      );
    } finally {
      clearTimeout(timer);
      decoded.src = "";
      URL.revokeObjectURL(url);
    }
  }
}

/** Metadata has no URIs; only GLTFLoader's own same-origin embedded-image blobs may resolve. */
export async function parseEmbeddedGlb(buffer: ArrayBuffer) {
  const inspection = inspectGlb(buffer);
  await validateGlbImages(buffer, inspection);
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") && new URL(url).origin === location.origin)
      return url;
    throw Error("Eksterne GLB-ressourcer er ikke tilladt");
  });
  let failed = false;
  manager.onError = () => {
    failed = true;
  };
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
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
