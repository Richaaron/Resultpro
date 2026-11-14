import assert from "node:assert/strict";
import { test } from "node:test";
import { createCorsMiddleware } from "./cors.js";

function runPreflight({ origin, configuredOrigins = "" }) {
  const headers = new Map();
  let responseStatus;
  const request = {
    method: "OPTIONS",
    get: (name) => name === "Origin" ? origin : undefined,
  };
  const response = {
    setHeader: (name, value) => headers.set(name, value),
    status: (status) => {
      responseStatus = status;
      return response;
    },
    json: () => response,
    sendStatus: (status) => {
      responseStatus = status;
      return response;
    },
  };
  const middleware = createCorsMiddleware({ production: true, configuredOrigins });

  middleware(request, response, () => assert.fail("preflight should end in the CORS middleware"));
  return { headers, responseStatus };
}

test("allows browser preflights for explicitly configured origins", () => {
  const { headers, responseStatus } = runPreflight({
    origin: "https://aster.example.com",
    configuredOrigins: "https://aster.example.com",
  });

  assert.equal(responseStatus, 204);
  assert.equal(headers.get("Access-Control-Allow-Methods"), "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  assert.equal(headers.get("Access-Control-Allow-Origin"), "https://aster.example.com");
});

test("allows the production app by default but blocks other unconfigured origins", () => {
  const productionOrigin = runPreflight({ origin: "https://resultpro-ruby.vercel.app" });
  const unconfiguredOrigin = runPreflight({ origin: "https://untrusted.example.com" });

  assert.equal(productionOrigin.responseStatus, 204);
  assert.equal(productionOrigin.headers.get("Access-Control-Allow-Origin"), "https://resultpro-ruby.vercel.app");
  assert.equal(unconfiguredOrigin.responseStatus, 403);
});
