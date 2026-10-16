import { crc32 } from "node:zlib";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inspectGlb } from "./glb";
const source = new Uint8Array(
  readFileSync(
    new URL("../../../fixtures/director-relay.glb", import.meta.url),
  ),
);
function mutate(fn: (json: any) => void, original: Uint8Array = source) {
  const view = new DataView(
    original.buffer,
    original.byteOffset,
    original.byteLength,
  );
  const length = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(original.slice(20, 20 + length)),
  );
  fn(json);
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(bytes.length / 4) * 4;
  const tail = original.slice(20 + length);
  const result = new Uint8Array(20 + padded + tail.length);
  result.set(original.slice(0, 20));
  result.fill(32, 20, 20 + padded);
  result.set(bytes, 20);
  result.set(tail, 20 + padded);
  const out = new DataView(result.buffer);
  out.setUint32(8, result.byteLength, true);
  out.setUint32(12, padded, true);
  return result.buffer;
}
describe("D-AT08 static GLB import safety", () => {
  it("accepts the actual original embedded model with 12 triangles", () => {
    expect(inspectGlb(new Uint8Array(source).buffer)).toMatchObject({
      triangles: 12,
      textureCount: 0,
      meshCount: 1,
      nodeCount: 1,
    });
  });
  it("refuses network URLs, malformed textures, extensions and animation", () => {
    for (const fn of [
      (j: any) => (j.buffers[0].uri = "https://example.com/asset"),
      (j: any) => (j.images = [{ bufferView: 0 }]),
      (j: any) => (j.extensionsUsed = ["KHR_draco_mesh_compression"]),
      (j: any) => (j.animations = [{}]),
    ])
      expect(() => inspectGlb(mutate(fn))).toThrow();
  });
  it("refuses oversized views/accessors and cyclic/deep node graphs", () => {
    expect(() =>
      inspectGlb(mutate((j) => (j.bufferViews[0].byteLength = 999999))),
    ).toThrow("uden for");
    expect(() =>
      inspectGlb(mutate((j) => (j.accessors[0].count = 300000))),
    ).toThrow();
    expect(() =>
      inspectGlb(mutate((j) => (j.nodes[0].children = [0]))),
    ).toThrow("cyklus");
    expect(() =>
      inspectGlb(
        mutate((j) => {
          j.nodes = Array.from({ length: 70 }, (_, i) =>
            i === 69 ? {} : { children: [i + 1] },
          );
        }),
      ),
    ).toThrow("dybt");
  });
  it("refuses non-finite vertices and invalid triangle indices", () => {
    let file = new Uint8Array(source);
    let view = new DataView(file.buffer);
    const binary = 20 + view.getUint32(12, true) + 8;
    view.setFloat32(binary, NaN, true);
    expect(() => inspectGlb(file.buffer)).toThrow("positioner");
    file = new Uint8Array(source);
    view = new DataView(file.buffer);
    view.setUint16(binary + 96, 999, true);
    expect(() => inspectGlb(file.buffer)).toThrow("uden for");
  });
  it("bounds instanced geometry and rejects graph amplification", () => {
    expect(() =>
      inspectGlb(
        mutate((j) => {
          j.meshes[0].primitives = Array.from(
            { length: 100 },
            () => j.meshes[0].primitives[0],
          );
          j.nodes = Array.from({ length: 100 }, () => ({ mesh: 0 }));
          j.scenes[0].nodes = Array.from({ length: 100 }, (_, i) => i);
        }),
      ),
    ).toThrow("100.000");
    expect(() =>
      inspectGlb(
        mutate((j) => {
          j.nodes = [{ children: [2] }, { children: [2] }, { mesh: 0 }];
          j.scenes[0].nodes = [0, 1];
        }),
      ),
    ).toThrow("forælder");
  });
  it("refuses malformed array fields without parsing renderer resources", () => {
    expect(() => inspectGlb(mutate((j) => (j.buffers = {})))).toThrow(
      "elementlister",
    );
  });
});

const textured = new Uint8Array(
  readFileSync(
    new URL("../../../fixtures/director-textured-crate.glb", import.meta.url),
  ),
);
describe("Bounded embedded 2K GLB textures", () => {
  it("accepts the original real PNG material and records decoded allocation", () => {
    expect(inspectGlb(new Uint8Array(textured).buffer)).toMatchObject({
      triangles: 12,
      textureCount: 1,
      textureBytes: 262144,
      images: [{ width: 256, height: 256, mime: "image/png" }],
    });
    const jpeg = new Uint8Array(
      readFileSync(
        new URL("../../../fixtures/director-jpeg-crate.glb", import.meta.url),
      ),
    );
    expect(inspectGlb(jpeg.buffer)).toMatchObject({
      textureBytes: 262144,
      images: [{ width: 256, height: 256, mime: "image/jpeg" }],
    });
  });
  it("refuses texture URLs, mismatched MIME, invalid samplers and missing UVs", () => {
    for (const mutateJson of [
      (j: any) => (j.images[0].uri = "https://example.com/texture.png"),
      (j: any) => (j.images[0].mimeType = "image/jpeg"),
      (j: any) => (j.textures[0].source = 8),
      (j: any) => (j.samplers[0].wrapS = 0),
      (j: any) =>
        (j.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = 2),
      (j: any) => delete j.meshes[0].primitives[0].attributes.TEXCOORD_0,
    ])
      expect(() => inspectGlb(mutate(mutateJson, textured))).toThrow();
  });
  it("rejects 4K textures and texture descriptor allocation amplification before decoding", () => {
    const bytes = new Uint8Array(textured),
      info = inspectGlb(bytes.buffer),
      view = new DataView(bytes.buffer);
    view.setUint32(info.images[0].offset + 16, 4096);
    view.setUint32(
      info.images[0].offset + 29,
      crc32(
        bytes.subarray(info.images[0].offset + 12, info.images[0].offset + 29),
      ),
    );
    expect(() => inspectGlb(bytes.buffer)).toThrow("2048");
    view.setUint32(info.images[0].offset + 16, 2048);
    view.setUint32(info.images[0].offset + 20, 2048);
    view.setUint32(
      info.images[0].offset + 29,
      crc32(
        bytes.subarray(info.images[0].offset + 12, info.images[0].offset + 29),
      ),
    );
    expect(() =>
      inspectGlb(
        mutate(
          (j) =>
            (j.textures = Array.from({ length: 5 }, () => ({ source: 0 }))),
          bytes,
        ),
      ),
    ).toThrow("64 MB");
  });
  it("rejects animation chunks and truncated PNG payload boundaries", () => {
    const bytes = new Uint8Array(textured),
      info = inspectGlb(bytes.buffer),
      view = new DataView(bytes.buffer),
      start = info.images[0].offset;
    bytes.set(new TextEncoder().encode("acTL"), start + 37);
    const length = view.getUint32(start + 33);
    view.setUint32(
      start + 41 + length,
      crc32(bytes.subarray(start + 37, start + 41 + length)),
    );
    expect(() => inspectGlb(bytes.buffer)).toThrow("Animerede");
    view.setUint32(start + 33, 999999);
    expect(() => inspectGlb(bytes.buffer)).toThrow("chunk");
  });
});
