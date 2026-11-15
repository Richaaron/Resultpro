import assert from "node:assert/strict";
import { test } from "node:test";
import { getPricingTierForActiveStudents } from "./billing-plans.js";

test("uses free pricing through 500 active students", () => {
  assert.equal(getPricingTierForActiveStudents(0).id, "free");
  assert.equal(getPricingTierForActiveStudents(500).id, "free");
});

test("moves schools into the next paid tier at each student threshold", () => {
  assert.equal(getPricingTierForActiveStudents(501).id, "starter");
  assert.equal(getPricingTierForActiveStudents(750).id, "starter");
  assert.equal(getPricingTierForActiveStudents(751).id, "growth");
  assert.equal(getPricingTierForActiveStudents(1500).id, "growth");
  assert.equal(getPricingTierForActiveStudents(1501).id, "scale");
  assert.equal(getPricingTierForActiveStudents(3000).id, "scale");
  assert.equal(getPricingTierForActiveStudents(3001).id, "custom");
});

test("rejects invalid active-student counts", () => {
  assert.equal(getPricingTierForActiveStudents(-1), null);
  assert.equal(getPricingTierForActiveStudents(1.5), null);
  assert.equal(getPricingTierForActiveStudents("500"), null);
});
