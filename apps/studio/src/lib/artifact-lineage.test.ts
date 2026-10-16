import { describe, expect, it } from "vitest";
import {
  addArtifact,
  archiveProject,
  assertProject,
  assertProjectUpdate,
  createProject,
  reviseArtifactMetadata,
  textArtifact,
} from "./model";
import { exportProject, importProject } from "./archive";
import { createSample } from "./sample";

describe("immutable artifact provenance and exact source versions", () => {
  it("carries licensed/unknown provenance and MIME through edits, including an explicit older source", async () => {
    let p = createProject("Kilder");
    const source = {
      ...(await textArtifact(p, "config.json", '{"value":1}')),
      mime: "application/json",
      rights: "licensed" as const,
      provenance: "Forfatter A · CC BY 4.0 · https://example.test/source",
    };
    p = addArtifact(p, source);
    const edited = await textArtifact(
      p,
      source.name,
      '{"value":2}',
      source.kind,
      source.artifactId,
    );
    expect(edited).toMatchObject({
      version: 2,
      mime: source.mime,
      rights: source.rights,
      provenance: source.provenance,
      derivedFrom: source.id,
    });
    p = addArtifact(p, edited);
    p = reviseArtifactMetadata(p, edited.id, {
      rights: "unknown",
      provenance: "Licensen afventer gennemgang",
    });
    const latest = await textArtifact(
      p,
      source.name,
      '{"value":3}',
      source.kind,
      source.artifactId,
    );
    expect(latest.rights).toBe("unknown");
    const branch = await textArtifact(
      p,
      source.name,
      '{"value":4}',
      source.kind,
      source.artifactId,
      source.id,
    );
    expect(branch).toMatchObject({
      version: 4,
      rights: "licensed",
      provenance: source.provenance,
      mime: source.mime,
      derivedFrom: source.id,
    });
    const next = addArtifact(p, branch);
    expect(() => assertProject(next)).not.toThrow();
    expect(() => assertProjectUpdate(p, next)).not.toThrow();
    expect(next.artifacts[0]).toEqual(source);
  });
  it("creates a metadata-only version without rewriting locked inputs, deliveries or earlier rights, and preserves it in ZIP", async () => {
    const p = createSample().projects[0]!,
      source = p.artifacts.find((a) =>
        p.runs[0]!.inputVersionIds.includes(a.id),
      )!;
    const next = reviseArtifactMetadata(p, source.id, {
      rights: "licensed",
      provenance: "Kontrolleret kilde · CC BY 4.0",
    });
    const version = next.artifacts.at(-1)!;
    expect(version).toMatchObject({
      content: source.content,
      sha256: source.sha256,
      bytes: source.bytes,
      mime: source.mime,
      derivedFrom: source.id,
      rights: "licensed",
    });
    expect(version.id).not.toBe(source.id);
    expect(version.version).toBeGreaterThan(source.version);
    expect(next.artifacts.slice(0, -1)).toEqual(p.artifacts);
    expect(next.runs).toEqual(p.runs);
    expect(next.deliveries).toEqual(p.deliveries);
    expect(next.reviews).toEqual(p.reviews);
    expect(() => assertProjectUpdate(p, next)).not.toThrow();
    expect((await importProject(await exportProject(next))).artifacts).toEqual(
      next.artifacts,
    );
  });
  it("rejects foreign, missing, self and forward lineage references", async () => {
    let p = createProject("Referencer"),
      a = await textArtifact(p, "a.txt", "A"),
      b = await textArtifact(p, "b.txt", "B");
    p = addArtifact(addArtifact(p, a), b);
    const next = await textArtifact(p, "a.txt", "A2", "code", a.artifactId);
    for (const derivedFrom of [b.id, "absent", next.id])
      expect(() =>
        assertProject(addArtifact(p, { ...next, derivedFrom })),
      ).toThrow(/oprindelsesversion/);
    const valid = addArtifact(p, next);
    expect(() =>
      assertProject({
        ...valid,
        artifacts: valid.artifacts.map((item) =>
          item.id === a.id ? { ...item, derivedFrom: next.id } : item,
        ),
      }),
    ).toThrow(/oprindelsesversion/);
    await expect(
      textArtifact(p, "a.txt", "A3", "code", a.artifactId, b.id),
    ).rejects.toThrow(/oprindelsesversion/);
    await expect(
      textArtifact(p, "a.txt", "A3", "code", "missing"),
    ).rejects.toThrow(/oprindelsesversion/);
  });
  it("refuses text edits of binary data, empty corrections and mutation of archived projects", async () => {
    let p = createProject("Binær"),
      file = await textArtifact(p, "original.bin", "abc");
    file = {
      ...file,
      content: "YWJj",
      encoding: "base64",
      mime: "application/octet-stream",
    };
    p = addArtifact(p, file);
    await expect(
      textArtifact(p, file.name, "new", "code", file.artifactId),
    ).rejects.toThrow(/tekst/);
    expect(() =>
      reviseArtifactMetadata(p, file.id, {
        rights: file.rights,
        provenance: file.provenance,
      }),
    ).toThrow(/uændrede/);
    expect(() =>
      reviseArtifactMetadata(p, file.id, {
        rights: "licensed",
        provenance: "  ",
      }),
    ).toThrow();
    expect(() =>
      reviseArtifactMetadata(archiveProject(p), file.id, {
        rights: "licensed",
        provenance: "Licens",
      }),
    ).toThrow(/arkiveret/);
  });
});
