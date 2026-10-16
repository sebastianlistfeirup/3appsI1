import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createSampleProject, inspectRaster } from "@tre/scene-format";
import { exportPackage, importPackage, sha256 } from "./project-files";
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
});
