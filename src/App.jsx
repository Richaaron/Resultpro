import React, { useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import AsterLogoMark from "./AsterLogo.jsx";
import EducationBackground from "./EducationBackground.jsx";
import ExplainerVideo from "./ExplainerVideo.jsx";
import { authClient, pendingSchoolNameKey } from "./auth.js";
import { curriculumByGrade, curriculumGrades } from "../shared/curriculum.js";
import { subscriptionPlans } from "../shared/billing-plans.js";
import {
  defaultGradingSettings,
  groupPublishedResultRowsByStudent,
  normalizeGradingSettingsInput,
  parseStudentCsv,
  summarizePublishedResultRows,
} from "../shared/school-data.js";

const navigation = [
  ["overview", "Overview", "▦"],
  ["results", "Results", "▤"],
  ["attendance", "Attendance", "✓"],
  ["students", "Students", "♧"],
  ["teachers", "Teachers", "♙"],
  ["classes", "Classes & subjects", "▦"],
  ["profile", "School profile", "⌂"],
  ["grading", "Grading rules", "A+"],
  ["access", "Portal access", "◈"],
];

const portalData = {
  admin: {
    label: "Admin",
    title: "Your school at a glance.",
    subtitle: "A current snapshot of saved school records and results.",
  },
  teacher: {
    label: "Teacher",
    title: "Your teaching workspace.",
    subtitle: "A current view of your assigned classes and saved assessments.",
  },
  student: {
    label: "Student",
    title: "Your learning, in focus.",
    subtitle: "A current view of the results your school has published for you.",
  },
  parent: {
    label: "Parent / guardian",
    title: "Your child’s progress, in focus.",
    subtitle: "A private view of published reports for the students linked to your account.",
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
const localDateInputValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const localMonthStartInputValue = () => `${localDateInputValue().slice(0, 7)}-01`;
const accessOptions = [
  ["invite", "Invite-only portals", "Only verified people invited by a school administrator can join."],
];

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const schoolSlugFromPath = () => window.location.pathname.match(/^\/school\/([a-z0-9-]+)\/?$/i)?.[1] || "";
const copyGradingSettings = (settings) => ({
  ...settings,
  bands: settings.bands.map((band) => ({ ...band })),
});

function formatClassPosition(position) {
  if (!Number.isInteger(Number(position)) || Number(position) < 1) return "—";
  const value = Number(position);
  const remainder = value % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th");
  return `${value}${suffix}`;
}

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

function StudentReportCard({ schoolName, result, rows }) {
  const summary = summarizePublishedResultRows(rows);
  const student = rows[0];
  return <article className="student-report-card">
    <header className="student-report-print-heading">
      <strong>{schoolName}</strong>
      <h2>Term report card</h2>
      <div className="student-report-identity">
        <span><b>Student</b>{student.firstName} {student.lastName}</span>
        <span><b>Admission no.</b>{student.admissionNumber}</span>
        <span><b>Class</b>{result.grade} {result.section}</span>
        <span><b>Academic year</b>{result.academicYear}</span>
        <span><b>Term</b>{result.term}</span>
        <span><b>Published</b>{new Date(result.publishedAt).toLocaleDateString("en-NG")}</span>
      </div>
    </header>
    <div className="student-report-summary" aria-label="Report summary">
      <div><small>Overall average</small><strong>{summary.averagePercentage == null ? "—" : `${summary.averagePercentage.toFixed(2)}%`}</strong></div>
      <div><small>Overall grade</small><strong>{student.overallGrade || "—"}</strong></div>
      <div><small>Class position</small><strong>{formatClassPosition(student.classPosition)}</strong></div>
      <div><small>Total points</small><strong>{summary.earnedPoints.toLocaleString("en-NG")} / {summary.possiblePoints.toLocaleString("en-NG")}</strong></div>
      <div><small>Graded subjects</small><strong>{summary.gradedSubjectCount} / {summary.subjectCount}</strong></div>
      <div><small>Approved assessments</small><strong>{summary.assessmentCount}</strong></div>
    </div>
    <div className="table-scroll"><table className="result-sheet-table"><thead><tr><th>SUBJECT</th><th>APPROVED MARKS</th><th>ASSESSMENTS</th><th>TERM PERCENTAGE</th><th>GRADE</th></tr></thead><tbody>{rows.map((row) => <tr key={row.subject}>
      <td><strong>{row.subject}</strong></td>
      <td>{row.percentage == null ? "—" : `${Number(row.earnedPoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })} / ${Number(row.possiblePoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`}</td>
      <td>{row.assessmentCount}</td>
      <td><strong className={row.percentage == null ? "ungraded-mark" : "result-percentage"}>{row.percentage == null ? "Not graded" : `${Number(row.percentage).toFixed(2)}%`}</strong></td>
      <td><strong className={row.grade ? "result-percentage" : "ungraded-mark"}>{row.grade || "—"}</strong></td>
    </tr>)}</tbody></table></div>
    <p className="student-report-note">This report reflects the school’s published grading rules and approved marks. Class position is shown only when the configured completeness rule is satisfied; older published reports may not contain grades or positions.</p>
  </article>;
}

function HeroScene() {
  return <div className="hero-scene" aria-hidden="true">
    <span className="hs-glow" />
    <span className="hs-ring hs-ring-1" />
    <span className="hs-ring hs-ring-2" />
    <span className="hs-cube hs-cube-1"><i /><i /><i /><i /><i /><i /></span>
    <span className="hs-cube hs-cube-2"><i /><i /><i /><i /><i /><i /></span>
    <span className="hs-orb" />
    <span className="hs-core"><AsterLogoMark className="hs-logo" /></span>
  </div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("error") === "INVALID_TOKEN"
      ? "That password reset link is invalid or has expired. Request a new one below."
      : "";
  });
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const [page, setPage] = useState("overview");
  const [school, setSchool] = useState(null);
  const [schoolRouteError, setSchoolRouteError] = useState(false);
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [platformAccess, setPlatformAccess] = useState(null);
  const [platformAccessError, setPlatformAccessError] = useState("");
  const [platformOverview, setPlatformOverview] = useState(null);
  const [loadingPlatformOverview, setLoadingPlatformOverview] = useState(false);
  const [platformOverviewError, setPlatformOverviewError] = useState("");
  const [platformRefresh, setPlatformRefresh] = useState(0);
  const [platformSchoolSearchDraft, setPlatformSchoolSearchDraft] = useState("");
  const [platformSchoolSearch, setPlatformSchoolSearch] = useState("");
  const [platformSchoolPage, setPlatformSchoolPage] = useState(1);
  const [platformBillingDrafts, setPlatformBillingDrafts] = useState({});
  const [platformBillingSaving, setPlatformBillingSaving] = useState("");
  const [platformBillingFeedback, setPlatformBillingFeedback] = useState({});
  const [platformSchoolStatusSaving, setPlatformSchoolStatusSaving] = useState("");
  const [platformSchoolStatusFeedback, setPlatformSchoolStatusFeedback] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [invitationLabel, setInvitationLabel] = useState("");
  const [invitationEmailDelivery, setInvitationEmailDelivery] = useState(null);
  const [invitationData, setInvitationData] = useState(null);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationError, setInvitationError] = useState(null);
  const [invitationRefresh, setInvitationRefresh] = useState(0);
  const [busyInvitationId, setBusyInvitationId] = useState("");
  const [selectedGrade, setSelectedGrade] = useState(curriculumGrades.primary[0]);
  const [savedSubjects, setSavedSubjects] = useState({});
  const [draftSubjects, setDraftSubjects] = useState({});
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [gradingSettings, setGradingSettings] = useState(null);
  const [draftGradingSettings, setDraftGradingSettings] = useState(() => copyGradingSettings(defaultGradingSettings));
  const [loadingGradingSettings, setLoadingGradingSettings] = useState(false);
  const [savingGradingSettings, setSavingGradingSettings] = useState(false);
  const [gradingSettingsError, setGradingSettingsError] = useState("");
  const [schoolClasses, setSchoolClasses] = useState([]);
  const [classRefresh, setClassRefresh] = useState(0);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classError, setClassError] = useState("");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(localDateInputValue);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [attendanceReportFrom, setAttendanceReportFrom] = useState(localMonthStartInputValue);
  const [attendanceReportTo, setAttendanceReportTo] = useState(localDateInputValue);
  const [attendanceReportData, setAttendanceReportData] = useState(null);
  const [loadingAttendanceReport, setLoadingAttendanceReport] = useState(false);
  const [attendanceReportError, setAttendanceReportError] = useState("");
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
  const [studentImportClassId, setStudentImportClassId] = useState("");
  const [studentImportPreview, setStudentImportPreview] = useState(null);
  const [studentImportError, setStudentImportError] = useState("");
  const [studentImporting, setStudentImporting] = useState(false);
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
  const [resultSheet, setResultSheet] = useState(null);
  const [printingClassReports, setPrintingClassReports] = useState(false);
  const [loadingResultSheet, setLoadingResultSheet] = useState(false);
  const [resultSheetError, setResultSheetError] = useState("");
  const [resultSheetClassId, setResultSheetClassId] = useState("");
  const [resultSheetTerm, setResultSheetTerm] = useState("Term 1");
  const [studentResultData, setStudentResultData] = useState(null);
  const [selectedParentStudentId, setSelectedParentStudentId] = useState("");
  const [selectedStudentResultId, setSelectedStudentResultId] = useState("");
  const [loadingStudentResults, setLoadingStudentResults] = useState(false);
  const [studentResultError, setStudentResultError] = useState("");
  const [linkingStudentId, setLinkingStudentId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherRegistration, setTeacherRegistration] = useState(null);
  const [teacherRegistrationError, setTeacherRegistrationError] = useState("");
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
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(null);
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [form, setForm] = useState({ name: "", schoolType: "", country: "", email: "", accessMode: "invite" });
  const role = school?.role || "admin";
  const verifiedEmail = session?.user?.email?.trim().toLowerCase() || "";
  const platformAdmin = platformAccess?.email === verifiedEmail && platformAccess?.isPlatformAdmin === true;
  const accountRoleLabel = platformAdmin
    ? "Platform owner"
    : school
      ? portalData[role].label
      : "No school profile";
  const platformOverviewForUser = platformOverview?.email === verifiedEmail ? platformOverview : null;
  const platformDirectory = platformOverviewForUser?.directory;
  const platformDirectoryPageCount = platformDirectory
    ? Math.ceil(platformDirectory.totalCount / platformDirectory.pageSize)
    : 0;
  const platformDirectoryFirstRow = platformDirectory?.totalCount
    ? ((platformDirectory.page - 1) * platformDirectory.pageSize) + 1
    : 0;
  const platformDirectoryLastRow = platformDirectory
    ? Math.min(platformDirectory.page * platformDirectory.pageSize, platformDirectory.totalCount)
    : 0;
  const platformSchoolActionBusy = Boolean(platformBillingSaving || platformSchoolStatusSaving);
  const current = portalData[role];
  const visibleNavigation = school
    ? navigation.filter(([id]) => role === "admin" || (role === "teacher" && ["overview", "results", "attendance", "classes"].includes(id)) || (["student", "parent"].includes(role) && ["overview", "results"].includes(id)))
    : [];
  const dashboardForCurrentSchool = dashboardData && dashboardData.schoolId === school?.id ? dashboardData : null;
  const dashboardErrorForCurrentSchool = dashboardError && dashboardError.schoolId === school?.id
    ? dashboardError.message
    : "";
  const dashboardPending = dashboardLoading || (!dashboardForCurrentSchool && !dashboardErrorForCurrentSchool);
  const invitationsForCurrentSchool = invitationData && invitationData.schoolId === school?.id
    ? invitationData.invitations
    : null;
  const invitationErrorForCurrentSchool = invitationError && invitationError.schoolId === school?.id
    ? invitationError.message
    : "";
  const invitationsPending = loadingInvitations || (!invitationsForCurrentSchool && !invitationErrorForCurrentSchool);
  const selectedParentStudent = studentResultData?.children?.find((child) => child.studentId === selectedParentStudentId) || null;
  const availableStudentSheets = role === "parent"
    ? selectedParentStudent?.sheets || []
    : studentResultData?.sheets || [];
  const selectedStudentResult = availableStudentSheets.find((sheet) => sheet.id === selectedStudentResultId) || null;
  const attendanceReportForSelection = attendanceReportData
    && attendanceReportData.schoolId === school?.id
    && attendanceReportData.classId === attendanceClassId
    && attendanceReportData.from === attendanceReportFrom
    && attendanceReportData.to === attendanceReportTo
    ? attendanceReportData
    : null;
  const attendanceReportTotals = attendanceReportForSelection?.rows.reduce((totals, row) => ({
    present: totals.present + row.present,
    absent: totals.absent + row.absent,
    late: totals.late + row.late,
    excused: totals.excused + row.excused,
  }), { present: 0, absent: 0, late: 0, excused: 0 });
  const classReportGroups = useMemo(
    () => groupPublishedResultRowsByStudent(resultSheet?.rows),
    [resultSheet?.rows],
  );
  useEffect(() => {
    if (!printingClassReports) return undefined;
    const finishPrinting = () => setPrintingClassReports(false);
    document.body.classList.add("printing-class-reports");
    window.addEventListener("afterprint", finishPrinting, { once: true });
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finishPrinting);
      document.body.classList.remove("printing-class-reports");
    };
  }, [printingClassReports]);
  const dashboardSummary = dashboardForCurrentSchool?.summary;
  const dashboardAverage = dashboardSummary?.averagePercentage == null
    ? "—"
    : `${Number(dashboardSummary.averagePercentage).toFixed(1)}%`;
  const dashboardStats = role === "admin"
    ? [
      ["Active students", dashboardSummary?.studentCount ?? 0, "Active student records"],
      ["Teachers", dashboardSummary?.teacherCount ?? 0, "Registered school teachers"],
      ["Classes", dashboardSummary?.classCount ?? 0, "Classes in this school"],
      ["Awaiting review", dashboardSummary?.submittedCount ?? 0, "Submitted assessments"],
    ]
    : role === "teacher"
      ? [
        ["My students", dashboardSummary?.studentCount ?? 0, "In your assigned classes"],
        ["My classes", dashboardSummary?.classCount ?? 0, "Classes with your assignments"],
        ["To complete", dashboardSummary?.toCompleteCount ?? 0, "Draft or returned assessments"],
        ["Submitted", dashboardSummary?.submittedCount ?? 0, "Awaiting administrator review"],
      ]
      : [
        ["Subjects", dashboardSummary?.latestSubjectCount ?? 0, "In your latest published report"],
        ["Published reports", dashboardSummary?.publishedSheetCount ?? 0, "Available to your account"],
        ["Assessments", dashboardSummary?.latestAssessmentCount ?? 0, "In your latest published report"],
        ["Latest average", dashboardAverage, "Based on your latest published report"],
      ];
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
  const normalizedGradingDraft = normalizeGradingSettingsInput(draftGradingSettings);
  const gradingSettingsChanged = !gradingSettings
    || !normalizedGradingDraft
    || JSON.stringify(normalizedGradingDraft) !== JSON.stringify(gradingSettings);

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
      setSchoolRouteError(false);
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
      const requestedSlug = schoolSlugFromPath();
      const requestedSchool = requestedSlug
        ? payload.schools.find((item) => item.slug === requestedSlug)
        : null;
      if (requestedSlug) {
        setSchool(requestedSchool || null);
      } else {
        setSchool((previous) => payload.schools.find((item) => item.id === previous?.id) || payload.schools[0] || null);
      }
      setSchoolRouteError(Boolean(requestedSlug && !requestedSchool));
      try {
        if (payload.schools.length) {
          window.sessionStorage.removeItem(pendingSchoolNameKey);
        } else {
          const pendingSchoolName = window.sessionStorage.getItem(pendingSchoolNameKey)?.trim();
          if (pendingSchoolName) {
            setForm((previous) => ({ ...previous, name: pendingSchoolName }));
            setStep(1);
            setModalOpen(true);
          }
        }
      } catch {
        setToast(payload.schools.length
          ? "Your dashboard is ready, but the saved signup name could not be cleared."
          : "Your saved school name could not be restored. Choose Create school profile to enter it.");
      }
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
      if (!session?.user?.emailVerified || !verifiedEmail) {
        setPlatformAccess(null);
        setPlatformAccessError("");
        setPlatformOverview(null);
        setPage((currentPage) => currentPage === "platform" ? "overview" : currentPage);
        return () => { active = false; };
      }

      setPlatformAccess(null);
      setPlatformAccessError("");
      setPlatformOverview(null);
      apiRequest("/api/platform/access")
        .then(({ isPlatformAdmin }) => {
          if (!active) return;
          setPlatformAccess({ email: verifiedEmail, isPlatformAdmin: isPlatformAdmin === true });
          if (isPlatformAdmin !== true) {
            setPlatformOverview(null);
            setPage((currentPage) => currentPage === "platform" ? "overview" : currentPage);
          }
        })
        .catch((requestError) => {
          if (!active) return;
          setPlatformAccess({ email: verifiedEmail, isPlatformAdmin: false });
          setPlatformAccessError(requestError.message || "Could not check platform access.");
          setPlatformOverview(null);
          setPage((currentPage) => currentPage === "platform" ? "overview" : currentPage);
          setToast(`Could not check platform access: ${requestError.message || "try again later."}`);
        });
      return () => { active = false; };
  }, [session?.user?.email, session?.user?.emailVerified, verifiedEmail]);

  useEffect(() => {
    if (platformAdmin && !loadingSchools && schools.length === 0) {
      setPage("platform");
    }
  }, [platformAdmin, loadingSchools, schools.length]);

  useEffect(() => {
      let active = true;
      if (!platformAdmin || page !== "platform") {
        setLoadingPlatformOverview(false);
        return () => { active = false; };
      }

      setLoadingPlatformOverview(true);
      setPlatformOverviewError("");
      const search = encodeURIComponent(platformSchoolSearch);
      apiRequest(`/api/platform/overview?page=${platformSchoolPage}&search=${search}`)
        .then(({ overview }) => {
          if (active) setPlatformOverview({ ...overview, email: verifiedEmail });
        })
        .catch((requestError) => {
          if (!active) return;
          setPlatformOverview(null);
          setPlatformOverviewError(requestError.message || "Could not load platform operations.");
        })
        .finally(() => {
          if (active) setLoadingPlatformOverview(false);
        });
      return () => { active = false; };
  }, [platformAdmin, page, platformRefresh, platformSchoolPage, platformSchoolSearch, verifiedEmail]);

  useEffect(() => {
    setPlatformBillingDrafts({});
    setPlatformBillingFeedback({});
    setPlatformSchoolStatusFeedback({});
    setPlatformSchoolSearchDraft("");
    setPlatformSchoolSearch("");
    setPlatformSchoolPage(1);
  }, [verifiedEmail]);

  useEffect(() => {
    function restoreSchoolFromPath() {
      const requestedSlug = schoolSlugFromPath();
      const requestedSchool = requestedSlug
        ? schools.find((item) => item.slug === requestedSlug)
        : schools[0] || null;
      setSchool(requestedSchool || null);
      setSchoolRouteError(Boolean(requestedSlug && !requestedSchool));
      setPage("overview");
      setSidebarOpen(false);
    }

    window.addEventListener("popstate", restoreSchoolFromPath);
    return () => window.removeEventListener("popstate", restoreSchoolFromPath);
  }, [schools]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "overview") {
      setDashboardLoading(false);
      return () => { active = false; };
    }

    setDashboardLoading(true);
    setDashboardError(null);
    apiRequest(`/api/schools/${school.id}/dashboard`)
      .then(({ dashboard }) => {
        if (active) setDashboardData({ ...dashboard, schoolId: school.id });
      })
      .catch((requestError) => {
        if (!active) return;
        setDashboardData(null);
        setDashboardError({
          schoolId: school.id,
          message: requestError.message || "Could not load the school overview.",
        });
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => { active = false; };
  }, [school?.id, role, page, assessmentRefresh, studentRefresh, classRefresh, assignmentRefresh, dashboardRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || role !== "admin" || page !== "access") {
      setLoadingInvitations(false);
      return () => { active = false; };
    }

    setLoadingInvitations(true);
    setInvitationError(null);
    apiRequest(`/api/schools/${school.id}/invitations`)
      .then(({ invitations }) => {
        if (active) setInvitationData({ schoolId: school.id, invitations });
      })
      .catch((requestError) => {
        if (!active) return;
        setInvitationData(null);
        setInvitationError({
          schoolId: school.id,
          message: requestError.message || "Could not load school invitations.",
        });
      })
      .finally(() => {
        if (active) setLoadingInvitations(false);
      });
    return () => { active = false; };
  }, [school?.id, role, page, invitationRefresh]);

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
    if (!school?.id || role !== "admin" || page !== "grading") {
      setLoadingGradingSettings(false);
      return () => { active = false; };
    }

    setLoadingGradingSettings(true);
    setGradingSettingsError("");
    setGradingSettings(null);
    setDraftGradingSettings(copyGradingSettings(defaultGradingSettings));
    apiRequest(`/api/schools/${school.id}/grading-settings`)
      .then(({ settings }) => {
        const normalized = normalizeGradingSettingsInput(settings);
        if (!normalized) throw new Error("The saved grading rules are invalid. Contact support before publishing results.");
        if (!active) return;
        setGradingSettings(normalized);
        setDraftGradingSettings(copyGradingSettings(normalized));
      })
      .catch((requestError) => {
        if (active) setGradingSettingsError(requestError.message || "Could not load grading rules.");
      })
      .finally(() => {
        if (active) setLoadingGradingSettings(false);
      });
    return () => { active = false; };
  }, [school?.id, role, page]);

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
    if (page !== "attendance" || loadingClasses) return;
    if (!schoolClasses.some((item) => item.id === attendanceClassId)) {
      setAttendanceClassId(schoolClasses[0]?.id || "");
    }
  }, [page, loadingClasses, schoolClasses, attendanceClassId]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "attendance" || !attendanceClassId || !attendanceDate) {
      setAttendanceData(null);
      setLoadingAttendance(false);
      setAttendanceError("");
      return () => { active = false; };
    }

    setLoadingAttendance(true);
    setAttendanceError("");
    setAttendanceData(null);
    const query = new URLSearchParams({ classId: attendanceClassId, date: attendanceDate });
    apiRequest(`/api/schools/${school.id}/attendance?${query}`)
      .then(({ attendance }) => {
        if (active) {
          setAttendanceData({
            schoolId: school.id,
            classId: attendanceClassId,
            date: attendanceDate,
            ...attendance,
          });
        }
      })
      .catch((requestError) => {
        if (active) setAttendanceError(requestError.message || "Could not load class attendance.");
      })
      .finally(() => {
        if (active) setLoadingAttendance(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, attendanceClassId, attendanceDate, attendanceRefresh]);

  useEffect(() => {
    if (page !== "results" || ["student", "parent"].includes(role) || loadingClasses) return;
    if (!schoolClasses.some((item) => item.id === resultSheetClassId)) {
      setResultSheetClassId(schoolClasses[0]?.id || "");
    }
  }, [page, role, loadingClasses, schoolClasses, resultSheetClassId]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "results" || ["student", "parent"].includes(role) || !resultSheetClassId) {
      setResultSheet(null);
      setLoadingResultSheet(false);
      return () => { active = false; };
    }

    setLoadingResultSheet(true);
    setResultSheetError("");
    const query = new URLSearchParams({ classId: resultSheetClassId, term: resultSheetTerm });
    apiRequest(`/api/schools/${school.id}/result-sheet?${query}`)
      .then((data) => {
        if (active) setResultSheet(data);
      })
      .catch((requestError) => {
        if (!active) return;
        setResultSheet(null);
        setResultSheetError(requestError.message || "Could not load the result sheet.");
      })
      .finally(() => {
        if (active) setLoadingResultSheet(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, resultSheetClassId, resultSheetTerm, assessmentRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "results" || !["student", "parent"].includes(role)) {
      setStudentResultData(null);
      setSelectedParentStudentId("");
      setSelectedStudentResultId("");
      setLoadingStudentResults(false);
      return () => { active = false; };
    }

    setLoadingStudentResults(true);
    setStudentResultError("");
    apiRequest(`/api/schools/${school.id}/my-results`)
      .then((data) => {
        if (!active) return;
        setStudentResultData(data);
        if (role === "parent") {
          const child = data.children[0];
          setSelectedParentStudentId(child?.studentId || "");
          setSelectedStudentResultId((previous) => (
            child?.sheets.some((sheet) => sheet.id === previous)
              ? previous
              : child?.sheets[0]?.id || ""
          ));
        } else {
          setSelectedStudentResultId((previous) => (
            data.sheets.some((sheet) => sheet.id === previous)
              ? previous
              : data.sheets[0]?.id || ""
          ));
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setStudentResultData(null);
        setStudentResultError(requestError.message || "Could not load your published results.");
      })
      .finally(() => {
        if (active) setLoadingStudentResults(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role]);

  useEffect(() => {
    let active = true;
    const shouldLoadAssignments = (page === "teachers" && role === "admin")
      || (page === "classes" && role === "teacher")
      || (page === "results" && !["student", "parent"].includes(role));
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
    if (!school?.id || page !== "results" || ["student", "parent"].includes(role)) {
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
    if (!school?.id || page !== "results" || ["student", "parent"].includes(role) || !selectedAssessmentId) {
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

  // Pointer-tracked 3D tilt: one delegated listener drives every .tilt-3d surface.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    let active = null;
    const reset = (element) => {
      element.style.removeProperty("--tilt-x");
      element.style.removeProperty("--tilt-y");
      element.style.removeProperty("--glare-x");
      element.style.removeProperty("--glare-y");
      element.classList.remove("is-live");
    };
    const onMove = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const surface = event.target.closest?.(".tilt-3d") || null;
      if (active && active !== surface) { reset(active); active = null; }
      if (!surface) return;
      active = surface;
      const rect = surface.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      surface.style.setProperty("--tilt-x", `${(-py * 7).toFixed(2)}deg`);
      surface.style.setProperty("--tilt-y", `${(px * 9).toFixed(2)}deg`);
      surface.style.setProperty("--glare-x", `${((px + 0.5) * 100).toFixed(1)}%`);
      surface.style.setProperty("--glare-y", `${((py + 0.5) * 100).toFixed(1)}%`);
      surface.classList.add("is-live");
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (active) reset(active);
    };
  }, []);

  function showSetup() {
    setError("");
    setStep(1);
    setModalOpen(true);
  }

  function switchSchool(schoolId) {
    const nextSchool = schools.find((item) => item.id === schoolId);
    if (!nextSchool || nextSchool.id === school?.id) return;
    window.history.pushState(null, "", nextSchool.portalUrl || `/school/${nextSchool.slug}`);
    setSchool(nextSchool);
    setSchoolRouteError(false);
    setPage("overview");
    setSidebarOpen(false);
    setToast(`Switched to ${nextSchool.name}.`);
  }

  function updatePlatformBillingDraft(schoolRow, field, value) {
    setPlatformBillingDrafts((previous) => {
      const current = previous[schoolRow.id] || {
        billingStatus: schoolRow.billingStatus || "pending",
        planId: schoolRow.planId || "",
      };
      return {
        ...previous,
        [schoolRow.id]: {
          ...current,
          [field]: value,
          ...(field === "billingStatus" && value !== "paid" ? { planId: "" } : {}),
        },
      };
    });
    setPlatformBillingFeedback((previous) => ({ ...previous, [schoolRow.id]: null }));
  }

  async function savePlatformBillingDecision(schoolRow) {
    const draft = platformBillingDrafts[schoolRow.id] || {
      billingStatus: schoolRow.billingStatus || "pending",
      planId: schoolRow.planId || "",
    };
    if (draft.billingStatus === "paid" && !draft.planId) {
      setPlatformBillingFeedback((previous) => ({
        ...previous,
        [schoolRow.id]: { message: "Choose a plan before saving a paid status.", error: true },
      }));
      return;
    }

    setPlatformBillingSaving(schoolRow.id);
    setPlatformBillingFeedback((previous) => ({ ...previous, [schoolRow.id]: null }));
    try {
      const { billingSetting } = await apiRequest(`/api/platform/schools/${schoolRow.id}/billing`, {
        method: "PUT",
        body: JSON.stringify({
          billingStatus: draft.billingStatus,
          planId: draft.billingStatus === "paid" ? draft.planId : null,
        }),
      });
      setPlatformOverview((previous) => previous ? {
        ...previous,
        schools: previous.schools.map((row) => row.id === schoolRow.id
          ? { ...row, ...billingSetting }
          : row),
      } : previous);
      setPlatformBillingDrafts((previous) => ({
        ...previous,
        [schoolRow.id]: {
          billingStatus: billingSetting.billingStatus,
          planId: billingSetting.planId || "",
        },
      }));
      setPlatformBillingFeedback((previous) => ({
        ...previous,
        [schoolRow.id]: { message: "Saved. No charge or access change was made.", error: false },
      }));
    } catch (requestError) {
      setPlatformBillingFeedback((previous) => ({
        ...previous,
        [schoolRow.id]: {
          message: requestError.message || "Could not save this billing decision.",
          error: true,
        },
      }));
    } finally {
      setPlatformBillingSaving("");
    }
  }

  async function setPlatformSchoolArchived(schoolRow, archived) {
    if (archived && !window.confirm(
      `Archive ${schoolRow.name}? School access will stop, but all records will be preserved and can be restored.`,
    )) return;

    setPlatformSchoolStatusSaving(schoolRow.id);
    setPlatformSchoolStatusFeedback((previous) => ({ ...previous, [schoolRow.id]: null }));
    try {
      const { schoolStatus } = await apiRequest(`/api/platform/schools/${schoolRow.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      setPlatformOverview((previous) => previous ? {
        ...previous,
        schools: previous.schools.map((row) => row.id === schoolRow.id
          ? { ...row, archivedAt: schoolStatus.archivedAt }
          : row),
      } : previous);

      if (archived) {
        setSchools((previous) => previous.filter((item) => item.id !== schoolRow.id));
        if (school?.id === schoolRow.id) {
          window.history.replaceState(null, "", "/");
          setSchool(null);
        }
      } else {
        try {
          const { schools: memberships } = await apiRequest("/api/schools");
          setSchools(memberships);
        } catch (refreshError) {
          setPlatformSchoolStatusFeedback((previous) => ({
            ...previous,
            [schoolRow.id]: {
              message: `School restored, but your workspace list could not refresh. Reload to update it. ${refreshError.message || ""}`.trim(),
              error: true,
            },
          }));
          return;
        }
      }

      setPlatformSchoolStatusFeedback((previous) => ({
        ...previous,
        [schoolRow.id]: {
          message: archived
            ? "School archived. Access is disabled; all records are preserved."
            : "School restored. Existing members can access it again.",
          error: false,
        },
      }));
    } catch (requestError) {
      setPlatformSchoolStatusFeedback((previous) => ({
        ...previous,
        [schoolRow.id]: {
          message: requestError.message || "Could not update this school.",
          error: true,
        },
      }));
    } finally {
      setPlatformSchoolStatusSaving("");
    }
  }

  async function createSchool(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const createdFromPlatform = page === "platform";
    try {
      const payload = await apiRequest("/api/schools", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSchool(payload.school);
      setSchools((previous) => [payload.school, ...previous]);
      window.history.replaceState(null, "", payload.school.portalUrl);
      setSchoolRouteError(false);
      if (createdFromPlatform) setPage("overview");
      setModalOpen(false);
      setToast(`School profile created for ${payload.school.name}.`);
      setForm({ name: "", schoolType: "", country: "", email: "", accessMode: "invite" });
    } catch (requestError) {
      setError(requestError.message || "The API could not be reached. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function registerTeacher(event) {
    event.preventDefault();
    if (!school) return;
    setInviting(true);
    setTeacherRegistrationError("");
    setTeacherRegistration(null);
    try {
      const payload = await apiRequest(`/api/schools/${school.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: "teacher", teacherName }),
      });
      const emailDelivery = payload.emailDelivery || {
        status: "unavailable",
        message: "Email delivery status is unavailable. Copy the activation link and send it manually.",
      };
      setTeacherRegistration({
        ...payload.invitation,
        emailDelivery,
        activationUrl: `${window.location.origin}${school.portalUrl || `/school/${school.slug}`}#invite=${encodeURIComponent(payload.invitation.token)}`,
      });
      setTeacherName("");
      setInviteEmail("");
      setToast(emailDelivery.message);
    } catch (requestError) {
      setTeacherRegistrationError(requestError.message || "Could not register this teacher.");
    } finally {
      setInviting(false);
    }
  }

  async function copyTeacherActivationLink() {
    try {
      await navigator.clipboard.writeText(teacherRegistration.activationUrl);
      setToast(teacherRegistration.emailDelivery.status === "sent"
        ? "Teacher activation link copied as a backup."
        : "Teacher activation link copied. Send it to the teacher’s registered email.");
    } catch {
      setToast(teacherRegistration.emailDelivery.status === "sent"
        ? "The teacher was emailed. You can copy the activation link from the field as a backup."
        : "Copy the activation link and send it to the teacher’s registered email.");
    }
  }

  async function inviteStudent(student) {
    if (!school || student.portalEmail) return;
    const email = window.prompt(
      `Enter the verified student or authorised guardian email for ${student.firstName} ${student.lastName}.`,
      student.guardianEmail || "",
    );
    if (email === null) return;
    if (!email.trim()) {
      setStudentError("Enter an email address to create student portal access.");
      return;
    }

    setLinkingStudentId(student.id);
    setStudentError("");
    setError("");
    setInvitationUrl("");
    setInvitationEmailDelivery(null);
    try {
      const payload = await apiRequest(`/api/schools/${school.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role: "student", studentId: student.id }),
      });
      const emailDelivery = payload.emailDelivery || {
        status: "unavailable",
        message: "Email delivery status is unavailable. Copy the activation link and send it manually.",
      };
      setInvitationUrl(`${window.location.origin}${school.portalUrl || `/school/${school.slug}`}#invite=${encodeURIComponent(payload.invitation.token)}`);
      setInvitationLabel(`Student portal access for ${student.firstName} ${student.lastName} · ${payload.invitation.email}`);
      setInvitationEmailDelivery(emailDelivery);
      setPage("access");
      setToast(emailDelivery.message);
    } catch (requestError) {
      setStudentError(requestError.message || "Could not create student portal access.");
    } finally {
      setLinkingStudentId("");
    }
  }

  async function publishResultSheet() {
    if (!school || !resultSheetClassId || resultSheet?.published) return;
    if (!window.confirm(`Publish and freeze ${resultSheet.schoolClass.grade} ${resultSheet.schoolClass.section} · ${resultSheetTerm}?`)) return;
    setResultSheetError("");
    try {
      await apiRequest(`/api/schools/${school.id}/result-sheet/publish`, {
        method: "POST",
        body: JSON.stringify({ classId: resultSheetClassId, term: resultSheetTerm }),
      });
      setAssessmentRefresh((previous) => previous + 1);
      setToast("Result sheet published. This term's results are now frozen.");
    } catch (requestError) {
      setResultSheetError(requestError.message || "Could not publish the result sheet.");
    }
  }

  async function saveAttendance() {
    if (!school || !attendanceData?.rows.length || attendanceData.rows.some((row) => !row.status)) return;
    setSavingAttendance(true);
    setAttendanceError("");
    try {
      const { savedCount } = await apiRequest(`/api/schools/${school.id}/attendance`, {
        method: "PUT",
        body: JSON.stringify({
          classId: attendanceClassId,
          date: attendanceDate,
          marks: attendanceData.rows.map(({ studentId, status }) => ({ studentId, status })),
        }),
      });
      setToast(`Attendance saved for ${savedCount} ${savedCount === 1 ? "student" : "students"}.`);
      setAttendanceRefresh((previous) => previous + 1);
    } catch (requestError) {
      setAttendanceError(requestError.message || "Could not save class attendance.");
    } finally {
      setSavingAttendance(false);
    }
  }

  async function generateAttendanceReport(event) {
    event.preventDefault();
    if (!school || !attendanceClassId || !attendanceReportFrom || !attendanceReportTo) return;
    setLoadingAttendanceReport(true);
    setAttendanceReportError("");
    setAttendanceReportData(null);
    const query = new URLSearchParams({
      classId: attendanceClassId,
      from: attendanceReportFrom,
      to: attendanceReportTo,
    });
    try {
      const { report } = await apiRequest(`/api/schools/${school.id}/attendance/report?${query}`);
      setAttendanceReportData({
        schoolId: school.id,
        classId: attendanceClassId,
        from: attendanceReportFrom,
        to: attendanceReportTo,
        ...report,
      });
    } catch (requestError) {
      setAttendanceReportError(requestError.message || "Could not generate the attendance report.");
    } finally {
      setLoadingAttendanceReport(false);
    }
  }

  function setAttendanceStatus(studentId, status) {
    setAttendanceData((previous) => previous && ({
      ...previous,
      rows: previous.rows.map((row) => row.studentId === studentId ? { ...row, status } : row),
    }));
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

  function updateGradingBand(index, field, value) {
    setDraftGradingSettings((previous) => ({
      ...previous,
      bands: previous.bands.map((band, bandIndex) => (
        bandIndex === index ? { ...band, [field]: value } : band
      )),
    }));
  }

  function addGradingBand() {
    setDraftGradingSettings((previous) => {
      if (previous.bands.length >= 12) return previous;
      const usedLabels = new Set(previous.bands.map((band) => band.label.toUpperCase()));
      let suffix = 1;
      while (usedLabels.has(`G${suffix}`)) suffix += 1;
      const usedMinimums = new Set(previous.bands.map((band) => Number(band.minimum)));
      const minimum = Array.from({ length: 101 }, (_, score) => score).find((score) => !usedMinimums.has(score));
      if (minimum === undefined) return previous;
      return {
        ...previous,
        bands: [...previous.bands, { label: `G${suffix}`, minimum }],
      };
    });
  }

  function removeGradingBand(index) {
    setDraftGradingSettings((previous) => ({
      ...previous,
      bands: previous.bands.filter((_band, bandIndex) => bandIndex !== index),
    }));
  }

  async function saveGradingSettings() {
    if (!school || !normalizedGradingDraft) {
      setGradingSettingsError("Use unique grade labels and score thresholds, and keep a band beginning at 0.");
      return;
    }

    setSavingGradingSettings(true);
    setGradingSettingsError("");
    try {
      const { settings } = await apiRequest(`/api/schools/${school.id}/grading-settings`, {
        method: "PUT",
        body: JSON.stringify(normalizedGradingDraft),
      });
      const normalized = normalizeGradingSettingsInput(settings);
      if (!normalized) throw new Error("The saved grading rules could not be verified.");
      setGradingSettings(normalized);
      setDraftGradingSettings(copyGradingSettings(normalized));
      setToast("Grading rules saved. Published reports keep their original grading snapshot.");
    } catch (requestError) {
      setGradingSettingsError(requestError.message || "Could not save grading rules.");
    } finally {
      setSavingGradingSettings(false);
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
      setClassRefresh((previous) => previous + 1);
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
      setClassRefresh((previous) => previous + 1);
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

  function downloadStudentImportTemplate() {
    const template = "firstName,lastName,admissionNumber,guardianEmail,guardianPhone\r\n";
    const objectUrl = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "aster-student-import-template.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  async function previewStudentImport(event) {
    const file = event.target.files?.[0];
    setStudentImportError("");
    setStudentImportPreview(null);
    if (!file) return;
    if (file.size > 1_000_000) {
      setStudentImportError("Choose a CSV file smaller than 1 MB.");
      event.target.value = "";
      return;
    }

    try {
      const parsed = parseStudentCsv(await file.text());
      setStudentImportPreview({ fileName: file.name, ...parsed });
    } catch (requestError) {
      setStudentImportError(requestError.message || "Could not read the selected CSV file.");
      event.target.value = "";
    }
  }

  async function importStudentsFromCsv() {
    if (!school || !studentImportClassId || !studentImportPreview?.students.length
      || studentImportPreview.errors.length) {
      setStudentImportError("Choose a class and resolve all CSV preview errors before importing.");
      return;
    }

    const requestBody = JSON.stringify({
      classId: studentImportClassId,
      students: studentImportPreview.students,
    });
    if (new Blob([requestBody]).size > 120 * 1024) {
      setStudentImportError("This batch is too large to send at once. Remove some rows and import them in smaller batches.");
      return;
    }

    setStudentImporting(true);
    setStudentImportError("");
    try {
      const { importedCount } = await apiRequest(`/api/schools/${school.id}/students/import`, {
        method: "POST",
        body: requestBody,
      });
      setStudentImportPreview(null);
      const fileInput = document.getElementById("studentImportFile");
      if (fileInput) fileInput.value = "";
      setStudentPage(1);
      setStudentRefresh((previous) => previous + 1);
      setClassRefresh((previous) => previous + 1);
      setDashboardRefresh((previous) => previous + 1);
      setToast(`${importedCount} student${importedCount === 1 ? "" : "s"} imported successfully.`);
    } catch (requestError) {
      setStudentImportError(requestError.message || "Could not import the student records.");
    } finally {
      setStudentImporting(false);
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

  async function inviteParent(student) {
    if (!school || !student.guardianEmail || student.isParentPortalLinked || student.parentInvitationPending) return;
    setLinkingStudentId(student.id);
    setStudentError("");
    setInvitationUrl("");
    setInvitationEmailDelivery(null);
    try {
      const payload = await apiRequest(`/api/schools/${school.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email: student.guardianEmail,
          role: "parent",
          studentId: student.id,
        }),
      });
      const emailDelivery = payload.emailDelivery || {
        status: "unavailable",
        message: "Email delivery status is unavailable. Copy the activation link and send it manually.",
      };
      setInvitationUrl(`${window.location.origin}${school.portalUrl || `/school/${school.slug}`}#invite=${encodeURIComponent(payload.invitation.token)}`);
      setInvitationLabel(`Parent portal access for ${student.firstName} ${student.lastName} · ${payload.invitation.email}`);
      setInvitationEmailDelivery(emailDelivery);
      setPage("access");
      setToast(emailDelivery.message);
    } catch (requestError) {
      setStudentError(requestError.message || "Could not create parent portal access.");
    } finally {
      setLinkingStudentId("");
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setToast(invitationEmailDelivery?.status === "sent"
        ? "Invitation link copied as a backup."
        : "Invitation link copied. Send it to the invited email address.");
    } catch {
      setToast(invitationEmailDelivery?.status === "sent"
        ? "The invitation was emailed. You can copy the link from the field as a backup."
        : "Copy the invitation link from the field and send it to the invited email address.");
    }
  }

  async function renewInvitation(invitation) {
    if (!school || !window.confirm(`Create a fresh seven-day link for ${invitation.email}? Any previous activation link for this invitation will stop working.`)) return;
    setBusyInvitationId(invitation.id);
    setInvitationError(null);
    try {
      const { invitation: renewed, emailDelivery } = await apiRequest(
        `/api/schools/${school.id}/invitations/${invitation.id}/resend`,
        { method: "POST" },
      );
      const delivery = emailDelivery || {
        status: "unavailable",
        message: "Email delivery status is unavailable. Copy the new activation link and send it manually.",
      };
      const invitee = renewed.teacherName || invitation.inviteeName || invitation.email;
      setInvitationLabel(`${renewed.role === "teacher" ? "Teacher" : "Student"} activation for ${invitee} · ${renewed.email}`);
      setInvitationUrl(`${window.location.origin}${school.portalUrl || `/school/${school.slug}`}#invite=${encodeURIComponent(renewed.token)}`);
      setInvitationEmailDelivery(delivery);
      setInvitationRefresh((previous) => previous + 1);
      setToast(delivery.message);
    } catch (requestError) {
      setInvitationError({
        schoolId: school.id,
        message: requestError.message || "Could not create a replacement invitation link.",
      });
    } finally {
      setBusyInvitationId("");
    }
  }

  async function revokeInvitation(invitation) {
    if (!school || !window.confirm(`Revoke the invitation for ${invitation.email}? Its activation link will stop working.`)) return;
    setBusyInvitationId(invitation.id);
    setInvitationError(null);
    try {
      await apiRequest(`/api/schools/${school.id}/invitations/${invitation.id}`, { method: "DELETE" });
      setInvitationUrl("");
      setInvitationLabel("");
      setInvitationEmailDelivery(null);
      setInvitationRefresh((previous) => previous + 1);
      setToast(`Invitation for ${invitation.email} revoked.`);
    } catch (requestError) {
      setInvitationError({
        schoolId: school.id,
        message: requestError.message || "Could not revoke this invitation.",
      });
    } finally {
      setBusyInvitationId("");
    }
  }

  async function restoreSession({ schoolName = "", signInData = null } = {}) {
    const result = await authClient.getSession();
    if (result.error) throw new Error(result.error.message || "Could not load your account.");
    let session = result.data?.session || null;
    if (!session?.user && signInData) {
      // The sign-in response may already carry the user/session; use it as a
      // fallback when the session cookie is not yet readable by getSession.
      const user = signInData.user || signInData.session?.user || null;
      if (user) {
        session = {
          ...(signInData.session || {}),
          user,
          token: signInData.session?.token || signInData.token || null,
        };
      }
    }
    if (!session?.user) throw new Error("Sign in to continue.");
    if (schoolName) {
      setForm((previous) => ({ ...previous, name: schoolName }));
      setStep(1);
      setModalOpen(true);
    }
    setAuthNotice("");
    setSession(session);
  }

  async function signOut() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
      setSession(null);
      setSchools([]);
      setSchool(null);
      setSchoolRouteError(false);
      setAuthNotice("");
    } catch (requestError) {
      setToast(requestError.message || "Could not sign out. Please try again.");
    }
  }

  function exportResultSheet() {
    if (!resultSheet?.rows.length) return;
    const csvCell = (value) => {
      const text = String(value ?? "");
      const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["School", school.name],
      ["Class", `${resultSheet.schoolClass.grade} ${resultSheet.schoolClass.section}`],
      ["Academic year", resultSheet.schoolClass.academicYear],
      ["Term", resultSheet.term],
      ["Calculation", "Sum of approved marks / sum of possible marks"],
      [],
      ["Student", "Admission number", "Subject", "Approved marks", "Possible marks", "Percentage", "Grade", "Overall percentage", "Overall grade", "Class position", "Approved assessments"],
      ...resultSheet.rows.map((row) => [
        `${row.firstName} ${row.lastName}`,
        row.admissionNumber,
        row.subject,
        row.earnedPoints ?? "",
        row.possiblePoints ?? "",
        row.percentage == null ? "" : `${row.percentage}%`,
        row.grade || "",
        row.overallPercentage == null ? "" : `${row.overallPercentage}%`,
        row.overallGrade || "",
        row.classPosition == null ? "" : formatClassPosition(row.classPosition),
        row.assessmentCount,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.href = objectUrl;
    const className = `${resultSheet.schoolClass.grade}-${resultSheet.schoolClass.section}`.replace(/[^a-z0-9-]+/gi, "-");
    link.download = `aster-result-sheet-${className}-${resultSheet.term.toLowerCase().replace(" ", "-")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setToast("The result sheet has been exported.");
  }

  function printResultSheet() {
    if (resultSheet?.rows.length) window.print();
  }

  function printClassReportCards() {
    if (role === "admin" && resultSheet?.published && classReportGroups.length) {
      setPrintingClassReports(true);
    }
  }

  function printStudentReport() {
    if (selectedStudentResult?.rows.length) window.print();
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
    return (
      <>
        <EducationBackground variant="dark" />
        <AuthScreen
          authClient={authClient}
          notice={authNotice}
          initialEmail={session?.user?.email}
          verificationRequired={Boolean(session?.user && !session.user.emailVerified)}
          onAuthenticated={restoreSession}
          onWatchVideo={() => setExplainerOpen(true)}
          resetToken={resetToken}
        />
        <ExplainerVideo open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      </>
    );
  }
  if (loadingSchools) {
    return <main className="auth-shell"><p className="auth-description">Loading your school workspace…</p></main>;
  }
  if (schoolRouteError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>School workspace unavailable</h1>
          <p className="auth-description">This link is for a school workspace your verified account does not belong to. Ask that school’s administrator to invite you, or return to your own school.</p>
          <a className="button button-primary" href="/">Go to my school</a>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <EducationBackground variant="light" />
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <a className="brand" href="#" aria-label="Aster home"><AsterLogoMark /><span className="brand-name">aster<span>.</span></span></a>
        {schools.length ? <>
          <label className="school-switcher">
            <span className="school-avatar">{school?.name?.[0]?.toUpperCase() || "S"}</span>
            <span className="school-switcher-copy"><strong>{school?.name || "Select a school"}</strong><small>{school?.schoolType || "Your school workspaces"}</small></span>
            <span className="chevron" aria-hidden="true">⌄</span>
            <select className="school-switcher-select" aria-label="Switch school workspace" value={school?.id || ""} onChange={(event) => switchSchool(event.target.value)}>
              {schools.map((item) => <option key={item.id} value={item.id}>{item.name} · {portalData[item.role]?.label || item.role}</option>)}
            </select>
          </label>
          <button className="school-create-link" type="button" onClick={showSetup}>＋ Add another school</button>
        </> : platformAdmin ? <div className="school-switcher">
          <span className="school-avatar">◈</span>
          <span className="school-switcher-copy"><strong>Platform account</strong><small>No school profile linked</small></span>
        </div> : <button className="school-switcher" type="button" onClick={showSetup} disabled={loadingSchools}>
          <span className="school-avatar">＋</span>
          <span className="school-switcher-copy"><strong>{loadingSchools ? "Loading schools…" : "Set up your school"}</strong><small>Create your school profile</small></span><span className="chevron">⌄</span>
        </button>}
        {visibleNavigation.length > 0 && <>
          <div className="nav-label">WORKSPACE</div>
          <nav className="main-nav" aria-label="Main navigation">
            {visibleNavigation.slice(0, role === "admin" ? 6 : visibleNavigation.length).map(([id, label, icon]) => (
              <button key={id} className={`nav-item ${page === id ? "active" : ""}`} type="button" onClick={() => { setPage(id); setSidebarOpen(false); }}>
                <span className="nav-symbol">{icon}</span><span>{label}</span>
              </button>
            ))}
          </nav>
        </>}
        {role === "admin" && school && <>
          <div className="nav-label nav-label-lower">SCHOOL</div>
          <nav className="main-nav" aria-label="School settings">
            {visibleNavigation.slice(6).map(([id, label, icon]) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} type="button" onClick={() => { setPage(id); setSidebarOpen(false); }}><span className="nav-symbol">{icon}</span><span>{label}</span></button>)}
          </nav>
        </>}
        {platformAdmin && <>
          <div className="nav-label nav-label-lower">PLATFORM</div>
          <nav className="main-nav" aria-label="Platform operations">
            <button className={`nav-item ${page === "platform" ? "active" : ""}`} type="button" onClick={() => { setPage("platform"); setSidebarOpen(false); }}>
              <span className="nav-symbol">◈</span><span>Platform operations</span>
            </button>
          </nav>
        </>}
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-spark">✳</span><strong>A little help goes a long way.</strong><span>Visit the Aster help desk</span><button type="button" onClick={() => setToast("Aster Help Desk — support@aster.school")}>Get help ↗</button><button className="help-video" type="button" onClick={() => setExplainerOpen(true)}><span aria-hidden="true">▶</span> Watch how Aster works</button></div>
          <div className="user-profile"><span className="user-avatar">{userInitials}</span><span className="user-copy"><strong>{userName}</strong><small className="user-email">{verifiedEmail}</small><small>{accountRoleLabel}</small></span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" type="button" aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><span aria-hidden="true">{sidebarOpen ? "×" : "☰"}</span></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{page}</strong></div><div className="topbar-actions"><button className="topbar-video" type="button" onClick={() => setExplainerOpen(true)}><span aria-hidden="true">▶</span> How it works</button><span className="role-select" aria-label={platformAdmin ? "Your platform role" : school ? "Your school role" : "Account status"}>{accountRoleLabel}</span><button className="icon-button" type="button" onClick={() => setToast("You’re all caught up on school notifications.")} aria-label="Notifications">♧</button><button className="topbar-signout" type="button" aria-label={`Sign out ${userName}`} onClick={signOut}>Sign out</button></div></header>
        <div key={page} className={`page-content page-view ${page === "classes" ? "curriculum-page" : page === "students" ? "students-page" : page === "teachers" ? "teachers-page" : page === "results" ? "results-page" : page === "attendance" ? "attendance-page" : page === "grading" ? "grading-page" : page === "platform" ? "platform-page" : ""}`}>
          <span className="route-sweep" aria-hidden="true" />
          {!school && !(page === "platform" && platformAdmin) ? <section className="panel onboarding-panel"><span className="auth-kicker">WELCOME TO ASTER</span><h1>{platformAdmin ? "Platform owner access" : "No school profile linked"}</h1><p className="page-subtitle">{platformAdmin ? "Your platform workspace is ready. You can create schools from Platform operations when needed." : "Your account is not linked to a school workspace. Platform-owner access is available only to approved email addresses."}</p>{platformAccessError && <p className="form-error" role="alert">Could not check platform access: {platformAccessError}</p>}{platformAccess?.email === verifiedEmail && !platformAccess.isPlatformAdmin && <p className="field-hint" role="status">Platform-owner access has not been confirmed for this account. You can create a school profile later if you need one.</p>}{!platformAdmin && <button className="button button-primary" type="button" onClick={showSetup}>＋ Create school profile</button>}</section> : <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> {currentDateLabel} <span className="eyebrow-divider">·</span> {page === "platform" ? "PLATFORM OPERATIONS" : "SCHOOL WORKSPACE"}</div><h1>{page === "platform" ? "Platform operations" : page === "overview" ? role === "admin" ? `Good morning, ${userName}` : current.title : page === "results" ? role === "student" ? "Results, at a glance" : role === "parent" ? "Your children’s results" : "Result sheet & assessments" : page === "attendance" ? "Daily attendance" : page === "profile" ? "Your school, your story." : page === "classes" ? "Classes & subjects" : page === "grading" ? "Grading rules" : page === "students" ? "Student register" : `${page[0].toUpperCase()}${page.slice(1)}`} <span className="wave">✳</span></h1><p className="page-subtitle">{page === "platform" ? "Monitor aggregate school activity across Aster without opening individual student records." : page === "overview" ? current.subtitle : page === "results" && role === "student" ? "View only the term results your school has published for your linked student record." : page === "results" && role === "parent" ? "View only published reports for children linked to your verified parent account." : page === "results" && role !== "student" && role !== "parent" ? role === "admin" ? "Calculate term percentages from approved marks, publish frozen result sheets, and review submissions." : "View calculated results and enter marks for your assigned classes." : page === "attendance" ? "Record and review daily attendance for your active class roster." : page === "classes" ? "Configure subjects and organise your classes." : page === "grading" ? "Set the grade bands and class-position rules used for new result publications." : page === "students" ? "Enrol students and keep their school records up to date." : `Keep your ${page} organised for the term ahead.`}</p></div>
            {page === "overview" && <HeroScene />}
            {page !== "platform" && page !== "classes" && page !== "students" && page !== "teachers" && page !== "results" && page !== "attendance" && page !== "grading" && !(page === "overview" && role === "parent") && <div className="welcome-actions"><button className="button button-secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${school.portalUrl || `/school/${school.slug}`}`); setToast("Your school workspace link has been copied. Only invited school members can access it."); } catch { setToast("Could not copy the school link. Please try again."); } }}>↗ Copy school workspace link</button><button className="button button-primary" type="button" onClick={() => page === "profile" ? showSetup() : page === "access" ? document.getElementById("inviteEmail")?.focus() : setPage(role === "admin" ? "students" : "results")}>＋ {page === "access" ? "Invite a member" : role === "teacher" ? "Enter marks" : ["student", "parent"].includes(role) ? role === "parent" ? "View child results" : "View my results" : "Add a student"}</button></div>}
          </section>

          {page === "platform" && platformAdmin && <section className="platform-overview">
            <section className="panel platform-summary-panel">
              <div className="panel-heading"><div><h2>School network</h2><p>Aggregate operational counts across all Aster schools.</p></div><div className="platform-summary-actions"><button className="button button-primary button-small" type="button" onClick={showSetup}>＋ Add school</button><button className="button button-secondary button-small" type="button" onClick={() => { setPlatformBillingDrafts({}); setPlatformBillingFeedback({}); setPlatformSchoolStatusFeedback({}); setPlatformRefresh((previous) => previous + 1); }} disabled={loadingPlatformOverview || platformSchoolActionBusy}>Refresh</button></div></div>
              {platformOverviewError && <p className="form-error" role="alert">{platformOverviewError}</p>}
              {loadingPlatformOverview && <p className="empty-search" role="status">Loading platform overview…</p>}
              {!loadingPlatformOverview && platformOverviewForUser && <>
                <section className="stats-grid" aria-label="Platform summary">
                  {[
                    ["Schools", platformOverviewForUser.summary.schoolCount, "Registered workspaces", "▦"],
                    ["Active students", platformOverviewForUser.summary.activeStudentCount, "Across all schools", "♧"],
                    ["Teacher memberships", platformOverviewForUser.summary.teacherMembershipCount, "Across all schools", "♙"],
                    ["Classes", platformOverviewForUser.summary.classCount, "Across all schools", "▤"],
                  ].map(([label, value, detail, icon], index) => <article className="stat-card" key={label}>
                    <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${["student-stat-icon", "teacher-stat-icon", "average-stat-icon", "review-stat-icon"][index]}`}>{icon}</span></div>
                    <div className="stat-number">{Number(value).toLocaleString("en-NG")}</div><div className="stat-foot"><span>{detail}</span></div>
                  </article>)}
                </section>
                <div className="platform-directory-heading">
                  <div><h3>School directory</h3><p>Showing {platformDirectoryFirstRow.toLocaleString("en-NG")}–{platformDirectoryLastRow.toLocaleString("en-NG")} of {platformDirectory?.totalCount.toLocaleString("en-NG")} {platformSchoolSearch ? "matching " : ""}schools; {platformOverviewForUser.summary.schoolCount.toLocaleString("en-NG")} registered. New schools remain pending until you decide.</p></div>
                  <form className="platform-school-search" onSubmit={(event) => { event.preventDefault(); setPlatformSchoolSearch(platformSchoolSearchDraft.trim()); setPlatformSchoolPage(1); }}>
                    <label className="platform-school-search-field"><span>Find a school</span><input className="text-input" type="search" value={platformSchoolSearchDraft} maxLength={100} placeholder="Name, type, or country" onChange={(event) => setPlatformSchoolSearchDraft(event.target.value)} /></label>
                    <button className="button button-secondary button-small" type="submit" disabled={loadingPlatformOverview || platformSchoolActionBusy}>Search</button>
                    {(platformSchoolSearch || platformSchoolSearchDraft) && <button className="button button-secondary button-small" type="button" onClick={() => { setPlatformSchoolSearchDraft(""); setPlatformSchoolSearch(""); setPlatformSchoolPage(1); }}>Clear</button>}
                  </form>
                </div>
                {platformOverviewForUser.schools.length === 0
                  ? <p className="empty-search">{platformSchoolSearch ? "No schools match that search. Try another name, type, or country." : "No school workspaces have been created yet."}</p>
                  : <div className="table-scroll"><table className="platform-directory-table"><thead><tr><th>SCHOOL</th><th>COUNTRY</th><th>TYPE</th><th>STUDENTS</th><th>TEACHERS</th><th>CLASSES</th><th>ADMINS</th><th>CREATED</th><th>BILLING DECISION</th><th>SCHOOL ACCESS</th></tr></thead><tbody>
                  {platformOverviewForUser.schools.map((schoolRow) => {
                    const billingDraft = platformBillingDrafts[schoolRow.id] || {
                      billingStatus: schoolRow.billingStatus || "pending",
                      planId: schoolRow.planId || "",
                    };
                    const billingFeedback = platformBillingFeedback[schoolRow.id];
                    const schoolStatusFeedback = platformSchoolStatusFeedback[schoolRow.id];
                    const isArchived = Boolean(schoolRow.archivedAt);
                    return <tr key={schoolRow.id}>
                      <td><strong>{schoolRow.name}</strong></td><td>{schoolRow.country}</td><td>{schoolRow.schoolType}</td><td>{schoolRow.studentCount.toLocaleString("en-NG")}</td><td>{schoolRow.teacherCount.toLocaleString("en-NG")}</td><td>{schoolRow.classCount.toLocaleString("en-NG")}</td><td>{schoolRow.administratorCount.toLocaleString("en-NG")}</td><td>{new Date(schoolRow.createdAt).toLocaleDateString("en-NG")}</td>
                      <td>
                        <div className="platform-billing-controls">
                          <label className="platform-billing-field"><span>Status</span><select className="text-input" value={billingDraft.billingStatus} disabled={platformSchoolActionBusy} onChange={(event) => updatePlatformBillingDraft(schoolRow, "billingStatus", event.target.value)}>
                            <option value="pending">Pending decision</option>
                            <option value="exempt">Exempt / free</option>
                            <option value="paid">Billable plan</option>
                          </select></label>
                          <label className="platform-billing-field"><span>Plan</span><select className="text-input" value={billingDraft.planId} disabled={billingDraft.billingStatus !== "paid" || platformSchoolActionBusy} onChange={(event) => updatePlatformBillingDraft(schoolRow, "planId", event.target.value)}>
                            <option value="">Select a plan</option>
                            {subscriptionPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ₦{plan.monthlyPrice.toLocaleString("en-NG")}/mo</option>)}
                          </select></label>
                          <button className="button button-secondary button-small" type="button" onClick={() => savePlatformBillingDecision(schoolRow)} disabled={platformSchoolActionBusy}>
                            {platformBillingSaving === schoolRow.id ? "Saving…" : "Save decision"}
                          </button>
                          {billingFeedback && <small className={billingFeedback.error ? "platform-billing-feedback form-error" : "platform-billing-feedback"} role={billingFeedback.error ? "alert" : "status"}>{billingFeedback.message}</small>}
                        </div>
                      </td>
                      <td><div className="platform-school-status-controls">
                        <span className={isArchived ? "platform-school-status archived" : "platform-school-status active"}>{isArchived ? "Archived" : "Active"}</span>
                        <button className="button button-secondary button-small" type="button" onClick={() => setPlatformSchoolArchived(schoolRow, !isArchived)} disabled={platformSchoolActionBusy}>
                          {platformSchoolStatusSaving === schoolRow.id ? "Saving…" : isArchived ? "Restore" : "Archive"}
                        </button>
                        {schoolStatusFeedback && <small className={schoolStatusFeedback.error ? "platform-school-status-feedback form-error" : "platform-school-status-feedback"} role={schoolStatusFeedback.error ? "alert" : "status"}>{schoolStatusFeedback.message}</small>}
                      </div></td>
                    </tr>;
                  })}
                </tbody></table></div>}
                {platformDirectoryPageCount > 1 && <nav className="platform-directory-pagination" aria-label="School directory pages">
                  <span>Page {platformDirectory?.page.toLocaleString("en-NG")} of {platformDirectoryPageCount.toLocaleString("en-NG")}</span>
                  <div>
                    <button className="button button-secondary button-small" type="button" onClick={() => setPlatformSchoolPage((currentPage) => currentPage - 1)} disabled={loadingPlatformOverview || platformSchoolActionBusy || platformDirectory?.page <= 1}>Previous</button>
                    <button className="button button-secondary button-small" type="button" onClick={() => setPlatformSchoolPage((currentPage) => currentPage + 1)} disabled={loadingPlatformOverview || platformSchoolActionBusy || platformDirectory?.page >= platformDirectoryPageCount}>Next</button>
                  </div>
                </nav>}
              </>}
              {!loadingPlatformOverview && !platformOverviewError && !platformOverviewForUser && <p className="empty-search">Platform operations are unavailable. Refresh to try again.</p>}
            </section>
            <section className="panel platform-pricing-panel">
              <div className="panel-heading"><div><h2>Approved pricing proposal</h2><p>All tiers include Aster’s current school workflows; only active-student capacity differs.</p></div></div>
              <p className="platform-billing-notice" role="status">Checkout and student-cap enforcement are disabled until a payment provider is selected.</p>
              <div className="platform-pricing-grid">
                {subscriptionPlans.map((plan) => <article className="platform-plan-card" key={plan.id}>
                  <span className="platform-plan-name">{plan.name}</span>
                  <strong className="platform-plan-price">₦{plan.monthlyPrice.toLocaleString("en-NG")}<small> / month</small></strong>
                  <span className="platform-plan-cap">Up to {plan.maxActiveStudents.toLocaleString("en-NG")} active students</span>
                  <div className="platform-plan-annual"><span>Annual</span><strong>₦{plan.annualPrice.toLocaleString("en-NG")} / year</strong><small>10% discount</small></div>
                </article>)}
              </div>
              <p className="field-hint">Schools above 1,500 active students will need a custom quote. Prices are per school, in Nigerian naira.</p>
            </section>
          </section>}

          {page === "attendance" && <section className="panel attendance-panel">
            <div className="panel-heading"><div><h2>Class register</h2><p>Attendance is saved per school day. Teachers can record attendance only for their assigned classes.</p></div></div>
            <div className="attendance-controls">
              <label><span>Class</span><select className="text-input" value={attendanceClassId} onChange={(event) => setAttendanceClassId(event.target.value)} disabled={loadingClasses || !schoolClasses.length}><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
              <label><span>Date</span><input className="text-input" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
              {attendanceData?.rows.length > 0 && <div className="attendance-counts" aria-label="Attendance totals">
                {["present", "absent", "late", "excused"].map((status) => <span key={status}>{status[0].toUpperCase() + status.slice(1)} <strong>{attendanceData.rows.filter((row) => row.status === status).length}</strong></span>)}
              </div>}
            </div>
            {classError && <p className="form-error" role="alert">{classError}</p>}
            {attendanceError && <p className="form-error" role="alert">{attendanceError}</p>}
            {loadingAttendance || loadingClasses ? <p className="empty-search">Loading the class register…</p>
              : !schoolClasses.length ? <p className="empty-search">{classError ? "Your class list could not be loaded." : "Create a class and enrol active students before recording attendance."}</p>
                : !attendanceDate ? <p className="empty-search">Choose a date to load attendance.</p>
                : !attendanceClassId ? <p className="empty-search">Select a class to load its active student roster.</p>
                  : !attendanceData ? <p className="empty-search">The class register could not be loaded. Please try again.</p>
                    : attendanceData.rows.length === 0 ? <p className="empty-search">This class has no active students to mark for attendance.</p>
                      : <form onSubmit={(event) => { event.preventDefault(); saveAttendance(); }}>
                        <div className="attendance-toolbar"><span>{attendanceData.schoolClass.grade} {attendanceData.schoolClass.section} · {attendanceDate}</span><button className="quiet-action" type="button" onClick={() => setAttendanceData((previous) => previous && ({ ...previous, rows: previous.rows.map((row) => ({ ...row, status: "present" })) }))}>Mark all present</button></div>
                        <div className="table-scroll"><table className="attendance-table"><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>STATUS</th></tr></thead><tbody>{attendanceData.rows.map((row) => <tr key={row.studentId}>
                          <td><strong>{row.firstName} {row.lastName}</strong></td>
                          <td>{row.admissionNumber}</td>
                          <td><select className="text-input attendance-status" aria-label={`Attendance status for ${row.firstName} ${row.lastName}`} value={row.status || ""} onChange={(event) => setAttendanceStatus(row.studentId, event.target.value)}><option value="">Choose status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></td>
                        </tr>)}</tbody></table></div>
                        <div className="attendance-footer"><span className="field-hint">Mark every active student before saving. Saving again updates this class and date.</span><button className="button button-primary" type="submit" disabled={savingAttendance || attendanceData.rows.some((row) => !row.status)}>{savingAttendance ? "Saving…" : "Save attendance"}</button></div>
                      </form>}
          </section>}

          {page === "attendance" && <section className="panel attendance-report-panel">
            <div className="panel-heading"><div><h2>Attendance summary</h2><p>Review saved attendance totals for each student in a class and date range.</p></div></div>
            <form className="attendance-report-filters" onSubmit={generateAttendanceReport}>
              <label><span>Class</span><select className="text-input" value={attendanceClassId} onChange={(event) => {
                setAttendanceClassId(event.target.value);
                setAttendanceReportData(null);
              }} disabled={loadingClasses || !schoolClasses.length} required><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
              <label><span>From</span><input className="text-input" type="date" value={attendanceReportFrom} max={attendanceReportTo} onChange={(event) => {
                setAttendanceReportFrom(event.target.value);
                setAttendanceReportData(null);
              }} required /></label>
              <label><span>To</span><input className="text-input" type="date" value={attendanceReportTo} min={attendanceReportFrom} onChange={(event) => {
                setAttendanceReportTo(event.target.value);
                setAttendanceReportData(null);
              }} required /></label>
              <button className="button button-secondary" type="submit" disabled={loadingAttendanceReport || !attendanceClassId}>{loadingAttendanceReport ? "Loading…" : "Generate report"}</button>
            </form>
            {attendanceReportError && <p className="form-error" role="alert">{attendanceReportError}</p>}
            {loadingAttendanceReport ? <p className="empty-search">Generating attendance summary…</p>
              : !attendanceReportForSelection ? <p className="empty-search">Choose a class and date range, then generate the attendance summary.</p>
              : <>
                <div className="attendance-report-meta">
                  <span>{attendanceReportForSelection.schoolClass.grade} {attendanceReportForSelection.schoolClass.section} · {attendanceReportFrom} to {attendanceReportTo}</span>
                  <span>{attendanceReportForSelection.recordedDays} school {attendanceReportForSelection.recordedDays === 1 ? "day" : "days"} recorded</span>
                </div>
                {attendanceReportTotals && <div className="attendance-counts attendance-report-totals" aria-label="Attendance totals for this period">
                  {["present", "absent", "late", "excused"].map((status) => <span key={status}>{status[0].toUpperCase() + status.slice(1)} <strong>{attendanceReportTotals[status]}</strong></span>)}
                </div>}
                {attendanceReportForSelection.rows.length === 0
                  ? <p className="empty-search">No students or saved attendance were found for this class.</p>
                  : <div className="table-scroll"><table className="attendance-table attendance-report-table"><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>DAYS MARKED</th><th>PRESENT</th><th>ABSENT</th><th>LATE</th><th>EXCUSED</th></tr></thead><tbody>{attendanceReportForSelection.rows.map((row) => <tr key={row.studentId}>
                    <td><strong>{row.firstName} {row.lastName}</strong></td>
                    <td>{row.admissionNumber}</td>
                    <td>{row.daysRecorded}</td><td>{row.present}</td><td>{row.absent}</td><td>{row.late}</td><td>{row.excused}</td>
                  </tr>)}</tbody></table></div>}
              </>}
          </section>}

          {role === "admin" && page === "grading" && <section className="panel grading-settings-panel">
            <div className="panel-heading">
              <div><h2>School grading policy</h2><p>Set percentage bands, tie handling, and when students can receive class positions.</p></div>
            </div>
            {gradingSettingsError && <p className="form-error" role="alert">{gradingSettingsError}</p>}
            {loadingGradingSettings ? <p className="empty-search">Loading this school’s grading rules…</p>
              : gradingSettings && <>
                <p className="curriculum-note">A score receives the highest grade band whose minimum it meets. The lowest band must begin at 0, and all labels and thresholds must be unique.</p>
                <div className="grading-band-list" aria-label="Grade bands">
                  {draftGradingSettings.bands.map((band, index) => <div className="grading-band-row" key={`${index}-${band.label}`}>
                    <label htmlFor={`gradeLabel-${index}`}>Grade label<input className="text-input" id={`gradeLabel-${index}`} maxLength={12} value={band.label} onChange={(event) => updateGradingBand(index, "label", event.target.value)} /></label>
                    <label htmlFor={`gradeMinimum-${index}`}>Minimum percentage<input className="text-input" id={`gradeMinimum-${index}`} type="number" min="0" max="100" step="0.01" value={band.minimum} onChange={(event) => updateGradingBand(index, "minimum", event.target.value)} /></label>
                    <button className="quiet-action grading-band-remove" type="button" onClick={() => removeGradingBand(index)} disabled={draftGradingSettings.bands.length <= 2} aria-label={`Remove ${band.label} grade band`}>Remove</button>
                  </div>)}
                </div>
                <button className="button button-secondary button-small" type="button" onClick={addGradingBand} disabled={draftGradingSettings.bands.length >= 12}>＋ Add grade band</button>
                {!normalizedGradingDraft && <p className="form-error" role="status">Use 2–12 unique labels and thresholds, and include a grade band starting at 0.</p>}
                <div className="grading-policy-grid">
                  <label><span>Tied positions</span><select className="text-input" value={draftGradingSettings.tieMethod} onChange={(event) => setDraftGradingSettings((previous) => ({ ...previous, tieMethod: event.target.value }))}>
                    <option value="competition">Shared positions with gaps (1, 1, 3)</option>
                    <option value="dense">Shared positions without gaps (1, 1, 2)</option>
                    <option value="none">Do not show class positions</option>
                  </select></label>
                  <label><span>Ungraded subjects</span><select className="text-input" value={draftGradingSettings.incompletePolicy} onChange={(event) => setDraftGradingSettings((previous) => ({ ...previous, incompletePolicy: event.target.value }))}>
                    <option value="require_all">Wait until all subjects are graded before ranking</option>
                    <option value="graded_only">Rank using currently graded subjects</option>
                  </select></label>
                </div>
                <p className="result-publication-note">These rules apply to new publications only. Published reports keep the grades and positions they were published with.</p>
                <div className="curriculum-footer">
                  <button className="button button-secondary" type="button" onClick={() => setDraftGradingSettings(copyGradingSettings(defaultGradingSettings))} disabled={savingGradingSettings}>Restore A1–F9 defaults</button>
                  <button className="button button-primary" type="button" onClick={saveGradingSettings} disabled={savingGradingSettings || loadingGradingSettings || !gradingSettingsChanged || !normalizedGradingDraft}>{savingGradingSettings ? "Saving…" : "Save grading rules"}</button>
                </div>
              </>}
          </section>}

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
                {schoolClasses.map((schoolClass) => <article className="class-card tilt-3d" key={schoolClass.id}>
                  <div className="class-card-top"><span className="class-card-grade">{schoolClass.grade}</span>{role === "admin" && <button className="quiet-action" type="button" onClick={() => removeClass(schoolClass)} disabled={schoolClass.studentCount > 0}>Delete</button>}</div>
                  <h3>{schoolClass.section}</h3>
                  <p>{schoolClass.academicYear} · {schoolClass.studentCount} student{schoolClass.studentCount === 1 ? "" : "s"}</p>
                  <div className="class-subject-list">{schoolClass.subjects.map((subject) => <span key={subject}>{subject}</span>)}</div>
                </article>)}
              </div>}
              <p className="field-hint">Classes with student records or published result sheets cannot be deleted.</p>
            </div>
          </section>}

          {page === "results" && ["student", "parent"].includes(role) && <section className="panel student-results-panel">
            <div className="panel-heading"><div><h2>{role === "parent" ? "Your children’s published results" : "Published term results"}</h2><p>{role === "parent" ? "Only reports for students explicitly linked to your verified parent account are shown." : "Your school releases results after administrator approval. Only your linked student record is shown here."}</p></div></div>
            {studentResultError && <p className="form-error" role="alert">{studentResultError}</p>}
            {loadingStudentResults ? <p className="empty-search">Loading your published results…</p>
              : !studentResultData ? <p className="empty-search">Your results could not be loaded. Please try again.</p>
                : role === "parent" && !studentResultData.linked ? <p className="empty-search">Ask your school to link your verified email to your child’s guardian contact to enable parent access.</p>
                  : role === "student" && !studentResultData.linked ? <p className="empty-search">Your school administrator needs to link your verified portal email to your student record before results can appear.</p>
                    : role === "student" && studentResultData.sheets.length === 0 ? <p className="empty-search">No term results have been published for your student record yet.</p>
                    : <>
                      <div className="result-sheet-filters">
                        {role === "parent" && <label><span>Student</span><select className="text-input" value={selectedParentStudentId} onChange={(event) => {
                          const child = studentResultData.children.find((item) => item.studentId === event.target.value);
                          setSelectedParentStudentId(event.target.value);
                          setSelectedStudentResultId(child?.sheets[0]?.id || "");
                        }}><option value="">Select a student</option>{studentResultData.children.map((child) => <option key={child.studentId} value={child.studentId}>{child.firstName} {child.lastName} · {child.admissionNumber}</option>)}</select></label>}
                        <label><span>Published result sheet</span><select className="text-input" value={selectedStudentResultId} onChange={(event) => setSelectedStudentResultId(event.target.value)} disabled={!availableStudentSheets.length}><option value="">Select a result sheet</option>{availableStudentSheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.grade} {sheet.section} · {sheet.academicYear} · {sheet.term}</option>)}</select></label>
                        {selectedStudentResult?.publishedAt && <span className="result-sheet-summary">Published {new Date(selectedStudentResult.publishedAt).toLocaleDateString("en-NG")}</span>}
                        <button className="button button-secondary button-small report-print-button" type="button" onClick={printStudentReport} disabled={!selectedStudentResult?.rows.length}>Print report card</button>
                      </div>
                      {selectedStudentResult?.rows.length
                        ? <StudentReportCard schoolName={school.name} result={selectedStudentResult} rows={selectedStudentResult.rows} />
                        : <p className="empty-search">{role === "parent" ? "No result sheets have been published for this student yet." : "Select one of your published result sheets to view its subjects."}</p>}
                    </>}
          </section>}

          {page === "results" && role !== "student" && role !== "parent" && <section className="assessment-workspace">
            <section className="panel result-sheet-panel">
              <div className="panel-heading result-sheet-heading">
                <div><h2>Term result sheet</h2><p>Only administrator-approved assessments are included. Letter grades and class positions follow this school’s saved grading rules.</p></div>
                <div className="result-sheet-actions">{role === "admin" && <>{resultSheet?.published && <button className="button button-secondary button-small" type="button" onClick={printClassReportCards} disabled={printingClassReports || !classReportGroups.length}>Print report cards</button>}<button className="button button-primary button-small" type="button" onClick={publishResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.some((row) => row.percentage != null) || Boolean(resultSheet?.published)}>{resultSheet?.published ? "Published" : "Publish results"}</button></>}<button className="button button-secondary button-small" type="button" onClick={printResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.length}>Print</button><button className="button button-secondary button-small" type="button" onClick={exportResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.length}>Export CSV</button></div>
              </div>
              {resultSheet?.schoolClass && <div className="result-sheet-print-heading"><strong>{school.name}</strong><span>{resultSheet.schoolClass.grade} {resultSheet.schoolClass.section} · {resultSheet.schoolClass.academicYear} · {resultSheet.term}</span><small>{resultSheet.published ? "Published result snapshot" : "Calculated from administrator-approved assessments only"}</small></div>}
              <div className="result-sheet-filters">
                <label><span>Class</span><select className="text-input" value={resultSheetClassId} onChange={(event) => setResultSheetClassId(event.target.value)} disabled={loadingClasses || !schoolClasses.length}><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
                <label><span>Term</span><select className="text-input" value={resultSheetTerm} onChange={(event) => setResultSheetTerm(event.target.value)}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
                {resultSheet?.schoolClass && <span className="result-sheet-summary">{resultSheet.rows.filter((row) => row.percentage !== null).length} graded subject entries</span>}
              </div>
              {resultSheet?.published
                ? <p className="result-publication-note">Published {new Date(resultSheet.published.publishedAt).toLocaleString("en-NG")} by {resultSheet.published.publishedBy || "a school administrator"}. Grades and positions are frozen with this snapshot and released to each linked student account.</p>
                : <p className="result-calculation-note">Percentage = total points earned across approved assessments ÷ total possible points × 100. Letter grades use this school’s bands. Class positions follow its tie and completeness rules; positions may change until publication.</p>}
              {resultSheetError && <p className="form-error" role="alert">{resultSheetError}</p>}
              {loadingResultSheet ? <p className="empty-search">Calculating the result sheet…</p>
                : !resultSheetClassId ? <p className="empty-search">{loadingClasses ? "Loading classes…" : "Create a class and assign a teacher to its subjects to view a result sheet."}</p>
                  : resultSheet?.rows.length ? <div className="table-scroll"><table className="result-sheet-table"><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>SUBJECT</th><th>APPROVED MARKS</th><th>ASSESSMENTS</th><th>TERM PERCENTAGE</th><th>GRADE</th><th>CLASS POSITION</th></tr></thead><tbody>{resultSheet.rows.map((row) => <tr key={`${row.studentId}-${row.subject}`}>
                    <td><strong>{row.firstName} {row.lastName}</strong></td>
                    <td>{row.admissionNumber}</td>
                    <td>{row.subject}</td>
                    <td>{row.percentage === null ? "—" : `${Number(row.earnedPoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })} / ${Number(row.possiblePoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`}</td>
                    <td>{row.assessmentCount}</td>
                    <td><strong className={row.percentage === null ? "ungraded-mark" : "result-percentage"}>{row.percentage === null ? "Not graded" : `${row.percentage.toFixed(2)}%`}</strong></td>
                    <td><strong className={row.grade ? "result-percentage" : "ungraded-mark"}>{row.grade || "—"}</strong></td>
                    <td>{formatClassPosition(row.classPosition)}</td>
                  </tr>)}</tbody></table></div>
                    : resultSheet?.schoolClass.studentCount === 0
                      ? <p className="empty-search">This class has no enrolled students for a result sheet yet.</p>
                      : <p className="empty-search">No assigned subjects are available for this class, or no students have results from approved assessments in {resultSheetTerm}. Assign teachers and approve mark submissions first.</p>}
              {role === "admin" && resultSheet?.published && resultSheet.schoolClass && <div className="class-report-print-root" aria-hidden="true">
                {classReportGroups.map(({ studentId, rows }) => <div className="class-report-card" key={studentId}>
                  <StudentReportCard
                    schoolName={school.name}
                    result={{ ...resultSheet.schoolClass, term: resultSheet.term, publishedAt: resultSheet.published.publishedAt }}
                    rows={rows}
                  />
                </div>)}
              </div>}
            </section>

            {role === "admin" && <section className="panel assessment-form-panel">
              <div className="panel-heading"><div><h2>Create an assessment</h2><p>Assessments can be created for subjects with an assigned teacher.</p></div></div>
              {resultSheet?.published && assessmentForm.classId === resultSheetClassId && assessmentForm.term === resultSheetTerm && <p className="result-publication-note">This class and term are published. No further assessments can be added.</p>}
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
                <button className="button button-primary" type="submit" disabled={assessmentBusy || !assessmentForm.subject || Boolean(resultSheet?.published && assessmentForm.classId === resultSheetClassId && assessmentForm.term === resultSheetTerm)}>{assessmentBusy ? "Creating…" : "Create assessment"}</button>
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
            <section className="panel teacher-registration-panel">
              <div className="panel-heading"><div><h2>Register a teacher</h2><p>Add the teacher’s name and email. Aster creates a staff code and a seven-day activation link; the teacher sets their own password when they activate the account.</p></div></div>
              <form className="invite-form" onSubmit={registerTeacher}>
                <label className="field-label" htmlFor="teacherName">Teacher’s full name</label>
                <input className="text-input" id="teacherName" autoComplete="name" required minLength={2} maxLength={120} value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="e.g. Ada Okafor" />
                <label className="field-label" htmlFor="inviteEmail">Teacher email</label>
                <input className="text-input" id="inviteEmail" type="email" autoComplete="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@yourschool.edu" />
                {teacherRegistrationError && <p className="form-error" role="alert">{teacherRegistrationError}</p>}
                <button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Registering…" : "Register teacher"}</button>
              </form>
              {teacherRegistration && <div className="invitation-link teacher-activation">
                <p className="auth-kicker">TEACHER ACCOUNT READY TO ACTIVATE</p>
                <p><strong>{teacherRegistration.teacherName}</strong> · {teacherRegistration.email}</p>
                <p className={teacherRegistration.emailDelivery.status === "sent" ? "field-hint" : "form-error"} role="status">{teacherRegistration.emailDelivery.message}</p>
                <label className="field-label" htmlFor="teacherCode">Generated teacher code</label>
                <input className="text-input" id="teacherCode" readOnly value={teacherRegistration.teacherCode} />
                <label className="field-label" htmlFor="teacherActivationUrl">One-time activation link</label>
                <div><input className="text-input" id="teacherActivationUrl" readOnly value={teacherRegistration.activationUrl} /><button className="button button-secondary" type="button" onClick={copyTeacherActivationLink}>Copy link</button></div>
                <p className="field-hint">This seven-day link is a backup. Share it only with the registered teacher; they verify their email and create their own password.</p>
              </div>}
            </section>
            {teacherRoster.length > 0 && <section className="panel teacher-roster-panel">
              <div className="panel-heading"><div><h2>Active teacher accounts</h2><p>Teachers appear here after accepting their activation link.</p></div></div>
              <div className="table-scroll"><table><thead><tr><th>TEACHER</th><th>STAFF CODE</th><th>EMAIL</th></tr></thead><tbody>{teacherRoster.map((teacher) => <tr key={teacher.userId}><td>{teacher.teacherName || "Teacher"}</td><td><strong>{teacher.teacherCode || "—"}</strong></td><td>{teacher.email}</td></tr>)}</tbody></table></div>
            </section>}
            <section className="panel teacher-assignment-panel">
              <div className="panel-heading">
                <div><h2>Teacher assignments</h2><p>Assign one teacher to each class and subject. Reassigning replaces the current teacher.</p></div>
                <button className="button button-secondary button-small" type="button" onClick={() => document.getElementById("teacherName")?.focus()}>Register a teacher</button>
              </div>
              {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
              {loadingAssignments ? <p className="empty-search">Loading teacher assignments…</p> : teacherRoster.length === 0 ? <p className="empty-search">No teachers have activated their accounts yet. Register a teacher above and share their activation link before assigning classes.</p> : <>
                <form className="assignment-form" onSubmit={assignTeacher}>
                  <label><span>Class</span><select className="text-input" required value={assignmentClassId} onChange={(event) => {
                    const classId = event.target.value;
                    const nextClass = schoolClasses.find((item) => item.id === classId);
                    setAssignmentClassId(classId);
                    setAssignmentSubject(nextClass?.subjects?.[0] || "");
                  }}><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
                  <label><span>Subject</span><select className="text-input" required value={assignmentSubject} onChange={(event) => setAssignmentSubject(event.target.value)} disabled={!selectedAssignmentClass?.subjects?.length}><option value="">Select a subject</option>{(selectedAssignmentClass?.subjects || []).map((subject) => <option key={subject}>{subject}</option>)}</select></label>
                  <label><span>Teacher</span><select className="text-input" required value={assignmentTeacherId} onChange={(event) => setAssignmentTeacherId(event.target.value)}><option value="">Select a teacher</option>{teacherRoster.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.teacherName || teacher.email} · {teacher.teacherCode || teacher.email}</option>)}</select></label>
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
              {loadingAssignments ? <p className="empty-search">Loading your assignments…</p> : teachingAssignments.length === 0 ? <p className="empty-search">No classes or subjects are assigned to you yet. Ask your school administrator to assign them.</p> : <div className="class-list teacher-assignment-cards">{teachingAssignments.map((assignment) => <article className="class-card tilt-3d" key={assignment.id}><div className="class-card-top"><span className="class-card-grade">{assignment.grade}</span><span className="class-year-pill">{assignment.academicYear}</span></div><h3>{assignment.section}</h3><p>{assignment.subject}</p></article>)}</div>}
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
            <section className="panel student-import-panel">
              <div className="panel-heading">
                <div><h2>Import students from CSV</h2><p>Enroll up to 200 students into one class at a time. Every row is checked before anything is saved.</p></div>
                <button className="button button-secondary button-small" type="button" onClick={downloadStudentImportTemplate}>Download CSV template</button>
              </div>
              <div className="student-import-controls">
                <label><span>Target class</span><select className="text-input" value={studentImportClassId} onChange={(event) => setStudentImportClassId(event.target.value)} disabled={loadingClasses || !schoolClasses.length}><option value="">Select a class</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.grade} {schoolClass.section} · {schoolClass.academicYear}</option>)}</select></label>
                <label><span>CSV file</span><input className="text-input" id="studentImportFile" type="file" accept=".csv,text/csv" onChange={previewStudentImport} disabled={!schoolClasses.length || studentImporting} /></label>
              </div>
              <p className="field-hint">Required columns: firstName, lastName, admissionNumber. guardianEmail and guardianPhone are optional. Imports are all-or-nothing; duplicate admission numbers stop the full import.</p>
              {studentImportError && <p className="form-error" role="alert">{studentImportError}</p>}
              {studentImportPreview && <>
                <div className="student-import-preview-heading">
                  <strong>{studentImportPreview.fileName}</strong>
                  <span>{studentImportPreview.students.length} valid row{studentImportPreview.students.length === 1 ? "" : "s"} · {studentImportPreview.errors.length} issue{studentImportPreview.errors.length === 1 ? "" : "s"}</span>
                </div>
                {studentImportPreview.errors.length > 0 && <ul className="student-import-errors" role="alert">
                  {studentImportPreview.errors.slice(0, 8).map((item, index) => <li key={`${item.line}-${index}`}>Line {item.line}: {item.message}</li>)}
                  {studentImportPreview.errors.length > 8 && <li>And {studentImportPreview.errors.length - 8} more issue{studentImportPreview.errors.length - 8 === 1 ? "" : "s"}.</li>}
                </ul>}
                {studentImportPreview.students.length > 0 && <div className="table-scroll student-import-table"><table><thead><tr><th>FIRST NAME</th><th>LAST NAME</th><th>ADMISSION NO.</th><th>GUARDIAN EMAIL</th><th>GUARDIAN PHONE</th></tr></thead><tbody>
                  {studentImportPreview.students.slice(0, 5).map((student) => <tr key={student.admissionNumber}><td>{student.firstName}</td><td>{student.lastName}</td><td>{student.admissionNumber}</td><td>{student.guardianEmail || "—"}</td><td>{student.guardianPhone || "—"}</td></tr>)}
                </tbody></table>{studentImportPreview.students.length > 5 && <p className="field-hint">Showing 5 of {studentImportPreview.students.length} valid rows.</p>}</div>}
                <div className="student-import-actions">
                  <button className="button button-secondary" type="button" onClick={() => { setStudentImportPreview(null); setStudentImportError(""); const fileInput = document.getElementById("studentImportFile"); if (fileInput) fileInput.value = ""; }} disabled={studentImporting}>Clear file</button>
                  <button className="button button-primary" type="button" onClick={importStudentsFromCsv} disabled={studentImporting || !studentImportClassId || !studentImportPreview.students.length || studentImportPreview.errors.length > 0}>{studentImporting ? "Importing…" : `Import ${studentImportPreview.students.length} students`}</button>
                </div>
              </>}
            </section>
            <section className="panel results-panel student-register-panel">
              <div className="panel-heading results-heading"><div><h2>Student register</h2><p>{studentTotal} student record{studentTotal === 1 ? "" : "s"} matching your filters.</p></div>
                <div className="student-filters"><label className="search-box"><span>⌕</span><input type="search" placeholder="Search name or admission no." aria-label="Search students" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentPage(1); }} /></label>
                  <select className="text-input" value={studentClassFilter} aria-label="Filter by class" onChange={(event) => { setStudentClassFilter(event.target.value); setStudentPage(1); }}><option value="">All classes</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.grade} {schoolClass.section}</option>)}</select>
                </div>
              </div>
              <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>CLASS</th><th>GUARDIAN CONTACT</th><th>STATUS</th><th>STUDENT PORTAL</th><th>PARENT PORTAL</th><th>ACTIONS</th></tr></thead><tbody>
                {studentRows.map((student) => <tr key={student.id}><td><strong>{student.firstName} {student.lastName}</strong></td><td>{student.admissionNumber}</td><td>{student.grade} {student.section}</td><td>{student.guardianEmail || student.guardianPhone || "—"}</td><td><span className={`status-pill ${student.isActive ? "approved" : "draft"}`}><i />{student.isActive ? "Active" : "Archived"}</span></td><td>{student.isPortalLinked ? <span className="student-portal-linked" title={student.portalEmail || "Portal account linked"}>Linked{student.portalEmail ? ` · ${student.portalEmail}` : ""}</span> : <button className="quiet-action" type="button" onClick={() => inviteStudent(student)} disabled={linkingStudentId === student.id}>{linkingStudentId === student.id ? "Creating…" : "Invite"}</button>}</td><td>{student.isParentPortalLinked ? <span className="student-portal-linked">Linked</span> : student.parentInvitationPending ? <span className="field-hint">Invited</span> : <button className="quiet-action" type="button" onClick={() => inviteParent(student)} disabled={!student.isActive || !student.guardianEmail || linkingStudentId === student.id}>{linkingStudentId === student.id ? "Creating…" : student.guardianEmail ? "Invite guardian" : "Add guardian email"}</button>}</td><td><div className="student-row-actions"><button className="quiet-action" type="button" onClick={() => editStudent(student)}>Edit</button><button className="quiet-action" type="button" onClick={() => toggleStudentStatus(student)}>{student.isActive ? "Archive" : "Reactivate"}</button></div></td></tr>)}
              </tbody></table>
                {loadingStudents && <div className="empty-search">Loading student records…</div>}
                {!loadingStudents && studentRows.length === 0 && <div className="empty-search">No students found. Add your first student above or adjust the filters.</div>}
              </div>
              <div className="table-footer student-pagination"><span>Page {studentPage} of {Math.max(1, Math.ceil(studentTotal / 100))}</span><div><button className="button button-secondary button-small" type="button" disabled={studentPage <= 1 || loadingStudents} onClick={() => setStudentPage((previous) => previous - 1)}>Previous</button><button className="button button-secondary button-small" type="button" disabled={studentPage >= Math.ceil(studentTotal / 100) || loadingStudents} onClick={() => setStudentPage((previous) => previous + 1)}>Next</button></div></div>
            </section>
          </section>}

          {role === "admin" && page === "access" && <>
            <section className="panel invite-panel">
              <div className="panel-heading"><div><h2>Portal access</h2><p>Register teachers from the Teachers page, or invite students and guardians from the student register. Parent access is limited to the invited student’s published reports.</p></div><button className="button button-secondary button-small" type="button" onClick={() => setPage("teachers")}>Go to Teachers</button></div>
              {invitationUrl && <div className="invitation-link"><p className={invitationEmailDelivery?.status === "sent" ? "field-hint" : "form-error"} role="status">{invitationEmailDelivery?.message || "Email delivery status is unavailable."}</p><label className="field-label" htmlFor="invitationUrl">{invitationLabel || "One-time invitation link"}</label><div><input className="text-input" id="invitationUrl" readOnly value={invitationUrl} /><button className="button button-secondary" type="button" onClick={copyInvitation}>Copy</button></div><p className="field-hint">This seven-day link is a backup. Share it only with the invited email address.</p></div>}
            </section>
            <section className="panel invitation-manager-panel">
              <div className="panel-heading"><div><h2>Outstanding invitations</h2><p>Review and manage links for people who have not activated their school access yet.</p></div><button className="button button-secondary button-small" type="button" onClick={() => setInvitationRefresh((previous) => previous + 1)} disabled={loadingInvitations}>Refresh</button></div>
              {invitationErrorForCurrentSchool && <p className="form-error" role="alert">{invitationErrorForCurrentSchool}</p>}
              {invitationsPending ? <p className="empty-search">Loading invitations…</p>
                : invitationsForCurrentSchool?.length ? <div className="table-scroll"><table className="invitation-manager-table"><thead><tr><th>INVITEE</th><th>EMAIL</th><th>ACCESS</th><th>EXPIRES</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
                  {invitationsForCurrentSchool.map((invitation) => {
                    const invitee = invitation.inviteeName || invitation.email;
                    const busy = busyInvitationId === invitation.id;
                    return <tr key={invitation.id}>
                      <td><strong>{invitee}</strong></td>
                      <td>{invitation.email}</td>
                      <td>{invitation.role === "teacher" ? `Teacher${invitation.teacherCode ? ` · ${invitation.teacherCode}` : ""}` : "Student portal"}</td>
                      <td>{new Date(invitation.expiresAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td><span className={`status-pill ${invitation.status === "expired" ? "draft" : "pending"}`}><i />{invitation.status === "expired" ? "Expired" : "Pending"}</span></td>
                      <td><div className="invitation-actions"><button className="quiet-action" type="button" disabled={busy} onClick={() => renewInvitation(invitation)}>{busy ? "Working…" : "Create new link"}</button><button className="quiet-action invitation-revoke-action" type="button" disabled={busy} onClick={() => revokeInvitation(invitation)}>Revoke</button></div></td>
                    </tr>;
                  })}
                </tbody></table></div>
                  : <p className="empty-search">There are no outstanding invitations. Create one from the Teachers page or a student record.</p>}
              <p className="field-hint">Creating a new link invalidates the old one and sends a fresh seven-day invitation email when email delivery is configured. Otherwise, copy the link and share it with the invited email address.</p>
            </section>
          </>}

          {page === "overview" && dashboardPending && <section className="panel dashboard-message" role="status">Loading your school overview…</section>}
          {page === "overview" && dashboardErrorForCurrentSchool && <section className="panel dashboard-message dashboard-error" role="alert"><span>{dashboardErrorForCurrentSchool}</span><button className="button button-secondary button-small" type="button" onClick={() => setDashboardRefresh((previous) => previous + 1)}>Retry</button></section>}
          {page === "overview" && !dashboardPending && !dashboardErrorForCurrentSchool && dashboardForCurrentSchool && <>
            <section className="stats-grid" aria-label="School summary">
              {dashboardStats.map(([label, value, detail], index) => <article className="stat-card tilt-3d" key={label}>
                <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon tilt-pop ${["student-stat-icon", "teacher-stat-icon", "average-stat-icon", "review-stat-icon"][index]}`}>{["♧", "♙", "↗", "▤"][index]}</span></div>
                <div className="stat-number">{value}</div><div className="stat-foot"><span>{detail}</span></div>
              </article>)}
            </section>
            <section className="main-grid">
              <article className="panel performance-panel tilt-3d">
                <div className="panel-heading"><div><h2>{role === "student" ? "My latest published results" : role === "parent" ? "Children’s latest published results" : "Published results average"}</h2><p>{role === "student" ? "Only your most recently published report is included." : role === "parent" ? "Based only on published reports for your linked children." : role === "teacher" ? "Based on published results for your assigned classes and subjects." : "Based on saved result snapshots for this school."}</p></div></div>
                <div className="chart-summary"><strong>{dashboardAverage}</strong><small>{["student", "parent"].includes(role) ? "latest report average" : "average percentage"}</small></div>
                {dashboardAverage === "—" && <p className="sample-chart-copy">No published result percentages are available yet.</p>}
              </article>
              <article className="panel activity-panel tilt-3d">
                <div className="panel-heading"><div><h2>{["student", "parent"].includes(role) ? "Published report activity" : "Recent assessment activity"}</h2><p>{role === "admin" ? "Latest assessments across your school." : role === "teacher" ? "Latest assessments for your assignments." : role === "parent" ? "Published reports for your linked children." : "Your latest published result sheets."}</p></div></div>
                <div className="attention-list">
                  {dashboardForCurrentSchool.activity.map((item) => {
                    const status = ["student", "parent"].includes(role) ? "Published" : `${item.status[0].toUpperCase()}${item.status.slice(1)}`;
                    const detail = ["student", "parent"].includes(role)
                      ? `${item.academicYear} · ${item.subjectCount} subjects${item.averagePercentage == null ? "" : ` · ${Number(item.averagePercentage).toFixed(1)}% average`}`
                      : `${item.detail} · ${item.markedCount} of ${item.studentCount} marks entered`;
                    return <button className="attention-item" type="button" key={item.id} onClick={() => setPage("results")}>
                      <span className={`attention-icon ${status === "Approved" || status === "Published" ? "blue" : "amber"}`}>{status === "Approved" || status === "Published" ? "✓" : "▤"}</span>
                      <span className="attention-copy"><strong>{item.title}</strong><small>{detail}</small></span>
                      <span className={`status-pill ${status === "Approved" || status === "Published" ? "approved" : status === "Submitted" ? "pending" : "draft"}`}><i />{status}</span>
                    </button>;
                  })}
                  {dashboardForCurrentSchool.activity.length === 0 && <p className="empty-search">{["student", "parent"].includes(role) ? "Your school has not published a result sheet for you yet." : "There is no assessment activity to show yet."}</p>}
                </div>
                <button className="view-all-link" type="button" onClick={() => setPage("results")}>{role === "student" ? "View my results" : role === "parent" ? "View child results" : "Open results & assessments"} →</button>
              </article>
            </section>
          </>}
          <footer className="page-footer"><span>Made for the people who make school matter <span className="footer-heart">♥</span></span><span>ASTER SCHOOL OS <i /> 2025</span></footer>
          </>}
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button className="modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="Close setup">×</button><div className="modal-kicker"><AsterLogoMark className="mini-brand" /> LET’S MAKE THIS YOURS</div><h2 id="modalTitle">Tell us about your school</h2><p className="modal-intro">A few details help us set up the right home for your school community.</p><div className="step-indicator"><span className={`step ${step === 1 ? "active" : ""}`}>01</span><i /><span className={`step ${step === 2 ? "active" : ""}`}>02</span><span className="step-caption">{step === 1 ? "School basics" : "Portal access"}</span></div><form onSubmit={createSchool} noValidate>{step === 1 ? <div className="form-step"><label className="field-label" htmlFor="schoolName">School name</label><input className="text-input" id="schoolName" required maxLength={120} value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="e.g. Harborview Academy" /><div className="field-row"><div><label className="field-label" htmlFor="schoolType">School type</label><select className="text-input" id="schoolType" required value={form.schoolType} onChange={(event) => updateForm("schoolType", event.target.value)}><option value="">Select school type</option>{schoolTypes.map((type) => <option key={type}>{type}</option>)}</select></div><div><label className="field-label" htmlFor="schoolCountry">Country</label><input className="text-input" id="schoolCountry" required maxLength={80} value={form.country} onChange={(event) => updateForm("country", event.target.value)} placeholder="e.g. Nigeria" /></div></div><label className="field-label" htmlFor="schoolEmail">School email</label><input className="text-input" id="schoolEmail" required type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="hello@yourschool.edu" /><button className="button button-primary modal-continue" type="button" onClick={() => { const fields = [...document.querySelectorAll("#schoolName, #schoolType, #schoolCountry, #schoolEmail")]; const invalid = fields.find((field) => !field.checkValidity()); if (invalid) invalid.reportValidity(); else { setError(""); setStep(2); } }}>Continue →</button></div> : <div className="form-step"><label className="field-label">How should your community access the school?</label><p className="field-hint">Choose how your school community will join. You can update this later.</p>{accessOptions.map(([value, title, description]) => <label className="access-option" key={value}><input type="radio" name="accessMode" checked={form.accessMode === value} onChange={() => updateForm("accessMode", value)} /><span className="access-option-icon">{value === "invite" ? "✉" : value === "school-code" ? "⌗" : "◎"}</span><span><strong>{title}</strong><small>{description}</small></span><span className="radio-mark" /></label>)}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-row-actions"><button className="button button-secondary" type="button" onClick={() => { setError(""); setStep(1); }}>← Back</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create school profile →"}</button></div><p className="privacy-note">School profiles are saved to the local database.</p></div>}</form></section></div>}
      {toast && <div className="toast show" role="status">{toast}</div>}
      <ExplainerVideo open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </div>
  );
}

export default App;
