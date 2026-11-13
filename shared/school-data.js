import { curriculumByGrade } from "./curriculum.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const classSectionPattern = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u;
const admissionNumberPattern = /^[A-Z0-9][A-Z0-9/-]{1,31}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assessmentTerms = ["Term 1", "Term 2", "Term 3"];
const hasAtMostTwoDecimals = (value) => Math.round(value * 100) / 100 === value;

export function normalizeClassInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const grade = typeof body.grade === "string" ? body.grade.trim() : "";
  const section = typeof body.section === "string" ? body.section.trim().toUpperCase() : "";
  const academicYear = typeof body.academicYear === "string" ? body.academicYear.trim() : "";
  const yearMatch = /^(\d{4})\/(\d{4})$/.exec(academicYear);

  if (
    !Object.hasOwn(curriculumByGrade, grade)
    || !classSectionPattern.test(section)
    || !yearMatch
    || Number(yearMatch[2]) !== Number(yearMatch[1]) + 1
  ) {
    return null;
  }

  return { grade, section, academicYear };
}

export function normalizeStudentInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const admissionNumber = typeof body.admissionNumber === "string"
    ? body.admissionNumber.trim().toUpperCase()
    : "";
  const classId = typeof body.classId === "string" ? body.classId : "";
  const guardianEmail = typeof body.guardianEmail === "string"
    ? body.guardianEmail.trim().toLowerCase()
    : "";
  const guardianPhone = typeof body.guardianPhone === "string" ? body.guardianPhone.trim() : "";

  if (
    firstName.length < 1
    || firstName.length > 80
    || lastName.length < 1
    || lastName.length > 80
    || !admissionNumberPattern.test(admissionNumber)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)
    || (guardianEmail && (guardianEmail.length > 254 || !emailPattern.test(guardianEmail)))
    || guardianPhone.length > 24
  ) {
    return null;
  }

  return { firstName, lastName, admissionNumber, classId, guardianEmail: guardianEmail || null, guardianPhone: guardianPhone || null };
}

export function normalizeTeachingAssignmentInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const classId = typeof body.classId === "string" ? body.classId : "";
  const teacherUserId = typeof body.teacherUserId === "string" ? body.teacherUserId.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)
    || teacherUserId.length < 1
    || teacherUserId.length > 255
    || subject.length < 1
    || subject.length > 100
  ) {
    return null;
  }
  return { classId, teacherUserId, subject };
}

export function normalizeAssessmentInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const classId = typeof body.classId === "string" ? body.classId : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const term = typeof body.term === "string" ? body.term : "";
  const maxScore = typeof body.maxScore === "number" ? body.maxScore : Number(body.maxScore);
  const dueDate = body.dueDate === "" || body.dueDate == null ? null : body.dueDate;

  if (
    !uuidPattern.test(classId)
    || subject.length < 1
    || subject.length > 100
    || title.length < 1
    || title.length > 100
    || !assessmentTerms.includes(term)
    || (typeof body.maxScore !== "number" && (
      typeof body.maxScore !== "string" || !/^(?:\d+\.?\d*|\.\d+)$/.test(body.maxScore.trim())
    ))
    || !Number.isFinite(maxScore)
    || maxScore < 1
    || maxScore > 1000
    || !hasAtMostTwoDecimals(maxScore)
    || (dueDate !== null && (
      typeof dueDate !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))
      || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate
    ))
  ) {
    return null;
  }
  return { classId, subject, title, term, maxScore, dueDate };
}

export function normalizeAssessmentMarksInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.marks) || body.marks.length < 1 || body.marks.length > 500) {
    return null;
  }
  const marks = [];
  const seenStudents = new Set();
  for (const mark of body.marks) {
    if (!mark || typeof mark !== "object" || Array.isArray(mark)) return null;
    const studentId = typeof mark.studentId === "string" ? mark.studentId : "";
    const blankScore = mark.score == null || (typeof mark.score === "string" && mark.score.trim() === "");
    const score = blankScore ? null : Number(mark.score);
    if (
      !uuidPattern.test(studentId)
      || seenStudents.has(studentId)
      || (score !== null && (
        (typeof mark.score !== "number" && (typeof mark.score !== "string" || !/^(?:\d+\.?\d*|\.\d+)$/.test(mark.score.trim())))
        || !Number.isFinite(score)
        || score < 0
        || !hasAtMostTwoDecimals(score)
      ))
    ) {
      return null;
    }
    seenStudents.add(studentId);
    marks.push({ studentId, score });
  }
  return marks;
}

export function normalizeAssessmentReviewInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!["approved", "returned"].includes(decision) || note.length > 500 || (decision === "returned" && note.length === 0)) {
    return null;
  }
  return { decision, note: note || null };
}
