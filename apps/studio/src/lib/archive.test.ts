import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { exportProject, importProject } from "./archive";
import {
  addArtifact,
  artifactSchema,
  changeProject,
  copyProject,
  createProject,
  sha256,
  textArtifact,
  type Project,
} from "./model";
import { bytesToBase64, decodeUtf8 } from "./limits";
import { createSample } from "./sample";

describe("Portable Studio archives", () => {
  it("writes v2 bytes once, retains metadata and reads legacy v1 archives", async () => {
    const project = createSample().projects[0]!;
    const files = unzipSync(await exportProject(project));
    const packed = JSON.parse(decodeUtf8(files["project.json"]!));
    expect(packed.artifacts[0]).not.toHaveProperty("content");
    const manifest = JSON.parse(decodeUtf8(files["manifest.json"]!));
    expect(manifest.schemaVersion).toBe(2);
    files["project.json"] = strToU8(JSON.stringify(project));
    manifest.schemaVersion = 1;
    manifest.projectSha256 = await sha256(files["project.json"]);
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    expect(await importProject(zipSync(files))).toEqual(project);
  });
  it("preserves BOM, Danish characters and emoji as exact UTF-8 bytes", async () => {
    let project = createProject("Unicode");
    const content = "\uFEFFÆble, blåbær og idéer 🌙";
    project = addArtifact(
      project,
      await textArtifact(project, "dansk.txt", content),
    );
    const restored = await importProject(await exportProject(project));
    expect(restored).toEqual(project);
    expect(restored.artifacts[0]!.content.charCodeAt(0)).toBe(0xfeff);
    const normalized = await textArtifact(
      project,
      "input.txt",
      "Et afbrudt tegn: \ud800",
    );
    expect(normalized.content.endsWith("\uFFFD")).toBe(true);
  });
  it("roundtrips a genuinely larger-than-10MB binary project", async () => {
    let project = createProject("Stor projektpakke"),
      seed = 381;
    for (let index = 0; index < 8; index++) {
      const bytes = new Uint8Array(1_500_000);
      for (let i = 0; i < bytes.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        bytes[i] = seed & 255;
      }
      project = addArtifact(
        project,
        artifactSchema.parse({
          id: `version-${index}`,
          artifactId: `file-${index}`,
          version: 1,
          name: `materiale-${index}.bin`,
          mime: "application/octet-stream",
          content: bytesToBase64(bytes),
          encoding: "base64",
          sha256: await sha256(bytes),
          bytes: bytes.length,
          kind: "other",
          provenance: "Deterministic synthetic bytes",
          rights: "owned",
          createdAt: "2026-10-16T20:00:00.000Z",
        }),
      );
    }
    const zip = await exportProject(project);
    expect(zip.length).toBeGreaterThan(10_000_000);
    const restored = await importProject(zip);
    expect(restored).toEqual(project);
    expect(unzipSync(zip)["project.json"]!.length).toBeLessThan(10_000);
  });
  it("rejects provenance inconsistencies, duplicate manifest entries and damaged ZIPs", async () => {
    const files = unzipSync(await exportProject(createSample().projects[0]!));
    const manifest = JSON.parse(decodeUtf8(files["manifest.json"]!));
    manifest.artifacts[0].rights = "unknown";
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    await expect(importProject(zipSync(files))).rejects.toThrow(
      "Filintegritet",
    );
    manifest.artifacts.push(manifest.artifacts[0]);
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    await expect(importProject(zipSync(files))).rejects.toThrow("dublerede");
    await expect(importProject(Uint8Array.of(1, 2, 3))).rejects.toThrow(
      "beskadiget",
    );
  });
  it("bounds admitted project history while preserving the previous good project", () => {
    const state = createSample(),
      original = structuredClone(state);
    const huge = structuredClone(state.projects[0]!);
    huge.artifacts = Array.from({ length: 5 }, (_, i) => ({
      ...huge.artifacts[0]!,
      id: `large-${i}`,
      artifactId: `file-${i}`,
      bytes: 10_000_000,
    }));
    // Keep references valid; budget rejection is evaluated before accepting the edited state.
    huge.runs = [];
    huge.deliveries = [];
    huge.reviews = [];
    expect(() => changeProject(state, huge.id, () => huge)).toThrow("48 MB");
    expect(state).toEqual(original);
  });
  it("imports an independent copy without rewriting original files, run snapshots or reviews", () => {
    const project = createSample().projects[0]!,
      before = structuredClone(project);
    const copy = copyProject(project);
    expect(copy.id).not.toBe(project.id);
    expect(copy.name).toBe("Realmread (kopi)");
    expect(copy.artifacts).toEqual(project.artifacts);
    expect(copy.runs).toEqual(project.runs);
    expect(copy.deliveries).toEqual(project.deliveries);
    expect(copy.activity.at(-1)!.title).toContain(project.id);
    expect(project).toEqual(before);
  });
});
