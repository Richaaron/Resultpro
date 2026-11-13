import assert from "node:assert/strict";
import { test } from "node:test";
import { curriculumByGrade, curriculumGrades, normalizeSubjectSelection } from "./curriculum.js";

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
