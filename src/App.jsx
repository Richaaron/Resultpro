import React, { useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import AsterLogoMark from "./AsterLogo.jsx";
import EducationBackground from "./EducationBackground.jsx";
import ExplainerVideo from "./ExplainerVideo.jsx";
import DemoMode from "./DemoMode.jsx";
import { authClient, pendingSchoolNameKey } from "./auth.js";
import {
  curriculumByGrade,
  curriculumGrades,
  normalizeEducationalLevelSelection,
} from "../shared/curriculum.js";
import {
  billablePlans,
  customQuotePlan,
  freePlan,
  getPricingTierForActiveStudents,
  subscriptionPlans,
} from "../shared/billing-plans.js";
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
  ["calendar", "Academic calendar", "◷"],
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
const SESSION_RESTORE_TIMEOUT_MS = 12000;
const teacherSessionStorageKey = "aster.teacher-session";
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
const assessmentDueDateInfo = (dueDate) => {
  if (!dueDate) return { label: "No due date", daysUntil: null };
  const [year, month, day] = dueDate.split("-").map(Number);
  const dueTimestamp = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(dueTimestamp);
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    return { label: "Due date unavailable", daysUntil: null };
  }
  const now = new Date();
  const todayTimestamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntil = Math.round((dueTimestamp - todayTimestamp) / 86400000);
  if (daysUntil < 0) return { label: `Overdue by ${Math.abs(daysUntil)} day${daysUntil === -1 ? "" : "s"}`, daysUntil };
  if (daysUntil === 0) return { label: "Due today", daysUntil };
  if (daysUntil <= 7) return { label: `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`, daysUntil };
  return {
    label: `Due ${new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day))}`,
    daysUntil,
  };
};
const localMonthStartInputValue = () => `${localDateInputValue().slice(0, 7)}-01`;
const accessOptions = [
  ["invite", "Invite-only portals", "Only verified people invited by a school administrator can join."],
];

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;
function getStoredTeacherSession() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(teacherSessionStorageKey) || "null");
    return typeof stored?.token === "string" && stored.token.startsWith("staff_") ? stored : null;
  } catch {
    return null;
  }
}

function saveTeacherSession(session) {
  window.sessionStorage.setItem(teacherSessionStorageKey, JSON.stringify(session));
}

function clearTeacherSession() {
  try {
    window.sessionStorage.removeItem(teacherSessionStorageKey);
  } catch {
    return;
  }
}

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
  const teacherSession = getStoredTeacherSession();
  let token = teacherSession?.token;
  let sessionError = null;
  if (!token) {
    if (!authClient) throw new Error("Authentication is not configured.");
    const sessionResult = await authClient.getSession();
    sessionError = sessionResult.error;
    token = sessionResult.data?.session?.token;
    if (!token) {
      const tokenResult = await authClient.token();
      if (tokenResult.error) throw new Error(tokenResult.error.message || "Could not retrieve an authentication token.");
      token = tokenResult.data?.token;
    }
  }
  if (!token) throw new Error(sessionError?.message || "Your session expired. Please sign in again.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(apiUrl(path), { ...options, headers });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && teacherSession) {
      clearTeacherSession();
      window.dispatchEvent(new Event("aster:teacher-session-expired"));
    }
    throw new Error(payload.error || "The request could not be completed.");
  }
  return payload;
}

async function prepareSignatureImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP signature image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a signature image smaller than 5 MB.");

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("That image could not be opened. Choose another file."));
      loadedImage.src = imageUrl;
    });
    const scale = Math.min(1, 1600 / image.naturalWidth, 600 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Your browser could not prepare the signature image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance = (pixels.data[index] * 299 + pixels.data[index + 1] * 587 + pixels.data[index + 2] * 114) / 1000;
      pixels.data[index] = 31;
      pixels.data[index + 1] = 56;
      pixels.data[index + 2] = 40;
      pixels.data[index + 3] = Math.round(pixels.data[index + 3] * Math.max(0, Math.min(1, (231 - luminance) / 180)));
    }
    context.putImageData(pixels, 0, 0);
    const signatureData = canvas.toDataURL("image/png");
    if (signatureData.length > 88_000) {
      throw new Error("The signature is still too large after optimization. Try a tightly cropped image.");
    }
    return signatureData;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function prepareSchoolLogoImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP school logo.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a logo image smaller than 5 MB.");

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("That image could not be opened. Choose another file."));
      loadedImage.src = imageUrl;
    });
    const scale = Math.min(1, 512 / image.naturalWidth, 512 / image.naturalHeight);
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the school logo.");

    while (Math.max(width, height) >= 128) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const logoData = canvas.toDataURL("image/png");
      if (logoData.length <= 88_000) return logoData;
      width = Math.round(width * 0.8);
      height = Math.round(height * 0.8);
    }
    throw new Error("This logo is too detailed to optimize. Try a simpler image smaller than 64 KB.");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function prepareProfilePhotoImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP profile photo.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a profile photo smaller than 5 MB.");

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("That image could not be opened. Choose another file."));
      loadedImage.src = imageUrl;
    });
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new Error("That image has invalid dimensions. Choose another file.");
    }
    const scale = Math.min(1, 128 / image.naturalWidth, 128 / image.naturalHeight);
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the profile photo.");

    while (Math.max(width, height) > 32) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const photoData = canvas.toDataURL("image/png");
      if (photoData.length <= 21_300) return photoData;
      width = Math.round(width * 0.8);
      height = Math.round(height * 0.8);
    }
    throw new Error("This photo is too detailed to optimize. Try a simpler image.");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function StudentReportCard({ school, result, rows, signatures, logoData }) {
  const summary = summarizePublishedResultRows(rows);
  const student = rows[0];
  const schoolCode = school.slug || school.id;
  const schoolMark = school.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const averagePercentage = summary.averagePercentage;
  return <article className="student-report-card">
    <header className="student-report-print-heading">
      <div className="student-report-school-brand">
        {logoData
          ? <img className="student-report-school-logo" src={logoData} alt={`${school.name} logo`} />
          : <span className="student-report-school-mark" aria-hidden="true">{schoolMark}</span>}
        <div className="student-report-school-details">
          <strong>{school.name}</strong>
          <span>{[school.schoolType, school.country].filter(Boolean).join(" · ") || "School"}</span>
          {school.email && <small>{school.email}</small>}
        </div>
        <div className="student-report-school-reference"><small>SCHOOL REF</small><strong>{schoolCode}</strong></div>
      </div>
      <div className="student-report-title"><div><span>OFFICIAL ACADEMIC RECORD</span><span className="student-report-term-pill">{result.term} · {result.academicYear}</span></div><h2>Student result sheet</h2><p>Academic performance and approved assessment summary</p></div>
      <div className="student-report-identity">
        <span className="student-report-name"><b>Student name</b><strong>{student.firstName} {student.lastName}</strong></span>
        <span><b>Admission no.</b><strong>{student.admissionNumber}</strong></span>
        <span><b>Class</b><strong>{result.grade} {result.section}</strong></span>
        <span><b>Academic year</b><strong>{result.academicYear}</strong></span>
        <span><b>Term</b><strong>{result.term}</strong></span>
        <span><b>Date published</b><strong>{new Date(result.publishedAt).toLocaleDateString("en-NG")}</strong></span>
      </div>
    </header>
    <div className="student-report-summary" aria-label="Report summary">
      <div className="student-report-average">
        <small>Overall average</small>
        <strong>{averagePercentage == null ? "—" : `${averagePercentage.toFixed(2)}%`}</strong>
        <span className="student-report-average-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, averagePercentage || 0))}%` }} /></span>
      </div>
      <div><small>Overall grade</small><strong className="student-report-highlight">{student.overallGrade || "—"}</strong><span className="student-report-summary-caption">Weighted term result</span></div>
      <div><small>Class position</small><strong className="student-report-highlight">{formatClassPosition(student.classPosition)}</strong><span className="student-report-summary-caption">Among classmates</span></div>
    </div>
    <div className="student-report-details" aria-label="Assessment overview">
      <span><small>Total points</small><strong>{summary.earnedPoints.toLocaleString("en-NG")} <i>/</i> {summary.possiblePoints.toLocaleString("en-NG")}</strong></span>
      <span><small>Subjects graded</small><strong>{summary.gradedSubjectCount} <i>/</i> {summary.subjectCount}</strong></span>
      <span><small>Approved assessments</small><strong>{summary.assessmentCount}</strong></span>
    </div>
    <section className="student-report-academics">
      <div className="student-report-section-heading"><div><span>TERM BREAKDOWN</span><h3>Subject performance</h3></div><small>{summary.subjectCount} subject{summary.subjectCount === 1 ? "" : "s"}</small></div>
      <div className="table-scroll"><table className="result-sheet-table"><thead><tr><th>SUBJECT</th><th>SCORE EARNED</th><th>ASSESSMENTS</th><th>TERM AVERAGE</th><th>GRADE</th></tr></thead><tbody>{rows.map((row) => <tr key={row.subject}>
      <td><strong>{row.subject}</strong></td>
      <td>{row.percentage == null ? "—" : `${Number(row.earnedPoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })} / ${Number(row.possiblePoints).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`}</td>
      <td>{row.assessmentCount}</td>
      <td><div className="student-report-subject-average"><strong className={row.percentage == null ? "ungraded-mark" : ""}>{row.percentage == null ? "Not graded" : `${Number(row.percentage).toFixed(2)}%`}</strong>{row.percentage != null && <span aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, Number(row.percentage)))}%` }} /></span>}</div></td>
      <td><span className={`student-report-grade-pill${row.grade ? "" : " is-empty"}`}>{row.grade || "—"}</span></td>
    </tr>)}</tbody></table></div>
    </section>
    <p className="student-report-note">Results are calculated from approved assessments using this school’s published grading rules. Class position is shown when the school’s completeness requirements are met.</p>
    <footer className="student-report-signatures">
      <span><div className="student-report-signature-line">{signatures?.formMasterSignature && <img src={signatures.formMasterSignature} alt={`${signatures.formMasterName || "Form master"} signature`} />}</div><b>Form master</b><small>{signatures?.formMasterName || "Signature not uploaded"}</small></span>
      <span><div className="student-report-signature-line">{signatures?.principalSignature && <img src={signatures.principalSignature} alt={`${signatures.principalName || "Principal"} signature`} />}</div><b>Principal</b><small>{signatures?.principalName || "Signature not uploaded"}</small></span>
      <span><div className="student-report-signature-line" /><b>Parent / guardian</b></span>
    </footer>
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

function PortalLoadingScreen({ title, message, detail }) {
  return (
    <main className="session-restore-shell" aria-busy="true">
      <section className="session-restore-card" role="status" aria-live="polite">
        <div className="brand session-restore-brand" aria-label="Aster">
          <AsterLogoMark /><span className="brand-name">aster<span>.</span></span>
        </div>
        <span className="session-restore-spinner" aria-hidden="true" />
        <h1>{title}</h1>
        <p>{message}</p>
        <small>{detail}</small>
      </section>
    </main>
  );
}

function LoadingMessage({ children, className = "" }) {
  return (
    <p className={`loading-message ${className}`.trim()} role="status">
      <span className="loading-message-spinner" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [demoOpen, setDemoOpen] = useState(() => window.location.pathname === "/demo");
  const [authMode, setAuthMode] = useState("sign-in");
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
  const [educationalLevels, setEducationalLevels] = useState([]);
  const [draftEducationalLevelCodes, setDraftEducationalLevelCodes] = useState([]);
  const [loadingEducationalLevels, setLoadingEducationalLevels] = useState(false);
  const [savingEducationalLevels, setSavingEducationalLevels] = useState(false);
  const [educationalLevelError, setEducationalLevelError] = useState("");
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
  const [academicCalendarData, setAcademicCalendarData] = useState(null);
  const [loadingAcademicCalendar, setLoadingAcademicCalendar] = useState(false);
  const [academicCalendarError, setAcademicCalendarError] = useState("");
  const [academicCalendarSaving, setAcademicCalendarSaving] = useState("");
  const [academicCalendarRefresh, setAcademicCalendarRefresh] = useState(0);
  const [newAcademicYear, setNewAcademicYear] = useState(currentAcademicYear);
  const [newAcademicSessionIsCurrent, setNewAcademicSessionIsCurrent] = useState(false);
  const [academicTermDrafts, setAcademicTermDrafts] = useState({});
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
    photoData: "",
  });
  const studentPhotoInputRef = useRef(null);
  const [teacherPhotoData, setTeacherPhotoData] = useState("");
  const teacherPhotoInputRef = useRef(null);
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
  const [formMasterAssignments, setFormMasterAssignments] = useState([]);
  const [formMasterSelections, setFormMasterSelections] = useState({});
  const [formMasterLoading, setFormMasterLoading] = useState(false);
  const [formMasterSavingClassId, setFormMasterSavingClassId] = useState("");
  const [formMasterError, setFormMasterError] = useState("");
  const [formMasterRefresh, setFormMasterRefresh] = useState(0);
  const [mySignature, setMySignature] = useState(null);
  const [signatureCanUpload, setSignatureCanUpload] = useState(false);
  const [signatureRole, setSignatureRole] = useState("");
  const [signatureFormMasterClasses, setSignatureFormMasterClasses] = useState([]);
  const [signatureFileData, setSignatureFileData] = useState("");
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [signatureRefresh, setSignatureRefresh] = useState(0);
  const [schoolLogoData, setSchoolLogoData] = useState(null);
  const [schoolLogoSchoolId, setSchoolLogoSchoolId] = useState("");
  const [schoolLogoFileData, setSchoolLogoFileData] = useState("");
  const [schoolLogoLoading, setSchoolLogoLoading] = useState(false);
  const [schoolLogoSaving, setSchoolLogoSaving] = useState(false);
  const [schoolLogoError, setSchoolLogoError] = useState("");
  const schoolLogoFileInputRef = useRef(null);
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
  const [studentResultsRefresh, setStudentResultsRefresh] = useState(0);
  const [studentNotifications, setStudentNotifications] = useState([]);
  const [studentNotificationsSchoolId, setStudentNotificationsSchoolId] = useState("");
  const [studentNotificationUnreadCount, setStudentNotificationUnreadCount] = useState(0);
  const [studentNotificationsLoading, setStudentNotificationsLoading] = useState(false);
  const [studentNotificationsError, setStudentNotificationsError] = useState("");
  const [studentNotificationRefresh, setStudentNotificationRefresh] = useState(0);
  const [studentNotificationsOpen, setStudentNotificationsOpen] = useState(false);
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
  const activeEducationalLevels = educationalLevels.filter((level) => level.active);
  const activeGradeOptions = activeEducationalLevels.flatMap((level) => level.grades);
  const savedEducationalLevelCodes = activeEducationalLevels.map((level) => level.code).sort();
  const normalizedEducationalLevelDraft = normalizeEducationalLevelSelection(draftEducationalLevelCodes);
  const educationalLevelsChanged = JSON.stringify([...draftEducationalLevelCodes].sort())
    !== JSON.stringify(savedEducationalLevelCodes);
  const activeGradeOptionsKey = activeGradeOptions.join("|");
  const dashboardForCurrentSchool = dashboardData && dashboardData.schoolId === school?.id ? dashboardData : null;
  const academicCalendarForCurrentSchool = academicCalendarData && school?.id
    && academicCalendarData.schoolId === school.id
    ? academicCalendarData.sessions
    : [];
  const currentAcademicSession = academicCalendarForCurrentSchool.find((item) => item.isCurrent) || null;
  const currentAcademicTerm = currentAcademicSession?.terms.find((item) => item.isCurrent)?.term || "";
  const schoolLogoForCurrentSchool = schoolLogoSchoolId === school?.id ? schoolLogoData : null;
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
  const notificationsMatchCurrentSchool = studentNotificationsSchoolId === school?.id;
  const notificationsForCurrentSchool = notificationsMatchCurrentSchool ? studentNotifications : [];
  const unreadNotificationsForCurrentSchool = notificationsMatchCurrentSchool ? studentNotificationUnreadCount : 0;
  const loadingNotificationsForCurrentSchool = studentNotificationsLoading || (role === "student" && !notificationsMatchCurrentSchool);
  const notificationsErrorForCurrentSchool = notificationsMatchCurrentSchool ? studentNotificationsError : "";
  const selectedStudentResult = availableStudentSheets.find((sheet) => sheet.id === selectedStudentResultId) || null;
  const studentPerformanceHistory = role === "student" && studentResultData?.linked
    ? [...studentResultData.sheets]
      .map((sheet) => ({
        ...sheet,
        summary: summarizePublishedResultRows(sheet.rows),
      }))
      .sort((left, right) => new Date(left.publishedAt) - new Date(right.publishedAt))
    : [];
  const visibleStudentPerformanceHistory = studentPerformanceHistory.slice(-6);
  const latestStudentHistory = studentPerformanceHistory[studentPerformanceHistory.length - 1];
  const previousStudentHistory = studentPerformanceHistory[studentPerformanceHistory.length - 2];
  const studentHistoryChange = latestStudentHistory?.summary.averagePercentage != null
    && previousStudentHistory?.summary.averagePercentage != null
    ? Number((latestStudentHistory.summary.averagePercentage - previousStudentHistory.summary.averagePercentage).toFixed(1))
    : null;
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
    const handleDemoRouteChange = () => setDemoOpen(window.location.pathname === "/demo");
    window.addEventListener("popstate", handleDemoRouteChange);
    return () => window.removeEventListener("popstate", handleDemoRouteChange);
  }, []);
  const teacherPerformanceTrends = useMemo(() => {
    if (role !== "teacher") return [];
    const groups = new Map();
    for (const report of dashboardForCurrentSchool?.teacherPerformanceHistory || []) {
      const key = `${report.classId}:${report.subject}`;
      const group = groups.get(key) || { reports: [] };
      group.reports.push(report);
      groups.set(key, group);
    }
    return [...groups.values()]
      .map(({ reports }) => {
        const [latest, previous] = reports;
        const change = latest?.averagePercentage != null && previous?.averagePercentage != null
          ? Number((latest.averagePercentage - previous.averagePercentage).toFixed(1))
          : null;
        return { ...latest, change };
      })
      .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
  }, [role, dashboardForCurrentSchool]);
  useEffect(() => {
    if (!printingClassReports) return undefined;
    const finishPrinting = () => setPrintingClassReports(false);
    document.body.classList.add("printing-class-reports");
    window.addEventListener("afterprint", finishPrinting, { once: true });
    const frame = window.requestAnimationFrame(() => { void printCurrentReports(); });
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
  const teacherAssessmentActions = role === "teacher"
    ? assessments
        .filter((assessment) => ["draft", "returned"].includes(assessment.status))
        .map((assessment) => ({ ...assessment, dueDateInfo: assessmentDueDateInfo(assessment.dueDate) }))
        .sort((left, right) => {
          const leftDaysUntil = left.dueDateInfo.daysUntil ?? Number.POSITIVE_INFINITY;
          const rightDaysUntil = right.dueDateInfo.daysUntil ?? Number.POSITIVE_INFINITY;
          if (leftDaysUntil !== rightDaysUntil) return leftDaysUntil - rightDaysUntil;
          if (left.status !== right.status) return left.status === "returned" ? -1 : 1;
          return left.title.localeCompare(right.title);
        })
    : [];
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
    function handleTeacherSessionExpired() {
      setSession(null);
      setSchools([]);
      setSchool(null);
      setSchoolRouteError(false);
      setAuthNotice("Your teacher session expired. Sign in again with your teacher ID and password.");
    }
    window.addEventListener("aster:teacher-session-expired", handleTeacherSessionExpired);
    return () => window.removeEventListener("aster:teacher-session-expired", handleTeacherSessionExpired);
  }, []);

  useEffect(() => {
    let active = true;
    if (!school?.id || !["profile", "results"].includes(page)) {
      setSchoolLogoData(null);
      setSchoolLogoSchoolId("");
      setSchoolLogoFileData("");
      setSchoolLogoLoading(false);
      setSchoolLogoError("");
      return () => { active = false; };
    }

    setSchoolLogoData(null);
    setSchoolLogoSchoolId(school.id);
    setSchoolLogoLoading(true);
    setSchoolLogoError("");
    apiRequest(`/api/schools/${school.id}/logo`)
      .then(({ logoData }) => {
        if (active) setSchoolLogoData(logoData);
      })
      .catch((requestError) => {
        if (active) setSchoolLogoError(requestError.message || "Could not load the school logo.");
      })
      .finally(() => {
        if (active) setSchoolLogoLoading(false);
      });
    return () => { active = false; };
  }, [school?.id, page]);

  useEffect(() => {
    let active = true;
    let timeoutId = null;
    async function restoreSavedSession() {
      const teacherSession = getStoredTeacherSession();
      if (teacherSession?.token) {
        const response = await fetch(apiUrl("/api/auth/session"), {
          headers: { Authorization: `Bearer ${teacherSession.token}` },
        });
        const payload = await response.json();
        if (response.ok && payload?.user?.id && payload?.user?.email) {
          if (active) {
            setSession({
              token: teacherSession.token,
              user: { ...payload.user, emailVerified: true },
              authType: "teacher-session",
            });
          }
          return;
        }
        if (response.status === 401) clearTeacherSession();
        else throw new Error(payload.error || "Could not restore the teacher session.");
      }

      if (!authClient) {
        setAuthNotice("Neon Auth is not configured. Teacher ID/password sign-in remains available.");
        return;
      }
      const result = await authClient.getSession();
      if (result.error) throw new Error(result.error.message || "Could not restore your session.");
      if (active) setSession(result.data?.session || null);
    }

    const timeoutRequest = new Promise((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("Session restoration timed out. Please sign in again.")),
        SESSION_RESTORE_TIMEOUT_MS,
      );
    });
    Promise.race([Promise.resolve().then(restoreSavedSession), timeoutRequest])
      .catch((sessionError) => {
        if (active) setAuthNotice(sessionError.message || "Could not restore your session.");
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
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
    if (!school?.id || role !== "admin") {
      setAcademicCalendarData(null);
      setAcademicTermDrafts({});
      setLoadingAcademicCalendar(false);
      setAcademicCalendarError("");
      return () => { active = false; };
    }

    setAcademicCalendarData(null);
    setLoadingAcademicCalendar(true);
    setAcademicCalendarError("");
    apiRequest(`/api/schools/${school.id}/academic-calendar`)
      .then(({ calendar }) => {
        if (!Array.isArray(calendar?.sessions)) throw new Error("The school’s academic calendar could not be read.");
        if (!active) return;
        setAcademicCalendarData({ schoolId: school.id, sessions: calendar.sessions });
        setAcademicTermDrafts(Object.fromEntries(calendar.sessions.map((session) => [
          session.academicYear,
          session.terms.map(({ term, startDate, endDate }) => ({ term, startDate: startDate || "", endDate: endDate || "" })),
        ])));
        const currentSession = calendar.sessions.find((session) => session.isCurrent);
        if (currentSession) {
          setClassForm((previous) => ({ ...previous, academicYear: currentSession.academicYear }));
        }
      })
      .catch((requestError) => {
        if (active) setAcademicCalendarError(requestError.message || "Could not load the academic calendar.");
      })
      .finally(() => {
        if (active) setLoadingAcademicCalendar(false);
      });
    return () => { active = false; };
  }, [school?.id, role, academicCalendarRefresh]);

  useEffect(() => {
    if (!currentAcademicTerm) return;
    setAssessmentForm((previous) => ({ ...previous, term: currentAcademicTerm }));
    setResultSheetTerm(currentAcademicTerm);
  }, [school?.id, currentAcademicSession?.academicYear, currentAcademicTerm]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "classes" || !["admin", "teacher"].includes(role)) {
      setLoadingEducationalLevels(false);
      return () => { active = false; };
    }

    setEducationalLevels([]);
    setDraftEducationalLevelCodes([]);
    setLoadingEducationalLevels(true);
    setEducationalLevelError("");
    apiRequest(`/api/schools/${school.id}/educational-levels`)
      .then(({ levels }) => {
        const levelCodes = Array.isArray(levels) ? levels.filter((level) => level.active).map((level) => level.code) : [];
        if (!normalizeEducationalLevelSelection(levelCodes)) {
          throw new Error("The school’s saved educational levels are invalid.");
        }
        if (!active) return;
        setEducationalLevels(levels);
        setDraftEducationalLevelCodes(levelCodes);
      })
      .catch((requestError) => {
        if (active) setEducationalLevelError(requestError.message || "Could not load educational levels.");
      })
      .finally(() => {
        if (active) setLoadingEducationalLevels(false);
      });
    return () => { active = false; };
  }, [school?.id, role, page]);

  useEffect(() => {
    if (!activeGradeOptions.length) return;
    if (!activeGradeOptions.includes(selectedGrade)) setSelectedGrade(activeGradeOptions[0]);
    if (!activeGradeOptions.includes(classForm.grade)) {
      setClassForm((previous) => ({ ...previous, grade: activeGradeOptions[0] }));
    }
  }, [activeGradeOptionsKey, selectedGrade, classForm.grade]);

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
    const shouldLoadStudentResults = page === "results" || (role === "student" && page === "overview");
    if (!school?.id || !shouldLoadStudentResults || !["student", "parent"].includes(role)) {
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
  }, [school?.id, page, role, studentResultsRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || role !== "student") {
      setStudentNotifications([]);
      setStudentNotificationsSchoolId("");
      setStudentNotificationUnreadCount(0);
      setStudentNotificationsLoading(false);
      setStudentNotificationsError("");
      setStudentNotificationsOpen(false);
      return () => { active = false; };
    }

    setStudentNotifications([]);
    setStudentNotificationsSchoolId(school.id);
    setStudentNotificationUnreadCount(0);
    setStudentNotificationsLoading(true);
    setStudentNotificationsError("");
    apiRequest(`/api/schools/${school.id}/notifications`)
      .then(({ notifications, unreadCount }) => {
        if (!active) return;
        setStudentNotifications(notifications);
        setStudentNotificationsSchoolId(school.id);
        setStudentNotificationUnreadCount(unreadCount);
      })
      .catch((requestError) => {
        if (!active) return;
        setStudentNotificationsError(requestError.message || "Could not load notifications.");
      })
      .finally(() => {
        if (active) setStudentNotificationsLoading(false);
      });
      const refreshNotifications = () => setStudentNotificationRefresh((previous) => previous + 1);
      const notificationInterval = window.setInterval(refreshNotifications, 60_000);
      window.addEventListener("focus", refreshNotifications);
      return () => {
        active = false;
        window.clearInterval(notificationInterval);
        window.removeEventListener("focus", refreshNotifications);
      };
  }, [school?.id, role, studentNotificationRefresh]);

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
    if (!school?.id || page !== "teachers" || role !== "admin") {
      setFormMasterAssignments([]);
      setFormMasterSelections({});
      setFormMasterLoading(false);
      return () => { active = false; };
    }

    setFormMasterLoading(true);
    setFormMasterError("");
    apiRequest(`/api/schools/${school.id}/form-masters`)
      .then(({ assignments }) => {
        if (active) setFormMasterAssignments(assignments);
      })
      .catch((requestError) => {
        if (active) setFormMasterError(requestError.message || "Could not load form-master assignments.");
      })
      .finally(() => {
        if (active) setFormMasterLoading(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, formMasterRefresh]);

  useEffect(() => {
    let active = true;
    if (!school?.id || page !== "results" || !["admin", "teacher"].includes(role)) {
      setMySignature(null);
      setSignatureCanUpload(false);
      setSignatureRole("");
      setSignatureFormMasterClasses([]);
      setSignatureLoading(false);
      setSignatureError("");
      setSignatureFileData("");
      return () => { active = false; };
    }

    setSignatureLoading(true);
    setSignatureError("");
    apiRequest(`/api/schools/${school.id}/my-signature`)
      .then((data) => {
        if (!active) return;
        setMySignature(data.signatureData);
        setSignatureCanUpload(data.canUpload);
        setSignatureRole(data.signerRole);
        setSignatureFormMasterClasses(data.formMasterClasses || []);
      })
      .catch((requestError) => {
        if (active) setSignatureError(requestError.message || "Could not load your signature settings.");
      })
      .finally(() => {
        if (active) setSignatureLoading(false);
      });
    return () => { active = false; };
  }, [school?.id, page, role, signatureRefresh]);

  useEffect(() => {
    let active = true;
    const shouldLoadAssessments = page === "results" || (role === "teacher" && page === "overview");
    if (!school?.id || !shouldLoadAssessments || ["student", "parent"].includes(role)) {
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
      surface.style.setProperty("--tilt-x", `${(-py * 3).toFixed(2)}deg`);
      surface.style.setProperty("--tilt-y", `${(px * 4).toFixed(2)}deg`);
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
      const payload = await apiRequest(`/api/schools/${school.id}/teacher-credentials`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, teacherName, photoData: teacherPhotoData }),
      });
      setTeacherRoster((previous) => [
        ...previous.filter((teacher) => teacher.userId !== payload.credential.userId),
        {
          userId: payload.credential.userId,
          email: payload.credential.email,
          teacherName: payload.credential.teacherName,
          teacherCode: payload.credential.teacherCode,
          photoData: payload.credential.photoData,
        },
      ]);
      setTeacherRegistration({
        ...payload.credential,
        adminNotification: payload.adminNotification || {
          status: "unavailable",
          message: "The administrator notification status is unavailable.",
        },
      });
      setTeacherName("");
      setInviteEmail("");
      setTeacherPhotoData("");
      if (teacherPhotoInputRef.current) teacherPhotoInputRef.current.value = "";
      setToast("Teacher ID and permanent password are ready. The teacher can now be assigned to classes and duties.");
    } catch (requestError) {
      setTeacherRegistrationError(requestError.message || "Could not register this teacher.");
    } finally {
      setInviting(false);
    }
  }

  async function copyTeacherCredentials() {
    try {
      await navigator.clipboard.writeText(
        `Teacher ID: ${teacherRegistration.teacherCode}\nPassword: ${teacherRegistration.teacherPassword}\nSign-in email: ${teacherRegistration.email}`,
      );
      setToast("Teacher credentials copied. Share them directly and privately with the teacher.");
    } catch {
      setToast("Could not copy the credentials. Select the ID and password fields to copy them manually.");
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
      setToast("Result sheet published and frozen. Linked students can now see a notification.");
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

  function toggleEducationalLevel(code) {
    setDraftEducationalLevelCodes((previous) => {
      if (previous.includes(code)) {
        return previous.length > 1 ? previous.filter((item) => item !== code) : previous;
      }
      return [...previous, code];
    });
  }

  function applyAcademicCalendar(calendar) {
    if (!school || !Array.isArray(calendar?.sessions)) return;
    setAcademicCalendarData({ schoolId: school.id, sessions: calendar.sessions });
    setAcademicTermDrafts(Object.fromEntries(calendar.sessions.map((session) => [
      session.academicYear,
      session.terms.map(({ term, startDate, endDate }) => ({ term, startDate: startDate || "", endDate: endDate || "" })),
    ])));
    const currentSession = calendar.sessions.find((session) => session.isCurrent);
    if (currentSession) {
      setClassForm((previous) => ({ ...previous, academicYear: currentSession.academicYear }));
    }
  }

  function updateAcademicTermDraft(academicYear, term, field, value) {
    setAcademicTermDrafts((previous) => ({
      ...previous,
      [academicYear]: (previous[academicYear] || []).map((item) => (
        item.term === term ? { ...item, [field]: value } : item
      )),
    }));
  }

  async function createAcademicSession(event) {
    event.preventDefault();
    if (!school) return;
    setAcademicCalendarSaving("new-session");
    setAcademicCalendarError("");
    try {
      const { calendar } = await apiRequest(`/api/schools/${school.id}/academic-calendar/sessions`, {
        method: "POST",
        body: JSON.stringify({ academicYear: newAcademicYear, isCurrent: newAcademicSessionIsCurrent }),
      });
      applyAcademicCalendar(calendar);
      setNewAcademicSessionIsCurrent(false);
      setToast("Academic session added with Term 1, Term 2, and Term 3.");
    } catch (requestError) {
      setAcademicCalendarError(requestError.message || "Could not add the academic session.");
    } finally {
      setAcademicCalendarSaving("");
    }
  }

  async function selectCurrentAcademicSession(academicYear) {
    if (!school) return;
    setAcademicCalendarSaving(`session-${academicYear}`);
    setAcademicCalendarError("");
    try {
      const { calendar } = await apiRequest(`/api/schools/${school.id}/academic-calendar/current-session`, {
        method: "PUT",
        body: JSON.stringify({ academicYear }),
      });
      applyAcademicCalendar(calendar);
      setToast(`${academicYear} is now the current academic session.`);
    } catch (requestError) {
      setAcademicCalendarError(requestError.message || "Could not change the current session.");
    } finally {
      setAcademicCalendarSaving("");
    }
  }

  async function selectCurrentAcademicTerm(academicYear, term) {
    if (!school) return;
    setAcademicCalendarSaving(`term-${academicYear}`);
    setAcademicCalendarError("");
    try {
      const { calendar } = await apiRequest(`/api/schools/${school.id}/academic-calendar/current-term`, {
        method: "PUT",
        body: JSON.stringify({ academicYear, term }),
      });
      applyAcademicCalendar(calendar);
      setToast(`${term} is now the current term for ${academicYear}.`);
    } catch (requestError) {
      setAcademicCalendarError(requestError.message || "Could not change the current term.");
    } finally {
      setAcademicCalendarSaving("");
    }
  }

  async function saveAcademicTermDates(event, academicYear) {
    event.preventDefault();
    if (!school) return;
    setAcademicCalendarSaving(`dates-${academicYear}`);
    setAcademicCalendarError("");
    try {
      const { calendar } = await apiRequest(`/api/schools/${school.id}/academic-calendar/terms`, {
        method: "PUT",
        body: JSON.stringify({ academicYear, terms: academicTermDrafts[academicYear] || [] }),
      });
      applyAcademicCalendar(calendar);
      setToast(`Term dates saved for ${academicYear}.`);
    } catch (requestError) {
      setAcademicCalendarError(requestError.message || "Could not save term dates.");
    } finally {
      setAcademicCalendarSaving("");
    }
  }

  async function saveEducationalLevels() {
    if (!school || !normalizedEducationalLevelDraft) {
      setEducationalLevelError("Keep at least one educational level selected.");
      return;
    }

    setSavingEducationalLevels(true);
    setEducationalLevelError("");
    try {
      const { levels } = await apiRequest(`/api/schools/${school.id}/educational-levels`, {
        method: "PUT",
        body: JSON.stringify({ levelCodes: normalizedEducationalLevelDraft }),
      });
      setEducationalLevels(levels);
      setDraftEducationalLevelCodes(levels.filter((level) => level.active).map((level) => level.code));
      setToast("Educational levels saved. Class and subject setup now follows your selected levels.");
    } catch (requestError) {
      setEducationalLevelError(requestError.message || "Could not save educational levels.");
    } finally {
      setSavingEducationalLevels(false);
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

  async function assignFormMaster(event, classId, teacherUserId) {
    event.preventDefault();
    if (!school || !classId || !teacherUserId) return;
    setFormMasterSavingClassId(classId);
    setFormMasterError("");
    try {
      await apiRequest(`/api/schools/${school.id}/form-masters`, {
        method: "PUT",
        body: JSON.stringify({ classId, teacherUserId }),
      });
      setFormMasterRefresh((previous) => previous + 1);
      setToast("Class form master assigned.");
    } catch (requestError) {
      setFormMasterError(requestError.message || "Could not assign the form master.");
    } finally {
      setFormMasterSavingClassId("");
    }
  }

  async function removeFormMaster(assignment) {
    if (!school || !window.confirm(`Remove ${assignment.teacherName} as form master for ${assignment.grade} ${assignment.section}?`)) return;
    setFormMasterSavingClassId(assignment.classId);
    setFormMasterError("");
    try {
      await apiRequest(`/api/schools/${school.id}/form-masters/${assignment.classId}`, { method: "DELETE" });
      setFormMasterRefresh((previous) => previous + 1);
      setToast("Form-master assignment removed.");
    } catch (requestError) {
      setFormMasterError(requestError.message || "Could not remove the form-master assignment.");
    } finally {
      setFormMasterSavingClassId("");
    }
  }

  async function prepareSignatureFile(event) {
    const file = event.target.files?.[0];
    setSignatureError("");
    setSignatureFileData("");
    if (!file) return;
    try {
      setSignatureFileData(await prepareSignatureImage(file));
    } catch (requestError) {
      setSignatureError(requestError.message || "Could not prepare that signature image.");
      event.target.value = "";
    }
  }

  async function prepareSchoolLogoFile(event) {
    const file = event.target.files?.[0];
    setSchoolLogoError("");
    setSchoolLogoFileData("");
    if (!file) return;
    try {
      setSchoolLogoFileData(await prepareSchoolLogoImage(file));
    } catch (requestError) {
      setSchoolLogoError(requestError.message || "Could not prepare that school logo.");
      event.target.value = "";
    }
  }

  async function prepareTeacherPhotoFile(event) {
    const file = event.target.files?.[0];
    setTeacherRegistrationError("");
    if (!file) return;
    try {
      setTeacherPhotoData(await prepareProfilePhotoImage(file));
    } catch (requestError) {
      setTeacherRegistrationError(requestError.message || "Could not prepare that teacher photo.");
      event.target.value = "";
    }
  }

  async function prepareStudentPhotoFile(event) {
    const file = event.target.files?.[0];
    setStudentError("");
    if (!file) return;
    try {
      const photoData = await prepareProfilePhotoImage(file);
      setStudentForm((previous) => ({ ...previous, photoData }));
    } catch (requestError) {
      setStudentError(requestError.message || "Could not prepare that student photo.");
      event.target.value = "";
    }
  }

  async function saveSchoolLogoUpload(event) {
    event.preventDefault();
    if (!school || !schoolLogoFileData || role !== "admin") return;
    setSchoolLogoSaving(true);
    setSchoolLogoError("");
    try {
      const { logoData } = await apiRequest(`/api/schools/${school.id}/logo`, {
        method: "PUT",
        body: JSON.stringify({ logoData: schoolLogoFileData }),
      });
      setSchoolLogoData(logoData);
      setSchoolLogoSchoolId(school.id);
      setSchoolLogoFileData("");
      if (schoolLogoFileInputRef.current) schoolLogoFileInputRef.current.value = "";
      setToast("School logo saved. It will appear on printed result reports.");
    } catch (requestError) {
      setSchoolLogoError(requestError.message || "Could not save the school logo.");
    } finally {
      setSchoolLogoSaving(false);
    }
  }

  async function removeSchoolLogoUpload() {
    if (!school || !window.confirm("Remove the school logo from future printed reports?")) return;
    setSchoolLogoSaving(true);
    setSchoolLogoError("");
    try {
      await apiRequest(`/api/schools/${school.id}/logo`, { method: "DELETE" });
      setSchoolLogoData(null);
      setSchoolLogoFileData("");
      if (schoolLogoFileInputRef.current) schoolLogoFileInputRef.current.value = "";
      setToast("School logo removed from future reports.");
    } catch (requestError) {
      setSchoolLogoError(requestError.message || "Could not remove the school logo.");
    } finally {
      setSchoolLogoSaving(false);
    }
  }

  async function saveMySignature(event) {
    event.preventDefault();
    if (!school || !signatureFileData || !signatureCanUpload) return;
    setSignatureSaving(true);
    setSignatureError("");
    try {
      const { signatureData } = await apiRequest(`/api/schools/${school.id}/my-signature`, {
        method: "PUT",
        body: JSON.stringify({ signatureData: signatureFileData }),
      });
      setMySignature(signatureData);
      setSignatureFileData("");
      setAssessmentRefresh((previous) => previous + 1);
      setToast(`${signatureRole} signature saved.`);
    } catch (requestError) {
      setSignatureError(requestError.message || "Could not save your signature.");
    } finally {
      setSignatureSaving(false);
    }
  }

  async function removeMySignature() {
    if (!school || !window.confirm("Remove your saved report signature?")) return;
    setSignatureSaving(true);
    setSignatureError("");
    try {
      await apiRequest(`/api/schools/${school.id}/my-signature`, { method: "DELETE" });
      setMySignature(null);
      setSignatureFileData("");
      setAssessmentRefresh((previous) => previous + 1);
      setToast("Signature removed from future reports.");
    } catch (requestError) {
      setSignatureError(requestError.message || "Could not remove your signature.");
    } finally {
      setSignatureSaving(false);
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
      photoData: "",
    });
    if (studentPhotoInputRef.current) studentPhotoInputRef.current.value = "";
  }

  function editStudent(student) {
    setEditingStudentId(student.id);
    if (studentPhotoInputRef.current) studentPhotoInputRef.current.value = "";
    setStudentForm({
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      classId: student.classId,
      guardianEmail: student.guardianEmail || "",
      guardianPhone: student.guardianPhone || "",
      photoData: student.photoData || "",
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

  async function loginTeacher(teacherCode, password) {
    const response = await fetch(apiUrl("/api/auth/teacher-login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherCode, password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not sign in with those teacher credentials.");
    if (!payload?.token && typeof payload?.legacyEmail !== "string") {
      throw new Error("The teacher login response was incomplete.");
    }
    return payload;
  }

  async function restoreTeacherSession({ token, user }) {
    if (typeof token !== "string" || !token.startsWith("staff_") || !user?.id || !user?.email) {
      throw new Error("The teacher session could not be restored.");
    }
    const teacherSession = { token, user: { ...user, emailVerified: true } };
    saveTeacherSession(teacherSession);
    setAuthNotice("");
    setSession({
      ...teacherSession,
      authType: "teacher-session",
    });
  }

  async function restoreSession({ schoolName = "", signInData = null, newAccount = false } = {}) {
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
    clearTeacherSession();
    if (schoolName) {
      setForm((previous) => ({ ...previous, name: schoolName }));
      setStep(1);
      setModalOpen(true);
    }
    setAuthNotice("");
    setSession(session);
    if (newAccount) {
      try {
        const { emailDelivery } = await apiRequest("/api/account/welcome-email", { method: "POST" });
        setToast(emailDelivery.message);
      } catch (requestError) {
        setToast(`Your account is ready, but the sign-in details email could not be sent: ${requestError.message}`);
      }
    }
  }

  async function signOut() {
    if (session?.authType === "teacher-session") {
      try {
        await apiRequest("/api/auth/teacher-logout", { method: "POST" });
      } catch (requestError) {
        setToast(requestError.message || "The teacher session could not be revoked.");
      } finally {
        clearTeacherSession();
        setSession(null);
        setSchools([]);
        setSchool(null);
        setSchoolRouteError(false);
        setAuthNotice("");
      }
      return;
    }
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
      ["School reference", school.slug || school.id],
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
    const schoolCode = (school.slug || school.id).replace(/[^a-z0-9-]+/gi, "-");
    link.download = `aster-${schoolCode}-result-sheet-${className}-${resultSheet.term.toLowerCase().replace(" ", "-")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setToast("The result sheet has been exported.");
  }

  async function printCurrentReports() {
    try {
      const reportImages = [...document.querySelectorAll(".student-report-card img, .result-sheet-print-brand img")];
      await Promise.all(reportImages.map((image) => image.decode()));
      window.print();
    } catch {
      setToast("Could not prepare report images for printing. Please check the uploaded logo and signatures.");
      setPrintingClassReports(false);
    }
  }

  function printResultSheet() {
    if (resultSheet?.rows.length) void printCurrentReports();
  }

  function printClassReportCards() {
    if (role === "admin" && resultSheet?.published && classReportGroups.length) {
      setPrintingClassReports(true);
    }
  }

  function printStudentReport() {
    if (selectedStudentResult?.rows.length) void printCurrentReports();
  }

  async function openStudentResultNotification(notification) {
    if (!school) return;
    setStudentNotificationsOpen(false);
    setSelectedStudentResultId(notification.publicationId);
    setPage("results");
    if (notification.readAt) return;

    try {
      await apiRequest(`/api/schools/${school.id}/notifications/${notification.id}/read`, { method: "POST" });
      setStudentNotifications((previous) => previous.map((item) => (
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
      )));
      setStudentNotificationUnreadCount((previous) => Math.max(0, previous - 1));
    } catch (requestError) {
      const message = requestError.message || "Could not mark this notification as read.";
      setStudentNotificationsError(message);
      setToast(message);
    }
  }

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function openDemo() {
    window.history.pushState(null, "", "/demo");
    setDemoOpen(true);
  }

  function closeDemo(registering = false) {
    window.history.replaceState(null, "", "/");
    setDemoOpen(false);
    setAuthMode(registering ? "sign-up" : "sign-in");
  }

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "School administrator";
  const userInitials = userName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  if (demoOpen) {
    return <DemoMode onExit={() => closeDemo()} onCreateAccount={() => closeDemo(true)} />;
  }
  if (sessionLoading) {
    return <PortalLoadingScreen title="Welcome back" message="Restoring your secure session" detail="Your school workspace will be ready in a moment." />;
  }
  if (!session?.user || session.user.emailVerified !== true) {
    return (
      <>
        <EducationBackground variant="dark" />
        <AuthScreen
          key={authMode}
          authClient={authClient}
          notice={authNotice}
          initialMode={authMode}
          initialEmail={session?.user?.email}
          verificationRequired={Boolean(session?.user && !session.user.emailVerified)}
          onAuthenticated={restoreSession}
          onTeacherAuthenticated={restoreTeacherSession}
          onLoginTeacher={loginTeacher}
          onDemo={openDemo}
          onWatchVideo={() => setExplainerOpen(true)}
          resetToken={resetToken}
        />
        <ExplainerVideo open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      </>
    );
  }
  if (loadingSchools) {
    return <PortalLoadingScreen title="Almost there" message="Loading your school workspace" detail="Gathering your school profiles and portal access." />;
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
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><span aria-hidden="true">{sidebarOpen ? "×" : "☰"}</span></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{page}</strong></div>
          <div className="topbar-actions">
            <button className="topbar-video" type="button" onClick={() => setExplainerOpen(true)}><span aria-hidden="true">▶</span> How it works</button>
            <span className="role-select" aria-label={platformAdmin ? "Your platform role" : school ? "Your school role" : "Account status"}>{accountRoleLabel}</span>
            {role === "student"
              ? <div className="notification-menu-wrap">
                <button
                  className="icon-button notification-button"
                  type="button"
                  onClick={() => {
                    const opening = !studentNotificationsOpen;
                    setStudentNotificationsOpen(opening);
                    if (opening) setStudentNotificationRefresh((previous) => previous + 1);
                  }}
                  aria-label={`Notifications${unreadNotificationsForCurrentSchool ? `, ${unreadNotificationsForCurrentSchool} unread` : ""}`}
                  aria-expanded={studentNotificationsOpen}
                  aria-controls="student-notifications"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
                  {unreadNotificationsForCurrentSchool > 0 && <span className="notification-count">{unreadNotificationsForCurrentSchool > 99 ? "99+" : unreadNotificationsForCurrentSchool}</span>}
                </button>
                {studentNotificationsOpen && <div className="notification-popover" id="student-notifications" role="region" aria-label="Result notifications">
                  <div className="notification-popover-heading"><strong>Notifications</strong><small>{unreadNotificationsForCurrentSchool ? `${unreadNotificationsForCurrentSchool} unread` : "Your latest result updates"}</small></div>
                  {notificationsErrorForCurrentSchool
                    ? <div className="notification-popover-message" role="alert"><span>{notificationsErrorForCurrentSchool}</span><button className="quiet-action" type="button" onClick={() => setStudentNotificationRefresh((previous) => previous + 1)}>Retry</button></div>
                    : loadingNotificationsForCurrentSchool
                      ? <LoadingMessage className="notification-popover-message">Loading notifications…</LoadingMessage>
                      : notificationsForCurrentSchool.length
                        ? <div className="student-notification-list">{notificationsForCurrentSchool.map((notification) => <button
                          className={`student-notification-item${notification.readAt ? "" : " unread"}`}
                          type="button"
                          key={notification.id}
                          onClick={() => openStudentResultNotification(notification)}
                        >
                          <span className="student-notification-indicator" aria-hidden="true" />
                          <span><strong>{notification.term} results are ready</strong><small>{notification.grade} {notification.section} · {notification.academicYear}</small><small>Published {new Date(notification.publishedAt).toLocaleDateString("en-NG")}</small></span>
                        </button>)}</div>
                        : <p className="notification-popover-message">No published-result notifications yet.</p>}
                </div>}
              </div>
              : <button className="icon-button" type="button" onClick={() => setToast("Result publication notifications are available to linked student accounts.")} aria-label="Notifications">♧</button>}
            <button className="topbar-signout" type="button" aria-label={`Sign out ${userName}`} onClick={signOut}>Sign out</button>
          </div>
        </header>
        <div key={page} className={`page-content page-view ${page === "classes" ? "curriculum-page" : page === "students" ? "students-page" : page === "teachers" ? "teachers-page" : page === "results" ? "results-page" : page === "attendance" ? "attendance-page" : page === "grading" ? "grading-page" : page === "platform" ? "platform-page" : ""}`}>
          <span className="route-sweep" aria-hidden="true" />
          {!school && !(page === "platform" && platformAdmin) ? <section className="panel onboarding-panel"><span className="auth-kicker">WELCOME TO ASTER</span><h1>{platformAdmin ? "Platform owner access" : "No school profile linked"}</h1><p className="page-subtitle">{platformAdmin ? "Your platform workspace is ready. You can create schools from Platform operations when needed." : "Your account is not linked to a school workspace. Platform-owner access is available only to approved email addresses."}</p>{platformAccessError && <p className="form-error" role="alert">Could not check platform access: {platformAccessError}</p>}{platformAccess?.email === verifiedEmail && !platformAccess.isPlatformAdmin && <p className="field-hint" role="status">Platform-owner access has not been confirmed for this account. You can create a school profile later if you need one.</p>}{!platformAdmin && <button className="button button-primary" type="button" onClick={showSetup}>＋ Create school profile</button>}</section> : <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> {currentDateLabel} <span className="eyebrow-divider">·</span> {page === "platform" ? "PLATFORM OPERATIONS" : "SCHOOL WORKSPACE"}</div><h1>{page === "platform" ? "Platform operations" : page === "overview" ? role === "admin" ? `Good morning, ${userName}` : current.title : page === "results" ? role === "student" ? "Results, at a glance" : role === "parent" ? "Your children’s results" : "Result sheet & assessments" : page === "attendance" ? "Daily attendance" : page === "calendar" ? "Academic calendar" : page === "profile" ? "Your school, your story." : page === "classes" ? "Classes & subjects" : page === "grading" ? "Grading rules" : page === "students" ? "Student register" : `${page[0].toUpperCase()}${page.slice(1)}`} <span className="wave">✳</span></h1><p className="page-subtitle">{page === "platform" ? "Monitor aggregate school activity across Aster without opening individual student records." : page === "overview" ? current.subtitle : page === "results" && role === "student" ? "View only the term results your school has published for your linked student record." : page === "results" && role === "parent" ? "View only published reports for children linked to your verified parent account." : page === "results" && role !== "student" && role !== "parent" ? role === "admin" ? "Calculate term percentages from approved marks, publish frozen result sheets, and review submissions." : "View calculated results and enter marks for your assigned classes." : page === "attendance" ? "Record and review daily attendance for your active class roster." : page === "calendar" ? "Set up academic sessions, term dates, and the current school term." : page === "classes" ? "Configure subjects and organise your classes." : page === "grading" ? "Set the grade bands and class-position rules used for new result publications." : page === "students" ? "Enrol students and keep their school records up to date." : `Keep your ${page} organised for the term ahead.`}</p></div>
            {page === "overview" && <HeroScene />}
            {page !== "platform" && page !== "classes" && page !== "students" && page !== "teachers" && page !== "results" && page !== "attendance" && page !== "calendar" && page !== "grading" && !(page === "overview" && role === "parent") && <div className="welcome-actions"><button className="button button-secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${school.portalUrl || `/school/${school.slug}`}`); setToast("Your school workspace link has been copied. Only invited school members can access it."); } catch { setToast("Could not copy the school link. Please try again."); } }}>↗ Copy school workspace link</button><button className="button button-primary" type="button" onClick={() => page === "profile" ? showSetup() : page === "access" ? document.getElementById("inviteEmail")?.focus() : setPage(role === "admin" ? "students" : "results")}>＋ {page === "access" ? "Invite a member" : role === "teacher" ? "Enter marks" : ["student", "parent"].includes(role) ? role === "parent" ? "View child results" : "View my results" : "Add a student"}</button></div>}
          </section>

          {page === "calendar" && role === "admin" && <section className="panel academic-calendar-panel">
            <div className="panel-heading"><div><h2>Academic sessions & terms</h2><p>Set the school’s current session and term, and keep each term’s date range up to date.</p></div></div>
            {academicCalendarError && <div className="academic-calendar-error" role="alert"><span>{academicCalendarError}</span><button className="quiet-action" type="button" onClick={() => setAcademicCalendarRefresh((previous) => previous + 1)} disabled={loadingAcademicCalendar}>Retry loading calendar</button></div>}
            {loadingAcademicCalendar ? <LoadingMessage>Loading academic sessions…</LoadingMessage> : <>
              <form className="academic-session-create-form" onSubmit={createAcademicSession}>
              <label><span>Academic session</span><input className="text-input" type="text" required maxLength={9} pattern="\d{4}/\d{4}" title="Use consecutive years, such as 2026/2027" value={newAcademicYear} onChange={(event) => setNewAcademicYear(event.target.value)} placeholder="2026/2027" disabled={academicCalendarSaving !== ""} /></label>
              <label className="academic-session-current-choice"><input type="checkbox" checked={newAcademicSessionIsCurrent} onChange={(event) => setNewAcademicSessionIsCurrent(event.target.checked)} disabled={academicCalendarSaving !== ""} />Make this the current session</label>
              <button className="button button-primary" type="submit" disabled={academicCalendarSaving !== ""}>{academicCalendarSaving === "new-session" ? "Adding…" : "Add session"}</button>
              </form>
              <p className="field-hint">Every session starts with Term 1, Term 2, and Term 3; the first session is automatically made current. Term dates are optional, but each date range must include both a start and end date; ranges cannot overlap.</p>
              {academicCalendarError && !academicCalendarData ? null : academicCalendarForCurrentSchool.length === 0
                ? <p className="empty-search">No sessions yet. Add the school’s first academic session before creating classes.</p>
                : <div className="academic-session-list">{academicCalendarForCurrentSchool.map((session) => {
                  const termDrafts = academicTermDrafts[session.academicYear] || session.terms.map(({ term, startDate, endDate }) => ({ term, startDate: startDate || "", endDate: endDate || "" }));
                  const termDatesChanged = JSON.stringify(termDrafts) !== JSON.stringify(session.terms.map(({ term, startDate, endDate }) => ({ term, startDate: startDate || "", endDate: endDate || "" })));
                  const currentTerm = session.terms.find((term) => term.isCurrent)?.term || "";
                  return <article className="academic-session-card" key={session.academicYear}>
                    <div className="academic-session-heading">
                      <div><h3>{session.academicYear}</h3>{session.isCurrent && <span className="academic-current-badge">Current session</span>}</div>
                      {!session.isCurrent && <button className="button button-secondary button-small" type="button" onClick={() => selectCurrentAcademicSession(session.academicYear)} disabled={academicCalendarSaving !== ""}>{academicCalendarSaving === `session-${session.academicYear}` ? "Updating…" : "Make current"}</button>}
                    </div>
                    {session.isCurrent && <label className="academic-current-term-control"><span>Current term</span><select className="text-input" value={currentTerm} onChange={(event) => { void selectCurrentAcademicTerm(session.academicYear, event.target.value); }} disabled={academicCalendarSaving !== ""}>{session.terms.map((term) => <option key={term.term}>{term.term}</option>)}</select></label>}
                    <form onSubmit={(event) => saveAcademicTermDates(event, session.academicYear)}>
                      <div className="academic-term-grid">{termDrafts.map((term) => <fieldset className="academic-term-row" key={term.term}>
                        <legend>{term.term}{session.isCurrent && session.terms.find((item) => item.term === term.term)?.isCurrent ? " · current" : ""}</legend>
                        <label><span>Start date</span><input className="text-input" type="date" value={term.startDate || ""} onChange={(event) => updateAcademicTermDraft(session.academicYear, term.term, "startDate", event.target.value)} disabled={academicCalendarSaving !== ""} /></label>
                        <label><span>End date</span><input className="text-input" type="date" value={term.endDate || ""} onChange={(event) => updateAcademicTermDraft(session.academicYear, term.term, "endDate", event.target.value)} disabled={academicCalendarSaving !== ""} /></label>
                      </fieldset>)}</div>
                      <div className="academic-term-footer"><span className="field-hint">{termDatesChanged ? "Unsaved term dates" : "Term dates saved"}</span><button className="button button-primary button-small" type="submit" disabled={!termDatesChanged || academicCalendarSaving !== ""}>{academicCalendarSaving === `dates-${session.academicYear}` ? "Saving…" : "Save term dates"}</button></div>
                    </form>
                  </article>;
                })}</div>}
            </>}
          </section>}

          {page === "profile" && role === "admin" && <section className="panel school-logo-panel">
            <div className="panel-heading"><div><h2>School logo</h2><p>Add your school identity to published report cards and printed result sheets.</p></div></div>
            {schoolLogoError && <p className="form-error" role="alert">{schoolLogoError}</p>}
            {schoolLogoLoading
              ? <LoadingMessage>Loading school logo…</LoadingMessage>
              : <div className="school-logo-current">
                {schoolLogoForCurrentSchool
                  ? <img src={schoolLogoForCurrentSchool} alt={`${school.name} logo`} />
                  : <span className="school-logo-placeholder" aria-hidden="true">{school.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                <div><strong>{schoolLogoForCurrentSchool ? "Current school logo" : "No school logo uploaded"}</strong><small>Appears on student report cards and printed class result sheets.</small></div>
              </div>}
            <form className="school-logo-upload-form" onSubmit={saveSchoolLogoUpload}>
              <label htmlFor="schoolLogoFile">Choose a logo image<input ref={schoolLogoFileInputRef} id="schoolLogoFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={prepareSchoolLogoFile} disabled={schoolLogoSaving} /><small>PNG, JPG, or WebP; maximum 5 MB. Aster optimizes it to a PNG up to 512 × 512 pixels and 64 KB.</small></label>
              {schoolLogoFileData && <img className="school-logo-upload-preview" src={schoolLogoFileData} alt="Preview of school logo to save" />}
              <div className="school-logo-actions">
                <button className="button button-primary" type="submit" disabled={!schoolLogoFileData || schoolLogoSaving}>{schoolLogoSaving ? "Saving…" : "Save school logo"}</button>
                {schoolLogoForCurrentSchool && <button className="button button-secondary" type="button" onClick={removeSchoolLogoUpload} disabled={schoolLogoSaving}>{schoolLogoSaving ? "Saving…" : "Remove logo"}</button>}
              </div>
            </form>
          </section>}

          {page === "platform" && platformAdmin && <section className="platform-overview">
            <section className="panel platform-summary-panel">
              <div className="panel-heading"><div><h2>School network</h2><p>Aggregate operational counts across all Aster schools.</p></div><div className="platform-summary-actions"><button className="button button-primary button-small" type="button" onClick={showSetup}>＋ Add school</button><button className="button button-secondary button-small" type="button" onClick={() => { setPlatformBillingDrafts({}); setPlatformBillingFeedback({}); setPlatformSchoolStatusFeedback({}); setPlatformRefresh((previous) => previous + 1); }} disabled={loadingPlatformOverview || platformSchoolActionBusy}>Refresh</button></div></div>
              {platformOverviewError && <p className="form-error" role="alert">{platformOverviewError}</p>}
              {loadingPlatformOverview && <LoadingMessage>Loading platform overview…</LoadingMessage>}
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
                  : <div className="table-scroll"><table className="platform-directory-table"><thead><tr><th>SCHOOL</th><th>COUNTRY</th><th>TYPE</th><th>STUDENTS / PRICING BAND</th><th>TEACHERS</th><th>CLASSES</th><th>ADMINS</th><th>CREATED</th><th>BILLING DECISION</th><th>SCHOOL ACCESS</th></tr></thead><tbody>
                  {platformOverviewForUser.schools.map((schoolRow) => {
                    const billingDraft = platformBillingDrafts[schoolRow.id] || {
                      billingStatus: schoolRow.billingStatus || "pending",
                      planId: schoolRow.planId || "",
                    };
                    const pricingTier = getPricingTierForActiveStudents(schoolRow.studentCount);
                    const billingFeedback = platformBillingFeedback[schoolRow.id];
                    const schoolStatusFeedback = platformSchoolStatusFeedback[schoolRow.id];
                    const isArchived = Boolean(schoolRow.archivedAt);
                    return <tr key={schoolRow.id}>
                      <td><strong>{schoolRow.name}</strong></td><td>{schoolRow.country}</td><td>{schoolRow.schoolType}</td><td><strong>{schoolRow.studentCount.toLocaleString("en-NG")}</strong><small className="platform-student-pricing-band">{pricingTier?.name || "Unassigned pricing band"}</small></td><td>{schoolRow.teacherCount.toLocaleString("en-NG")}</td><td>{schoolRow.classCount.toLocaleString("en-NG")}</td><td>{schoolRow.administratorCount.toLocaleString("en-NG")}</td><td>{new Date(schoolRow.createdAt).toLocaleDateString("en-NG")}</td>
                      <td>
                        <div className="platform-billing-controls">
                          <label className="platform-billing-field"><span>Status</span><select className="text-input" value={billingDraft.billingStatus} disabled={platformSchoolActionBusy} onChange={(event) => updatePlatformBillingDraft(schoolRow, "billingStatus", event.target.value)}>
                            <option value="pending">Pending decision</option>
                            <option value="exempt">Exempt / free</option>
                            <option value="paid">Billable plan</option>
                          </select></label>
                          <label className="platform-billing-field"><span>Plan</span><select className="text-input" value={billingDraft.planId} disabled={billingDraft.billingStatus !== "paid" || platformSchoolActionBusy} onChange={(event) => updatePlatformBillingDraft(schoolRow, "planId", event.target.value)}>
                            <option value="">Select a plan</option>
                            {billablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.minActiveStudents.toLocaleString("en-NG")}{plan.maxActiveStudents == null ? "+" : `–${plan.maxActiveStudents.toLocaleString("en-NG")}`} students · {typeof plan.monthlyPrice === "number" ? `₦${plan.monthlyPrice.toLocaleString("en-NG")}/mo` : "Custom pricing"}</option>)}
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
              <div className="panel-heading"><div><h2>School pricing</h2><p>Free for the first 500 active students; paid tiers apply above that.</p></div></div>
              <p className="platform-billing-notice" role="status">Pricing policy only: enrollment remains open, and no payment or automatic student-cap enforcement is active yet.</p>
              <div className="platform-pricing-grid">
                <article className="platform-plan-card platform-plan-card-free">
                  <span className="platform-plan-name">{freePlan.name}</span>
                  <strong className="platform-plan-price">₦0<small> / month</small></strong>
                  <span className="platform-plan-cap">Up to {freePlan.maxActiveStudents.toLocaleString("en-NG")} active students</span>
                  <div className="platform-plan-annual"><span>Annual</span><strong>₦0 / year</strong><small>No charge</small></div>
                </article>
                {subscriptionPlans.map((plan) => <article className="platform-plan-card" key={plan.id}>
                  <span className="platform-plan-name">{plan.name}</span>
                  <strong className="platform-plan-price">₦{plan.monthlyPrice.toLocaleString("en-NG")}<small> / month</small></strong>
                  <span className="platform-plan-cap">{plan.minActiveStudents.toLocaleString("en-NG")}–{plan.maxActiveStudents.toLocaleString("en-NG")} active students</span>
                  <div className="platform-plan-annual"><span>Annual</span><strong>₦{plan.annualPrice.toLocaleString("en-NG")} / year</strong><small>10% discount</small></div>
                </article>)}
                <article className="platform-plan-card">
                  <span className="platform-plan-name">{customQuotePlan.name}</span>
                  <strong className="platform-plan-price">Contact us</strong>
                  <span className="platform-plan-cap">{customQuotePlan.minActiveStudents.toLocaleString("en-NG")}+ active students</span>
                </article>
              </div>
              <p className="field-hint">All plans include Aster’s current school workflows. Prices are per school, in Nigerian naira; annual paid plans include a 10% discount.</p>
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
            {loadingAttendance || loadingClasses ? <LoadingMessage>Loading the class register…</LoadingMessage>
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
            {loadingAttendanceReport ? <LoadingMessage>Generating attendance summary…</LoadingMessage>
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
            {loadingGradingSettings ? <LoadingMessage>Loading this school’s grading rules…</LoadingMessage>
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
              <label className="grade-picker"><span>Grade</span><select className="text-input" value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value)} aria-label="Select grade" disabled={loadingEducationalLevels || !activeGradeOptions.length}>{activeGradeOptions.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
            </div>
            <section className="educational-levels-settings" aria-labelledby="educational-levels-heading">
              <div className="educational-levels-heading">
                <div><h3 id="educational-levels-heading">Educational levels</h3><p>Choose the levels your school offers. Class and subject setup follows this selection.</p></div>
              </div>
              {loadingEducationalLevels ? <LoadingMessage>Loading this school’s educational levels…</LoadingMessage>
                : educationalLevels.length > 0 && <div className="educational-level-options">
                  {educationalLevels.map((level) => {
                    const checked = draftEducationalLevelCodes.includes(level.code);
                    return <label className={`educational-level-option ${checked ? "selected" : ""} ${role !== "admin" ? "readonly" : ""}`} key={level.code}>
                      <input type="checkbox" checked={checked} disabled={role !== "admin" || savingEducationalLevels || (checked && draftEducationalLevelCodes.length <= 1)} onChange={() => toggleEducationalLevel(level.code)} />
                      <span className="curriculum-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                      <span className="educational-level-copy"><strong>{level.label}</strong><small>{level.grades[0]} – {level.grades[level.grades.length - 1]}</small></span>
                    </label>;
                  })}
                </div>}
              {educationalLevelError && <p className="form-error" role="alert">{educationalLevelError}</p>}
              {role === "admin" && !loadingEducationalLevels && <div className="educational-level-footer">
                <span>{draftEducationalLevelCodes.length} level{draftEducationalLevelCodes.length === 1 ? "" : "s"} selected{educationalLevelsChanged ? " · Unsaved changes" : " · All changes saved"}</span>
                <div>
                  {educationalLevelsChanged && <button className="button button-secondary button-small" type="button" onClick={() => setDraftEducationalLevelCodes(savedEducationalLevelCodes)} disabled={savingEducationalLevels}>Discard</button>}
                  <button className="button button-primary button-small" type="button" onClick={saveEducationalLevels} disabled={savingEducationalLevels || !educationalLevelsChanged || !normalizedEducationalLevelDraft}>{savingEducationalLevels ? "Saving…" : "Save levels"}</button>
                </div>
              </div>}
            </section>
            <p className="curriculum-note">This starting catalogue follows the grade structure in NERDC’s revised Basic Education and Senior Secondary curriculum pages. Optional offerings can vary; confirm your school’s current subjects with the official grade-level curriculum and your state authority.</p>
            <div className="curriculum-grid" aria-label={`${selectedGrade} subjects`}>
              {(curriculumByGrade[selectedGrade] || []).map((subject) => {
                const checked = gradeDraftSubjects.includes(subject);
                return <label className={`curriculum-subject ${checked ? "selected" : ""} ${role !== "admin" ? "readonly" : ""}`} key={subject}>
                  <input type="checkbox" checked={checked} disabled={loadingSubjects || loadingEducationalLevels || !activeGradeOptions.includes(selectedGrade) || role !== "admin"} onChange={() => toggleSubject(subject)} />
                  <span className="curriculum-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                  <span>{subject}</span>
                </label>;
              })}
            </div>
            <div className="curriculum-footer">
              <span>{loadingSubjects ? "Loading saved subjects…" : `${gradeDraftSubjects.length} selected${role === "admin" ? ` · ${subjectChangesPending ? "Unsaved changes" : "All changes saved"}` : ""}`}</span>
              {role === "admin" && <button className="button button-primary" type="button" onClick={saveSubjects} disabled={loadingSubjects || loadingEducationalLevels || savingSubjects || !activeGradeOptions.includes(selectedGrade) || !subjectChangesPending}>{savingSubjects ? "Saving…" : "Save subjects"}</button>}
            </div>
            {subjectError && <p className="form-error" role="alert">{subjectError}</p>}
            <p className="curriculum-source">Official references: <a href="https://nerdc.gov.ng/content_manager/new_curriculum_home.html" target="_blank" rel="noreferrer">NERDC revised Basic Education Curriculum</a> · <a href="https://nerdc.gov.ng/content_manager/new_senior_curriculum_home.html" target="_blank" rel="noreferrer">NERDC revised Senior Secondary Curriculum</a></p>
            <div className="class-management">
              <div className="panel-heading"><div><h2>School classes</h2><p>Create class groups using this grade’s saved subjects.</p></div><span className="class-year-pill">{classForm.academicYear}</span></div>
              {role === "admin" && <form className="class-create-form" onSubmit={createClass}>
                <label><span>Grade</span><select className="text-input" value={classForm.grade} onChange={(event) => setClassForm((previous) => ({ ...previous, grade: event.target.value }))} disabled={loadingEducationalLevels || !activeGradeOptions.length}>{activeGradeOptions.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
                <label><span>Class / stream</span><input className="text-input" required maxLength={24} value={classForm.section} onChange={(event) => setClassForm((previous) => ({ ...previous, section: event.target.value }))} placeholder="e.g. A or Blue" /></label>
                <label><span>Academic session</span><select className="text-input" required value={classForm.academicYear} onChange={(event) => setClassForm((previous) => ({ ...previous, academicYear: event.target.value }))} disabled={loadingAcademicCalendar || !academicCalendarForCurrentSchool.length}><option value="">Select a session</option>{academicCalendarForCurrentSchool.map((session) => <option key={session.academicYear} value={session.academicYear}>{session.academicYear}{session.isCurrent ? " · current" : ""}</option>)}</select></label>
                <button className="button button-primary" type="submit" disabled={creatingClass || loadingClasses || loadingEducationalLevels || loadingAcademicCalendar || !academicCalendarForCurrentSchool.length || !activeGradeOptions.includes(classForm.grade)}>{creatingClass ? "Creating…" : "Create class"}</button>
              </form>}
              {role === "admin" && !loadingAcademicCalendar && academicCalendarForCurrentSchool.length === 0 && <p className="field-hint">Add an academic session before creating classes. <button className="quiet-action" type="button" onClick={() => setPage("calendar")}>Set up academic calendar</button></p>}
              {classError && <p className="form-error" role="alert">{classError}</p>}
              {loadingClasses ? <LoadingMessage>Loading classes…</LoadingMessage> : schoolClasses.length === 0 ? <p className="empty-search">No classes yet. Save subjects for a grade, then create its first class.</p> : <div className="class-list">
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

          {page === "results" && ["admin", "teacher"].includes(role) && <section className="panel signature-settings-panel">
            <div className="panel-heading"><div><h2>{role === "admin" ? "Principal report signature" : "Form-master report signature"}</h2><p>{role === "admin" ? "Your signature as the school’s primary administrator appears on published student reports." : "Your signature appears only on published reports for classes where you are assigned as form master."}</p></div></div>
            {signatureLoading ? <LoadingMessage>Loading signature settings…</LoadingMessage>
              : signatureError && <p className="form-error" role="alert">{signatureError}</p>}
            {!signatureLoading && !signatureError && !signatureCanUpload && <p className="field-hint">{role === "admin" ? "Only the school’s primary administrator can upload the principal signature." : "You are not assigned as a form master yet. Ask your school administrator to assign you to a class."}</p>}
            {!signatureLoading && signatureCanUpload && <>
              {role === "teacher" && <p className="field-hint">Assigned classes: {signatureFormMasterClasses.map((item) => `${item.grade} ${item.section}`).join(", ")}</p>}
              <div className="signature-current">
                <span>Current {signatureRole.toLowerCase()} signature</span>
                {mySignature
                  ? <img src={mySignature} alt={`Saved ${signatureRole.toLowerCase()} signature`} />
                  : <small>No signature uploaded yet.</small>}
              </div>
              <form className="signature-upload-form" onSubmit={saveMySignature}>
                <label><span>Upload signature image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={prepareSignatureFile} disabled={signatureSaving} /><small>PNG, JPG, or WebP; maximum 5 MB. Aster trims and optimizes it into a private PNG.</small></label>
                {signatureFileData && <img className="signature-upload-preview" src={signatureFileData} alt="Preview of signature to save" />}
                <div className="signature-upload-actions">
                  <button className="button button-primary" type="submit" disabled={!signatureFileData || signatureSaving}>{signatureSaving ? "Saving…" : "Save signature"}</button>
                  {mySignature && <button className="button button-secondary" type="button" onClick={removeMySignature} disabled={signatureSaving}>Remove signature</button>}
                </div>
              </form>
            </>}
          </section>}

          {page === "results" && ["student", "parent"].includes(role) && <section className="panel student-results-panel">
            <div className="panel-heading"><div><h2>{role === "parent" ? "Your children’s published results" : "Published term results"}</h2><p>{role === "parent" ? "Only reports for students explicitly linked to your verified parent account are shown." : "Your school releases results after administrator approval. Only your linked student record is shown here."}</p></div></div>
            {schoolLogoError && <p className="form-error" role="alert">{schoolLogoError}</p>}
            {studentResultError && <p className="form-error" role="alert">{studentResultError}</p>}
            {loadingStudentResults ? <LoadingMessage>Loading your published results…</LoadingMessage>
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
                        <button className="button button-secondary button-small report-print-button" type="button" onClick={printStudentReport} disabled={!selectedStudentResult?.rows.length || schoolLogoLoading}>Print report card</button>
                      </div>
                      {selectedStudentResult?.rows.length
                        ? <StudentReportCard school={school} result={selectedStudentResult} rows={selectedStudentResult.rows} signatures={selectedStudentResult.reportSignatures} logoData={schoolLogoForCurrentSchool} />
                        : <p className="empty-search">{role === "parent" ? "No result sheets have been published for this student yet." : "Select one of your published result sheets to view its subjects."}</p>}
                    </>}
          </section>}

          {page === "results" && role !== "student" && role !== "parent" && <section className="assessment-workspace">
            <section className="panel result-sheet-panel">
              <div className="panel-heading result-sheet-heading">
                <div><h2>Term result sheet</h2><p>Only administrator-approved assessments are included. Letter grades and class positions follow this school’s saved grading rules.</p></div>
                <div className="result-sheet-actions">{role === "admin" && <>{resultSheet?.published && <button className="button button-secondary button-small" type="button" onClick={printClassReportCards} disabled={printingClassReports || !classReportGroups.length || schoolLogoLoading}>Print report cards</button>}<button className="button button-primary button-small" type="button" onClick={publishResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.some((row) => row.percentage != null) || Boolean(resultSheet?.published)}>{resultSheet?.published ? "Published" : "Publish results"}</button></>}<button className="button button-secondary button-small" type="button" onClick={printResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.length || schoolLogoLoading}>Print</button><button className="button button-secondary button-small" type="button" onClick={exportResultSheet} disabled={loadingResultSheet || !resultSheet?.rows.length}>Export CSV</button></div>
              </div>
              {schoolLogoError && <p className="form-error" role="alert">{schoolLogoError}</p>}
              {resultSheet?.schoolClass && <div className="result-sheet-print-heading"><div className="result-sheet-print-brand">{schoolLogoForCurrentSchool && <img src={schoolLogoForCurrentSchool} alt={`${school.name} logo`} />}<strong>{school.name}</strong></div><span>School ref: {school.slug || school.id}</span><span>{resultSheet.schoolClass.grade} {resultSheet.schoolClass.section} · {resultSheet.schoolClass.academicYear} · {resultSheet.term}</span><small>{resultSheet.published ? `Published result snapshot · ${new Date(resultSheet.published.publishedAt).toLocaleDateString("en-NG")}` : "Calculated from administrator-approved assessments only"}</small></div>}
              <div className="result-sheet-filters">
                <label><span>Class</span><select className="text-input" value={resultSheetClassId} onChange={(event) => setResultSheetClassId(event.target.value)} disabled={loadingClasses || !schoolClasses.length}><option value="">Select a class</option>{schoolClasses.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.academicYear}</option>)}</select></label>
                <label><span>Term</span><select className="text-input" value={resultSheetTerm} onChange={(event) => setResultSheetTerm(event.target.value)}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
                {resultSheet?.schoolClass && <span className="result-sheet-summary">{resultSheet.rows.filter((row) => row.percentage !== null).length} graded subject entries</span>}
              </div>
              {resultSheet?.published
                ? <p className="result-publication-note">Published {new Date(resultSheet.published.publishedAt).toLocaleString("en-NG")} by {resultSheet.published.publishedBy || "a school administrator"}. Grades and positions are frozen with this snapshot and released to each linked student account.</p>
                : <p className="result-calculation-note">Percentage = total points earned across approved assessments ÷ total possible points × 100. Letter grades use this school’s bands. Class positions follow its tie and completeness rules; positions may change until publication.</p>}
              {resultSheetError && <p className="form-error" role="alert">{resultSheetError}</p>}
              {loadingResultSheet ? <LoadingMessage>Calculating the result sheet…</LoadingMessage>
                : !resultSheetClassId ? loadingClasses ? <LoadingMessage>Loading classes…</LoadingMessage> : <p className="empty-search">Create a class and assign a teacher to its subjects to view a result sheet.</p>
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
                    school={school}
                    result={{ ...resultSheet.schoolClass, term: resultSheet.term, publishedAt: resultSheet.published.publishedAt }}
                    rows={rows}
                    signatures={resultSheet.reportSignatures}
                    logoData={schoolLogoForCurrentSchool}
                  />
                </div>)}
              </div>}
            </section>

            {role === "admin" && <section className="panel assessment-form-panel">
              <div className="panel-heading"><div><h2>Create an assessment</h2><p>Assessments can be created for subjects with an assigned teacher.</p></div></div>
              {resultSheet?.published && assessmentForm.classId === resultSheetClassId && assessmentForm.term === resultSheetTerm && <p className="result-publication-note">This class and term are published. No further assessments can be added.</p>}
              {loadingAssignments || loadingClasses ? <LoadingMessage>Loading assigned classes…</LoadingMessage> : assessmentAssignableClasses.length === 0 ? <p className="empty-search">{schoolClasses.length === 0 ? "Create a class and save its subjects first." : "Assign a teacher to a class subject first."} <button className="inline-action" type="button" onClick={() => setPage(schoolClasses.length === 0 ? "classes" : "teachers")}>Go to {schoolClasses.length === 0 ? "Classes & subjects" : "Teachers"} →</button></p> : <form className="assessment-create-form" onSubmit={createAssessment}>
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
              {loadingAssessments ? <LoadingMessage>Loading assessments…</LoadingMessage> : assessments.length === 0 ? <p className="empty-search">{role === "admin" ? "No assessments yet. Create one after classes, subjects, and teacher assignments are ready." : "No assessments have been assigned to your classes yet."}</p> : <div className="table-scroll"><table className="assessment-table"><thead><tr><th>ASSESSMENT</th><th>CLASS</th><th>TEACHER</th><th>MARKS ENTERED</th><th>STATUS</th><th></th></tr></thead><tbody>{assessments.map((assessment) => <tr key={assessment.id}>
                <td><strong>{assessment.title}</strong><small className="assessment-subtitle">{assessment.subject} · {assessment.term} · out of {assessment.maxScore}</small></td>
                <td>{assessment.grade} {assessment.section}<small className="assessment-subtitle">{assessment.academicYear}{assessment.dueDate ? ` · Due ${new Date(`${assessment.dueDate}T00:00:00`).toLocaleDateString("en-NG")}` : ""}</small></td>
                <td>{assessment.teacherEmail || "Assigned teacher"}</td>
                <td>{assessment.markedCount} / {assessment.studentCount}</td>
                <td><span className={`status-pill ${assessment.status === "approved" ? "approved" : assessment.status === "submitted" ? "pending" : assessment.status === "returned" ? "returned" : "draft"}`}><i />{assessment.status[0].toUpperCase()}{assessment.status.slice(1)}</span></td>
                <td><button className="quiet-action" type="button" onClick={() => setSelectedAssessmentId(assessment.id)}>{role === "admin" && assessment.status === "submitted" ? "Review marks" : role === "teacher" && ["draft", "returned"].includes(assessment.status) ? "Enter marks" : "View marks"}</button></td>
              </tr>)}</tbody></table></div>}
            </section>

            {selectedAssessmentId && <section className="panel assessment-detail-panel">
              {assessmentDetailLoading ? <LoadingMessage>Loading student marks…</LoadingMessage> : assessmentDetail && <>
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
              <div className="panel-heading"><div><h2>Register a teacher</h2><p>Add the teacher’s name and email. Aster creates the teacher profile immediately, emails the permanent ID and password to the administrator, and displays the credentials once. The teacher can sign in directly without creating an account or activating an email link.</p></div></div>
              <form className="invite-form" onSubmit={registerTeacher}>
                <label className="field-label" htmlFor="teacherName">Teacher’s full name</label>
                <input className="text-input" id="teacherName" autoComplete="name" required minLength={2} maxLength={120} value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="e.g. Ada Okafor" />
                <label className="field-label" htmlFor="inviteEmail">Teacher email</label>
                <input className="text-input" id="inviteEmail" type="email" autoComplete="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@yourschool.edu" />
                <label className="field-label" htmlFor="teacherPhoto">Teacher photo <small>Optional · PNG, JPEG, or WebP</small></label>
                <input ref={teacherPhotoInputRef} className="text-input" id="teacherPhoto" type="file" accept="image/png,image/jpeg,image/webp" onChange={prepareTeacherPhotoFile} />
                {teacherPhotoData && <img className="profile-photo-preview" src={teacherPhotoData} alt="Teacher photo preview" />}
                <p className="field-hint">Registering an existing teacher email keeps their ID and issues a new permanent password.</p>
                {teacherRegistrationError && <p className="form-error" role="alert">{teacherRegistrationError}</p>}
                <button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Registering…" : "Register teacher"}</button>
              </form>
              {teacherRegistration && <div className="invitation-link teacher-activation">
                <p className="auth-kicker">GENERATED TEACHER CREDENTIALS</p>
                <p><strong>{teacherRegistration.teacherName}</strong> · {teacherRegistration.email}</p>
                <p className={teacherRegistration.adminNotification.status === "sent" ? "field-hint" : "form-error"} role="status">{teacherRegistration.adminNotification.message}</p>
                <label className="field-label" htmlFor="teacherCode">Generated teacher code</label>
                <input className="text-input" id="teacherCode" readOnly value={teacherRegistration.teacherCode} />
                <label className="field-label" htmlFor="teacherPassword">Generated password</label>
                <input className="text-input" id="teacherPassword" readOnly value={teacherRegistration.teacherPassword} />
                <p className="field-hint">The permanent password is emailed to the school administrator and shown here once. Share the credentials with the teacher through a private channel. If the teacher forgets the password, register the same email again to reissue it while keeping the teacher ID.</p>
                <div className="form-row-actions"><button className="button button-secondary" type="button" onClick={copyTeacherCredentials}>Copy credentials</button><button className="quiet-action" type="button" onClick={() => setTeacherRegistration(null)}>Hide credentials</button></div>
              </div>}
            </section>
            {teacherRoster.length > 0 && <section className="panel teacher-roster-panel">
              <div className="panel-heading"><div><h2>Teacher profiles</h2><p>Profiles are ready for class and duty assignments as soon as you register them.</p></div></div>
              <div className="table-scroll"><table><thead><tr><th>TEACHER</th><th>STAFF CODE</th><th>EMAIL</th></tr></thead><tbody>{teacherRoster.map((teacher) => <tr key={teacher.userId}><td><span className="person-name-cell">{teacher.photoData ? <img className="person-photo" src={teacher.photoData} alt="" loading="lazy" decoding="async" /> : <span className="person-photo-fallback">{teacher.teacherName?.[0]?.toUpperCase() || "T"}</span>}<strong>{teacher.teacherName || "Teacher"}</strong></span></td><td><strong>{teacher.teacherCode || "—"}</strong></td><td>{teacher.email}</td></tr>)}</tbody></table></div>
            </section>}
            <section className="panel teacher-assignment-panel">
              <div className="panel-heading">
                <div><h2>Teacher assignments</h2><p>Assign one teacher to each class and subject. Reassigning replaces the current teacher.</p></div>
                <button className="button button-secondary button-small" type="button" onClick={() => document.getElementById("teacherName")?.focus()}>Register a teacher</button>
              </div>
              {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
              {loadingAssignments ? <LoadingMessage>Loading teacher assignments…</LoadingMessage> : teacherRoster.length === 0 ? <p className="empty-search">No teacher profiles yet. Register a teacher above to assign classes and duties.</p> : <>
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
            <section className="panel form-master-panel">
              <div className="panel-heading"><div><h2>Class form masters</h2><p>Choose one active teacher for each class. Form masters can add their own signature to that class’s published reports.</p></div></div>
              {formMasterError && <p className="form-error" role="alert">{formMasterError}</p>}
              {formMasterLoading || loadingClasses || loadingAssignments
                ? <LoadingMessage>Loading classes and teachers…</LoadingMessage>
                : schoolClasses.length === 0
                  ? <p className="empty-search">Create a class before assigning a form master. <button className="inline-action" type="button" onClick={() => setPage("classes")}>Go to Classes & subjects →</button></p>
                  : teacherRoster.length === 0
                    ? <p className="empty-search">Register a teacher before assigning a form master.</p>
                    : <div className="form-master-list">{schoolClasses.map((classItem) => {
                      const assignment = formMasterAssignments.find((item) => item.classId === classItem.id);
                      const selectedTeacherId = formMasterSelections[classItem.id] ?? assignment?.teacherUserId ?? "";
                      return <div className="form-master-row" key={classItem.id}>
                        <div><strong>{classItem.grade} {classItem.section}</strong><small>{classItem.academicYear}</small></div>
                        <form onSubmit={(event) => assignFormMaster(event, classItem.id, selectedTeacherId)}>
                          <select className="text-input" required aria-label={`Form master for ${classItem.grade} ${classItem.section}`} value={selectedTeacherId} onChange={(event) => setFormMasterSelections((previous) => ({ ...previous, [classItem.id]: event.target.value }))}>
                            <option value="">Select a teacher</option>
                            {teacherRoster.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.teacherName || teacher.email} · {teacher.teacherCode || teacher.email}</option>)}
                          </select>
                          <button className="button button-secondary button-small" type="submit" disabled={!selectedTeacherId || formMasterSavingClassId === classItem.id}>{formMasterSavingClassId === classItem.id ? "Saving…" : assignment ? "Update" : "Assign"}</button>
                        </form>
                        {assignment && <button className="quiet-action" type="button" onClick={() => removeFormMaster(assignment)} disabled={formMasterSavingClassId === classItem.id}>Remove</button>}
                      </div>;
                    })}</div>}
            </section>
          </section>}

          {page === "classes" && role === "teacher" && <section className="teacher-workspace">
            <section className="panel teacher-assignment-panel">
              <div className="panel-heading"><div><h2>Your teaching assignments</h2><p>These are the classes and subjects assigned to your teacher account.</p></div></div>
              {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
              {loadingAssignments ? <LoadingMessage>Loading your assignments…</LoadingMessage> : teachingAssignments.length === 0 ? <p className="empty-search">No classes or subjects are assigned to you yet. Ask your school administrator to assign them.</p> : <div className="class-list teacher-assignment-cards">{teachingAssignments.map((assignment) => <article className="class-card tilt-3d" key={assignment.id}><div className="class-card-top"><span className="class-card-grade">{assignment.grade}</span><span className="class-year-pill">{assignment.academicYear}</span></div><h3>{assignment.section}</h3><p>{assignment.subject}</p></article>)}</div>}
            </section>
          </section>}

          {page === "students" && role === "admin" && <section className="student-workspace">
            <section className="panel student-form-panel" id="studentForm">
              <div className="panel-heading"><div><h2>{editingStudentId ? "Edit student record" : "Enrol a student"}</h2><p>Only collect the details your school needs to manage enrolment.</p></div></div>
              {loadingClasses ? <LoadingMessage>Loading classes…</LoadingMessage> : classError ? <p className="form-error" role="alert">{classError}</p> : schoolClasses.length === 0 ? <p className="empty-search">Create a class first. <button className="inline-action" type="button" onClick={() => setPage("classes")}>Go to Classes & subjects →</button></p> : <form className="student-create-form" onSubmit={saveStudent}>
                <label><span>First name</span><input className="text-input" required maxLength={80} autoComplete="given-name" value={studentForm.firstName} onChange={(event) => setStudentForm((previous) => ({ ...previous, firstName: event.target.value }))} /></label>
                <label><span>Last name</span><input className="text-input" required maxLength={80} autoComplete="family-name" value={studentForm.lastName} onChange={(event) => setStudentForm((previous) => ({ ...previous, lastName: event.target.value }))} /></label>
                <label><span>Student photo <small>Optional · PNG, JPEG, or WebP</small></span><input ref={studentPhotoInputRef} className="text-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={prepareStudentPhotoFile} /></label>
                {studentForm.photoData && <img className="profile-photo-preview" src={studentForm.photoData} alt={`${studentForm.firstName || "Student"} photo preview`} />}
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
                {studentRows.map((student) => <tr key={student.id}><td><span className="person-name-cell">{student.photoData ? <img className="person-photo" src={student.photoData} alt="" loading="lazy" decoding="async" /> : <span className="person-photo-fallback">{student.firstName?.[0]?.toUpperCase() || "S"}</span>}<strong>{student.firstName} {student.lastName}</strong></span></td><td>{student.admissionNumber}</td><td>{student.grade} {student.section}</td><td>{student.guardianEmail || student.guardianPhone || "—"}</td><td><span className={`status-pill ${student.isActive ? "approved" : "draft"}`}><i />{student.isActive ? "Active" : "Archived"}</span></td><td>{student.isPortalLinked ? <span className="student-portal-linked" title={student.portalEmail || "Portal account linked"}>Linked{student.portalEmail ? ` · ${student.portalEmail}` : ""}</span> : <button className="quiet-action" type="button" onClick={() => inviteStudent(student)} disabled={linkingStudentId === student.id}>{linkingStudentId === student.id ? "Creating…" : "Invite"}</button>}</td><td>{student.isParentPortalLinked ? <span className="student-portal-linked">Linked</span> : student.parentInvitationPending ? <span className="field-hint">Invited</span> : <button className="quiet-action" type="button" onClick={() => inviteParent(student)} disabled={!student.isActive || !student.guardianEmail || linkingStudentId === student.id}>{linkingStudentId === student.id ? "Creating…" : student.guardianEmail ? "Invite guardian" : "Add guardian email"}</button>}</td><td><div className="student-row-actions"><button className="quiet-action" type="button" onClick={() => editStudent(student)}>Edit</button><button className="quiet-action" type="button" onClick={() => toggleStudentStatus(student)}>{student.isActive ? "Archive" : "Reactivate"}</button></div></td></tr>)}
              </tbody></table>
                {loadingStudents && <LoadingMessage>Loading student records…</LoadingMessage>}
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
              {invitationsPending ? <LoadingMessage>Loading invitations…</LoadingMessage>
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

          {page === "overview" && dashboardPending && <section className="panel dashboard-message"><LoadingMessage>Loading your school overview…</LoadingMessage></section>}
          {page === "overview" && dashboardErrorForCurrentSchool && <section className="panel dashboard-message dashboard-error" role="alert"><span>{dashboardErrorForCurrentSchool}</span><button className="button button-secondary button-small" type="button" onClick={() => setDashboardRefresh((previous) => previous + 1)}>Retry</button></section>}
          {page === "overview" && !dashboardPending && !dashboardErrorForCurrentSchool && dashboardForCurrentSchool && <>
            <section className="stats-grid" aria-label="School summary">
              {dashboardStats.map(([label, value, detail], index) => <article className="stat-card tilt-3d" key={label}>
                <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon tilt-pop ${["student-stat-icon", "teacher-stat-icon", "average-stat-icon", "review-stat-icon"][index]}`}>{["♧", "♙", "↗", "▤"][index]}</span></div>
                <div className="stat-number">{value}</div><div className="stat-foot"><span>{detail}</span></div>
              </article>)}
            </section>
            {role === "teacher" && <section className="panel teacher-assessment-actions">
              <div className="panel-heading">
                <div><h2>Assessment action list</h2><p>Drafts and returned assessments assigned to your classes, ordered by due date.</p></div>
                <button className="button button-secondary button-small" type="button" onClick={() => setPage("results")}>Open assessments</button>
              </div>
              {loadingAssessments
                ? <LoadingMessage>Loading your assessment tasks…</LoadingMessage>
                : assessmentError
                  ? <div className="dashboard-message dashboard-error" role="alert"><span>{assessmentError}</span><button className="button button-secondary button-small" type="button" onClick={() => setAssessmentRefresh((previous) => previous + 1)}>Retry</button></div>
                  : teacherAssessmentActions.length
                    ? <div className="attention-list">
                      {teacherAssessmentActions.slice(0, 6).map((assessment) => <button
                        className="attention-item"
                        type="button"
                        key={assessment.id}
                        onClick={() => {
                          setSelectedAssessmentId(assessment.id);
                          setPage("results");
                        }}
                        aria-label={`Open ${assessment.title}, ${assessment.status === "returned" ? "returned for changes" : "draft"}, ${assessment.dueDateInfo.label}`}
                      >
                        <span className={`attention-icon ${assessment.status === "returned" ? "amber" : "blue"}`}>{assessment.status === "returned" ? "!" : "▤"}</span>
                        <span className="attention-copy">
                          <strong>{assessment.title}</strong>
                          <small>{assessment.grade} {assessment.section} · {assessment.subject} · {assessment.markedCount} of {assessment.studentCount} marks entered · <span className={assessment.dueDateInfo.daysUntil != null && assessment.dueDateInfo.daysUntil < 0 ? "assessment-deadline-overdue" : assessment.dueDateInfo.daysUntil != null && assessment.dueDateInfo.daysUntil <= 3 ? "assessment-deadline-soon" : ""}>{assessment.dueDateInfo.label}</span></small>
                        </span>
                        <span className={`status-pill ${assessment.status === "returned" ? "returned" : "draft"}`}><i />{assessment.status === "returned" ? "Returned" : "Draft"}</span>
                      </button>)}
                      <button className="view-all-link" type="button" onClick={() => setPage("results")}>View all assessments →</button>
                    </div>
                    : <p className="empty-search">{assessments.length ? "You’re up to date. No draft or returned assessments need action." : "No assessments have been assigned to your classes yet."}</p>}
            </section>}
            <section className="main-grid">
              {role === "teacher"
                ? <article className="panel teacher-performance-panel">
                  <div className="panel-heading"><div><h2>Published subject performance</h2><p>Class averages for your assigned subjects, compared with the previous published report where available.</p></div></div>
                  {teacherPerformanceTrends.length
                    ? <div className="teacher-performance-list">
                      {teacherPerformanceTrends.slice(0, 6).map((trend) => {
                        const average = trend.averagePercentage == null ? null : Number(trend.averagePercentage);
                        const barWidth = average == null ? 0 : Math.max(0, Math.min(100, average));
                        return <button
                          className="teacher-performance-item"
                          type="button"
                          key={`${trend.classId}-${trend.subject}`}
                          onClick={() => {
                            setResultSheetClassId(trend.classId);
                            setResultSheetTerm(trend.term);
                            setPage("results");
                          }}
                          aria-label={`View ${trend.grade} ${trend.section} ${trend.subject}, ${trend.academicYear} ${trend.term}, ${average == null ? "average not available" : `average ${average.toFixed(1)} percent`}`}
                        >
                          <span className="teacher-performance-copy">
                            <strong>{trend.grade} {trend.section} · {trend.subject}</strong>
                            <small>{trend.academicYear} · {trend.term} · {trend.gradedStudentCount} students graded</small>
                          </span>
                          <span className="teacher-performance-track" aria-hidden="true"><span style={{ width: `${barWidth}%` }} /></span>
                          <span className="teacher-performance-result">
                            <strong className="teacher-performance-score">{average == null ? "—" : `${average.toFixed(1)}%`}</strong>
                            {trend.change != null && <small className={`teacher-performance-change ${trend.change > 0 ? "positive-change" : trend.change < 0 ? "negative-change" : ""}`}>
                              {trend.change > 0 ? "↑ " : trend.change < 0 ? "↓ " : ""}{trend.change === 0 ? "No change" : `${Math.abs(trend.change).toFixed(1)} pp`}
                            </small>}
                          </span>
                        </button>;
                      })}
                      {teacherPerformanceTrends.length > 6 && <p className="teacher-performance-note">Showing the six most recently published class and subject averages.</p>}
                    </div>
                    : <p className="empty-search">No published results are available for your assigned subjects yet.</p>}
                  <button className="view-all-link" type="button" onClick={() => setPage("results")}>Open assigned result sheets →</button>
                </article>
                : role === "student"
                ? <article className="panel student-performance-history-panel">
                  <div className="panel-heading"><div><h2>My performance history</h2><p>Average scores from your published reports, in publication order.</p></div></div>
                  {loadingStudentResults || (!studentResultData && !studentResultError)
                    ? <LoadingMessage>Loading your published results…</LoadingMessage>
                    : studentResultError
                      ? <div className="dashboard-message dashboard-error" role="alert"><span>{studentResultError}</span><button className="button button-secondary button-small" type="button" onClick={() => setStudentResultsRefresh((previous) => previous + 1)}>Retry</button></div>
                      : !studentResultData?.linked
                        ? <p className="empty-search">Your school administrator needs to link your verified portal email to your student record before results can appear.</p>
                        : studentPerformanceHistory.length === 0
                          ? <p className="empty-search">No published results are available yet. Your history will appear here after your school publishes a report.</p>
                          : <>
                            <div className="student-history-summary">
                              <div><small>Latest report average</small><strong>{latestStudentHistory.summary.averagePercentage == null ? "—" : `${latestStudentHistory.summary.averagePercentage.toFixed(1)}%`}</strong></div>
                              {studentHistoryChange == null
                                ? <span className="student-history-change">{studentPerformanceHistory.length < 2 ? "A trend appears after another report is published." : "A comparison is unavailable for these reports."}</span>
                                : <span className={`student-history-change ${studentHistoryChange > 0 ? "positive-change" : studentHistoryChange < 0 ? "negative-change" : ""}`}>
                                  {studentHistoryChange > 0 ? "↑ " : studentHistoryChange < 0 ? "↓ " : ""}{studentHistoryChange === 0 ? "No change" : `${Math.abs(studentHistoryChange).toFixed(1)} percentage points`} vs previous report
                                </span>}
                            </div>
                            <div className="student-history-list" aria-label="Recent published report averages">
                              {visibleStudentPerformanceHistory.map((sheet) => {
                                const average = sheet.summary.averagePercentage;
                                const barWidth = average == null ? 0 : Math.max(0, Math.min(100, average));
                                const reportLabel = `${sheet.academicYear} ${sheet.term}`;
                                return <button
                                  className="student-history-item"
                                  type="button"
                                  key={sheet.id}
                                  onClick={() => {
                                    setSelectedStudentResultId(sheet.id);
                                    setPage("results");
                                  }}
                                  aria-label={`View ${reportLabel}, average ${average == null ? "not available" : `${average.toFixed(1)} percent`}`}
                                >
                                  <span className="student-history-term"><strong>{sheet.academicYear}</strong><small>{sheet.term} · {sheet.grade} {sheet.section}</small></span>
                                  <span className="student-history-track" aria-hidden="true"><span style={{ width: `${barWidth}%` }} /></span>
                                  <strong className="student-history-score">{average == null ? "—" : `${average.toFixed(1)}%`}</strong>
                                </button>;
                              })}
                            </div>
                            <button className="view-all-link" type="button" onClick={() => setPage("results")}>Open published report cards →</button>
                          </>}
                </article>
                : <article className="panel performance-panel tilt-3d">
                  <div className="panel-heading"><div><h2>{role === "parent" ? "Children’s latest published results" : "Published results average"}</h2><p>{role === "parent" ? "Based only on published reports for your linked children." : role === "teacher" ? "Based on published results for your assigned classes and subjects." : "Based on saved result snapshots for this school."}</p></div></div>
                  <div className="chart-summary"><strong>{dashboardAverage}</strong><small>average percentage</small></div>
                  {dashboardAverage === "—" && <p className="sample-chart-copy">No published result percentages are available yet.</p>}
                </article>}
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
