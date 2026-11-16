import assert from "node:assert/strict";
import { test } from "node:test";
import {
  curriculumByGrade,
  curriculumGrades,
  getNextGradeForSchool,
  normalizeEducationalLevelSelection,
  normalizeSubjectSelection,
} from "./curriculum.js";

test("accepts one or more supported educational levels", () => {
  assert.deepEqual(normalizeEducationalLevelSelection(["primary", "seniorSecondary"]), ["primary", "seniorSecondary"]);
  assert.deepEqual(normalizeEducationalLevelSelection(["juniorSecondary"]), ["juniorSecondary"]);
});

test("rejects empty, duplicate, or unsupported educational levels", () => {
  assert.equal(normalizeEducationalLevelSelection([]), null);
  assert.equal(normalizeEducationalLevelSelection(["primary", "primary"]), null);
  assert.equal(normalizeEducationalLevelSelection(["Year 10"]), null);
  assert.equal(normalizeEducationalLevelSelection("primary"), null);
});

test("provides subject options for every primary, junior, and senior grade", () => {
  const grades = [
    ...curriculumGrades.primary,
    ...curriculumGrades.juniorSecondary,
    ...curriculumGrades.seniorSecondary,
  ];

  assert.deepEqual(Object.keys(curriculumByGrade).sort(), grades.sort());
  for (const subjects of Object.values(curriculumByGrade)) {
    assert.ok(subjects.length > 0);
    assert.equal(new Set(subjects).size, subjects.length);
  }
});

test("advances students only into the next grade of an enabled school level", () => {
  assert.equal(getNextGradeForSchool("Primary 5", ["primary"]), "Primary 6");
  assert.equal(getNextGradeForSchool("Primary 6", ["primary", "juniorSecondary"]), "JSS 1");
  assert.equal(getNextGradeForSchool("Primary 6", ["primary", "seniorSecondary"]), null);
  assert.equal(getNextGradeForSchool("SSS 3", ["seniorSecondary"]), null);
  assert.equal(getNextGradeForSchool("Unknown", ["primary"]), null);
});

test("accepts a unique selection from the selected grade catalogue", () => {
  assert.deepEqual(
    normalizeSubjectSelection("Primary 1", ["English Studies", "Mathematics"]),
    ["English Studies", "Mathematics"],
  );
  assert.deepEqual(normalizeSubjectSelection("JSS 1", []), []);
});

test("rejects unknown grades, unknown subjects, and duplicate selections", () => {
  assert.equal(normalizeSubjectSelection("Year 10", ["Mathematics"]), null);
  assert.equal(normalizeSubjectSelection("__proto__", []), null);
  assert.equal(normalizeSubjectSelection("toString", []), null);
  assert.equal(normalizeSubjectSelection("Primary 1", ["Biology"]), null);
  assert.equal(normalizeSubjectSelection("Primary 1", ["Mathematics", "Mathematics"]), null);
  assert.equal(normalizeSubjectSelection("Primary 1", "Mathematics"), null);
});
