import React, { useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import { authClient } from "./auth.js";
import { curriculumByGrade, curriculumGrades } from "../shared/curriculum.js";

const navigation = [
  ["overview", "Overview", "▦"],
  ["results", "Results", "▤"],
  ["students", "Students", "♧"],
  ["teachers", "Teachers", "♙"],
  ["classes", "Classes & subjects", "▦"],
  ["profile", "School profile", "⌂"],
  ["access", "Portal access", "◈"],
];

const portalData = {
  admin: {
    label: "Admin",
    title: "Good morning, Olumide",
    subtitle: "Here’s what’s happening across your school today.",
    stats: [["Total students", "1,248", "↗ 8.2%"], ["Teaching staff", "64", "↗ 3 new"], ["School average", "72.4%", "↗ 4.6%"], ["Results to review", "12", "Needs your eye"]],
    average: "72.4%",
    attention: [["12 results need reviewing", "4 classes · submitted by 3 teachers"], ["8 teachers haven’t started", "Mark submissions are due Friday"], ["6 student profiles incomplete", "Missing a parent or guardian contact"]],
    results: [
      ["Amara Okafor", "AST-2024-018", "Year 10A", "Mathematics", "Mrs. F. Adebayo", "92", "Approved"],
      ["Tunde Bakare", "AST-2024-023", "Year 10A", "English Language", "Mr. E. Okwueze", "84", "Needs review"],
      ["Zara Adeyemi", "AST-2023-041", "Year 11B", "Biology", "Dr. C. Okoro", "76", "Approved"],
      ["Chidi Eme", "AST-2025-009", "Year 9C", "Physics", "Mr. O. Balogun", "—", "Not submitted"],
    ],
  },
  teacher: {
    label: "Teacher",
    title: "Good morning, Folake",
    subtitle: "Your classes are looking good. Here’s where to start today.",
    stats: [["My students", "126", "Across 4 classes"], ["My classes", "4", "This term"], ["Marks entered", "82%", "↗ 12 marks"], ["To submit", "3", "Due Friday"]],
    average: "82%",
    attention: [["Year 10A marks are due", "Mathematics · 28 of 32 entered"], ["3 assessments coming up", "Year 10A and Year 11B this week"], ["2 marks returned for review", "Add a note and resubmit when ready"]],
    results: [
      ["Amara Okafor", "AST-2024-018", "Year 10A", "Mathematics · Quiz 3", "My marks", "92", "Submitted"],
      ["Tunde Bakare", "AST-2024-023", "Year 10A", "Mathematics · Quiz 3", "My marks", "84", "Needs review"],
      ["Zara Adeyemi", "AST-2023-041", "Year 11B", "Biology · Lab 2", "My marks", "76", "Submitted"],
      ["Chidi Eme", "AST-2025-009", "Year 9C", "Physics · Quiz 1", "My marks", "—", "Not submitted"],
    ],
  },
  student: {
    label: "Student",
    title: "Your learning, in focus.",
    subtitle: "A little progress adds up. Here’s your school snapshot.",
    stats: [["My average", "78.6%", "↗ 3.2%"], ["My subjects", "8", "This term"], ["Class position", "6th", "Out of 32"], ["Next assessment", "Maths", "In 2 days"]],
    average: "78.6%",
    attention: [["Algebra assessment on Thursday", "Year 10 Mathematics · Room 204"], ["Your Biology result is in", "You scored 76% on Cell biology"], ["Science club meets this week", "Wednesday after school · Lab 2"]],
    results: [
      ["Mathematics", "Quiz 3 · Algebra", "Term 2", "Mathematics", "Mrs. F. Adebayo", "92", "Graded"],
      ["English Language", "Essay 2 · Reading", "Term 2", "English", "Mr. E. Okwueze", "84", "Graded"],
      ["Biology", "Lab 2 · Cell biology", "Term 2", "Biology", "Dr. C. Okoro", "76", "Graded"],
      ["Physics", "Quiz 1 · Forces", "Term 2", "Physics", "Mr. O. Balogun", "—", "Coming soon"],
    ],
  },
};

const schoolTypes = ["Primary school", "Secondary school", "All-through school", "College / sixth form"];
const currentAcademicYear = (() => {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
})();
const currentDateLabel = new Intl.DateTimeFormat("en-NG", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date()).toUpperCase();
const accessOptions = [
  ["invite", "Invite-only portals", "Only verified people invited by a school administrator can join."],
];

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;

async function apiRequest(path, options = {}) {
  if (!authClient) throw new Error("Authentication is not configured.");
  const tokenResult = await authClient.token();
  if (tokenResult.error || !tokenResult.data?.token) {
    throw new Error(tokenResult.error?.message || "Your session expired. Please sign in again.");
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${tokenResult.data.token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(apiUrl(path), { ...options, headers });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function App() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState("");
  const [page, setPage] = useState("overview");
  const [school, setSchool] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("teacher");
  const [inviting, setInviting] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [selectedGrade, setSelectedGrade] = useState(curriculumGrades.primary[0]);
  const [savedSubjects, setSavedSubjects] = useState({});
  const [draftSubjects, setDraftSubjects] = useState({});
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [schoolClasses, setSchoolClasses] = useState([]);
  const [classRefresh, setClassRefresh] = useState(0);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classError, setClassError] = useState("");
  const [classForm, setClassForm] = useState({
    grade: curriculumGrades.primary[0],
    section: "",
    academicYear: currentAcademicYear,
  });
  const [creatingClass, setCreatingClass] = useState(false);
  const [studentRows, setStudentRows] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentRefresh, setStudentRefresh] = useState(0);
  const [studentForm, setStudentForm] = useState({
    firstName: "",
    lastName: "",
    admissionNumber: "",
    classId: "",
    guardianEmail: "",
    guardianPhone: "",
  });
  const [editingStudentId, setEditingStudentId] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [teacherRoster, setTeacherRoster] = useState([]);
  const [teachingAssignments, setTeachingAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentClassId, setAssignmentClassId] = useState("");
  const [assignmentSubject, setAssignmentSubject] = useState("");
  const [assignmentTeacherId, setAssignmentTeacherId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentRefresh, setAssignmentRefresh] = useState(0);
  const [assessments, setAssessments] = useState([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [assessmentError, setAssessmentError] = useState("");
  const [assessmentRefresh, setAssessmentRefresh] = useState(0);
  const [assessmentDetailLoading, setAssessmentDetailLoading] = useState(false);
  const [assessmentDetail, setAssessmentDetail] = useState(null);
  const [assessmentMarks, setAssessmentMarks] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [assessmentForm, setAssessmentForm] = useState({
    classId: "",
    subject: "",
    title: "",
    term: "Term 1",
    maxScore: "100",
    dueDate: "",
  });
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [form, setForm] = useState({ name: "", schoolType: "", country: "", email: "", accessMode: "invite" });
  const role = school?.role || "admin";
  const current = portalData[role];
  const visibleNavigation = navigation.filter(([id]) => role === "admin" || (role === "teacher" && ["overview", "results", "classes"].includes(id)) || (role === "student" && ["overview", "results"].includes(id)));
  const filteredResults = useMemo(() => current.results.filter((row) => row.join(" ").toLowerCase().includes(search.toLowerCase())), [current, search]);
  const gradeSavedSubjects = savedSubjects[selectedGrade] || [];
  const gradeDraftSubjects = draftSubjects[selectedGrade] || [];
  const selectedAssignmentClass = schoolClasses.find((item) => item.id === assignmentClassId);
  const assessmentAssignableClasses = useMemo(
    () => schoolClasses.filter((item) => teachingAssignments.some((assignment) => assignment.classId === item.id)),
    [schoolClasses, teachingAssignments],
  );
  const assessmentSubjects = useMemo(
    () => teachingAssignments.filter((assignment) => assignment.classId === assessmentForm.classId).map((assignment) => assignment.subject),
    [assessmentForm.classId, teachingAssignments],
  );
  const allAssessmentMarksEntered = Boolean(
    assessmentDetail?.students.length
    && assessmentMarks.length === assessmentDetail.students.length
    && assessmentMarks.every((mark) => mark.score !== "" && Number.isFinite(Number(mark.score))
      && Number(mark.score) >= 0 && Number(mark.score) <= assessmentDetail.assessment.maxScore),
  );
  const subjectChangesPending = gradeSavedSubjects.length !== gradeDraftSubjects.length
    || gradeSavedSubjects.some((subject) => !gradeDraftSubjects.includes(subject));

  useEffect(() => {
    let active = true;
    if (!authClient) {
      setSessionLoading(false);
      setAuthNotice("Neon Auth is not configured. Set VITE_NEON_AUTH_URL to your Auth Base URL.");
      return () => { active = false; };
    }
    authClient.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw new Error(sessionError.message || "Could not restore your session.");
        if (active) setSession(data?.session || null);
      })
      .catch((sessionError) => {
        if (active) setAuthNotice(sessionError.message || "Could not restore your session.");
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session?.user?.emailVerified) {
      setSchools([]);
      setSchool(null);
      setLoadingSchools(false);
      return () => { active = false; };
    }
    setLoadingSchools(true);
    async function loadWorkspace() {
      const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get("invite");
      if (inviteToken) {
        try {
          await apiRequest("/api/invitations/accept", {
            method: "POST",
            body: JSON.stringify({ token: inviteToken }),
          });
          setToast("Invitation accepted. Your school access is ready.");
        } catch (requestError) {
          setToast(requestError.message);
        } finally {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
      }
      const payload = await apiRequest("/api/schools");
      if (!active) return;
      setSchools(payload.schools);
      setSchool((previous) => payload.schools.find((item) => item.id === previous?.id) || payload.schools[0] || null);
    }
    loadWorkspace()
      .catch((requestError) => {
        if (active) setToast(requestError.message || "Could not load your school profiles.");
      })
      .finally(() => {
        if (active) setLoadingSchools(false);
      });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    let active = true;
    if (!school?.id) {
      setSavedSubjects({});
      setDraftSubjects({});
      return () => { active = false; };
    }

    setLoadingSubjects(true);
    setSubjectError("");
    apiRequest(`/api/schools/${school.id}/subjects`)
      .then(({ subjects }) => {
        if (!active) return;
        const byGrade = Object.fromEntries(
          Object.keys(curriculumByGrade).map((grade) => [
            grade,
            subjects.filter((item) => item.grade === grade).map((item) => item.subject),
          ]),
        );
        setSavedSubjects(byGrade);
        setDraftSubjects(byGrade);
      })
      .catch((requestError) => {
        if (active) setSubjectError(requestError.message || "Could not load the school subjects.");
      })
      .finally(() => {
        if (active) setLoadingSubjects(false);
      });
    return () => { active = false; };
  }, [school?.id]);

  useEffect(() => {
    let active = true;
    if (!school?.id) {
      setSchoolClasses([]);
      return () => { active = false; };
    }

    setLoadingClasses(true);
    setClassError("");
    apiRequest(`/api/schools/${school.id}/classes`)
      .then(({ classes }) => {
        if (active) setSchoolClasses(classes);
      })
      .catch((requestError) => {
        if (active) setClassError(requestError.message || "Could not load classes.");
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });
    return () => { active = false; };
  }, [school?.id, classRefresh]);

  useEffect(() => {
    if (!assignmentClassId || schoolClasses.some((item) => item.id === assignmentClassId)) return;
    setAssignmentClassId("");
    setAssignmentSubject("");
  }, [schoolClasses, assignmentClassId]);

  useEffect(() => {
    let active = true;
    const shouldLoadAssignments = (page === "teachers" && role === "admin")
      || (page === "classes" && role === "teacher")
      || (page === "results" && role !== "student");
    if (!school?.id || !shouldLoadAssignments) {
      setTeacherRoster([]);
      setTeachingAssignments([]);
      setLoadingAssignments(false);
      return () => { active = false; };
    }

    setLoadingAssignments(true);
    setAssignmentError("");
    apiRequest(`/api/schools/${school.id}/teaching-assignments`)
      .then(({ teachers, assignments }) => {
        if (!active) return;
        setTeacherRoster(teachers);
        setTeachingAssignments(assignments);
        setAssignmentTeacherId((previous) => (
          teachers.some((teacher) => teacher.userId === previous)
            ? previous
            : teachers[0]?.userId || ""
        ));
      })
      .catch((requestError) => {
        if (active) setAssignmentError(requestError.message || "Could not load teacher assignments.");
      })
      .finally(() => {
        if (active) setLoadingAssignments(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, assignmentRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "results" || role === "student") {
      setAssessments([]);
      setLoadingAssessments(false);
      setAssessmentDetail(null);
      setAssessmentMarks([]);
      setSelectedAssessmentId("");
      return () => { active = false; };
    }

    setLoadingAssessments(true);
    setAssessmentError("");
    apiRequest(`/api/schools/${school.id}/assessments`)
      .then(({ assessments: rows }) => {
        if (active) setAssessments(rows);
      })
      .catch((requestError) => {
        if (active) setAssessmentError(requestError.message || "Could not load assessments.");
      })
      .finally(() => {
        if (active) setLoadingAssessments(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, assessmentRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "results" || role === "student" || !selectedAssessmentId) {
      setAssessmentDetail(null);
      setAssessmentMarks([]);
      setAssessmentDetailLoading(false);
      return () => { active = false; };
    }

    setAssessmentDetailLoading(true);
    setAssessmentError("");
    apiRequest(`/api/schools/${school.id}/assessments/${selectedAssessmentId}/marks`)
      .then((result) => {
        if (!active) return;
        setAssessmentDetail(result);
        setAssessmentMarks(result.students.map((student) => ({
          studentId: student.id,
          score: student.score == null ? "" : String(student.score),
        })));
        setReviewNote(result.assessment.reviewNote || "");
      })
      .catch((requestError) => {
        if (active) setAssessmentError(requestError.message || "Could not load this assessment.");
      })
      .finally(() => {
        if (active) setAssessmentDetailLoading(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, selectedAssessmentId, assessmentRefresh]);

  useEffect(() => {
    if (page !== "results" || role !== "admin" || !assessmentAssignableClasses.length) return;
    const currentClass = assessmentAssignableClasses.find((item) => item.id === assessmentForm.classId);
    if (!currentClass) {
      const firstClass = assessmentAssignableClasses[0];
      const firstSubject = teachingAssignments.find((assignment) => assignment.classId === firstClass.id)?.subject || "";
      setAssessmentForm((previous) => ({ ...previous, classId: firstClass.id, subject: firstSubject }));
      return;
    }
    if (!teachingAssignments.some((assignment) => (
      assignment.classId === assessmentForm.classId && assignment.subject === assessmentForm.subject
    ))) {
      const firstSubject = teachingAssignments.find((assignment) => assignment.classId === currentClass.id)?.subject || "";
      setAssessmentForm((previous) => ({ ...previous, subject: firstSubject }));
    }
  }, [page, role, assessmentAssignableClasses, assessmentForm.classId, assessmentForm.subject, teachingAssignments]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "students" || role !== "admin") {
      setStudentRows([]);
      setLoadingStudents(false);
      return () => { active = false; };
    }

    setLoadingStudents(true);
    setStudentError("");
    const query = new URLSearchParams({ page: String(studentPage) });
    if (studentClassFilter) query.set("classId", studentClassFilter);
    if (studentSearch.trim()) query.set("search", studentSearch.trim());
    apiRequest(`/api/schools/${school.id}/students?${query}`)
      .then(({ students, total }) => {
        if (!active) return;
        setStudentRows(students);
        setStudentTotal(total);
      })
      .catch((requestError) => {
        if (active) {
          setStudentTotal(0);
          setStudentError(requestError.message || "Could not load the student register.");
        }
      })
      .finally(() => {
        if (active) setLoadingStudents(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, studentSearch, studentClassFilter, studentPage, studentRefresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showSetup() {
    setError("");
    setStep(1);
    setModalOpen(true);
  }

  async function createSchool(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = await apiRequest("/api/schools", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSchool(payload.school);
      setSchools((previous) => [payload.school, ...previous]);
      setModalOpen(false);
      setToast(`School profile created for ${payload.school.name}.`);
      setForm({ name: "", schoolType: "", country: "", email: "", accessMode: "invite" });
    } catch (requestError) {
      setError(requestError.message || "The API could not be reached. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function createInvitation(event) {
    event.preventDefault();
    if (!school) return;
    setInviting(true);
    setError("");
    setInvitationUrl("");
    try {
      const payload = await apiRequest(`/api/schools/${school.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInvitationUrl(`${window.location.origin}/#invite=${encodeURIComponent(payload.invitation.token)}`);
      setInviteEmail("");
      setToast(`Invitation link created for ${payload.invitation.email}.`);
    } catch (requestError) {
      setError(requestError.message || "Could not create the invitation.");
    } finally {
      setInviting(false);
    }
  }

  function toggleSubject(subject) {
    setDraftSubjects((previous) => {
      const currentSubjects = previous[selectedGrade] || [];
      const nextSubjects = currentSubjects.includes(subject)
        ? currentSubjects.filter((item) => item !== subject)
        : [...currentSubjects, subject];
      return { ...previous, [selectedGrade]: nextSubjects };
    });
  }

  async function saveSubjects() {
    if (!school) return;
    setSavingSubjects(true);
    setSubjectError("");
    try {
      const subjects = draftSubjects[selectedGrade] || [];
      const payload = await apiRequest(`/api/schools/${school.id}/subjects`, {
        method: "PUT",
        body: JSON.stringify({ grade: selectedGrade, subjects }),
      });
      setSavedSubjects((previous) => ({ ...previous, [selectedGrade]: payload.subjects }));
      setDraftSubjects((previous) => ({ ...previous, [selectedGrade]: payload.subjects }));
      setToast(`${selectedGrade} subjects saved.`);
    } catch (requestError) {
      setSubjectError(requestError.message || "Could not save the selected subjects.");
    } finally {
      setSavingSubjects(false);
    }
  }

  async function createClass(event) {
    event.preventDefault();
    setCreatingClass(true);
    setClassError("");
    try {
      const { schoolClass } = await apiRequest(`/api/schools/${school.id}/classes`, {
        method: "POST",
        body: JSON.stringify(classForm),
      });
      setSchoolClasses((previous) => [...previous, schoolClass].sort((a, b) => a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section)));
      setClassForm((previous) => ({ ...previous, section: "" }));
      setToast(`${schoolClass.grade} ${schoolClass.section} created.`);
    } catch (requestError) {
      setClassError(requestError.message || "Could not create the class.");
    } finally {
      setCreatingClass(false);
    }
  }

  async function removeClass(schoolClass) {
    if (!window.confirm(`Delete ${schoolClass.grade} ${schoolClass.section}?`)) return;
    setClassError("");
    try {
      await apiRequest(`/api/schools/${school.id}/classes/${schoolClass.id}`, { method: "DELETE" });
      setSchoolClasses((previous) => previous.filter((item) => item.id !== schoolClass.id));
      setToast(`${schoolClass.grade} ${schoolClass.section} deleted.`);
    } catch (requestError) {
      setClassError(requestError.message || "Could not delete the class.");
    }
  }

  async function createAssessment(event) {
    event.preventDefault();
    if (!school) return;
    setAssessmentBusy(true);
    setAssessmentError("");
    try {
      const { assessment } = await apiRequest(`/api/schools/${school.id}/assessments`, {
        method: "POST",
        body: JSON.stringify({
          ...assessmentForm,
          maxScore: Number(assessmentForm.maxScore),
        }),
      });
      setSelectedAssessmentId(assessment.id);
      setAssessmentRefresh((previous) => previous + 1);
      setAssessmentForm((previous) => ({ ...previous, title: "", dueDate: "" }));
      setToast("Assessment created.");
    } catch (requestError) {
      setAssessmentError(requestError.message || "Could not create the assessment.");
    } finally {
      setAssessmentBusy(false);
    }
  }

  async function saveAssessmentMarks(submit = false) {
    if (!school || !assessmentDetail) return;
    setAssessmentBusy(true);
    setAssessmentError("");
    try {
      await apiRequest(`/api/schools/${school.id}/assessments/${assessmentDetail.assessment.id}/marks`, {
        method: "PUT",
        body: JSON.stringify({
          marks: assessmentMarks.map((mark) => ({
            studentId: mark.studentId,
            score: mark.score === "" ? null : Number(mark.score),
          })),
        }),
      });
      if (submit) {
        await apiRequest(`/api/schools/${school.id}/assessments/${assessmentDetail.assessment.id}/submit`, { method: "POST" });
      }
      setAssessmentRefresh((previous) => previous + 1);
      setToast(submit ? "Marks submitted for administrator review." : "Marks saved as a draft.");
    } catch (requestError) {
      setAssessmentError(requestError.message || "Could not save assessment marks.");
    } finally {
      setAssessmentBusy(false);
    }
  }

  async function reviewAssessment(decision) {
    if (!school || !assessmentDetail) return;
    if (!window.confirm(decision === "approved" ? "Approve these submitted marks?" : "Return these marks to the teacher for changes?")) return;
    setAssessmentBusy(true);
    setAssessmentError("");
    try {
      await apiRequest(`/api/schools/${school.id}/assessments/${assessmentDetail.assessment.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note: reviewNote }),
      });
      setAssessmentRefresh((previous) => previous + 1);
      setToast(decision === "approved" ? "Marks approved." : "Marks returned to the teacher.");
    } catch (requestError) {
      setAssessmentError(requestError.message || "Could not review the assessment.");
    } finally {
      setAssessmentBusy(false);
    }
  }

  async function assignTeacher(event) {
    event.preventDefault();
    if (!school || !assignmentClassId) return;
    setSavingAssignment(true);
    setAssignmentError("");
    try {
      await apiRequest(`/api/schools/${school.id}/classes/${assignmentClassId}/teaching-assignments`, {
        method: "PUT",
        body: JSON.stringify({
          subject: assignmentSubject,
          teacherUserId: assignmentTeacherId,
        }),
      });
      setAssignmentRefresh((previous) => previous + 1);
      setToast("Teacher assignment saved.");
    } catch (requestError) {
      setAssignmentError(requestError.message || "Could not save the teacher assignment.");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function unassignTeacher(assignment) {
    if (!window.confirm(`Remove ${assignment.teacherEmail} from ${assignment.subject}, ${assignment.grade} ${assignment.section}?`)) return;
    setAssignmentError("");
    try {
      await apiRequest(`/api/schools/${school.id}/teaching-assignments/${assignment.id}`, { method: "DELETE" });
      setAssignmentRefresh((previous) => previous + 1);
      setToast("Teacher assignment removed.");
    } catch (requestError) {
      setAssignmentError(requestError.message || "Could not remove the teacher assignment.");
    }
  }

  function resetStudentForm() {
    setEditingStudentId("");
    setStudentForm({
      firstName: "",
      lastName: "",
      admissionNumber: "",
      classId: schoolClasses[0]?.id || "",
      guardianEmail: "",
      guardianPhone: "",
    });
  }

  function editStudent(student) {
    setEditingStudentId(student.id);
    setStudentForm({
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      classId: student.classId,
      guardianEmail: student.guardianEmail || "",
      guardianPhone: student.guardianPhone || "",
    });
    document.getElementById("studentForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveStudent(event) {
    event.preventDefault();
    setSavingStudent(true);
    setStudentError("");
    try {
      const path = editingStudentId
        ? `/api/schools/${school.id}/students/${editingStudentId}`
        : `/api/schools/${school.id}/students`;
      await apiRequest(path, {
        method: editingStudentId ? "PUT" : "POST",
        body: JSON.stringify(studentForm),
      });
      resetStudentForm();
      setStudentRefresh((previous) => previous + 1);
      setClassRefresh((previous) => previous + 1);
      setToast(editingStudentId ? "Student record updated." : "Student enrolled.");
    } catch (requestError) {
      setStudentError(requestError.message || "Could not save the student record.");
    } finally {
      setSavingStudent(false);
    }
  }

  async function toggleStudentStatus(student) {
    setStudentError("");
    try {
      await apiRequest(`/api/schools/${school.id}/students/${student.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !student.isActive }),
      });
      setStudentRefresh((previous) => previous + 1);
      setClassRefresh((previous) => previous + 1);
      setToast(student.isActive ? "Student archived." : "Student reactivated.");
    } catch (requestError) {
      setStudentError(requestError.message || "Could not update student status.");
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setToast("Invitation link copied. Send it to the invited email address.");
    } catch {
      setToast("Copy the invitation link from the field and send it to the invited email address.");
    }
  }

  async function restoreSession() {
    const result = await authClient.getSession();
    if (result.error) throw new Error(result.error.message || "Could not load your account.");
    if (!result.data?.session?.user) throw new Error("Sign in to continue.");
    setAuthNotice("");
    setSession(result.data.session);
  }

  async function signOut() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
      setSession(null);
      setSchools([]);
      setSchool(null);
      setAuthNotice("");
    } catch (requestError) {
      setToast(requestError.message || "Could not sign out. Please try again.");
    }
  }

  function exportResults() {
    const rows = [["Student", "Student ID", "Class", "Subject", "Teacher", "Mark", "Status"], ...filteredResults];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "aster-results.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("Your results have been exported.");
  }

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "School administrator";
  const userInitials = userName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  if (sessionLoading) {
    return <main className="auth-shell"><p className="auth-description">Restoring your secure session…</p></main>;
  }
  if (!session?.user || session.user.emailVerified !== true) {
    return <AuthScreen authClient={authClient} notice={authNotice} initialEmail={session?.user?.email} verificationRequired={Boolean(session?.user && !session.user.emailVerified)} onAuthenticated={restoreSession} />;
  }
  if (loadingSchools) {
    return <main className="auth-shell"><p className="auth-description">Loading your school workspace…</p></main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Aster home"><span className="brand-mark">✳</span><span className="brand-name">aster<span>.</span></span></a>
        <button className="school-switcher" type="button" onClick={showSetup} disabled={loadingSchools}>
          <span className="school-avatar">{school?.name?.[0]?.toUpperCase() || "H"}</span>
          <span className="school-switcher-copy"><strong>{school?.name || (loadingSchools ? "Loading schools…" : "Set up your school")}</strong><small>{school?.schoolType || (schools.length ? "Select a school profile" : "Create your school profile")}</small></span><span className="chevron">⌄</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {visibleNavigation.slice(0, role === "admin" ? 5 : visibleNavigation.length).map(([id, label, icon], index) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} type="button" onClick={() => setPage(id)}>
              <span className="nav-symbol">{icon}</span><span>{label}</span>{id === "results" && role === "admin" && <span className="nav-badge">4</span>}
            </button>
          ))}
        </nav>
        {role === "admin" && <>
          <div className="nav-label nav-label-lower">SCHOOL</div>
          <nav className="main-nav" aria-label="School settings">
            {visibleNavigation.slice(5).map(([id, label, icon]) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} type="button" onClick={() => setPage(id)}><span className="nav-symbol">{icon}</span><span>{label}</span></button>)}
          </nav>
        </>}
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-spark">✳</span><strong>A little help goes a long way.</strong><span>Visit the Aster help desk</span><button type="button" onClick={() => setToast("Aster Help Desk — support@aster.school")}>Get help ↗</button></div>
          <div className="user-profile"><span className="user-avatar">{userInitials}</span><span className="user-copy"><strong>{userName}</strong><small>{portalData[role].label}</small></span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{page}</strong></div><div className="topbar-actions"><span className="role-select" aria-label="Your school role">{portalData[role].label}</span><button className="icon-button" type="button" onClick={() => setToast("You’re all caught up on school notifications.")} aria-label="Notifications">♧</button><button className="topbar-avatar" type="button" aria-label={`Sign out ${userName}`} onClick={signOut}>{userInitials}</button></div></header>
        <div className={`page-content ${page === "classes" ? "curriculum-page" : page === "students" ? "students-page" : page === "teachers" ? "teachers-page" : page === "results" ? "results-page" : ""}`}>
          {!school ? <section className="panel onboarding-panel"><span className="auth-kicker">WELCOME TO ASTER</span><h1>Create your school workspace</h1><p className="page-subtitle">Your account is ready. Set up your school profile to begin; only people you invite can join its portal.</p><button className="button button-primary" type="button" onClick={showSetup}>＋ Create school profile</button></section> : <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> {currentDateLabel} <span className="eyebrow-divider">·</span> SCHOOL WORKSPACE</div><h1>{page === "overview" ? role === "admin" ? `Good morning, ${userName}` : current.title : page === "results" ? role === "student" ? "Results, at a glance" : "Assessments & marks" : page === "profile" ? "Your school, your story." : page === "classes" ? "Classes & subjects" : page === "students" ? "Student register" : `${page[0].toUpperCase()}${page.slice(1)}`} <span className="wave">✳</span></h1><p className="page-subtitle">{page === "overview" ? current.subtitle : page === "results" && role !== "student" ? role === "admin" ? "Set assessments, review teacher submissions, and track mark completion." : "Enter marks for your assigned classes and submit them for administrator review." : page === "classes" ? "Configure subjects and organise your classes." : page === "students" ? "Enrol students and keep their school records up to date." : `Keep your ${page} organised for the term ahead.`}</p></div>
            {page !== "classes" && page !== "students" && page !== "teachers" && page !== "results" && <div className="welcome-actions"><button className="button button-secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/school/${school.slug}`); setToast("Your school link has been copied."); } catch { setToast("Could not copy the school link. Please try again."); } }}>↗ Share school link</button><button className="button button-primary" type="button" onClick={() => page === "profile" ? showSetup() : page === "access" ? document.getElementById("inviteEmail")?.focus() : setToast(`${role === "teacher" ? "Enter marks" : role === "student" ? "View your results" : "Add a student"} — student records are not connected yet.`)}>＋ {page === "access" ? "Invite a member" : role === "teacher" ? "Enter marks" : role === "student" ? "View my results" : "Add a student"}</button></div>}
          </section>

          {(page === "overview" || (page === "results" && role === "student")) && <div className="sample-data-notice" role="note">Preview only: dashboard figures and result rows are sample data, not saved student results.</div>}

          {page === "classes" && <section className="panel curriculum-panel">
            <div className="panel-heading curriculum-heading">
              <div><h2>Subject setup</h2><p>Select the subjects taught in each grade. Changes are saved to this school.</p></div>
              <label className="grade-picker"><span>Grade</span><select className="text-input" value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value)} aria-label="Select grade">{Object.keys(curriculumByGrade).map((grade) => <option key={grade}>{grade}</option>)}</select></label>
            </div>
            <p className="curriculum-note">This starting catalogue follows the grade structure in NERDC’s revised Basic Education and Senior Secondary curriculum pages. Optional offerings can vary; confirm your school’s current subjects with the official grade-level curriculum and your state authority.</p>
            <div className="curriculum-grid" aria-label={`${selectedGrade} subjects`}>
              {curriculumByGrade[selectedGrade].map((subject) => {
                const checked = gradeDraftSubjects.includes(subject);
                return <label className={`curriculum-subject ${checked ? "selected" : ""} ${role !== "admin" ? "readonly" : ""}`} key={subject}>
                  <input type="checkbox" checked={checked} disabled={loadingSubjects || role !== "admin"} onChange={() => toggleSubject(subject)} />
                  <span className="curriculum-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                  <span>{subject}</span>
                </label>;
              })}
            </div>
            <div className="curriculum-footer">
              <span>{loadingSubjects ? "Loading saved subjects…" : `${gradeDraftSubjects.length} selected${role === "admin" ? ` · ${subjectChangesPending ? "Unsaved changes" : "All changes saved"}` : ""}`}</span>
              {role === "admin" && <button className="button button-primary" type="button" onClick={saveSubjects} disabled={loadingSubjects || savingSubjects || !subjectChangesPending}>{savingSubjects ? "Saving…" : "Save subjects"}</button>}
            </div>
            {subjectError && <p className="form-error" role="alert">{subjectError}</p>}
            <p className="curriculum-source">Official references: <a href="https://nerdc.gov.ng/content_manager/new_curriculum_home.html" target="_blank" rel="noreferrer">NERDC revised Basic Education Curriculum</a> · <a href="https://nerdc.gov.ng/content_manager/new_senior_curriculum_home.html" target="_blank" rel="noreferrer">NERDC revised Senior Secondary Curriculum</a></p>
            <div className="class-management">
              <div className="panel-heading"><div><h2>School classes</h2><p>Create class groups using this grade’s saved subjects.</p></div><span className="class-year-pill">{classForm.academicYear}</span></div>
              {role === "admin" && <form className="class-create-form" onSubmit={createClass}>
                <label><span>Grade</span><select className="text-input" value={classForm.grade} onChange={(event) => setClassForm((previous) => ({ ...previous, grade: event.target.value }))}>{Object.keys(curriculumByGrade).map((grade) => <option key={grade}>{grade}</option>)}</select></label>
                <label><span>Class / stream</span><input className="text-input" required maxLength={24} value={classForm.section} onChange={(event) => setClassForm((previous) => ({ ...previous, section: event.target.value }))} placeholder="e.g. A or Blue" /></label>
                <label><span>Academic year</span><input className="text-input" required pattern="\d{4}/\d{4}" title="Use the format 2026/2027" value={classForm.academicYear} onChange={(event) => setClassForm((previous) => ({ ...previous, academicYear: event.target.value }))} /></label>
                <button className="button button-primary" type="submit" disabled={creatingClass || loadingClasses}>{creatingClass ? "Creating…" : "Create class"}</button>
              </form>}
              {classError && <p className="form-error" role="alert">{classError}</p>}
              {loadingClasses ? <p className="empty-search">Loading classes…</p> : schoolClasses.length === 0 ? <p className="empty-search">No classes yet. Save subjects for a grade, then create its first class.</p> : <div className="class-list">
                {schoolClasses.map((schoolClass) => <article className="class-card" key={schoolClass.id}>
                  <div className="class-card-top"><span className="class-card-grade">{schoolClass.grade}</span>{role === "admin" && <button className="quiet-action" type="button" onClick={() => removeClass(schoolClass)} disabled={schoolClass.studentCount > 0}>Delete</button>}</div>
                  <h3>{schoolClass.section}</h3>
                  <p>{schoolClass.academicYear} · {schoolClass.studentCount} student{schoolClass.studentCount === 1 ? "" : "s"}</p>
                  <div className="class-subject-list">{schoolClass.subjects.map((subject) => <span key={subject}>{subject}</span>)}</div>
                </article>)}
              </div>}
              <p className="field-hint">Classes with student records cannot be deleted. Move every student record, including archived students, before removing a class.</p>
            </div>
          </section>}

          {page === "results" && role !== "student" && <section className="assessment-workspace">
            {role === "admin" && <section className="panel assessment-form-panel">
              <div className="panel-heading"><div><h2>Create an assessment</h2><p>Assessments can be created for subjects with an assigned teacher.</p></div></div>
              {loadingAssignments || loadingClasses ? <p className="empty-search">Loading assigned classes…</p> : assessmentAssignableClasses.length === 0 ? <p className="empty-search">{schoolClasses.length === 0 ? "Create a class and save its subjects first." : "Assign a teacher to a class subject first."} <button className="inline-action" type="button" onClick={() => setPage(schoolClasses.length === 0 ? "classes" : "teachers")}>Go to {schoolClasses.length === 0 ? "Classes & subjects" : "Teachers"} →</button></p> : <form className="assessment-create-form" onSubmit={createAssessment}>
                <label><span>Class</span><select className="text-input" required value={assessmentForm.classId} onChange={(event) => {
                  const classId = event.target.value;
                  const subject = teachingAssignments.find((assignment) => assignment.classId === classId)?.subject || "";
                  setAssessmentForm((previous) => ({ ...previous, classId, subject }));
                }}><option value="">Select a class</option>{assessmentAssignableClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
                <label><span>Subject</span><select className="text-input" required value={assessmentForm.subject} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, subject: event.target.value }))}><option value="">Select a subject</option>{assessmentSubjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
                <label><span>Assessment title</span><input className="text-input" required maxLength={100} value={assessmentForm.title} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="e.g. Mid-term test" /></label>
                <label><span>Term</span><select className="text-input" value={assessmentForm.term} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, term: event.target.value }))}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
                <label><span>Maximum mark</span><input className="text-input" type="number" required min="1" max="1000" step="0.01" value={assessmentForm.maxScore} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, maxScore: event.target.value }))} /></label>
                <label><span>Due date <small>Optional</small></span><input className="text-input" type="date" value={assessmentForm.dueDate} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, dueDate: event.target.value }))} /></label>
                <button className="button button-primary" type="submit" disabled={assessmentBusy || !assessmentForm.subject}>{assessmentBusy ? "Creating…" : "Create assessment"}</button>
              </form>}
            </section>}

            <section className="panel assessment-list-panel">
              <div className="panel-heading"><div><h2>{role === "admin" ? "School assessments" : "Your assessments"}</h2><p>{role === "admin" ? "Track progress and review submitted marks." : "Open an assessment to enter or update marks."}</p></div><button className="button button-secondary button-small" type="button" onClick={() => setAssessmentRefresh((previous) => previous + 1)} disabled={loadingAssessments}>Refresh</button></div>
              {assessmentError && <p className="form-error" role="alert">{assessmentError}</p>}
              {loadingAssessments ? <p className="empty-search">Loading assessments…</p> : assessments.length === 0 ? <p className="empty-search">{role === "admin" ? "No assessments yet. Create one after classes, subjects, and teacher assignments are ready." : "No assessments have been assigned to your classes yet."}</p> : <div className="table-scroll"><table className="assessment-table"><thead><tr><th>ASSESSMENT</th><th>CLASS</th><th>TEACHER</th><th>MARKS ENTERED</th><th>STATUS</th><th></th></tr></thead><tbody>{assessments.map((assessment) => <tr key={assessment.id}>
                <td><strong>{assessment.title}</strong><small className="assessment-subtitle">{assessment.subject} · {assessment.term} · out of {assessment.maxScore}</small></td>
                <td>{assessment.grade} {assessment.section}<small className="assessment-subtitle">{assessment.academicYear}{assessment.dueDate ? ` · Due ${new Date(`${assessment.dueDate}T00:00:00`).toLocaleDateString("en-NG")}` : ""}</small></td>
                <td>{assessment.teacherEmail || "Assigned teacher"}</td>
                <td>{assessment.markedCount} / {assessment.studentCount}</td>
                <td><span className={`status-pill ${assessment.status === "approved" ? "approved" : assessment.status === "submitted" ? "pending" : assessment.status === "returned" ? "returned" : "draft"}`}><i />{assessment.status[0].toUpperCase()}{assessment.status.slice(1)}</span></td>
                <td><button className="quiet-action" type="button" onClick={() => setSelectedAssessmentId(assessment.id)}>{role === "admin" && assessment.status === "submitted" ? "Review marks" : role === "teacher" && ["draft", "returned"].includes(assessment.status) ? "Enter marks" : "View marks"}</button></td>
              </tr>)}</tbody></table></div>}
            </section>

            {selectedAssessmentId && <section className="panel assessment-detail-panel">
              {assessmentDetailLoading ? <p className="empty-search">Loading student marks…</p> : assessmentDetail && <>
                <div className="panel-heading"><div><h2>{assessmentDetail.assessment.title}</h2><p>{assessmentDetail.assessment.grade} {assessmentDetail.assessment.section} · {assessmentDetail.assessment.subject} · {assessmentDetail.assessment.term} · Maximum {assessmentDetail.assessment.maxScore}</p></div><button className="quiet-action" type="button" onClick={() => setSelectedAssessmentId("")}>Close</button></div>
                {assessmentDetail.assessment.reviewNote && <p className={`assessment-review-note ${assessmentDetail.assessment.status === "returned" ? "returned" : ""}`}>{assessmentDetail.assessment.status === "returned" ? "Returned with feedback: " : "Administrator note: "}{assessmentDetail.assessment.reviewNote}</p>}
                <div className="table-scroll"><table className="assessment-marks-table"><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>MARK / {assessmentDetail.assessment.maxScore}</th></tr></thead><tbody>{assessmentDetail.students.map((student, index) => {
                  const mark = assessmentMarks[index];
                  const editable = role === "teacher" && ["draft", "returned"].includes(assessmentDetail.assessment.status);
                  return <tr key={student.id}><td>{student.firstName} {student.lastName}</td><td>{student.admissionNumber}</td><td>{editable ? <input className="text-input assessment-score-input" type="number" min="0" max={assessmentDetail.assessment.maxScore} step="0.01" value={mark?.score ?? ""} aria-label={`Mark for ${student.firstName} ${student.lastName}`} onChange={(event) => setAssessmentMarks((previous) => previous.map((item) => item.studentId === student.id ? { ...item, score: event.target.value } : item))} /> : student.score == null ? "—" : `${student.score} / ${assessmentDetail.assessment.maxScore}`}</td></tr>;
                })}</tbody></table>
                  {assessmentDetail.students.length === 0 && <p className="empty-search">This class has no active students to mark.</p>}
                </div>
                {role === "teacher" && ["draft", "returned"].includes(assessmentDetail.assessment.status) && <div className="assessment-actions"><span className="field-hint">You can save an incomplete draft; every student on this assessment roster needs a mark before submission.</span><button className="button button-secondary" type="button" onClick={() => saveAssessmentMarks(false)} disabled={assessmentBusy || assessmentMarks.length === 0}>{assessmentBusy ? "Saving…" : "Save draft"}</button><button className="button button-primary" type="button" onClick={() => saveAssessmentMarks(true)} disabled={assessmentBusy || !allAssessmentMarksEntered}>{assessmentBusy ? "Submitting…" : "Submit for review"}</button></div>}
                {role === "admin" && assessmentDetail.assessment.status === "submitted" && <div className="assessment-review-actions">
                  <label><span>Review note <small>Required when returning marks</small></span><textarea className="text-input" rows="3" maxLength={500} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Explain any changes the teacher needs to make." /></label>
                  <div><button className="button button-secondary" type="button" onClick={() => reviewAssessment("returned")} disabled={assessmentBusy || !reviewNote.trim()}>{assessmentBusy ? "Saving…" : "Return to teacher"}</button><button className="button button-primary" type="button" onClick={() => reviewAssessment("approved")} disabled={assessmentBusy}>{assessmentBusy ? "Saving…" : "Approve marks"}</button></div>
                </div>}
              </>}
            </section>}
          </section>}

          {page === "teachers" && role === "admin" && <section className="teacher-workspace">
            <section className="panel teacher-assignment-panel">
              <div className="panel-heading">
                <div><h2>Teacher assignments</h2><p>Assign one teacher to each class and subject. Reassigning replaces the current teacher.</p></div>
                <button className="button button-secondary button-small" type="button" onClick={() => setPage("access")}>Invite a teacher</button>
              </div>
              {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
              {loadingAssignments ? <p className="empty-search">Loading teacher assignments…</p> : teacherRoster.length === 0 ? <p className="empty-search">No teachers have accepted a school invitation yet. Invite a teacher from <button className="inline-action" type="button" onClick={() => setPage("access")}>Portal access →</button> and ask them to sign in before assigning classes.</p> : <>
                <form className="assignment-form" onSubmit={assignTeacher}>
                  <label><span>Class</span><select className="text-input" required value={assignmentClassId} onChange={(event) => {
                    const classId = event.target.value;
                    const nextClass = schoolClasses.find((item) => item.id === classId);
                    setAssignmentClassId(classId);
                    setAssignmentSubject(nextClass?.subjects?.[0] || "");
                  }}><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
                  <label><span>Subject</span><select className="text-input" required value={assignmentSubject} onChange={(event) => setAssignmentSubject(event.target.value)} disabled={!selectedAssignmentClass?.subjects?.length}><option value="">Select a subject</option>{(selectedAssignmentClass?.subjects || []).map((subject) => <option key={subject}>{subject}</option>)}</select></label>
                  <label><span>Teacher</span><select className="text-input" required value={assignmentTeacherId} onChange={(event) => setAssignmentTeacherId(event.target.value)}><option value="">Select a teacher</option>{teacherRoster.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.email}</option>)}</select></label>
                  <button className="button button-primary" type="submit" disabled={savingAssignment || !schoolClasses.length || !selectedAssignmentClass?.subjects?.length}>{savingAssignment ? "Saving…" : "Save assignment"}</button>
                </form>
                {schoolClasses.length === 0 && <p className="empty-search">Create classes and save their subjects before assigning teachers. <button className="inline-action" type="button" onClick={() => setPage("classes")}>Go to Classes & subjects →</button></p>}
                {schoolClasses.length > 0 && schoolClasses.every((item) => !item.subjects.length) && <p className="empty-search">Save subjects for a grade before assigning teachers. <button className="inline-action" type="button" onClick={() => setPage("classes")}>Go to Classes & subjects →</button></p>}
                <div className="assignment-list-heading"><h3>Current assignments</h3><span>{teachingAssignments.length}</span></div>
                {teachingAssignments.length === 0 ? <p className="empty-search">No teacher assignments yet.</p> : <div className="table-scroll"><table className="assignment-table"><thead><tr><th>CLASS</th><th>SUBJECT</th><th>TEACHER</th><th>ACADEMIC YEAR</th><th></th></tr></thead><tbody>{teachingAssignments.map((assignment) => <tr key={assignment.id}><td>{assignment.grade} {assignment.section}</td><td>{assignment.subject}</td><td>{assignment.teacherEmail}</td><td>{assignment.academicYear}</td><td><button className="quiet-action" type="button" onClick={() => unassignTeacher(assignment)}>Remove</button></td></tr>)}</tbody></table></div>}
              </>}
            </section>
          </section>}

          {page === "classes" && role === "teacher" && <section className="teacher-workspace">
            <section className="panel teacher-assignment-panel">
              <div className="panel-heading"><div><h2>Your teaching assignments</h2><p>These are the classes and subjects assigned to your teacher account.</p></div></div>
              {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
              {loadingAssignments ? <p className="empty-search">Loading your assignments…</p> : teachingAssignments.length === 0 ? <p className="empty-search">No classes or subjects are assigned to you yet. Ask your school administrator to assign them.</p> : <div className="class-list teacher-assignment-cards">{teachingAssignments.map((assignment) => <article className="class-card" key={assignment.id}><div className="class-card-top"><span className="class-card-grade">{assignment.grade}</span><span className="class-year-pill">{assignment.academicYear}</span></div><h3>{assignment.section}</h3><p>{assignment.subject}</p></article>)}</div>}
            </section>
          </section>}

          {page === "students" && role === "admin" && <section className="student-workspace">
            <section className="panel student-form-panel" id="studentForm">
              <div className="panel-heading"><div><h2>{editingStudentId ? "Edit student record" : "Enrol a student"}</h2><p>Only collect the details your school needs to manage enrolment.</p></div></div>
              {loadingClasses ? <p className="empty-search">Loading classes…</p> : classError ? <p className="form-error" role="alert">{classError}</p> : schoolClasses.length === 0 ? <p className="empty-search">Create a class first. <button className="inline-action" type="button" onClick={() => setPage("classes")}>Go to Classes & subjects →</button></p> : <form className="student-create-form" onSubmit={saveStudent}>
                <label><span>First name</span><input className="text-input" required maxLength={80} autoComplete="given-name" value={studentForm.firstName} onChange={(event) => setStudentForm((previous) => ({ ...previous, firstName: event.target.value }))} /></label>
                <label><span>Last name</span><input className="text-input" required maxLength={80} autoComplete="family-name" value={studentForm.lastName} onChange={(event) => setStudentForm((previous) => ({ ...previous, lastName: event.target.value }))} /></label>
                <label><span>Admission number</span><input className="text-input" required maxLength={32} value={studentForm.admissionNumber} onChange={(event) => setStudentForm((previous) => ({ ...previous, admissionNumber: event.target.value }))} placeholder="e.g. AST/2026/001" /></label>
                <label><span>Class</span><select className="text-input" required value={studentForm.classId} onChange={(event) => setStudentForm((previous) => ({ ...previous, classId: event.target.value }))}><option value="">Select a class</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.grade} {schoolClass.section} · {schoolClass.academicYear}</option>)}</select></label>
                <label><span>Parent / guardian email <small>Optional</small></span><input className="text-input" type="email" maxLength={254} autoComplete="email" value={studentForm.guardianEmail} onChange={(event) => setStudentForm((previous) => ({ ...previous, guardianEmail: event.target.value }))} /></label>
                <label><span>Parent / guardian phone <small>Optional</small></span><input className="text-input" type="tel" maxLength={24} autoComplete="tel" value={studentForm.guardianPhone} onChange={(event) => setStudentForm((previous) => ({ ...previous, guardianPhone: event.target.value }))} /></label>
                <div className="student-form-actions">{editingStudentId && <button className="button button-secondary" type="button" onClick={resetStudentForm}>Cancel edit</button>}<button className="button button-primary" type="submit" disabled={savingStudent}>{savingStudent ? "Saving…" : editingStudentId ? "Save changes" : "Enrol student"}</button></div>
              </form>}
              {studentError && <p className="form-error" role="alert">{studentError}</p>}
            </section>
            <section className="panel results-panel student-register-panel">
              <div className="panel-heading results-heading"><div><h2>Student register</h2><p>{studentTotal} student record{studentTotal === 1 ? "" : "s"} matching your filters.</p></div>
                <div className="student-filters"><label className="search-box"><span>⌕</span><input type="search" placeholder="Search name or admission no." aria-label="Search students" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentPage(1); }} /></label>
                  <select className="text-input" value={studentClassFilter} aria-label="Filter by class" onChange={(event) => { setStudentClassFilter(event.target.value); setStudentPage(1); }}><option value="">All classes</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.grade} {schoolClass.section}</option>)}</select>
                </div>
              </div>
              <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>CLASS</th><th>GUARDIAN CONTACT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
                {studentRows.map((student) => <tr key={student.id}><td><strong>{student.firstName} {student.lastName}</strong></td><td>{student.admissionNumber}</td><td>{student.grade} {student.section}</td><td>{student.guardianEmail || student.guardianPhone || "—"}</td><td><span className={`status-pill ${student.isActive ? "approved" : "draft"}`}><i />{student.isActive ? "Active" : "Archived"}</span></td><td><div className="student-row-actions"><button className="quiet-action" type="button" onClick={() => editStudent(student)}>Edit</button><button className="quiet-action" type="button" onClick={() => toggleStudentStatus(student)}>{student.isActive ? "Archive" : "Reactivate"}</button></div></td></tr>)}
              </tbody></table>
                {loadingStudents && <div className="empty-search">Loading student records…</div>}
                {!loadingStudents && studentRows.length === 0 && <div className="empty-search">No students found. Add your first student above or adjust the filters.</div>}
              </div>
              <div className="table-footer student-pagination"><span>Page {studentPage} of {Math.max(1, Math.ceil(studentTotal / 100))}</span><div><button className="button button-secondary button-small" type="button" disabled={studentPage <= 1 || loadingStudents} onClick={() => setStudentPage((previous) => previous - 1)}>Previous</button><button className="button button-secondary button-small" type="button" disabled={studentPage >= Math.ceil(studentTotal / 100) || loadingStudents} onClick={() => setStudentPage((previous) => previous + 1)}>Next</button></div></div>
            </section>
          </section>}

          {role === "admin" && page === "access" && <section className="panel invite-panel"><div className="panel-heading"><div><h2>Invite your school community</h2><p>Only invited people can join. Links expire after 7 days and work for the invited email address only.</p></div></div><form className="invite-form" onSubmit={createInvitation}><label className="field-label" htmlFor="inviteEmail">Invitee email</label><input className="text-input" id="inviteEmail" type="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@yourschool.edu" /><label className="field-label" htmlFor="inviteRole">Portal role</label><select className="text-input" id="inviteRole" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="teacher">Teacher</option><option value="student">Student</option></select>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Creating link…" : "Create invitation link"}</button></form>{invitationUrl && <div className="invitation-link"><label className="field-label" htmlFor="invitationUrl">One-time invitation link</label><div><input className="text-input" id="invitationUrl" readOnly value={invitationUrl} /><button className="button button-secondary" type="button" onClick={copyInvitation}>Copy</button></div><p className="field-hint">Send this link directly to the invited email address. Aster does not email invitations yet.</p></div>}</section>}

          <section className={`term-banner ${page === "access" || page === "classes" ? "hidden" : ""}`}><div className="term-icon">▣</div><div className="term-copy"><strong>{role === "admin" ? "Second term is in full swing" : role === "teacher" ? "Your classes are making progress" : "Your second term, so far"}</strong><span>{role === "admin" ? "Results are due in 12 days. Your teachers have submitted 68% of their marks." : role === "teacher" ? "Three mark sets are due Friday. You’ve entered 82% of your marks." : "You’re doing well. Keep showing up, asking questions, and making progress."}</span></div><div className="progress-wrap"><div className="progress-label"><span>{role === "student" ? "Term progress" : role === "teacher" ? "My marks entered" : "Mark submission"}</span><strong>{role === "student" ? "On track" : role === "teacher" ? "82%" : "68%"}</strong></div><div className="progress-track"><span style={{ width: role === "student" ? "62%" : role === "teacher" ? "82%" : "68%" }} /></div></div><button className="text-link" type="button" onClick={() => setPage("results")}>View results →</button></section>

          <section className={`stats-grid ${page === "access" ? "hidden" : ""}`} aria-label="School summary">{current.stats.map(([label, value, trend], index) => <article className="stat-card" key={label}><div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${["student-stat-icon", "teacher-stat-icon", "average-stat-icon", "review-stat-icon"][index]}`}>{["♧", "♙", "↗", "▤"][index]}</span></div><div className="stat-number">{value} <span className={`stat-trend ${index === 3 ? "attention" : "positive"}`}>{trend}</span></div><div className="stat-foot"><span>{index === 3 ? "4 classes, 3 teachers" : "vs. last term"}</span><span className="mini-chart students-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></div></article>)}</section>
          <section className={`main-grid ${page === "access" ? "hidden" : ""}`}>
            <article className="panel performance-panel">
              <div className="panel-heading"><div><h2>{role === "student" ? "My learning journey" : role === "teacher" ? "My marking progress" : "School performance"}</h2><p>A little progress, every term.</p></div></div>
              <div className="chart-summary"><strong>{current.average}</strong><small>{role === "student" ? "my average" : "overall average"}</small></div>
              <p className="sample-chart-copy">Performance charts will show verified school results once student records are connected.</p>
            </article>
            <article className="panel activity-panel"><div className="panel-heading"><div><h2>{role === "student" ? "Coming up for you" : role === "teacher" ? "Your next steps" : "Needs your attention"}</h2><p>The important things, all in one place.</p></div><button className="more-button" type="button">•••</button></div><div className="attention-list">{current.attention.map(([title, detail], index) => <button className="attention-item" type="button" key={title} onClick={() => setPage("results")}><span className={`attention-icon ${["amber", "blue", "lilac"][index]}`}>{["⚠", "♧", "⌂"][index]}</span><span className="attention-copy"><strong>{title}</strong><small>{detail}</small></span><span className="attention-arrow">→</span></button>)}</div><button className="view-all-link" type="button" onClick={() => setPage("results")}>View all updates →</button></article>
          </section>

          <section className={`panel results-panel ${page === "access" ? "hidden" : ""}`}><div className="panel-heading results-heading"><div><h2>{role === "student" ? "My recent results" : role === "teacher" ? "My recent marks" : "Recent results"}</h2><p>A snapshot of marks making their way to you.</p></div><div className="table-actions"><label className="search-box"><span>⌕</span><input type="search" placeholder="Search results" aria-label="Search results" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="button button-secondary button-small" type="button" onClick={() => setToast("Showing results from the current term.")}>☷ Filter</button><button className="button button-secondary button-small export-button" type="button" onClick={exportResults}>⇩ Export</button></div></div><div className="table-scroll"><table><thead><tr>{[role === "student" ? "SUBJECT" : "STUDENT", role === "student" ? "ASSESSMENT" : "CLASS", role === "student" ? "TERM" : "SUBJECT", "TEACHER", "MARK", "STATUS"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{filteredResults.map((row, index) => <tr key={`${row[0]}-${index}`}><td>{role === "student" ? row[0] : <span className="student-cell"><span className={`table-avatar ${["rose", "blue-avatar", "green-avatar", "yellow-avatar"][index]}`}>{row[0].split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{row[0]}</strong><small>{row[1]}</small></span></span>}</td><td>{role === "student" ? row[1] : row[2]}</td><td>{role === "student" ? row[2] : row[3]}</td><td>{row[4]}</td><td><strong className="mark">{row[5]}</strong><span className="mark-denom"> / 100</span></td><td><span className={`status-pill ${row[6] === "Approved" || row[6] === "Submitted" || row[6] === "Graded" ? "approved" : row[6] === "Needs review" ? "pending" : "draft"}`}><i />{row[6]}</span></td></tr>)}</tbody></table>{filteredResults.length === 0 && <div className="empty-search">No results match your search. Try another name, class, or subject.</div>}</div><div className="table-footer"><span>Showing <strong>{filteredResults.length}</strong> of {role === "student" ? "8" : role === "teacher" ? "576" : "1,248"} results</span><button className="table-footer-link" type="button" onClick={() => setPage("results")}>View all results →</button></div></section>
          <footer className="page-footer"><span>Made for the people who make school matter <span className="footer-heart">♥</span></span><span>ASTER SCHOOL OS <i /> 2025</span></footer>
          </>}
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button className="modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="Close setup">×</button><div className="modal-kicker"><span className="brand-mark mini-brand">✳</span> LET’S MAKE THIS YOURS</div><h2 id="modalTitle">Tell us about your school</h2><p className="modal-intro">A few details help us set up the right home for your school community.</p><div className="step-indicator"><span className={`step ${step === 1 ? "active" : ""}`}>01</span><i /><span className={`step ${step === 2 ? "active" : ""}`}>02</span><span className="step-caption">{step === 1 ? "School basics" : "Portal access"}</span></div><form onSubmit={createSchool} noValidate>{step === 1 ? <div className="form-step"><label className="field-label" htmlFor="schoolName">School name</label><input className="text-input" id="schoolName" required maxLength={120} value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="e.g. Harborview Academy" /><div className="field-row"><div><label className="field-label" htmlFor="schoolType">School type</label><select className="text-input" id="schoolType" required value={form.schoolType} onChange={(event) => updateForm("schoolType", event.target.value)}><option value="">Select school type</option>{schoolTypes.map((type) => <option key={type}>{type}</option>)}</select></div><div><label className="field-label" htmlFor="schoolCountry">Country</label><input className="text-input" id="schoolCountry" required maxLength={80} value={form.country} onChange={(event) => updateForm("country", event.target.value)} placeholder="e.g. Nigeria" /></div></div><label className="field-label" htmlFor="schoolEmail">School email</label><input className="text-input" id="schoolEmail" required type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="hello@yourschool.edu" /><button className="button button-primary modal-continue" type="button" onClick={() => { const fields = [...document.querySelectorAll("#schoolName, #schoolType, #schoolCountry, #schoolEmail")]; const invalid = fields.find((field) => !field.checkValidity()); if (invalid) invalid.reportValidity(); else { setError(""); setStep(2); } }}>Continue →</button></div> : <div className="form-step"><label className="field-label">How should your community access the school?</label><p className="field-hint">Choose how your school community will join. You can update this later.</p>{accessOptions.map(([value, title, description]) => <label className="access-option" key={value}><input type="radio" name="accessMode" checked={form.accessMode === value} onChange={() => updateForm("accessMode", value)} /><span className="access-option-icon">{value === "invite" ? "✉" : value === "school-code" ? "⌗" : "◎"}</span><span><strong>{title}</strong><small>{description}</small></span><span className="radio-mark" /></label>)}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-row-actions"><button className="button button-secondary" type="button" onClick={() => { setError(""); setStep(1); }}>← Back</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create school profile →"}</button></div><p className="privacy-note">School profiles are saved to the local database.</p></div>}</form></section></div>}
      {toast && <div className="toast show" role="status">{toast}</div>}
    </div>
  );
}

export default App;
