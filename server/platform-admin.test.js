import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPlatformAdminEmail,
  normalizePlatformSchoolBillingDecision,
} from "./platform-admin.js";

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

test("validates per-school billing decisions and requires an approved plan for paid schools", () => {
  assert.deepEqual(normalizePlatformSchoolBillingDecision({ billingStatus: "pending" }), {
    billingStatus: "pending",
    planId: null,
  });
  assert.deepEqual(normalizePlatformSchoolBillingDecision({ billingStatus: "exempt", planId: null }), {
    billingStatus: "exempt",
    planId: null,
  });
  assert.deepEqual(normalizePlatformSchoolBillingDecision({ billingStatus: "paid", planId: "growth" }), {
    billingStatus: "paid",
    planId: "growth",
  });
  assert.equal(normalizePlatformSchoolBillingDecision({ billingStatus: "paid" }), null);
  assert.equal(normalizePlatformSchoolBillingDecision({ billingStatus: "paid", planId: "custom" }), null);
  assert.equal(normalizePlatformSchoolBillingDecision({ billingStatus: "exempt", planId: "starter" }), null);
  assert.equal(normalizePlatformSchoolBillingDecision({ billingStatus: "overdue" }), null);
});
