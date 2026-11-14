import assert from "node:assert/strict";
import test from "node:test";
import {
  createSchoolSlug,
  normalizeSignatureData,
  normalizeTeacherRegistrationInput,
} from "./school-input.js";

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

test("accepts only small, dimension-limited PNG signatures", () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(1200, 16);
  image.writeUInt32BE(300, 20);
  const signature = `data:image/png;base64,${image.toString("base64")}`;

  assert.equal(normalizeSignatureData(signature), signature);
  assert.equal(normalizeSignatureData(signature.replace("image/png", "image/svg+xml")), null);
  assert.equal(normalizeSignatureData(`data:image/png;base64,${Buffer.alloc(24).toString("base64")}`), null);
  assert.equal(normalizeSignatureData(`data:image/png;base64,${Buffer.concat([image, Buffer.alloc(65_537)]).toString("base64")}`), null);

  image.writeUInt32BE(1601, 16);
  assert.equal(normalizeSignatureData(`data:image/png;base64,${image.toString("base64")}`), null);
});
