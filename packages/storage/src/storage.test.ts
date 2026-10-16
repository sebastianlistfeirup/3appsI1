import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  readdir,
  chmod,
  stat,
  symlink,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArtifactDownloadSigner,
  LocalPrivateObjectStore,
  objectKey,
  type ObjectDescriptor,
} from "./index";
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "tre-private-test-"));
  roots.push(root);
  return { root, store: new LocalPrivateObjectStore(join(root, "objects")) };
}
function descriptor(bytes: Uint8Array): ObjectDescriptor {
  return {
    workspaceId: randomUUID(),
    projectId: randomUUID(),
    artifactVersionId: randomUUID(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
describe("private immutable filesystem objects", () => {
  it("normalizes UUID case and refuses filesystem roots or relative configuration", () => {
    const d = descriptor(new Uint8Array());
    expect(objectKey({ ...d, workspaceId: d.workspaceId.toUpperCase() })).toBe(
      objectKey(d),
    );
    for (const root of ["/", "//", "/tmp/..", "relative"])
      expect(() => new LocalPrivateObjectStore(root)).toThrow(/dedicated/);
  });
  it("round trips binary and empty files with private permissions and no staging residue", async () => {
    const { root, store } = await setup();
    for (const bytes of [new Uint8Array(), randomBytes(1_100_007)]) {
      const d = descriptor(bytes);
      expect(await store.putVerified(d, bytes)).toEqual({ created: true });
      expect(await store.readVerified(d)).toEqual(Buffer.from(bytes));
      const path = join(root, "objects", objectKey(d));
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(
        await readdir(
          join(
            root,
            "objects",
            d.workspaceId,
            d.projectId,
            d.artifactVersionId,
          ),
        ),
      ).toEqual([d.sha256]);
    }
  });
  it("publishes one complete immutable object under concurrent retry and snapshots caller bytes", async () => {
    const { store } = await setup(),
      bytes = randomBytes(300_000),
      expected = Buffer.from(bytes),
      d = descriptor(bytes);
    const first = store.putVerified(d, bytes);
    bytes.fill(0);
    const results = await Promise.all([
      first,
      ...Array.from({ length: 9 }, () => store.putVerified(d, expected)),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await store.readVerified(d)).toEqual(expected);
  });
  it("rejects input mismatch and an oversized object before creating storage", async () => {
    const { root, store } = await setup(),
      bytes = randomBytes(16),
      d = descriptor(bytes);
    await expect(
      store.putVerified(d, bytes.subarray(0, 15)),
    ).rejects.toMatchObject({ code: "OBJECT_INTEGRITY" });
    await expect(
      store.putVerified({ ...d, sha256: "0".repeat(64) }, bytes),
    ).rejects.toMatchObject({ code: "OBJECT_INTEGRITY" });
    await expect(
      store.putVerified({ ...d, bytes: 10_000_001 }, bytes),
    ).rejects.toMatchObject({ code: "OBJECT_TOO_LARGE" });
    expect(await readdir(root)).toEqual([]);
  });
  it("refuses altered or truncated files and never overwrites a corrupt existing version", async () => {
    const { root, store } = await setup(),
      bytes = randomBytes(500),
      d = descriptor(bytes);
    await store.putVerified(d, bytes);
    const path = join(root, "objects", objectKey(d));
    const altered = Buffer.from(bytes);
    altered[40] ^= 1;
    await writeFile(path, altered);
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "OBJECT_INTEGRITY",
    });
    await expect(store.putVerified(d, bytes)).rejects.toMatchObject({
      code: "OBJECT_INTEGRITY",
    });
    expect(await readFile(path)).toEqual(altered);
    expect(await readdir(join(path, ".."))).toEqual([d.sha256]);
    await writeFile(path, bytes.subarray(0, 10));
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "OBJECT_INTEGRITY",
    });
  });
  it("refuses public permissions, symlink objects and replacement of the root", async () => {
    const { root, store } = await setup(),
      bytes = randomBytes(50),
      d = descriptor(bytes);
    await store.putVerified(d, bytes);
    const path = join(root, "objects", objectKey(d));
    await chmod(path, 0o644);
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "OBJECT_INTEGRITY",
    });
    await chmod(path, 0o600);
    await rename(path, `${path}.original`);
    await symlink(`${path}.original`, path);
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "OBJECT_INTEGRITY",
    });
    await rename(join(root, "objects"), join(root, "replaced"));
    await symlink(join(root, "replaced"), join(root, "objects"));
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "STORAGE_CONFIGURATION",
    });
  });
  it("refuses symlink directories and reports absent objects without revealing local paths", async () => {
    const { root, store } = await setup(),
      bytes = randomBytes(10),
      d = descriptor(bytes);
    await expect(store.readVerified(d)).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
      status: 404,
    });
    await symlink(root, join(root, "objects", d.workspaceId));
    await expect(store.putVerified(d, bytes)).rejects.toMatchObject({
      code: "STORAGE_CONFIGURATION",
    });
    expect(await readdir(root)).toEqual(["objects"]);
    expect(() => objectKey({ ...d, workspaceId: "../outside" })).toThrow();
  });
});
describe("short lived artifact capabilities", () => {
  const input = {
    ...descriptor(new TextEncoder().encode("private")),
    app: "studio" as const,
    userId: randomUUID(),
  };
  it("binds the immutable version, app, user and bytes for exactly sixty seconds", () => {
    let now = 1_800_000_000_000;
    const signer = new ArtifactDownloadSigner(randomBytes(32), () => now),
      link = signer.issue(input);
    expect(
      signer.verify(link.token, "studio", input.artifactVersionId),
    ).toMatchObject(input);
    expect(link.expiresAt).toBe(new Date(now + 60_000).toISOString());
    now += 59_999;
    expect(
      signer.verify(link.token, "studio", input.artifactVersionId),
    ).toMatchObject(input);
    now += 1;
    expect(() =>
      signer.verify(link.token, "studio", input.artifactVersionId),
    ).toThrow(/udløbet/);
  });
  it("rejects altered claims, signature, wrong app/version, rotated key and malformed tokens", () => {
    const key = randomBytes(32),
      signer = new ArtifactDownloadSigner(key),
      link = signer.issue(input),
      [body, signature] = link.token.split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    claims.userId = randomUUID();
    for (const token of [
      "",
      "x".repeat(2049),
      "not.a.token",
      `${body}.${signature}a`,
      `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`,
      `${body}.${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`,
    ])
      expect(() =>
        signer.verify(token, "studio", input.artifactVersionId),
      ).toThrow(/ugyldigt/);
    expect(() =>
      signer.verify(link.token, "director", input.artifactVersionId),
    ).toThrow();
    expect(() => signer.verify(link.token, "studio", randomUUID())).toThrow();
    expect(() =>
      new ArtifactDownloadSigner(randomBytes(32)).verify(
        link.token,
        "studio",
        input.artifactVersionId,
      ),
    ).toThrow();
    key.fill(0);
    expect(
      signer.verify(link.token, "studio", input.artifactVersionId),
    ).toMatchObject(input);
    expect(() => new ArtifactDownloadSigner(randomBytes(16))).toThrow();
  });
  it("rejects future-issued links after an unexpected backward clock jump", () => {
    let now = 1_800_000_000_000;
    const signer = new ArtifactDownloadSigner(randomBytes(32), () => now),
      link = signer.issue(input);
    now -= 6_000;
    expect(() =>
      signer.verify(link.token, "studio", input.artifactVersionId),
    ).toThrow();
  });
});
