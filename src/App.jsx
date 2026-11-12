import React, { useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import { authClient } from "./auth.js";

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
  const [form, setForm] = useState({ name: "", schoolType: "", country: "", email: "", accessMode: "invite" });
  const role = school?.role || "admin";
  const current = portalData[role];
  const visibleNavigation = navigation.filter(([id]) => role === "admin" || (role === "teacher" && ["overview", "results", "classes"].includes(id)) || (role === "student" && ["overview", "results"].includes(id)));
  const filteredResults = useMemo(() => current.results.filter((row) => row.join(" ").toLowerCase().includes(search.toLowerCase())), [current, search]);

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
        <div className="page-content">
          {!school ? <section className="panel onboarding-panel"><span className="auth-kicker">WELCOME TO ASTER</span><h1>Create your school workspace</h1><p className="page-subtitle">Your account is ready. Set up your school profile to begin; only people you invite can join its portal.</p><button className="button button-primary" type="button" onClick={showSetup}>＋ Create school profile</button></section> : <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> MONDAY, 12 MAY 2025 <span className="eyebrow-divider">·</span> SECOND TERM</div><h1>{page === "overview" ? role === "admin" ? `Good morning, ${userName}` : current.title : page === "results" ? "Results, at a glance" : page === "profile" ? "Your school, your story." : `${page[0].toUpperCase()}${page.slice(1)}`} <span className="wave">✳</span></h1><p className="page-subtitle">{page === "overview" ? current.subtitle : `Keep your ${page} organised for the term ahead.`}</p></div>
            <div className="welcome-actions"><button className="button button-secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/school/${school.slug}`); setToast("Your school link has been copied."); } catch { setToast("Could not copy the school link. Please try again."); } }}>↗ Share school link</button><button className="button button-primary" type="button" onClick={() => page === "profile" ? showSetup() : page === "access" ? document.getElementById("inviteEmail")?.focus() : setToast(`${role === "teacher" ? "Enter marks" : role === "student" ? "View your results" : "Add a student"} — student records are not connected yet.`)}>＋ {page === "access" ? "Invite a member" : role === "teacher" ? "Enter marks" : role === "student" ? "View my results" : "Add a student"}</button></div>
          </section>

          {role === "admin" && page === "access" && <section className="panel invite-panel"><div className="panel-heading"><div><h2>Invite your school community</h2><p>Only invited people can join. Links expire after 7 days and work for the invited email address only.</p></div></div><form className="invite-form" onSubmit={createInvitation}><label className="field-label" htmlFor="inviteEmail">Invitee email</label><input className="text-input" id="inviteEmail" type="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@yourschool.edu" /><label className="field-label" htmlFor="inviteRole">Portal role</label><select className="text-input" id="inviteRole" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="teacher">Teacher</option><option value="student">Student</option></select>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Creating link…" : "Create invitation link"}</button></form>{invitationUrl && <div className="invitation-link"><label className="field-label" htmlFor="invitationUrl">One-time invitation link</label><div><input className="text-input" id="invitationUrl" readOnly value={invitationUrl} /><button className="button button-secondary" type="button" onClick={copyInvitation}>Copy</button></div><p className="field-hint">Send this link directly to the invited email address. Aster does not email invitations yet.</p></div>}</section>}

          <section className={`term-banner ${page === "access" ? "hidden" : ""}`}><div className="term-icon">▣</div><div className="term-copy"><strong>{role === "admin" ? "Second term is in full swing" : role === "teacher" ? "Your classes are making progress" : "Your second term, so far"}</strong><span>{role === "admin" ? "Results are due in 12 days. Your teachers have submitted 68% of their marks." : role === "teacher" ? "Three mark sets are due Friday. You’ve entered 82% of your marks." : "You’re doing well. Keep showing up, asking questions, and making progress."}</span></div><div className="progress-wrap"><div className="progress-label"><span>{role === "student" ? "Term progress" : role === "teacher" ? "My marks entered" : "Mark submission"}</span><strong>{role === "student" ? "On track" : role === "teacher" ? "82%" : "68%"}</strong></div><div className="progress-track"><span style={{ width: role === "student" ? "62%" : role === "teacher" ? "82%" : "68%" }} /></div></div><button className="text-link" type="button" onClick={() => setPage("results")}>View results →</button></section>

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
