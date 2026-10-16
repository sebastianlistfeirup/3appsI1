import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { constants } from "node:fs";
import { mkdir, lstat, open, link, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { appKeySchema, DomainError } from "@tre/contracts";

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const descriptorSchema = z
  .object({
    workspaceId: uuid,
    projectId: uuid,
    artifactVersionId: uuid,
    sha256: sha,
    bytes: z.number().int().nonnegative().max(50_000_000),
  })
  .strict();
export type ObjectDescriptor = z.infer<typeof descriptorSchema>;
export function objectKey(descriptor: ObjectDescriptor): string {
  const d = descriptorSchema.parse(descriptor);
  return `${d.workspaceId}/${d.projectId}/${d.artifactVersionId}/${d.sha256}`;
}
export interface PrivateObjectStore {
  readVerified(descriptor: ObjectDescriptor): Promise<Uint8Array>;
  putVerified(
    descriptor: ObjectDescriptor,
    bytes: Uint8Array,
  ): Promise<{ created: boolean }>;
}
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const failure = (code: string, message: string, status = 409) =>
  new DomainError(code, message, status);
function verifyBytes(d: ObjectDescriptor, bytes: Uint8Array) {
  if (bytes.byteLength !== d.bytes || digest(bytes) !== d.sha256)
    throw failure(
      "OBJECT_INTEGRITY",
      "Filens størrelse eller checksum stemmer ikke. Den er ikke udleveret.",
    );
}
function isCode(error: unknown, code: string) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code,
  );
}

/** Real private local storage for the opt-in reference backend, never a public
 * web directory. Authorization belongs at the API boundary, before calling it. */
export class LocalPrivateObjectStore implements PrivateObjectStore {
  private readonly root: string;
  private initialized?: Promise<void>;
  constructor(
    root: string,
    readonly maximumObjectBytes = 10_000_000,
  ) {
    if (!isAbsolute(root) || resolve(root) === "/")
      throw new Error(
        "Private object root must be an absolute dedicated directory.",
      );
    z.number().int().positive().max(50_000_000).parse(maximumObjectBytes);
    this.root = resolve(root);
  }
  private async initialize() {
    this.initialized ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const stat = await lstat(this.root);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o077) !== 0
      )
        throw failure(
          "STORAGE_CONFIGURATION",
          "Filområdet skal være en privat mappe med adgang kun for serverbrugeren.",
          503,
        );
    })().catch((error) => {
      this.initialized = undefined;
      throw error;
    });
    await this.initialized;
    // Recheck on every access so replacing the configured root after startup
    // cannot silently turn it into a symbolic link or a shared directory.
    const stat = await lstat(this.root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0
    )
      throw failure(
        "STORAGE_CONFIGURATION",
        "Filområdet er ikke længere privat.",
        503,
      );
  }
  private async location(descriptor: ObjectDescriptor, create: boolean) {
    const d = descriptorSchema.parse(descriptor);
    if (d.bytes > this.maximumObjectBytes)
      throw failure(
        "OBJECT_TOO_LARGE",
        "Filen overskrider det konfigurerede serverloft.",
        413,
      );
    await this.initialize();
    let directory = this.root;
    // Every component is a validated UUID. Refuse symlinks even inside the root.
    for (const part of [d.workspaceId, d.projectId, d.artifactVersionId]) {
      directory = join(directory, part);
      if (create)
        await mkdir(directory, { mode: 0o700 }).catch((error) => {
          if (!isCode(error, "EEXIST")) throw error;
        });
      let stat;
      try {
        stat = await lstat(directory);
      } catch (error) {
        if (isCode(error, "ENOENT"))
          throw failure(
            "OBJECT_NOT_FOUND",
            "Filen findes ikke i det private lager.",
            404,
          );
        throw error;
      }
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o077) !== 0
      )
        throw failure(
          "STORAGE_CONFIGURATION",
          "Filområdet indeholder en ugyldig mappe.",
          503,
        );
    }
    return { d, directory, path: join(directory, d.sha256) };
  }
  async readVerified(descriptor: ObjectDescriptor): Promise<Uint8Array> {
    const { d, path } = await this.location(descriptor, false);
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((error) => {
      if (isCode(error, "ENOENT"))
        throw failure(
          "OBJECT_NOT_FOUND",
          "Filen findes ikke i det private lager.",
          404,
        );
      if (isCode(error, "ELOOP"))
        throw failure(
          "OBJECT_INTEGRITY",
          "En filreference er ugyldig. Filen er ikke udleveret.",
        );
      throw error;
    });
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== d.bytes || (stat.mode & 0o077) !== 0)
        throw failure(
          "OBJECT_INTEGRITY",
          "Filens metadata eller adgangsgrænse stemmer ikke. Den er ikke udleveret.",
        );
      const bytes = Buffer.alloc(d.bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await file.read(
          bytes,
          offset,
          Math.min(1_048_576, bytes.length - offset),
          offset,
        );
        if (!read.bytesRead)
          throw failure(
            "OBJECT_INTEGRITY",
            "Filen er afkortet. Den er ikke udleveret.",
          );
        offset += read.bytesRead;
      }
      const trailing = await file.read(Buffer.alloc(1), 0, 1, offset);
      if (trailing.bytesRead)
        throw failure(
          "OBJECT_INTEGRITY",
          "Filens størrelse er ændret. Den er ikke udleveret.",
        );
      verifyBytes(d, bytes);
      return bytes;
    } finally {
      await file.close();
    }
  }
  async putVerified(
    descriptor: ObjectDescriptor,
    bytes: Uint8Array,
  ): Promise<{ created: boolean }> {
    // Check before creating any directories or a partial object.
    const d = descriptorSchema.parse(descriptor);
    if (d.bytes > this.maximumObjectBytes)
      throw failure(
        "OBJECT_TOO_LARGE",
        "Filen overskrider det konfigurerede serverloft.",
        413,
      );
    if (bytes.byteLength !== d.bytes)
      throw failure(
        "OBJECT_INTEGRITY",
        "Filens størrelse stemmer ikke. Den er ikke gemt.",
      );
    bytes = Uint8Array.from(bytes);
    verifyBytes(d, bytes);
    const { directory, path } = await this.location(d, true);
    const temporary = join(directory, `.staging-${randomUUID()}`);
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        // Hard-link publication is atomic and cannot overwrite an existing version.
        await link(temporary, path);
      } catch (error) {
        if (!isCode(error, "EEXIST")) throw error;
        await this.readVerified(d);
        return { created: false };
      }
      const dir = await open(directory, constants.O_RDONLY);
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
      return { created: true };
    } finally {
      await unlink(temporary).catch((error) => {
        if (!isCode(error, "ENOENT")) throw error;
      });
    }
  }
}

const claimsSchema = descriptorSchema
  .extend({
    v: z.literal(1),
    audience: z.literal("tre-private-artifact"),
    app: appKeySchema,
    userId: uuid,
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type DownloadClaims = z.infer<typeof claimsSchema>;
export class ArtifactDownloadSigner {
  private readonly key: Uint8Array;
  constructor(
    key: Uint8Array,
    private readonly clock = () => Date.now(),
  ) {
    if (key.byteLength < 32 || key.byteLength > 128)
      throw new Error(
        "Artifact download signing key must contain 32–128 bytes.",
      );
    this.key = Uint8Array.from(key);
  }
  issue(
    input: ObjectDescriptor & { app: DownloadClaims["app"]; userId: string },
  ) {
    const now = Math.floor(this.clock() / 1000);
    const claims = claimsSchema.parse({
      ...input,
      v: 1,
      audience: "tre-private-artifact",
      issuedAt: now,
      expiresAt: now + 60,
    });
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", this.key)
      .update(body)
      .digest("base64url");
    return {
      token: `${body}.${signature}`,
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    };
  }
  verify(
    token: string,
    app: DownloadClaims["app"],
    artifactVersionId: string,
  ): DownloadClaims {
    const invalid = () =>
      failure(
        "INVALID_DOWNLOAD_LINK",
        "Downloadlinket er ugyldigt eller udløbet. Hent et nyt fra projektet.",
        401,
      );
    if (
      token.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw invalid();
    const [body, signature] = token.split(".") as [string, string];
    const expected = createHmac("sha256", this.key).update(body).digest();
    const provided = Buffer.from(signature, "base64url");
    if (
      provided.length !== expected.length ||
      provided.toString("base64url") !== signature ||
      !timingSafeEqual(provided, expected)
    )
      throw invalid();
    try {
      const bytes = Buffer.from(body, "base64url");
      if (bytes.toString("base64url") !== body) throw invalid();
      const claims = claimsSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      const now = Math.floor(this.clock() / 1000);
      if (
        claims.app !== app ||
        claims.artifactVersionId !== artifactVersionId ||
        claims.issuedAt > now + 5 ||
        claims.expiresAt <= now ||
        claims.expiresAt - claims.issuedAt !== 60
      )
        throw invalid();
      return claims;
    } catch {
      throw invalid();
    }
  }
}
