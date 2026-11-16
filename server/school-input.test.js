import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAcademicSessionInput,
  normalizeAcademicRolloverInput,
  normalizeAcademicTermDates,
  createSchoolSlug,
  normalizeProfilePhotoData,
  normalizeSchoolLogoData,
  normalizeSchoolCurriculumInput,
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

test("normalizes school levels and grade-specific subject selections", () => {
  assert.deepEqual(
    normalizeSchoolCurriculumInput({
      levelCodes: ["primary"],
      subjectsByGrade: {
        "Primary 1": ["Mathematics", "English Studies"],
        "Primary 2": [],
      },
    }),
    {
      levelCodes: ["primary"],
      subjectsByGrade: {
        "Primary 1": ["Mathematics", "English Studies"],
        "Primary 2": [],
        "Primary 3": [],
        "Primary 4": [],
        "Primary 5": [],
        "Primary 6": [],
      },
    },
  );
});

test("rejects school curriculum setup without valid levels and grade subjects", () => {
  for (const input of [
    { levelCodes: [], subjectsByGrade: { "Primary 1": ["Mathematics"] } },
    { levelCodes: ["primary"], subjectsByGrade: { "Primary 1": [] } },
    { levelCodes: ["primary"], subjectsByGrade: { "JSS 1": ["Mathematics"] } },
    { levelCodes: ["primary"], subjectsByGrade: { "Primary 1": ["Physics"] } },
    { levelCodes: ["primary"], subjectsByGrade: { "Primary 1": ["Mathematics", "Mathematics"] } },
    { levelCodes: ["primary"], subjectsByGrade: { Unknown: ["Mathematics"] } },
  ]) {
    assert.equal(normalizeSchoolCurriculumInput(input), null);
  }
});

test("normalizes sequential academic sessions", () => {
  assert.deepEqual(normalizeAcademicSessionInput({ academicYear: " 2026/2027 ", isCurrent: true }), {
    academicYear: "2026/2027",
    isCurrent: true,
  });
  assert.equal(normalizeAcademicSessionInput({ academicYear: "2026/2028" }), null);
  assert.equal(normalizeAcademicSessionInput({ academicYear: "2026/2027", isCurrent: "true" }), null);
});

test("normalizes a consecutive-year student rollover and per-student overrides", () => {
  const studentId = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(normalizeAcademicRolloverInput({
    sourceAcademicYear: "2025/2026",
    targetAcademicYear: "2026/2027",
    exceptions: [{ studentId, action: "repeat" }],
  }), {
    sourceAcademicYear: "2025/2026",
    targetAcademicYear: "2026/2027",
    exceptions: [{ studentId, action: "repeat" }],
  });
  assert.equal(normalizeAcademicRolloverInput({
    sourceAcademicYear: "2024/2025",
    targetAcademicYear: "2026/2027",
  }), null);
  assert.equal(normalizeAcademicRolloverInput({
    sourceAcademicYear: "2025/2026",
    targetAcademicYear: "2026/2027",
    exceptions: [{ studentId, action: "unknown" }],
  }), null);
  assert.equal(normalizeAcademicRolloverInput({
    sourceAcademicYear: "2025/2026",
    targetAcademicYear: "2026/2027",
    exceptions: [{ studentId, action: "repeat" }, { studentId, action: "graduate" }],
  }), null);
});

test("normalizes complete, ordered academic term date ranges", () => {
  const terms = [
    { term: "Term 1", startDate: "2026-09-01", endDate: "2026-12-10" },
    { term: "Term 2", startDate: "2027-01-05", endDate: "2027-04-02" },
    { term: "Term 3", startDate: "", endDate: "" },
  ];
  assert.deepEqual(normalizeAcademicTermDates(terms), [
    { term: "Term 1", startDate: "2026-09-01", endDate: "2026-12-10" },
    { term: "Term 2", startDate: "2027-01-05", endDate: "2027-04-02" },
    { term: "Term 3", startDate: null, endDate: null },
  ]);
  assert.equal(normalizeAcademicTermDates([...terms.slice(0, 2)]), null);
  assert.equal(normalizeAcademicTermDates([
    terms[0],
    { ...terms[1], startDate: "2026-12-01" },
    terms[2],
  ]), null);
  assert.equal(normalizeAcademicTermDates([
    { ...terms[0], startDate: "2026-02-30" },
    terms[1],
    terms[2],
  ]), null);
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

test("accepts only small PNG school logos with bounded dimensions", () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(512, 16);
  image.writeUInt32BE(512, 20);
  const logo = `data:image/png;base64,${image.toString("base64")}`;

  assert.equal(normalizeSchoolLogoData(logo), logo);
  assert.equal(normalizeSchoolLogoData(logo.replace("image/png", "image/svg+xml")), null);
  assert.equal(normalizeSchoolLogoData(`data:image/png;base64,${Buffer.alloc(24).toString("base64")}`), null);

  image.writeUInt32BE(513, 16);
  assert.equal(normalizeSchoolLogoData(`data:image/png;base64,${image.toString("base64")}`), null);
  image.writeUInt32BE(512, 16);
  image.writeUInt32BE(513, 20);
  assert.equal(normalizeSchoolLogoData(`data:image/png;base64,${image.toString("base64")}`), null);
  assert.equal(
    normalizeSchoolLogoData(`data:image/png;base64,${Buffer.concat([image, Buffer.alloc(65_537)]).toString("base64")}`),
    null,
  );
});

test("accepts only small PNG profile photos with bounded dimensions", () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(128, 16);
  image.writeUInt32BE(128, 20);
  const photo = `data:image/png;base64,${image.toString("base64")}`;

  assert.equal(normalizeProfilePhotoData(photo), photo);
  assert.equal(normalizeProfilePhotoData(photo.replace("image/png", "image/svg+xml")), null);
  assert.equal(normalizeProfilePhotoData(`data:image/png;base64,${Buffer.alloc(24).toString("base64")}`), null);
  image.writeUInt32BE(129, 16);
  assert.equal(normalizeProfilePhotoData(`data:image/png;base64,${image.toString("base64")}`), null);
  image.writeUInt32BE(128, 16);
  image.writeUInt32BE(129, 20);
  assert.equal(normalizeProfilePhotoData(`data:image/png;base64,${image.toString("base64")}`), null);
  assert.equal(
    normalizeProfilePhotoData(`data:image/png;base64,${Buffer.concat([image, Buffer.alloc(16_001)]).toString("base64")}`),
    null,
  );
});
