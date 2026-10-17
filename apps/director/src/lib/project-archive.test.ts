import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createSampleProject, inspectGlb } from "@tre/scene-format";
import {
  exportPackage,
  importPackage,
  importProjectJsonBytes,
  ARCHIVE_LIMITS,
} from "./project-archive";
import { sha256 } from "./binary";
const buffer = (value: Uint8Array) => new Uint8Array(value).buffer;
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url)),
  );
async function withRepeatedModel() {
  const project = createSampleProject(),
    bytes = fixture("director-textured-crate.glb"),
    info = inspectGlb(buffer(bytes));
  const asset = {
    id: "shared_model",
    name: "Original.glb",
    dataUrl:
      "data:model/gltf-binary;base64," + Buffer.from(bytes).toString("base64"),
    bytes: bytes.length,
    sha256: await sha256(bytes),
    triangles: info.triangles,
    textureBytes: info.textureBytes,
    source: "Original fixture",
    rights: "owned" as const,
  };
  project.draft.assets = [asset];
  for (const scene of project.scenes) scene.assets = [structuredClone(asset)];
  project.scenes.push({
    ...structuredClone(project.scenes[0]),
    id: "third_scene",
    version: 3,
  });
  return { project, bytes, asset };
}
async function repack(
  files: Record<string, Uint8Array>,
  change: (raw: any, manifest: any) => void,
) {
  const raw = JSON.parse(strFromU8(files["project.json"])),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  change(raw, manifest);
  files["project.json"] = strToU8(JSON.stringify(raw));
  manifest.sha256 = await sha256(files["project.json"]);
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return buffer(zipSync(files));
}
describe("Versioned deduplicated Director archives", () => {
  it("validates raw JSON with the same scene/media guarantees as an archive", async () => {
    const { project } = await withRepeatedModel();
    expect(
      await importProjectJsonBytes(buffer(strToU8(JSON.stringify(project)))),
    ).toEqual(project);
    project.draft.assets[0].sha256 = "f".repeat(64);
    await expect(
      importProjectJsonBytes(buffer(strToU8(JSON.stringify(project)))),
    ).rejects.toThrow("checksum");
  });
  it("rejects raw JSON bytes above the expansion ceiling before decoding and rejects invalid UTF-8 or syntax", async () => {
    await expect(
      importProjectJsonBytes(
        new ArrayBuffer(ARCHIVE_LIMITS.expandedProjectBytes + 1),
      ),
    ).rejects.toThrow("150 MiB");
    await expect(
      importProjectJsonBytes(buffer(new Uint8Array([255, 254]))),
    ).rejects.toThrow("UTF-8 JSON");
    await expect(
      importProjectJsonBytes(buffer(strToU8('{"broken":'))),
    ).rejects.toThrow("UTF-8 JSON");
  });
  it("stores a real textured model once across immutable scene versions and restores every reference", async () => {
    const { project, bytes, asset } = await withRepeatedModel(),
      before = structuredClone(project);
    const zip = await exportPackage(project),
      files = unzipSync(zip),
      manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.version).toBe(2);
    expect(manifest.blobs).toEqual([
      { sha256: asset.sha256, bytes: bytes.length },
    ]);
    expect(Object.keys(files).sort()).toEqual([
      `assets/${asset.sha256}`,
      "manifest.json",
      "project.json",
    ]);
    expect(files[`assets/${asset.sha256}`]).toEqual(bytes);
    expect(strFromU8(files["project.json"])).not.toContain(asset.dataUrl);
    expect(manifest.expandedBytes).toBe(
      strToU8(JSON.stringify(project)).length,
    );
    expect(await importPackage(buffer(zip))).toEqual(project);
    expect(project).toEqual(before);
  });
  it("still reads the original v1 embedded-JSON ZIP format", async () => {
    const { project } = await withRepeatedModel(),
      bytes = strToU8(JSON.stringify(project));
    const zip = zipSync({
      "project.json": bytes,
      "manifest.json": strToU8(
        JSON.stringify({
          format: "director-project-package",
          version: 1,
          project: "project.json",
          sha256: await sha256(bytes),
        }),
      ),
    });
    expect(await importPackage(buffer(zip))).toEqual(project);
  });
  it("deduplicates a genuine frame reused by multiple shots without replacing shot versions", async () => {
    const project = createSampleProject(),
      jpg = new Uint8Array(
        readFileSync(
          new URL("../../public/locations/studio.jpg", import.meta.url),
        ),
      );
    const dataUrl =
      "data:image/jpeg;base64," + Buffer.from(jpg).toString("base64");
    for (const shot of project.shots) shot.frame = dataUrl;
    const zip = await exportPackage(project),
      files = unzipSync(zip),
      manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.blobs).toHaveLength(1);
    expect(manifest.blobs[0].bytes).toBe(jpg.length);
    expect(await importPackage(buffer(zip))).toEqual(project);
  });
  it("normalizes missing base64 padding while preserving actual original bytes and declared expansion", async () => {
    const project = createSampleProject(),
      bytes = new Uint8Array([1]);
    project.media = [
      {
        id: "audio",
        name: "Legacy.wav",
        kind: "audio",
        mime: "audio/wav",
        bytes: 1,
        dataUrl: "data:audio/wav;base64,AQ",
        sha256: await sha256(bytes),
        source: "Legacy",
        rights: "owned",
      },
    ];
    const restored = await importPackage(buffer(await exportPackage(project)));
    expect(restored.media[0].dataUrl).toBe("data:audio/wav;base64,AQ==");
    expect(restored.media[0].sha256).toBe(project.media[0].sha256);
  });
  it("rejects modified or missing original bytes before accepting the project", async () => {
    const { project, asset } = await withRepeatedModel(),
      files = unzipSync(await exportPackage(project));
    files[`assets/${asset.sha256}`][0] ^= 1;
    await expect(importPackage(buffer(zipSync(files)))).rejects.toThrow(
      "checksum",
    );
    delete files[`assets/${asset.sha256}`];
    await expect(importPackage(buffer(zipSync(files)))).rejects.toThrow();
  });
  it("rejects unsupported archive versions and untrusted references even with a recomputed project hash", async () => {
    const { project } = await withRepeatedModel(),
      zip = await exportPackage(project);
    for (const change of [
      (_raw: any, manifest: any) => {
        manifest.version = 3;
      },
      (raw: any) => {
        raw.draft.assets[0].dataUrl = "https://example.com/model.glb";
      },
      (raw: any) => {
        raw.draft.assets[0].dataUrl = `director-blob:${"0".repeat(64)}:model/gltf-binary`;
      },
      (raw: any) => {
        raw.draft.assets[0].dataUrl = raw.draft.assets[0].dataUrl.replace(
          "model/gltf-binary",
          "text/html",
        );
      },
      (_raw: any, manifest: any) => {
        manifest.blobs.push(manifest.blobs[0]);
      },
      (_raw: any, manifest: any) => {
        manifest.expandedBytes--;
      },
      (_raw: any, manifest: any) => {
        manifest.expandedBytes = ARCHIVE_LIMITS.expandedProjectBytes + 1;
      },
    ])
      await expect(
        importPackage(await repack(unzipSync(zip), change)),
      ).rejects.toThrow();
  });
  it("rejects undeclared files, traversal and duplicate filenames before extraction can overwrite an entry", async () => {
    const { project } = await withRepeatedModel(),
      files = unzipSync(await exportPackage(project));
    files[`assets/${"f".repeat(64)}`] = new Uint8Array([1]);
    await expect(importPackage(buffer(zipSync(files)))).rejects.toThrow();
    await expect(
      importPackage(buffer(zipSync({ "../secret.json": strToU8("{}") }))),
    ).rejects.toThrow();
    const one = `assets/${"a".repeat(64)}`,
      two = `assets/${"b".repeat(64)}`;
    const duplicate = Buffer.from(
      zipSync({ [one]: new Uint8Array([1]), [two]: new Uint8Array([2]) }),
    );
    let at = duplicate.indexOf(two);
    while (at !== -1) {
      duplicate.write(one, at);
      at = duplicate.indexOf(two, at + one.length);
    }
    await expect(importPackage(buffer(duplicate))).rejects.toThrow("Ugyldig");
  });
  it("rejects oversized declared ZIP expansion before allocation", async () => {
    const zip = zipSync({ "project.json": strToU8("{}") }),
      bytes = new Uint8Array(zip),
      view = new DataView(bytes.buffer);
    const central = Buffer.from(bytes).indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    );
    expect(central).toBeGreaterThan(0);
    view.setUint32(central + 24, ARCHIVE_LIMITS.expandedProjectBytes + 1, true);
    await expect(importPackage(bytes.buffer)).rejects.toThrow("for stor");
  });
  it("bounds expanded reference aliases independently of the manifest's claimed size", async () => {
    const project = createSampleProject(),
      bytes = new Uint8Array(1024 * 1024);
    bytes.set(
      readFileSync(
        new URL("../../public/locations/studio.jpg", import.meta.url),
      ),
    );
    project.shots[0].frame =
      "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64");
    const files = unzipSync(await exportPackage(project));
    const bomb = await repack(files, (raw) => {
      raw.shots = Array.from({ length: 200 }, (_, index) => ({
        ...raw.shots[0],
        id: `alias_${index}`,
      }));
      raw.sequence = [raw.shots[0].id];
    });
    await expect(importPackage(bomb)).rejects.toThrow("150 MB");
  });
});
