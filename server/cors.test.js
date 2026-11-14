import assert from "node:assert/strict";
import { test } from "node:test";
import { createCorsMiddleware } from "./cors.js";

test("allows browser preflights for the API's mutating methods", () => {
  const headers = new Map();
  let responseStatus;
  const request = {
    method: "OPTIONS",
    get: (name) => name === "Origin" ? "https://aster.example.com" : undefined,
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
  const middleware = createCorsMiddleware({
    production: true,
    configuredOrigins: "https://aster.example.com",
  });

  middleware(request, response, () => assert.fail("preflight should end in the CORS middleware"));

  assert.equal(responseStatus, 204);
  assert.equal(headers.get("Access-Control-Allow-Methods"), "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  assert.equal(headers.get("Access-Control-Allow-Origin"), "https://aster.example.com");
});
