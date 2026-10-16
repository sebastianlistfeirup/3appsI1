import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  exportWorkspace,
  importWorkspace,
  mergeWorkspaceProjects,
  workspaceFileBytes,
} from "./workspace-archive";
import {
  addArtifact,
  archiveProject,
  createProject,
  saveReviewDraft,
  sha256,
  textArtifact,
  type Project,
} from "./model";
import { createSample } from "./sample";
import { decodeUtf8 } from "./limits";
import { importProject } from "./archive";

async function fixture() {
  const state = createSample();
  state.projects = [
    saveReviewDraft(state.projects[0]!, state.projects[0]!.deliveries[0]!.id, {
      comment: "Ikke færdig · æøå 東京",
      checkedCriteria: [],
    }),
  ];
  let archived = createProject("Arkiveret original");
  archived = addArtifact(
    archived,
    await textArtifact(
      archived,
      "ophav.txt",
      "\uFEFFBevar præcis disse bytes 🌙",
    ),
  );
  state.projects.push(archiveProject(archived));
  return state;
}
describe("Bounded, additive Studio workspace recovery", () => {
  it("roundtrips complete selected projects and separately usable nested ZIPs", async () => {
    const state = await fixture(),
      before = structuredClone(state);
    const zip = await exportWorkspace(
      state,
      state.projects.map((p) => p.id),
    );
    const archive = await importWorkspace(zip);
    expect(archive.workspace).toEqual(state.workspace);
    expect(archive.projects).toEqual(state.projects);
    expect(archive.projects[0]!.reviewDrafts![0]!.comment).toContain("東京");
    expect(archive.projects[1]!.archivedAt).toBeTruthy();
    const files = unzipSync(zip);
    expect(await importProject(files["projects/002.zip"]!)).toEqual(
      state.projects[1],
    );
    expect(state).toEqual(before);
    const selected = await importWorkspace(
      await exportWorkspace(state, [state.projects[1]!.id]),
    );
    expect(selected.projects).toEqual([state.projects[1]]);
  });
  it("rejects outer checksum changes and inner metadata tampering even with a recalculated outer hash", async () => {
    const state = await fixture();
    const files = unzipSync(
      await exportWorkspace(state, [state.projects[0]!.id]),
    );
    const manifest = JSON.parse(decodeUtf8(files["workspace.json"]!));
    const inner = unzipSync(files["projects/001.zip"]!);
    const project = JSON.parse(decodeUtf8(inner["project.json"]!));
    project.name = "Manipuleret";
    inner["project.json"] = strToU8(JSON.stringify(project));
    files["projects/001.zip"] = zipSync(inner);
    await expect(importWorkspace(zipSync(files))).rejects.toThrow("kontrolsum");
    manifest.projects[0].bytes = files["projects/001.zip"].length;
    manifest.projects[0].sha256 = await sha256(files["projects/001.zip"]);
    files["workspace.json"] = strToU8(JSON.stringify(manifest));
    await expect(importWorkspace(zipSync(files))).rejects.toThrow("kontrolsum");
  });
  it("rejects unknown paths, expanded oversize manifests, duplicate IDs and extra nested files", async () => {
    await expect(
      importWorkspace(zipSync({ "../unsafe.zip": new Uint8Array(1) })),
    ).rejects.toThrow("filsti");
    await expect(
      importWorkspace(zipSync({ "workspace.json": new Uint8Array(100_001) })),
    ).rejects.toThrow("for stor");
    const state = await fixture();
    const files = unzipSync(
      await exportWorkspace(
        state,
        state.projects.map((p) => p.id),
      ),
    );
    const manifest = JSON.parse(decodeUtf8(files["workspace.json"]!));
    manifest.projects[1].id = manifest.projects[0].id;
    files["workspace.json"] = strToU8(JSON.stringify(manifest));
    await expect(importWorkspace(zipSync(files))).rejects.toThrow("dubletter");
    manifest.projects[1].id = state.projects[1]!.id;
    files["workspace.json"] = strToU8(JSON.stringify(manifest));
    files["projects/003.zip"] = files["projects/001.zip"]!;
    await expect(importWorkspace(zipSync(files))).rejects.toThrow("matcher");
  });
  it("checks aggregate file and metadata budgets before beginning compression", async () => {
    const state = await fixture();
    const source = state.projects[0]!;
    const huge = Array.from({ length: 4 }, (_, i) => ({
      ...source,
      id: `project-large-${i}`,
      artifacts: Array.from({ length: 3 }, (_, j) => ({
        ...source.artifacts[0]!,
        id: `file-${j}`,
        bytes: 10_000_000,
      })),
    }));
    expect(workspaceFileBytes(huge)).toBe(120_000_000);
    let progress = false;
    await expect(
      exportWorkspace(
        { ...state, projects: huge },
        huge.map((p) => p.id),
        () => {
          progress = true;
        },
      ),
    ).rejects.toThrow("96 MB");
    expect(progress).toBe(false);
    const metadata = Array.from({ length: 3 }, (_, i) => {
      const project = createProject(`Historik ${i}`);
      project.briefVersions = Array.from({ length: 31 }, (_, j) => ({
        ...project.briefVersions[0]!,
        id: `brief-${i}-${j}`,
        version: j + 1,
        goal: "x".repeat(90_000),
      }));
      return project;
    });
    await expect(
      exportWorkspace(
        { ...state, projects: metadata },
        metadata.map((p) => p.id),
      ),
    ).rejects.toThrow("8 MB");
  });
  it("rejects a nested decompression bomb before allocating its advertised contents", async () => {
    const state = await fixture();
    const files = unzipSync(
      await exportWorkspace(state, [state.projects[0]!.id]),
    );
    const inner = unzipSync(files["projects/001.zip"]!);
    inner["padding.bin"] = Uint8Array.of(0);
    const nested = zipSync(inner);
    const view = new DataView(
      nested.buffer,
      nested.byteOffset,
      nested.byteLength,
    );
    let changed = false;
    for (let offset = 0; offset + 46 < nested.length; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const nameLength = view.getUint16(offset + 28, true);
      if (
        decodeUtf8(nested.subarray(offset + 46, offset + 46 + nameLength)) ===
        "padding.bin"
      ) {
        view.setUint32(offset + 24, 121_000_000, true);
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
    files["projects/001.zip"] = nested;
    const manifest = JSON.parse(decodeUtf8(files["workspace.json"]!));
    manifest.projects[0].bytes = nested.length;
    manifest.projects[0].sha256 = await sha256(nested);
    files["workspace.json"] = strToU8(JSON.stringify(manifest));
    await expect(importWorkspace(zipSync(files))).rejects.toThrow("120 MB");
  });
  it("never replaces existing identities, retains archived state and preserves exact immutable history", async () => {
    const state = await fixture(),
      before = structuredClone(state);
    const archive = await importWorkspace(
      await exportWorkspace(
        state,
        state.projects.map((p) => p.id),
      ),
    );
    const restored = mergeWorkspaceProjects(
      state,
      archive,
      archive.projects.map((p) => p.id),
    );
    expect(restored.projects).toHaveLength(4);
    expect(restored.projects.slice(0, 2)).toEqual(before.projects);
    expect(restored.projects[2]!.id).not.toBe(state.projects[0]!.id);
    expect(restored.projects[2]!.deliveries).toEqual(
      state.projects[0]!.deliveries,
    );
    expect(restored.projects[2]!.reviewDrafts).toEqual(
      state.projects[0]!.reviewDrafts,
    );
    expect(restored.projects[3]!.archivedAt).toBe(
      state.projects[1]!.archivedAt,
    );
    expect(restored.projects[3]!.artifacts).toEqual(
      state.projects[1]!.artifacts,
    );
    expect(restored.workspace).toEqual(before.workspace);
    expect(state).toEqual(before);
    const distinct = { ...state, projects: [] };
    expect(
      mergeWorkspaceProjects(distinct, archive, [archive.projects[1]!.id])
        .projects,
    ).toEqual([archive.projects[1]]);
  });
  it("rejects incomplete, duplicate or over-capacity selections without partial changes", async () => {
    const state = await fixture();
    await expect(exportWorkspace(state, [])).rejects.toThrow("1 og 100");
    await expect(
      exportWorkspace(state, [state.projects[0]!.id, state.projects[0]!.id]),
    ).rejects.toThrow("forskellige");
    await expect(exportWorkspace(state, ["absent"])).rejects.toThrow(
      "findes ikke",
    );
    const archive = {
      workspace: state.workspace,
      exportedAt: new Date().toISOString(),
      projects: state.projects,
    };
    expect(() =>
      mergeWorkspaceProjects(state, archive, [state.projects[0]!.id, "absent"]),
    ).toThrow("findes ikke");
    const full = {
      ...state,
      projects: Array.from({ length: 100 }, (_, i) =>
        createProject(`Projekt ${i}`),
      ),
    };
    const before = structuredClone(full);
    expect(() =>
      mergeWorkspaceProjects(full, archive, [state.projects[0]!.id]),
    ).toThrow("100 lokale");
    expect(full).toEqual(before);
  });
});
