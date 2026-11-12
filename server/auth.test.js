import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { requireAuth } from "./auth.js";

const originalAuthUrl = process.env.NEON_AUTH_BASE_URL;
let authServer;
let authUrl;
let privateKey;

before(async () => {
  const keys = await generateKeyPair("EdDSA");
  privateKey = keys.privateKey;
  const jwk = await exportJWK(keys.publicKey);
  jwk.kid = "test-key";
  jwk.alg = "EdDSA";
  jwk.use = "sig";

  authServer = createServer((request, response) => {
    if (request.url !== "/auth/.well-known/jwks.json") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => authServer.listen(0, "127.0.0.1", resolve));
  const { port } = authServer.address();
  authUrl = `http://127.0.0.1:${port}/auth`;
  process.env.NEON_AUTH_BASE_URL = authUrl;
});

after(async () => {
  await new Promise((resolve, reject) => {
    authServer.close((error) => error ? reject(error) : resolve());
  });
  if (originalAuthUrl === undefined) delete process.env.NEON_AUTH_BASE_URL;
  else process.env.NEON_AUTH_BASE_URL = originalAuthUrl;
});

async function signedToken({ emailVerified = true } = {}) {
  const origin = new URL(authUrl).origin;
  return new SignJWT({
    email: "member@example.test",
    emailVerified,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setIssuer(origin)
    .setAudience(origin)
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects requests without a bearer token", async () => {
  const response = responseRecorder();
  await requireAuth({ get: () => undefined }, response, () => assert.fail("next should not run"));
  assert.equal(response.statusCode, 401);
});

test("verifies the token and exposes only its signed identity", async () => {
  const token = await signedToken();
  const request = { get: () => `Bearer ${token}` };
  const response = responseRecorder();
  let nextCalled = false;

  await requireAuth(request, response, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.deepEqual(request.auth, { userId: "user-123", email: "member@example.test" });
});

test("rejects an otherwise valid token until the email is verified", async () => {
  const token = await signedToken({ emailVerified: false });
  const response = responseRecorder();

  await requireAuth({ get: () => `Bearer ${token}` }, response, () => assert.fail("next should not run"));

  assert.equal(response.statusCode, 403);
});

test("rejects malformed or forged tokens", async () => {
  const response = responseRecorder();

  await requireAuth({ get: () => "Bearer invalid" }, response, () => assert.fail("next should not run"));

  assert.equal(response.statusCode, 401);
});
