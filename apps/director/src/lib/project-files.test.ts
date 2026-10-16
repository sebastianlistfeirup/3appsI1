import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  createSampleProject,
  inspectRaster,
  parseProject,
} from "@tre/scene-format";
import {
  exportPackage,
  importPackage,
  sha256,
  verifyMedia,
} from "./project-files";
const buffer = (value: Uint8Array) => new Uint8Array(value).buffer;
describe("Portable project and media safety", () => {
  it("D-AT12: ZIP preserves every scene, shot and media hash", async () => {
    const p = createSampleProject();
    const bytes = new Uint8Array([1, 2, 3]);
    p.media = [
      {
        id: "test_media",
        kind: "audio",
        mime: "audio/wav",
        name: "Egen optagelse.wav",
        dataUrl: "data:audio/wav;base64,AQID",
        bytes: 3,
        sha256: await sha256(bytes),
        source: "Egen fil",
        rights: "owned",
      },
    ];
    p.voice = {
      mediaId: "test_media",
      volume: 1,
      startFrame: 0,
      sourceIn: 0,
      fadeFrames: 24,
      duck: false,
    };
    expect(await importPackage(buffer(await exportPackage(p)))).toEqual(p);
  });
  it("rejects traversal, undeclared archive contents and corrupted project checksums", async () => {
    await expect(
      importPackage(buffer(zipSync({ "../secret.json": strToU8("{}") }))),
    ).rejects.toThrow();
    const bytes = strToU8(JSON.stringify(createSampleProject()));
    await expect(
      importPackage(
        buffer(
          zipSync({
            "project.json": bytes,
            "manifest.json": strToU8(
              JSON.stringify({
                format: "director-project-package",
                version: 1,
                sha256: "0".repeat(64),
              }),
            ),
          }),
        ),
      ),
    ).rejects.toThrow("checksum");
  });
  it("refuses a media hash mismatch even when project hash is valid", async () => {
    const p = createSampleProject();
    p.media = [
      {
        id: "bad",
        kind: "audio",
        mime: "audio/wav",
        name: "bad.wav",
        dataUrl: "data:audio/wav;base64,AQID",
        bytes: 3,
        sha256: "0".repeat(64),
        source: "Egen fil",
        rights: "owned",
      },
    ];
    await expect(importPackage(buffer(await exportPackage(p)))).rejects.toThrow(
      "checksum",
    );
  });
  it("checks PNG image allocation limits from headers before decoding", () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const v = new DataView(bytes.buffer);
    v.setUint32(8, 13);
    v.setUint32(12, 0x49484452);
    v.setUint32(16, 1280);
    v.setUint32(20, 720);
    expect(inspectRaster(bytes)).toEqual({
      width: 1280,
      height: 720,
      format: "png",
    });
    v.setUint32(16, 50000);
    expect(() => inspectRaster(bytes)).toThrow("8192");
    expect(() => inspectRaster(new Uint8Array([1, 2, 3]))).toThrow();
  });
  it("verifies real GLB texture allocation rather than trusting a package's budget field", async () => {
    const project = createSampleProject(),
      bytes = new Uint8Array(
        readFileSync(
          new URL(
            "../../../../fixtures/director-textured-crate.glb",
            import.meta.url,
          ),
        ),
      );
    project.draft.assets.push({
      id: "textured",
      name: "crate.glb",
      dataUrl:
        "data:model/gltf-binary;base64," +
        Buffer.from(bytes).toString("base64"),
      sha256: await sha256(bytes),
      bytes: bytes.length,
      triangles: 12,
      textureBytes: 262144,
      source: "Original fixture",
      rights: "owned",
    });
    await verifyMedia(project);
    project.draft.assets[0].textureBytes = 0;
    await expect(verifyMedia(project)).rejects.toThrow("manifestet");
  });
  it("bounds total retained scene texture allocation across distinct assets", () => {
    const project = createSampleProject();
    project.draft.assets = Array.from({ length: 3 }, (_, i) => ({
      id: `model_${i}`,
      name: "crate.glb",
      dataUrl: "data:model/gltf-binary;base64,AA==",
      sha256: "0".repeat(64),
      bytes: 1,
      triangles: 12,
      textureBytes: 64 * 1024 * 1024,
      source: "Original fixture",
      rights: "owned",
    }));
    expect(() => parseProject(project)).toThrow("128 MB");
  });
});
