import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inspectGlb } from "./glb";
const original = new Uint8Array(
  readFileSync(
    new URL("../../../fixtures/director-relay.glb", import.meta.url),
  ),
);
function mutate(fn: (json: any) => void) {
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
    expect(inspectGlb(new Uint8Array(original).buffer)).toMatchObject({
      triangles: 12,
      textureCount: 0,
      meshCount: 1,
      nodeCount: 1,
    });
  });
  it("refuses network URLs, textures, extensions and animation", () => {
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
    let file = new Uint8Array(original);
    let view = new DataView(file.buffer);
    const binary = 20 + view.getUint32(12, true) + 8;
    view.setFloat32(binary, NaN, true);
    expect(() => inspectGlb(file.buffer)).toThrow("positioner");
    file = new Uint8Array(original);
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
