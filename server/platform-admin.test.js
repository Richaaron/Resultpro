import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformAdminEmail } from "./platform-admin.js";

test("matches platform administrators by exact normalized email", () => {
  assert.equal(isPlatformAdminEmail("Owner@Example.com", "staff@example.com, owner@example.com"), true);
  assert.equal(isPlatformAdminEmail("owner@example.com.evil", "owner@example.com"), false);
  assert.equal(isPlatformAdminEmail("owner@example.com", "other@example.com"), false);
});

test("does not grant platform access for empty or malformed allowlists", () => {
  assert.equal(isPlatformAdminEmail("owner@example.com", ""), false);
  assert.equal(isPlatformAdminEmail("owner@example.com", " ,  "), false);
  assert.equal(isPlatformAdminEmail(null, "owner@example.com"), false);
});
