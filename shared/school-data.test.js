import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeClassInput,
  normalizeStudentInput,
  normalizeStudentImportInput,
  parseStudentCsv,
  normalizeAssessmentInput,
  normalizeAssessmentMarksInput,
  normalizeAssessmentReviewInput,
  normalizeAttendanceInput,
  isValidAttendanceDate,
  isValidAttendanceReportRange,
  calculatePointsPercentage,
  summarizePublishedResultRows,
  groupPublishedResultRowsByStudent,
  normalizeTeachingAssignmentInput,
  defaultGradingSettings,
  normalizeGradingSettingsInput,
  gradeForPercentage,
  applyGradingSettingsToRows,
} from "./school-data.js";

test("normalizes a valid class and rejects unsupported grade or academic year", () => {
  assert.deepEqual(normalizeClassInput({
    grade: "JSS 1",
    section: "Blue",
    academicYear: "2026/2027",
  }), {
    grade: "JSS 1",
    section: "BLUE",
    academicYear: "2026/2027",
  });
  assert.equal(normalizeClassInput({ grade: "Year 10", section: "A", academicYear: "2026/2027" }), null);
  assert.equal(normalizeClassInput({ grade: "__proto__", section: "A", academicYear: "2026/2027" }), null);
  assert.equal(normalizeClassInput({ grade: "JSS 1", section: "A", academicYear: "2026/2028" }), null);
  assert.equal(normalizeClassInput({ grade: "JSS 1", section: "A!", academicYear: "2026/2027" }), null);
  assert.equal(normalizeClassInput(null), null);
});

test("normalizes admission details and optional guardian contacts", () => {
  assert.deepEqual(normalizeStudentInput({
    firstName: "  Ada ",
    lastName: " Okafor ",
    admissionNumber: " ast/001 ",
    classId: "123e4567-e89b-42d3-a456-426614174000",
    guardianEmail: " PARENT@EXAMPLE.COM ",
    guardianPhone: "+234 800 000 0000",
  }), {
    firstName: "Ada",
    lastName: "Okafor",
    admissionNumber: "AST/001",
    classId: "123e4567-e89b-42d3-a456-426614174000",
    guardianEmail: "parent@example.com",
    guardianPhone: "+234 800 000 0000",
  });
  assert.equal(normalizeStudentInput({
    firstName: "Ada",
    lastName: "Okafor",
    admissionNumber: "AST/001",
    classId: "not-a-uuid",
  }), null);
  assert.equal(normalizeStudentInput({
    firstName: "Ada",
    lastName: "Okafor",
    admissionNumber: "AST/001",
    classId: "123e4567-e89b-42d3-a456-426614174000",
    guardianEmail: "not-an-email",
  }), null);
  assert.equal(normalizeStudentInput(null), null);
});

test("parses student CSV rows, quoted values, and optional guardian contacts", () => {
  const parsed = parseStudentCsv(
    "\uFEFFfirstName,lastName,admissionNumber,guardianEmail,guardianPhone\r\n"
    + '"Ada, Jr.","O""Neil",ast/001,parent@example.com,+234 800 000 0000\r\n',
  );
  assert.deepEqual(parsed, {
    students: [{
      firstName: "Ada, Jr.",
      lastName: "O\"Neil",
      admissionNumber: "AST/001",
      guardianEmail: "parent@example.com",
      guardianPhone: "+234 800 000 0000",
    }],
    errors: [],
  });
});

test("rejects malformed, duplicate, and oversized student CSV imports", () => {
  assert.match(parseStudentCsv('firstName,lastName,admissionNumber\n"Ada,Okafor,AST/001').errors[0].message, /quoted value/);
  assert.match(parseStudentCsv("firstName,lastName\nAda,Okafor").errors[0].message, /admissionNumber/);
  assert.match(
    parseStudentCsv("firstName,lastName,admissionNumber\nAda,One,AST/001\nBea,Two,ast/001").errors[0].message,
    /duplicated in this file/,
  );
  const oversized = parseStudentCsv(
    `firstName,lastName,admissionNumber\n${Array.from({ length: 201 }, (_, index) => `Student,Name,AST/${index + 1}`).join("\n")}`,
  );
  assert.equal(oversized.students.length, 200);
  assert.match(oversized.errors[0].message, /limited to 200/);
});

test("normalizes a whole student import and rejects invalid or duplicate admissions", () => {
  const classId = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(normalizeStudentImportInput({
    classId,
    students: [{
      firstName: "Ada",
      lastName: "Okafor",
      admissionNumber: "ast/001",
      guardianEmail: "",
      guardianPhone: "",
    }],
  }), {
    classId,
    students: [{
      firstName: "Ada",
      lastName: "Okafor",
      admissionNumber: "AST/001",
      classId,
      guardianEmail: null,
      guardianPhone: null,
    }],
  });
  assert.equal(normalizeStudentImportInput({
    classId,
    students: [
      { firstName: "Ada", lastName: "One", admissionNumber: "AST/001" },
      { firstName: "Bea", lastName: "Two", admissionNumber: "ast/001" },
    ],
  }), null);
});

test("validates the identifiers and subject for a teaching assignment", () => {
  assert.deepEqual(normalizeTeachingAssignmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    teacherUserId: "teacher-user-id",
    subject: "Mathematics",
  }), {
    classId: "123e4567-e89b-42d3-a456-426614174000",
    teacherUserId: "teacher-user-id",
    subject: "Mathematics",
  });
  assert.equal(normalizeTeachingAssignmentInput({
    classId: "not-a-uuid",
    teacherUserId: "teacher-user-id",
    subject: "Mathematics",
  }), null);
  assert.equal(normalizeTeachingAssignmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    teacherUserId: "",
    subject: "Mathematics",
  }), null);
});

test("validates complete daily attendance mark payloads", () => {
  const classId = "123e4567-e89b-42d3-a456-426614174000";
  const studentId = "123e4567-e89b-42d3-a456-426614174001";
  assert.deepEqual(normalizeAttendanceInput({
    classId,
    date: "2026-11-13",
    marks: [{ studentId, status: "present" }],
  }), {
    classId,
    date: "2026-11-13",
    marks: [{ studentId, status: "present" }],
  });
  assert.equal(normalizeAttendanceInput({
    classId,
    date: "2026-02-30",
    marks: [{ studentId, status: "present" }],
  }), null);
  assert.equal(normalizeAttendanceInput({
    classId,
    date: "2026-11-13",
    marks: [{ studentId, status: "unknown" }],
  }), null);
  assert.equal(normalizeAttendanceInput({
    classId,
    date: "2026-11-13",
    marks: [{ studentId, status: "present" }, { studentId, status: "absent" }],
  }), null);
  assert.equal(isValidAttendanceDate("2026-02-30"), false);
  assert.equal(isValidAttendanceDate("2026-11-13"), true);
  assert.equal(isValidAttendanceReportRange("2026-11-01", "2026-11-30"), true);
  assert.equal(isValidAttendanceReportRange("2026-11-30", "2026-11-01"), false);
  assert.equal(isValidAttendanceReportRange("2026-01-01", "2027-01-02"), false);
});

test("validates assessment details and score bounds", () => {
  assert.deepEqual(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: " Mid-term test ",
    term: "Term 2",
    maxScore: 60,
    dueDate: "2026-11-20",
  }), {
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Mid-term test",
    term: "Term 2",
    maxScore: 60,
    dueDate: "2026-11-20",
  });
  assert.equal(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Test",
    term: "Term 4",
    maxScore: 100,
  }), null);
  assert.equal(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Test",
    term: "Term 1",
    maxScore: 100.001,
    dueDate: "2026-02-31",
  }), null);
  assert.equal(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Test",
    term: "Term 1",
    maxScore: 100,
    dueDate: "2026-02-31",
  }), null);
  assert.equal(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Test",
    term: "Term 1",
    maxScore: true,
  }), null);
  assert.equal(normalizeAssessmentInput({
    classId: "123e4567-e89b-42d3-a456-426614174000",
    subject: "Mathematics",
    title: "Test",
    term: "Term 1",
    maxScore: 1.15,
  }).maxScore, 1.15);
});

test("validates complete mark payload shapes, duplicate students, and review outcomes", () => {
  assert.deepEqual(normalizeAssessmentMarksInput({ marks: [
    { studentId: "123e4567-e89b-42d3-a456-426614174000", score: 1.15 },
    { studentId: "123e4567-e89b-42d3-a456-426614174001", score: "" },
  ] }), [
    { studentId: "123e4567-e89b-42d3-a456-426614174000", score: 1.15 },
    { studentId: "123e4567-e89b-42d3-a456-426614174001", score: null },
  ]);
  assert.equal(normalizeAssessmentMarksInput({ marks: [] }), null);
  assert.equal(normalizeAssessmentMarksInput({ marks: [
    { studentId: "123e4567-e89b-42d3-a456-426614174000", score: 10 },
    { studentId: "123e4567-e89b-42d3-a456-426614174000", score: 9 },
  ] }), null);
  assert.equal(normalizeAssessmentMarksInput({ marks: [
    { studentId: "123e4567-e89b-42d3-a456-426614174000", score: true },
  ] }), null);
  assert.deepEqual(normalizeAssessmentReviewInput({ decision: "returned", note: "Please check this mark." }), {
    decision: "returned",
    note: "Please check this mark.",
  });
  assert.equal(normalizeAssessmentReviewInput({ decision: "returned", note: "" }), null);
  assert.deepEqual(normalizeAssessmentReviewInput({ decision: "approved" }), {
    decision: "approved",
    note: null,
  });
});

test("calculates a points-weighted percentage from approved marks", () => {
  assert.equal(calculatePointsPercentage(45, 50), 90);
  assert.equal(calculatePointsPercentage(75, 100), 75);
  assert.equal(calculatePointsPercentage(2, 3), 66.67);
  assert.equal(calculatePointsPercentage(0, 100), 0);
  assert.equal(calculatePointsPercentage(0, 0), null);
  assert.equal(calculatePointsPercentage(101, 100), null);
  assert.equal(calculatePointsPercentage("unknown", 100), null);
});

test("summarizes a published report using weighted approved points only", () => {
  assert.deepEqual(summarizePublishedResultRows([
    { earnedPoints: 45, possiblePoints: 50, assessmentCount: 2, percentage: 90 },
    { earnedPoints: 30, possiblePoints: 50, assessmentCount: 1, percentage: 60 },
    { earnedPoints: null, possiblePoints: null, assessmentCount: 0, percentage: null },
  ]), {
    subjectCount: 3,
    gradedSubjectCount: 2,
    assessmentCount: 3,
    earnedPoints: 75,
    possiblePoints: 100,
    averagePercentage: 75,
  });
  assert.deepEqual(summarizePublishedResultRows([]), {
    subjectCount: 0,
    gradedSubjectCount: 0,
    assessmentCount: 0,
    earnedPoints: 0,
    possiblePoints: 0,
    averagePercentage: null,
  });
  assert.equal(summarizePublishedResultRows(null).averagePercentage, null);
});

test("groups published rows into alphabetized student report cards", () => {
  const rows = [
    { studentId: "student-2", firstName: "Ada", lastName: "Zulu", admissionNumber: "AST-002", subject: "Mathematics" },
    { studentId: "student-1", firstName: "Bola", lastName: "Ade", admissionNumber: "AST-001", subject: "English" },
    { studentId: "student-1", firstName: "Bola", lastName: "Ade", admissionNumber: "AST-001", subject: "Mathematics" },
  ];

  assert.deepEqual(groupPublishedResultRowsByStudent(rows), [
    { studentId: "student-1", rows: [rows[1], rows[2]] },
    { studentId: "student-2", rows: [rows[0]] },
  ]);
  assert.deepEqual(groupPublishedResultRowsByStudent(null), []);
});

test("provides an editable A1-F9 default and normalizes custom grade bands", () => {
  assert.equal(defaultGradingSettings.bands.length, 9);
  assert.equal(gradeForPercentage(75, defaultGradingSettings.bands), "A1");
  assert.equal(gradeForPercentage(74.99, defaultGradingSettings.bands), "B2");
  assert.equal(gradeForPercentage(0, defaultGradingSettings.bands), "F9");

  assert.deepEqual(normalizeGradingSettingsInput({
    bands: [{ label: "Pass", minimum: "50" }, { label: "Fail", minimum: 0 }],
    tieMethod: "dense",
    incompletePolicy: "graded_only",
  }), {
    bands: [{ label: "PASS", minimum: 50 }, { label: "FAIL", minimum: 0 }],
    tieMethod: "dense",
    incompletePolicy: "graded_only",
  });
  assert.equal(normalizeGradingSettingsInput({
    bands: [{ label: "A", minimum: 90 }, { label: "B", minimum: 50 }],
    tieMethod: "competition",
    incompletePolicy: "require_all",
  }), null);
  assert.equal(normalizeGradingSettingsInput({
    bands: [{ label: "A", minimum: 100 }, { label: "A", minimum: 0 }],
    tieMethod: "competition",
    incompletePolicy: "require_all",
  }), null);
  assert.equal(normalizeGradingSettingsInput({
    bands: [{ label: "A", minimum: 100 }, { label: "B", minimum: 0 }],
    tieMethod: "invalid",
    incompletePolicy: "require_all",
  }), null);
});

test("assigns subject grades, weighted overall grades, and competition positions", () => {
  const rows = [
    { studentId: "a", subject: "English", earnedPoints: 90, possiblePoints: 100, percentage: 90 },
    { studentId: "a", subject: "Maths", earnedPoints: 80, possiblePoints: 100, percentage: 80 },
    { studentId: "b", subject: "English", earnedPoints: 90, possiblePoints: 100, percentage: 90 },
    { studentId: "b", subject: "Maths", earnedPoints: 80, possiblePoints: 100, percentage: 80 },
    { studentId: "c", subject: "English", earnedPoints: 80, possiblePoints: 100, percentage: 80 },
    { studentId: "c", subject: "Maths", earnedPoints: 70, possiblePoints: 100, percentage: 70 },
    { studentId: "d", subject: "English", earnedPoints: 100, possiblePoints: 100, percentage: 100 },
    { studentId: "d", subject: "Maths", earnedPoints: null, possiblePoints: null, percentage: null },
  ];

  const graded = applyGradingSettingsToRows(rows, defaultGradingSettings);
  assert.equal(graded[0].grade, "A1");
  assert.equal(graded[0].overallPercentage, 85);
  assert.equal(graded[0].overallGrade, "A1");
  assert.equal(graded[0].classPosition, 1);
  assert.equal(graded[2].classPosition, 1);
  assert.equal(graded[4].classPosition, 3);
  assert.equal(graded[6].overallPercentage, 100);
  assert.equal(graded[6].classPosition, null);

  const dense = applyGradingSettingsToRows(rows, {
    ...defaultGradingSettings,
    tieMethod: "dense",
  });
  assert.equal(dense[4].classPosition, 2);

  const gradedOnly = applyGradingSettingsToRows(rows, {
    ...defaultGradingSettings,
    incompletePolicy: "graded_only",
  });
  assert.equal(gradedOnly[6].classPosition, 1);
  assert.equal(gradedOnly[0].classPosition, 2);

  const unranked = applyGradingSettingsToRows(rows, {
    ...defaultGradingSettings,
    tieMethod: "none",
  });
  assert.ok(unranked.every((row) => row.classPosition === null));
  assert.throws(() => applyGradingSettingsToRows(rows, { ...defaultGradingSettings, tieMethod: "invalid" }));
});
