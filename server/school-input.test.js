import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolSlug, normalizeTeacherRegistrationInput } from "./school-input.js";

test("creates a school workspace slug with a unique ID suffix", () => {
  assert.equal(
    createSchoolSlug("Harborview Academy", "12345678-abcd-4abc-8def-1234567890ab"),
    "harborview-academy-12345678abcd",
  );
  assert.equal(
    createSchoolSlug("!!!", "12345678-abcd-4abc-8def-1234567890ab"),
    "school-12345678abcd",
  );
});

test("normalizes a teacher registration name and email", () => {
  assert.deepEqual(
    normalizeTeacherRegistrationInput({
      teacherName: "  Ada Teacher  ",
      email: " ADA@EXAMPLE.COM ",
    }),
    { teacherName: "Ada Teacher", email: "ada@example.com" },
  );
});

test("rejects incomplete or invalid teacher registration details", () => {
  for (const input of [
    {},
    { teacherName: "A", email: "ada@example.com" },
    { teacherName: "Ada Teacher", email: "not-an-email" },
    { teacherName: "a".repeat(121), email: "ada@example.com" },
    { teacherName: "Ada Teacher", email: `${"a".repeat(250)}@example.com` },
  ]) {
    assert.equal(normalizeTeacherRegistrationInput(input), null);
  }
});
