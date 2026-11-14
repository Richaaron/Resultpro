import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPlatformAdminEmail,
  normalizePlatformSchoolArchiveInput,
  normalizePlatformSchoolBillingDecision,
  normalizePlatformSchoolDirectoryQuery,
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

test("normalizes school directory search and pagination inputs", () => {
  assert.deepEqual(normalizePlatformSchoolDirectoryQuery(), {
    page: 1,
    pageSize: 50,
    search: "",
  });
  assert.deepEqual(normalizePlatformSchoolDirectoryQuery({ page: "2", search: "  academy " }), {
    page: 2,
    pageSize: 50,
    search: "academy",
  });
  assert.equal(normalizePlatformSchoolDirectoryQuery({ page: "0" }), null);
  assert.equal(normalizePlatformSchoolDirectoryQuery({ page: "1.5" }), null);
  assert.equal(normalizePlatformSchoolDirectoryQuery({ page: "1e2" }), null);
  assert.equal(normalizePlatformSchoolDirectoryQuery({ search: "x".repeat(101) }), null);
  assert.equal(normalizePlatformSchoolDirectoryQuery({ search: " ".repeat(101) }), null);
});

test("accepts only explicit boolean school archive decisions", () => {
  assert.deepEqual(normalizePlatformSchoolArchiveInput({ archived: true }), { archived: true });
  assert.deepEqual(normalizePlatformSchoolArchiveInput({ archived: false }), { archived: false });
  assert.equal(normalizePlatformSchoolArchiveInput({ archived: "true" }), null);
  assert.equal(normalizePlatformSchoolArchiveInput({}), null);
});
