import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { z } from "zod";
import { DomainError } from "@tre/contracts";
export interface VerifiedIdentity {
  userId: string;
  email?: string;
  expiresAt: number;
}
export interface AuthConfig {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
}
/** Requires an explicit issuer and asymmetric signing keys. Never reads a user ID from a body. */
export async function verifyBearer(
  header: string | null,
  config: AuthConfig,
): Promise<VerifiedIdentity> {
  if (!header || header.length > 16384 || !/^Bearer [^\s]+$/i.test(header))
    throw new DomainError("AUTH_REQUIRED", "Log ind for at fortsætte.", 401);
  try {
    const { payload } = await jwtVerify(header.slice(7), config.keys, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: 5,
    });
    const userId = z.string().uuid().parse(payload.sub);
    if (payload.role !== "authenticated")
      throw new Error("Role is not an end-user");
    return {
      userId,
      email: typeof payload.email === "string" ? payload.email : undefined,
      expiresAt: payload.exp!,
    };
  } catch {
    throw new DomainError(
      "INVALID_SESSION",
      "Din session er udløbet eller ugyldig. Log ind igen.",
      401,
    );
  }
}
export function supabaseAuthConfig(url: string): AuthConfig {
  const base = new URL(url);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("SUPABASE_URL must be an HTTPS origin");
  const issuer = `${base.origin}/auth/v1`;
  return {
    issuer,
    audience: "authenticated",
    keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    }),
  };
}
export type { JWTPayload };
