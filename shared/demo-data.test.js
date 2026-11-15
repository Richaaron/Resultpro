import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoData } from "./demo-data.js";
import { defaultGradingSettings, gradeForPercentage } from "./school-data.js";

test("creates a complete fictional school preview with roles and report results", () => {
  const demo = createDemoData(() => 0.42);

  assert.equal(demo.school.name.endsWith(demo.school.location), true);
  assert.ok(demo.people.admin);
  assert.ok(demo.people.formTeacher);
  assert.ok(demo.people.subjectTeacher);
  assert.equal(demo.students.length, 10);
  assert.equal(demo.people.student, demo.reportStudent.name);
  assert.equal(new Set([
    demo.people.admin,
    demo.people.formTeacher,
    demo.people.subjectTeacher,
    ...demo.students.map((student) => student.name),
  ]).size, demo.students.length + 3);
  assert.equal(demo.reportStudent.scores.length, 5);
  assert.equal(demo.reportStudent.average, Math.round(
    demo.reportStudent.scores.reduce((total, score) => total + score.score, 0) / demo.reportStudent.scores.length,
  ));
});

test("keeps all generated report scores within the expected marks range", () => {
  const demo = createDemoData();
  for (const student of demo.students) {
    assert.ok(student.scores.every(({ score }) => score >= 45 && score <= 98));
    assert.equal(student.grade, gradeForPercentage(student.average, defaultGradingSettings.bands));
  }
});
