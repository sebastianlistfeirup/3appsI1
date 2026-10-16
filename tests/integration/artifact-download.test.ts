import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createBackendHandler } from "../../packages/backend/src/index";
import type { AuthConfig } from "../../packages/auth/src/index";
import {
  Pool,
  withTrustedUser,
  createWorkspace,
  createProject,
  archiveProject,
} from "../../packages/database/src/index";
import {
  ArtifactDownloadSigner,
  LocalPrivateObjectStore,
  objectKey,
  type ObjectDescriptor,
} from "../../packages/storage/src/index";
const admin = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
const login = `files_${randomUUID().replaceAll("-", "")}`,
  password = randomUUID();
let pool: Pool,
  auth: AuthConfig,
  key: CryptoKey,
  root: string,
  store: LocalPrivateObjectStore;
let now = Date.now(),
  reads = 0;
const signer = new ArtifactDownloadSigner(randomBytes(32), () => now);
let handle: ReturnType<typeof createBackendHandler>;
const domain = {
  app: "studio" as const,
  validateDocument: () => ({}),
  createDocument: () => ({}),
};
function handler(app: "studio" | "director" = "studio") {
  return createBackendHandler({
    pool,
    auth,
    ...domain,
    app,
    storage: {
      signer,
      store: {
        putVerified: (d, b) => store.putVerified(d, b),
        readVerified: async (d) => {
          reads++;
          return store.readVerified(d);
        },
      },
    },
  });
}
beforeAll(async () => {
  await admin.query(
    `create role ${login} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'; grant authenticated to ${login}`,
  );
  const connection = new URL(process.env.TEST_DATABASE_URL!);
  connection.username = login;
  connection.password = password;
  pool = new Pool({ connectionString: connection.toString(), max: 3 });
  const keys = await generateKeyPair("ES256");
  key = keys.privateKey;
  auth = {
    issuer: "https://identity.example.test/auth/v1",
    audience: "authenticated",
    keys: createLocalJWKSet({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: "files-fixture",
          alg: "ES256",
        },
      ],
    }),
  };
  root = await mkdtemp(join(tmpdir(), "tre-api-files-"));
  store = new LocalPrivateObjectStore(root);
  handle = handler();
});
afterAll(async () => {
  await pool?.end();
  await admin.end();
  if (root) await rm(root, { recursive: true, force: true });
});
async function jwt(user: string) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "files-fixture" })
    .setIssuer(auth.issuer)
    .setAudience(auth.audience)
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
async function issue(
  user: string,
  version: string,
  selected = handle,
  body: unknown = {},
) {
  return selected(
    new Request(
      `https://studio.example.test/api/backend/artifacts/${version}/download-link`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await jwt(user)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    ),
  );
}
async function redeem(
  url: string,
  selected = handle,
  method = "GET",
  headers: Record<string, string> = {},
) {
  return selected(
    new Request(new URL(url, "https://studio.example.test"), {
      method,
      headers,
    }),
  );
}
async function fixture(
  options: { key?: string; app?: "studio" | "director" } = {},
) {
  const owner = randomUUID(),
    bytes = randomBytes(8193);
  const { workspace, project } = await withTrustedUser(
    pool,
    owner,
    async (c) => {
      const workspace = await createWorkspace(c, "Privat syntetisk filfixture");
      const project = await createProject(c, {
        workspaceId: workspace.id,
        appKey: options.app ?? "studio",
        name: "Testfilm",
        document: {},
      });
      return { workspace, project };
    },
  );
  const d: ObjectDescriptor = {
    workspaceId: workspace.id,
    projectId: project.id,
    artifactVersionId: randomUUID(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  await store.putVerified(d, bytes);
  await withTrustedUser(pool, owner, (c) =>
    c.query(
      "insert into app.artifact_versions(id,workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status) values($1,$2,$3,$4,1,$5,'application/octet-stream',$6,$7,'{}','owned')",
      [
        d.artifactVersionId,
        d.workspaceId,
        d.projectId,
        randomUUID(),
        d.sha256,
        d.bytes,
        options.key
          ? `${d.workspaceId}/${d.projectId}/${options.key}`
          : objectKey(d),
      ],
    ),
  );
  return { owner, bytes, d, project };
}
async function downloadLink(
  f: Awaited<ReturnType<typeof fixture>>,
  user = f.owner,
  selected = handle,
) {
  const response = await issue(user, f.d.artifactVersionId, selected);
  expect(response.status).toBe(200);
  return (await response.json()).download as {
    url: string;
    expiresAt: string;
    sha256: string;
    bytes: number;
  };
}
describe("private artifact HTTP access against real PostgreSQL and real files", () => {
  it("issues a relative one-minute capability and returns the exact binary with attachment/no-store headers", async () => {
    const f = await fixture(),
      link = await downloadLink(f);
    expect(link).toMatchObject({ sha256: f.d.sha256, bytes: f.bytes.length });
    expect(link.url).toMatch(/^\/api\/backend\/artifacts\//);
    expect(
      new Date(link.expiresAt).getTime() - Math.floor(now / 1000) * 1000,
    ).toBe(60_000);
    const response = await redeem(link.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(f.bytes);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-disposition")).toContain(
      `attachment; filename="artifact-${f.d.artifactVersionId}.bin"`,
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const head = await redeem(link.url, handle, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(f.bytes.length));
    expect(await head.text()).toBe("");
  });
  it("permits current viewers, then revokes an already-issued link before touching storage", async () => {
    const f = await fixture(),
      viewer = randomUUID();
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "insert into app.memberships(workspace_id,user_id,role) values($1,$2,'viewer')",
        [f.d.workspaceId, viewer],
      ),
    );
    const link = await downloadLink(f, viewer);
    expect((await redeem(link.url)).status).toBe(200);
    await withTrustedUser(pool, f.owner, (c) =>
      c.query(
        "update app.memberships set revoked_at=now() where workspace_id=$1 and user_id=$2",
        [f.d.workspaceId, viewer],
      ),
    );
    const before = reads;
    expect((await redeem(link.url)).status).toBe(404);
    expect(reads).toBe(before);
    expect((await issue(viewer, f.d.artifactVersionId)).status).toBe(404);
    expect((await issue(randomUUID(), f.d.artifactVersionId)).status).toBe(404);
    expect((await issue(randomUUID(), randomUUID())).status).toBe(404);
  });
  it("does not treat a download capability as login and cannot cross app, version, expiry or origin", async () => {
    const f = await fixture(),
      link = await downloadLink(f),
      before = reads,
      signed = new URL(
        link.url,
        "https://studio.example.test",
      ).searchParams.get("token")!;
    expect((await redeem(link.url, handler("director"))).status).toBe(401);
    expect(
      (await redeem(link.url.replace(f.d.artifactVersionId, randomUUID())))
        .status,
    ).toBe(401);
    expect((await redeem(`${link.url}&token=${signed}`)).status).toBe(401);
    expect(
      (
        await redeem(link.url, handle, "GET", {
          origin: "https://foreign.example.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await redeem("/api/backend/workspaces", handle, "GET", {
          authorization: `Bearer ${signed}`,
        })
      ).status,
    ).toBe(401);
    now += 60_000;
    expect((await redeem(link.url)).status).toBe(401);
    now -= 60_000;
    expect(reads).toBe(before);
    const foreign = await fixture({ app: "director" });
    expect(
      (await issue(foreign.owner, foreign.d.artifactVersionId)).status,
    ).toBe(404);
  });
  it("rejects client-selected paths and mismatched persisted storage references", async () => {
    const f = await fixture();
    expect(
      (
        await issue(f.owner, f.d.artifactVersionId, handle, {
          storageKey: objectKey(f.d),
        })
      ).status,
    ).toBe(400);
    const invalid = await fixture({ key: "legacy/unbound.bin" }),
      before = reads;
    expect(
      (await issue(invalid.owner, invalid.d.artifactVersionId)).status,
    ).toBe(409);
    expect(reads).toBe(before);
    const forgedButSigned = signer.issue({
      ...f.d,
      sha256: "0".repeat(64),
      app: "studio",
      userId: f.owner,
    });
    expect(
      (
        await redeem(
          `/api/backend/artifacts/${f.d.artifactVersionId}/download?token=${forgedButSigned.token}`,
        )
      ).status,
    ).toBe(409);
    expect(reads).toBe(before);
  });
  it("returns actionable corruption/missing errors without delivering bytes or filesystem paths", async () => {
    const f = await fixture(),
      link = await downloadLink(f),
      path = join(root, objectKey(f.d));
    const damaged = Buffer.from(f.bytes);
    damaged[100] ^= 1;
    await writeFile(path, damaged);
    const corrupt = await redeem(link.url);
    expect(corrupt.status).toBe(409);
    const message = await corrupt.text();
    expect(message).toContain("OBJECT_INTEGRITY");
    expect(message).not.toContain(root);
    await unlink(path);
    const missing = await redeem(link.url);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain(root);
  });
  it("keeps archived project artifacts readable and leaves absent storage explicitly disconnected", async () => {
    const f = await fixture();
    await withTrustedUser(pool, f.owner, (c) =>
      archiveProject(c, f.project.id, "studio", 1, true),
    );
    expect((await redeem((await downloadLink(f)).url)).status).toBe(200);
    const offline = createBackendHandler({ pool, auth, ...domain });
    expect((await issue(f.owner, f.d.artifactVersionId, offline)).status).toBe(
      503,
    );
  });
});
