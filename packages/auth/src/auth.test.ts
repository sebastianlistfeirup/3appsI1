import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { verifyBearer, supabaseAuthConfig, type AuthConfig } from "./index";
let config: AuthConfig, privateKey: CryptoKey;
const subject = randomUUID();
beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  const key = await exportJWK(pair.publicKey);
  config = {
    issuer: "https://identity.example.test/auth/v1",
    audience: "authenticated",
    keys: createLocalJWKSet({
      keys: [{ ...key, kid: "test-key", alg: "ES256" }],
    }),
  };
});
async function token(
  payload: Record<string, unknown> = {},
  options: {
    issuer?: string;
    audience?: string;
    expires?: string;
    subject?: string;
  } = {},
) {
  return new SignJWT({ role: "authenticated", ...payload })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(options.issuer ?? config.issuer)
    .setAudience(options.audience ?? config.audience)
    .setSubject(options.subject ?? subject)
    .setIssuedAt()
    .setExpirationTime(options.expires ?? "5m")
    .sign(privateKey);
}
describe("Verified bearer identity", () => {
  it("derives identity only from an asymmetrically verified token", async () => {
    const result = await verifyBearer(
      `Bearer ${await token({ email: "synthetic@example.test" })}`,
      config,
    );
    expect(result.userId).toBe(subject);
    expect(result.email).toBe("synthetic@example.test");
  });
  it.each([null, "", "Bearer", "Basic Zm9vOmJhcg==", "Bearer x y"])(
    "rejects absent or malformed credentials %s",
    async (header) => {
      await expect(verifyBearer(header, config)).rejects.toMatchObject({
        status: 401,
        code: "AUTH_REQUIRED",
      });
    },
  );
  it("rejects expired tokens, wrong issuer and wrong audience", async () => {
    for (const options of [
      { expires: "-1m" },
      { issuer: "https://attacker.example.test" },
      { audience: "service-role" },
    ])
      await expect(
        verifyBearer(`Bearer ${await token({}, options)}`, config),
      ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects service identities, anonymous identities and non-UUID subjects", async () => {
    for (const payload of [{ role: "service_role" }, { role: "anon" }])
      await expect(
        verifyBearer(`Bearer ${await token(payload)}`, config),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyBearer(
        `Bearer ${await token({}, { subject: "../../other-user" })}`,
        config,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects a valid token signed by an untrusted key", async () => {
    const other = await generateKeyPair("ES256");
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(
      verifyBearer(`Bearer ${forged}`, config),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects HMAC algorithm substitution", async () => {
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256", kid: "test-key" })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("fixture-secret-not-a-real-secret"));
    await expect(
      verifyBearer(`Bearer ${forged}`, config),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("requires an explicit HTTPS identity origin and exposes no credentials", () => {
    for (const url of [
      "http://identity.example.test",
      "https://user:password@identity.example.test",
      "https://identity.example.test/?token=secret",
    ])
      expect(() => supabaseAuthConfig(url)).toThrow();
    expect(supabaseAuthConfig("https://sample.supabase.co").issuer).toBe(
      "https://sample.supabase.co/auth/v1",
    );
  });
});
