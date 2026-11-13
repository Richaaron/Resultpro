import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeClassInput,
  normalizeStudentInput,
  normalizeAssessmentInput,
  normalizeAssessmentMarksInput,
  normalizeAssessmentReviewInput,
  calculatePointsPercentage,
  summarizePublishedResultRows,
  groupPublishedResultRowsByStudent,
  normalizeTeachingAssignmentInput,
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
