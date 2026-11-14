import express from "express";
import dotenv from "dotenv";
import {
  acceptInvitation,
  countSchoolStudents,
  createInvitation,
  createSchoolAssessment,
  createSchool,
  createSchoolClass,
  createSchoolStudent,
  deleteSchoolClass,
  getSchoolDashboard,
  getSchoolClassAttendance,
  getSchoolClassAttendanceReport,
  getSchoolRole,
  listSchoolInvitations,
  getSchoolPublishedResultSheet,
  listSchoolTeachers,
  listSchoolClasses,
  listSchools,
  listSchoolStudents,
  listSchoolSubjects,
  listSchoolAssessments,
  listSchoolResultSheet,
  listStudentPublishedResultSheets,
  listTeachingAssignments,
  getSchoolAssessment,
  removeTeachingAssignment,
  publishSchoolResultSheet,
  renewSchoolInvitation,
  revokeSchoolInvitation,
  replaceSchoolSubjects,
  reviewSchoolAssessment,
  saveSchoolAssessmentMarks,
  saveSchoolClassAttendance,
  saveTeachingAssignment,
  setSchoolStudentActive,
  submitSchoolAssessment,
  updateSchoolStudent,
} from "./school-repository.js";
import { normalizeSchoolInput, normalizeTeacherRegistrationInput } from "./school-input.js";
import { normalizeSubjectSelection } from "../shared/curriculum.js";
import {
  normalizeClassInput,
  normalizeAssessmentInput,
  normalizeAssessmentMarksInput,
  normalizeAssessmentReviewInput,
  normalizeAttendanceInput,
  isValidAttendanceDate,
  isValidAttendanceReportRange,
  normalizeStudentInput,
  normalizeTeachingAssignmentInput,
} from "../shared/school-data.js";
import { createCorsMiddleware } from "./cors.js";
import { requireAuth } from "./auth.js";
import { sendInvitationEmail } from "./invitation-email.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(filename), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const app = express();
const port = Number(process.env.PORT) || 4000;

app.disable("x-powered-by");
app.use(createCorsMiddleware({
  production: process.env.NODE_ENV === "production",
  configuredOrigins: process.env.FRONTEND_ORIGINS,
}));
app.use(express.json({ limit: "128kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/schools", requireAuth, async (request, response) => {
  try {
    const schools = await listSchools(request.auth.userId);
    return response.json({ schools });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools", requireAuth, async (request, response) => {
  const normalized = normalizeSchoolInput(request.body);
  if (!normalized) {
    return response.status(400).json({ error: "Enter a valid school name, type, country, email, and access option." });
  }

  try {
    const school = await createSchool(normalized, request.auth.userId);
    return response.status(201).json({ school });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/dashboard", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    const dashboard = await getSchoolDashboard(schoolId, request.auth.userId, membershipRole);
    return response.json({ dashboard });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/subjects", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    const subjects = await listSchoolSubjects(schoolId);
    return response.json({ subjects });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.put("/api/schools/:schoolId/subjects", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });
  const { grade, subjects } = request.body ?? {};
  const normalizedSubjects = normalizeSubjectSelection(grade, subjects);
  if (!normalizedSubjects) {
    return response.status(400).json({ error: "Choose a valid grade and subjects from the curriculum catalogue." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can update subjects." });
    }
    await replaceSchoolSubjects(schoolId, grade, normalizedSubjects);
    return response.json({ grade, subjects: normalizedSubjects });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/classes", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const academicYear = typeof request.query.academicYear === "string" ? request.query.academicYear : null;
  if (!isUuid(schoolId) || (academicYear && !/^\d{4}\/\d{4}$/.test(academicYear))) {
    return response.status(400).json({ error: "Enter a valid school and academic year." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole === "student") {
      return response.status(403).json({ error: "Student class access is not available yet." });
    }
    const classes = await listSchoolClasses(
      schoolId,
      academicYear,
      membershipRole === "teacher" ? request.auth.userId : null,
    );
    return response.json({ classes });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/teaching-assignments", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole === "student") {
      return response.status(403).json({ error: "Teacher assignments are not available to student accounts." });
    }

    const isAdmin = membershipRole === "admin";
    const [assignments, teachers] = await Promise.all([
      listTeachingAssignments(schoolId, isAdmin ? null : request.auth.userId),
      isAdmin ? listSchoolTeachers(schoolId) : [],
    ]);
    return response.json({ assignments, teachers });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/attendance", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const classId = typeof request.query.classId === "string" ? request.query.classId : "";
  const date = typeof request.query.date === "string" ? request.query.date : "";
  if (!isUuid(schoolId) || !isUuid(classId) || !isValidAttendanceDate(date)) {
    return response.status(400).json({ error: "Select a valid class and attendance date." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (!["admin", "teacher"].includes(membershipRole)) {
      return response.status(403).json({ error: "Attendance is available to school administrators and teachers." });
    }
    const teacherUserId = membershipRole === "teacher" ? request.auth.userId : null;
    const attendance = await getSchoolClassAttendance(schoolId, classId, date, teacherUserId);
    if (!attendance) return response.status(404).json({ error: "Class not found or not assigned to this teacher." });
    return response.json({ attendance });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/attendance/report", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const classId = typeof request.query.classId === "string" ? request.query.classId : "";
  const from = typeof request.query.from === "string" ? request.query.from : "";
  const to = typeof request.query.to === "string" ? request.query.to : "";
  if (!isUuid(schoolId) || !isUuid(classId) || !isValidAttendanceReportRange(from, to)) {
    return response.status(400).json({ error: "Select a valid class and a date range of up to 366 days." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (!["admin", "teacher"].includes(membershipRole)) {
      return response.status(403).json({ error: "Attendance reports are available to school administrators and teachers." });
    }
    const teacherUserId = membershipRole === "teacher" ? request.auth.userId : null;
    const report = await getSchoolClassAttendanceReport(schoolId, classId, from, to, teacherUserId);
    if (!report) return response.status(404).json({ error: "Class not found or not assigned to this teacher." });
    return response.json({ report });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.put("/api/schools/:schoolId/attendance", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const attendance = normalizeAttendanceInput(request.body);
  if (!isUuid(schoolId) || !attendance) {
    return response.status(400).json({ error: "Enter a valid class, date, and attendance status for every active student." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (!["admin", "teacher"].includes(membershipRole)) {
      return response.status(403).json({ error: "Only school administrators and teachers can record attendance." });
    }
    const teacherUserId = membershipRole === "teacher" ? request.auth.userId : null;
    const result = await saveSchoolClassAttendance(
      schoolId,
      attendance.classId,
      attendance.date,
      request.auth.userId,
      attendance.marks,
      teacherUserId,
    );
    if (result.error === "class") {
      return response.status(404).json({ error: "Class not found or not assigned to this teacher." });
    }
    if (result.error === "roster") {
      return response.status(409).json({ error: "The active class roster changed. Reload attendance and try again." });
    }
    return response.json({ savedCount: result.savedCount });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.put("/api/schools/:schoolId/classes/:classId/teaching-assignments", requireAuth, async (request, response) => {
  const { schoolId, classId } = request.params;
  const assignment = normalizeTeachingAssignmentInput({ ...request.body, classId });
  if (!isUuid(schoolId) || !assignment) {
    return response.status(400).json({ error: "Choose a valid teacher and subject for this class." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can assign teachers." });
    }
    const saved = await saveTeachingAssignment(schoolId, assignment);
    if (!saved) {
      return response.status(400).json({
        error: "The class, subject, or invited teacher could not be found in this school.",
      });
    }
    return response.json({ assignment: saved });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.delete("/api/schools/:schoolId/teaching-assignments/:assignmentId", requireAuth, async (request, response) => {
  const { schoolId, assignmentId } = request.params;
  if (!isUuid(schoolId) || !isUuid(assignmentId)) {
    return response.status(400).json({ error: "Enter a valid school and assignment." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can remove teacher assignments." });
    }
    const removed = await removeTeachingAssignment(schoolId, assignmentId);
    if (!removed) return response.status(404).json({ error: "Teacher assignment not found." });
    return response.status(204).end();
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/result-sheet", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const classId = typeof request.query.classId === "string" ? request.query.classId : "";
  const term = typeof request.query.term === "string" ? request.query.term : "";
  if (!isUuid(schoolId) || !isUuid(classId) || !["Term 1", "Term 2", "Term 3"].includes(term)) {
    return response.status(400).json({ error: "Select a valid class and school term." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole === "student") {
      return response.status(403).json({ error: "Student accounts can only view their own published result sheets." });
    }

    const teacherUserId = membershipRole === "teacher" ? request.auth.userId : null;
    const classes = await listSchoolClasses(schoolId, null, teacherUserId);
    const schoolClass = classes.find((item) => item.id === classId);
    if (!schoolClass) return response.status(404).json({ error: "Class not found or not assigned to this teacher." });

    const published = await getSchoolPublishedResultSheet(schoolId, classId, term, teacherUserId);
    if (published) {
      return response.json({
        schoolClass,
        term,
        rows: published.rows,
        published: published.publication,
      });
    }

    const rows = await listSchoolResultSheet(schoolId, classId, term, teacherUserId);
    return response.json({ schoolClass, term, rows, published: null });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/result-sheet/publish", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const { classId, term } = request.body ?? {};
  if (!isUuid(schoolId) || !isUuid(classId) || !["Term 1", "Term 2", "Term 3"].includes(term)) {
    return response.status(400).json({ error: "Select a valid class and school term." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can publish results." });
    }
    const result = await publishSchoolResultSheet(schoolId, classId, term, request.auth.userId);
    if (result.error === "published") {
      return response.status(409).json({ error: "This class and term already have a published result sheet." });
    }
    if (result.error === "students") {
      return response.status(400).json({ error: "Enrol at least one active student before publishing." });
    }
    if (result.error === "no_assessments") {
      return response.status(400).json({ error: "Create and approve at least one assessment for this term before publishing." });
    }
    if (result.error === "unapproved") {
      return response.status(409).json({ error: "Resolve every draft, submitted, or returned assessment before publishing results." });
    }
    if (result.error === "class") {
      return response.status(404).json({ error: "Class not found." });
    }
    return response.status(201).json({ published: true });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/my-results", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "student") {
      return response.status(403).json({ error: "Only student accounts can view student results." });
    }
    const results = await listStudentPublishedResultSheets(schoolId, request.auth.userId);
    return response.json(results);
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/assessments", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole === "student") {
      return response.status(403).json({ error: "Assessment access is not available to student accounts yet." });
    }
    const assessments = await listSchoolAssessments(
      schoolId,
      membershipRole === "teacher" ? request.auth.userId : null,
    );
    return response.json({ assessments });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/assessments", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const assessment = normalizeAssessmentInput(request.body);
  if (!isUuid(schoolId) || !assessment) {
    return response.status(400).json({ error: "Enter a valid class, subject, title, term, maximum mark, and due date." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can create assessments." });
    }
    const result = await createSchoolAssessment(schoolId, request.auth.userId, assessment);
    if (result.error === "assignment") {
      return response.status(400).json({ error: "Assign a teacher to this class and subject before creating an assessment." });
    }
    if (result.error === "students") {
      return response.status(400).json({ error: "Enrol at least one active student in this class before creating an assessment." });
    }
    if (result.error === "published") {
      return response.status(409).json({ error: "This class and term are published. Create no further assessments for a published term." });
    }
    if (result.error === "duplicate") {
      return response.status(409).json({ error: "An assessment with this title already exists for that class, subject, and term." });
    }
    return response.status(201).json({ assessment: result.assessment });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/assessments/:assessmentId/marks", requireAuth, async (request, response) => {
  const { schoolId, assessmentId } = request.params;
  if (!isUuid(schoolId) || !isUuid(assessmentId)) {
    return response.status(400).json({ error: "Enter a valid school and assessment." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole === "student") {
      return response.status(403).json({ error: "Assessment marks are not available to student accounts yet." });
    }
    const result = await getSchoolAssessment(
      schoolId,
      assessmentId,
      membershipRole === "teacher" ? request.auth.userId : null,
    );
    if (!result) return response.status(404).json({ error: "Assessment not found." });
    return response.json(result);
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.put("/api/schools/:schoolId/assessments/:assessmentId/marks", requireAuth, async (request, response) => {
  const { schoolId, assessmentId } = request.params;
  const marks = normalizeAssessmentMarksInput(request.body);
  if (!isUuid(schoolId) || !isUuid(assessmentId) || !marks) {
    return response.status(400).json({ error: "Enter valid marks for the students on this assessment roster." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "teacher") {
      return response.status(403).json({ error: "Only the assigned teacher can enter assessment marks." });
    }
    const result = await getSchoolAssessment(schoolId, assessmentId, request.auth.userId);
    if (!result) return response.status(404).json({ error: "Assessment not found." });
    if (!["draft", "returned"].includes(result.assessment.status)) {
      return response.status(409).json({ error: "This assessment is not accepting mark changes." });
    }
    if (marks.some(({ score }) => score !== null && score > result.assessment.maxScore)) {
      return response.status(400).json({ error: `Marks must be between 0 and ${result.assessment.maxScore}.` });
    }
    const saved = await saveSchoolAssessmentMarks(schoolId, assessmentId, request.auth.userId, marks);
    if (!saved) {
      return response.status(409).json({ error: "Marks were not saved. Refresh the roster and try again." });
    }
    return response.json({ saved: marks.length });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/assessments/:assessmentId/submit", requireAuth, async (request, response) => {
  const { schoolId, assessmentId } = request.params;
  if (!isUuid(schoolId) || !isUuid(assessmentId)) {
    return response.status(400).json({ error: "Enter a valid school and assessment." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "teacher") {
      return response.status(403).json({ error: "Only the assigned teacher can submit assessment marks." });
    }
    const submitted = await submitSchoolAssessment(schoolId, assessmentId, request.auth.userId);
    if (!submitted) {
      return response.status(409).json({ error: "Enter a mark for every student on this assessment roster before submitting." });
    }
    return response.json({ assessment: submitted });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.patch("/api/schools/:schoolId/assessments/:assessmentId/review", requireAuth, async (request, response) => {
  const { schoolId, assessmentId } = request.params;
  const review = normalizeAssessmentReviewInput(request.body);
  if (!isUuid(schoolId) || !isUuid(assessmentId) || !review) {
    return response.status(400).json({ error: "Choose approve or return; add a note when returning marks." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can review submitted marks." });
    }
    const assessment = await getSchoolAssessment(schoolId, assessmentId);
    if (!assessment) return response.status(404).json({ error: "Assessment not found." });
    const updated = await reviewSchoolAssessment(schoolId, assessmentId, request.auth.userId, review);
    if (!updated) return response.status(409).json({ error: "Only submitted assessments can be reviewed." });
    return response.json({ assessment: updated });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/classes", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const classDetails = normalizeClassInput(request.body);
  if (!isUuid(schoolId) || !classDetails) {
    return response.status(400).json({ error: "Enter a valid grade, class section, and academic year." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can create classes." });
    }
    const schoolClass = await createSchoolClass(schoolId, classDetails);
    return response.status(201).json({ schoolClass });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.delete("/api/schools/:schoolId/classes/:classId", requireAuth, async (request, response) => {
  const { schoolId, classId } = request.params;
  if (!isUuid(schoolId) || !isUuid(classId)) {
    return response.status(400).json({ error: "Enter a valid school and class." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can delete classes." });
    }
    const deleted = await deleteSchoolClass(schoolId, classId);
    if (!deleted) return response.status(404).json({ error: "Class not found." });
    return response.status(204).end();
  } catch (error) {
    if (error.code === "CLASS_HAS_RESULTS") {
      return response.status(409).json({ error: error.message });
    }
    if (error.code === "CLASS_HAS_STUDENTS") {
      return response.status(409).json({ error: error.message });
    }
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/students", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const classId = typeof request.query.classId === "string" ? request.query.classId : null;
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const page = request.query.page === undefined ? 1 : Number(request.query.page);
  if (!isUuid(schoolId) || (classId && !isUuid(classId)) || search.length > 100
    || !Number.isInteger(page) || page < 1 || page > 10000) {
    return response.status(400).json({ error: "Enter a valid school, class, and search term." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can view the student register." });
    }
    const filters = { classId, search: search ? `%${search}%` : null };
    const [students, total] = await Promise.all([
      listSchoolStudents(schoolId, { ...filters, limit: 100, offset: (page - 1) * 100 }),
      countSchoolStudents(schoolId, filters),
    ]);
    return response.json({ students, total, page, pageSize: 100 });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/students", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const student = normalizeStudentInput(request.body);
  if (!isUuid(schoolId) || !student) {
    return response.status(400).json({ error: "Enter the student's name, admission number, and a valid class." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can enrol students." });
    }
    const created = await createSchoolStudent(schoolId, student);
    if (!created) return response.status(400).json({ error: "Choose a class in this school." });
    return response.status(201).json({ student: created });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.put("/api/schools/:schoolId/students/:studentId", requireAuth, async (request, response) => {
  const { schoolId, studentId } = request.params;
  const student = normalizeStudentInput(request.body);
  if (!isUuid(schoolId) || !isUuid(studentId) || !student) {
    return response.status(400).json({ error: "Enter the student's name, admission number, and a valid class." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can update student records." });
    }
    const updated = await updateSchoolStudent(schoolId, studentId, student);
    if (!updated) return response.status(404).json({ error: "Student or class not found in this school." });
    return response.json({ student: updated });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.patch("/api/schools/:schoolId/students/:studentId/status", requireAuth, async (request, response) => {
  const { schoolId, studentId } = request.params;
  const { isActive } = request.body ?? {};
  if (!isUuid(schoolId) || !isUuid(studentId) || typeof isActive !== "boolean") {
    return response.status(400).json({ error: "Choose whether this student record should be active." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can update student status." });
    }
    const updated = await setSchoolStudentActive(schoolId, studentId, isActive);
    if (!updated) return response.status(404).json({ error: "Student not found." });
    return response.json({ student: updated });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/invitations", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const role = request.body?.role;
  const studentId = request.body?.studentId;
  const teacher = role === "teacher" ? normalizeTeacherRegistrationInput(request.body) : null;
  const email = role === "teacher"
    ? teacher?.email
    : typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  if (!isUuid(schoolId) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || !["teacher", "student"].includes(role)
    || (role === "teacher" && !teacher)
    || (studentId !== undefined && (!isUuid(studentId) || role !== "student"))
    || (role === "student" && !studentId)) {
    return response.status(400).json({
      error: role === "teacher"
        ? "Enter the teacher’s full name and a valid email address."
        : "Enter a valid email address; student invitations must target a student record.",
    });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") return response.status(403).json({ error: "Only a school administrator can invite members." });

    const invitation = await createInvitation({
      schoolId,
      email,
      role,
      userId: request.auth.userId,
      studentId,
      teacherName: teacher?.teacherName,
    });
    if (!invitation) {
      return response.status(409).json({
        error: role === "teacher"
          ? "This email already belongs to a teacher or has a pending invitation in this school."
          : "That student record is unavailable or already linked to a portal account.",
      });
    }
    const emailDelivery = await sendInvitationEmail(invitation);
    return response.status(201).json({ invitation, emailDelivery });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.get("/api/schools/:schoolId/invitations", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  if (!isUuid(schoolId)) return response.status(400).json({ error: "Enter a valid school." });

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can manage invitations." });
    }
    const invitations = await listSchoolInvitations(schoolId);
    return response.json({ invitations });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/invitations/:invitationId/resend", requireAuth, async (request, response) => {
  const { schoolId, invitationId } = request.params;
  if (!isUuid(schoolId) || !isUuid(invitationId)) {
    return response.status(400).json({ error: "Enter a valid invitation." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can manage invitations." });
    }
    const invitation = await renewSchoolInvitation(schoolId, invitationId);
    if (!invitation) {
      return response.status(404).json({ error: "This invitation is no longer available to renew." });
    }
    const emailDelivery = await sendInvitationEmail(invitation);
    return response.json({ invitation, emailDelivery });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.delete("/api/schools/:schoolId/invitations/:invitationId", requireAuth, async (request, response) => {
  const { schoolId, invitationId } = request.params;
  if (!isUuid(schoolId) || !isUuid(invitationId)) {
    return response.status(400).json({ error: "Enter a valid invitation." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") {
      return response.status(403).json({ error: "Only a school administrator can manage invitations." });
    }
    const revoked = await revokeSchoolInvitation(schoolId, invitationId);
    if (!revoked) return response.status(404).json({ error: "This invitation is no longer available to revoke." });
    return response.status(204).end();
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/invitations/accept", requireAuth, async (request, response) => {
  const token = request.body?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return response.status(400).json({ error: "This invitation link is invalid." });
  }

  try {
    const membership = await acceptInvitation({
      token,
      email: request.auth.email,
      userId: request.auth.userId,
    });
    if (!membership) {
      return response.status(404).json({
        error: "This invitation is invalid, expired, already used, or belongs to a different email address.",
      });
    }
    return response.json({ membership });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

function handleDatabaseError(error, response) {
  if (error.code === "23505") {
    return response.status(409).json({
      error: error.constraint === "schools_email_key"
        ? "A school profile already exists for that email address."
        : "A record with the same details already exists. Check the admission number or class section.",
    });
  }
  if (error.code === "CLASS_SUBJECTS_REQUIRED") {
    return response.status(409).json({ error: error.message });
  }
  if (error.code === "CLASS_HAS_STUDENTS") {
    return response.status(409).json({ error: error.message });
  }
  if (error.code === "DATABASE_URL_MISSING") {
    return response.status(503).json({
      error: "Database not configured. Set DATABASE_URL to your Neon connection string.",
    });
  }
  console.error("School API request failed:", error);
  return response.status(500).json({
    error: "We couldn’t complete the school request. Please try again.",
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API endpoint not found." });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(projectRoot, "dist", "index.html")));
}

app.listen(port, () => {
  console.log(`Aster API listening on http://localhost:${port}`);
});
