import { createRemoteJWKSet, jwtVerify } from "jose";

const invalidTokenCodes = new Set([
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_EXPIRED",
  "ERR_JWT_INVALID",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

let keySetUrl;
let keySet;

export async function requireAuth(request, response, next) {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) {
    return response.status(503).json({
      error: "Authentication is not configured on the API.",
    });
  }

  const authorization = request.get("Authorization") || "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    return response.status(401).json({ error: "Sign in to continue." });
  }

  let authUrl;
  try {
    authUrl = new URL(baseUrl);
  } catch {
    console.error("NEON_AUTH_BASE_URL is not a valid URL.");
    return response.status(503).json({
      error: "Authentication is not configured correctly on the API.",
    });
  }

  const jwksUrl = new URL(".well-known/jwks.json", `${authUrl.href.replace(/\/+$/, "")}/`);
  if (keySetUrl !== jwksUrl.href) {
    keySetUrl = jwksUrl.href;
    keySet = createRemoteJWKSet(jwksUrl);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], keySet, {
      algorithms: ["EdDSA"],
      issuer: authUrl.origin,
      audience: authUrl.origin,
    }));
  } catch (error) {
    if (invalidTokenCodes.has(error?.code)) {
      return response.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
    }
    console.error("Managed Auth verification is unavailable:", error?.code || error?.name);
    return response.status(503).json({
      error: "We couldn’t verify your session. Please try again.",
    });
  }

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return response.status(401).json({ error: "Your session does not include a valid user identity." });
  }
  if (payload.emailVerified !== true) {
    return response.status(403).json({ error: "Verify your email before accessing a school." });
  }

  request.auth = {
    userId: payload.sub,
    email: payload.email.trim().toLowerCase(),
  };
  return next();
}
