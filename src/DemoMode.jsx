import React, { useState } from "react";
import AsterLogoMark from "./AsterLogo.jsx";
import { createDemoData } from "../shared/demo-data.js";
import { defaultGradingSettings, gradeForPercentage } from "../shared/school-data.js";

const demoRoles = [
  ["admin", "School admin"],
  ["formTeacher", "Form teacher"],
  ["subjectTeacher", "Subject teacher"],
  ["student", "Student"],
];
const demoPages = [
  ["overview", "Overview", "▦"],
  ["results", "Result preview", "▤"],
  ["students", "Students", "♧"],
  ["people", "School team", "♙"],
];

function getInitials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function DemoMode({ onExit, onCreateAccount }) {
  const [demo] = useState(createDemoData);
  const [page, setPage] = useState("overview");
  const [activeRole, setActiveRole] = useState("admin");
  const [selectedStudentId, setSelectedStudentId] = useState(demo.reportStudent.id);
  const selectedStudent = demo.students.find((student) => student.id === selectedStudentId) || demo.reportStudent;
  const activePerson = demo.people[activeRole];
  const roleDetails = {
    admin: {
      title: "School overview",
      description: "A clear view of your school, people, and academic progress.",
      stats: [
        ["Active students", demo.students.length, "Across 1 sample class"],
        ["Teaching staff", 2, "Form and subject teachers"],
        ["Subjects", demo.subjects.length, "Configured for this class"],
        ["Class average", `${Math.round(demo.students.reduce((total, student) => total + student.average, 0) / demo.students.length)}%`, "From the sample results"],
      ],
    },
    formTeacher: {
      title: "Form teacher workspace",
      description: `A focused view of ${demo.school.grade} ${demo.school.section} and the learners in your care.`,
      stats: [
        ["My students", demo.students.length, "In your form class"],
        ["My form class", `${demo.school.grade} ${demo.school.section}`, demo.school.academicYear],
        ["Attendance", "94%", "Sample term attendance"],
        ["Class average", `${Math.round(demo.students.reduce((total, student) => total + student.average, 0) / demo.students.length)}%`, "Published term results"],
      ],
    },
    subjectTeacher: {
      title: "Subject teacher workspace",
      description: `Review progress and assessments for ${demo.subjectTeacherSubject}.`,
      stats: [
        ["My subject", demo.subjectTeacherSubject, "Assigned to your class"],
        ["My students", demo.students.length, "In this class"],
        ["Marks entered", `${demo.students.length}/${demo.students.length}`, "Sample assessment"],
        ["Subject average", `${Math.round(demo.students.reduce((total, student) => total + student.scores.find((item) => item.subject === demo.subjectTeacherSubject).score, 0) / demo.students.length)}%`, "Approved marks"],
      ],
    },
    student: {
      title: "My learning, in focus",
      description: "A student view of published results, progress, and class information.",
      stats: [
        ["My average", `${selectedStudent.average}%`, "Latest published report"],
        ["Class position", `${demo.students.slice().sort((left, right) => right.average - left.average).findIndex((student) => student.id === selectedStudent.id) + 1} of ${demo.students.length}`, "In your form class"],
        ["Subjects", demo.subjects.length, "In this term’s report"],
        ["Attendance", "94%", "Sample term attendance"],
      ],
    },
  };
  const currentRole = roleDetails[activeRole];

  return (
    <div className="demo-mode">
      <aside className="demo-sidebar">
        <a className="brand demo-brand" href="/" aria-label="Aster home"><AsterLogoMark /><span className="brand-name">aster<span>.</span></span></a>
        <div className="demo-school-switcher">
          <span className="demo-school-avatar">{demo.school.name[0]}</span>
          <span><strong>{demo.school.name}</strong><small>Sample school workspace</small></span>
        </div>
        <span className="demo-nav-label">DEMO WORKSPACE</span>
        <nav className="demo-navigation" aria-label="Demo pages">
          {demoPages.map(([id, label, icon]) => (
            <button key={id} className={`demo-nav-item${page === id ? " active" : ""}`} type="button" onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="demo-sidebar-note"><span>✳</span><strong>Every role, in sync.</strong><p>One school workspace, with the right view for each member.</p></div>
        <div className="demo-sidebar-person"><span>{getInitials(activePerson)}</span><div><strong>{activePerson}</strong><small>{demoRoles.find(([role]) => role === activeRole)[1]}</small></div></div>
      </aside>

      <main className="demo-main">
        <header className="demo-topbar">
          <span className="demo-breadcrumb">Workspace <b>/</b> {page === "people" ? "School team" : demoPages.find(([id]) => id === page)[1]}</span>
          <div className="demo-topbar-actions"><span className="demo-readonly-badge"><i /> Interactive demo · Sample data</span><button className="button button-secondary demo-exit-button" type="button" onClick={onExit}>Back to sign in</button></div>
        </header>

        <div className="demo-content">
          <section className="demo-intro">
            <div><div className="demo-eyebrow"><span /> {demo.school.location} · {demo.school.academicYear} · TERM 1</div><h1>{page === "results" ? "A result worth celebrating." : page === "students" ? "Know every learner." : page === "people" ? "One school, every role." : currentRole.title}</h1>
              <p>{page === "results" ? "See how Aster turns assessment marks into a clear, shareable student report." : page === "students" ? "Explore the kind of clear, organised student register school admins can maintain." : page === "people" ? "Meet the fictional team behind this sample school workspace." : currentRole.description}</p></div>
            <div className="demo-intro-actions"><span className="demo-label">DEMO MODE</span><button className="button button-primary" type="button" onClick={onCreateAccount}>Create your school <span aria-hidden="true">→</span></button></div>
          </section>

          <section className="demo-role-switcher" aria-label="Preview a portal role">
            <span>PREVIEW AS</span>
            <div>{demoRoles.map(([role, label]) => <button key={role} type="button" className={activeRole === role ? "active" : ""} onClick={() => setActiveRole(role)} aria-pressed={activeRole === role}>{label}</button>)}</div>
            <small>{activePerson}</small>
          </section>

          {page === "overview" && <>
            <section className="demo-stats" aria-label={`${demoRoles.find(([role]) => role === activeRole)[1]} overview`}>
              {currentRole.stats.map(([label, value, detail], index) => <article className="demo-stat-card" key={label}>
                <div><span>{label}</span><b className={`demo-stat-icon tone-${index}`} aria-hidden="true">{["♧", "♙", "▤", "↗"][index]}</b></div>
                <strong>{value}</strong><small>{detail}</small>
              </article>)}
            </section>
            <div className="demo-content-grid">
              <section className="demo-panel demo-performance-panel">
                <div className="demo-panel-heading"><div><h2>Class performance</h2><p>{demo.school.grade} {demo.school.section} · Term 1 results</p></div><button className="demo-inline-link" type="button" onClick={() => setPage("results")}>View report →</button></div>
                <div className="demo-chart-legend"><span><i /> Average score by subject</span><strong>{Math.round(demo.subjects.reduce((total, subject) => total + demo.students.reduce((sum, student) => sum + student.scores.find((score) => score.subject === subject).score, 0) / demo.students.length, 0) / demo.subjects.length)}% class average</strong></div>
                <div className="demo-bars" role="img" aria-label="Sample class average by subject">{demo.subjects.map((subject) => {
                  const average = Math.round(demo.students.reduce((total, student) => total + student.scores.find((score) => score.subject === subject).score, 0) / demo.students.length);
                  return <div key={subject}><span>{subject}</span><div><i style={{ width: `${average}%` }} /></div><b>{average}%</b></div>;
                })}</div>
              </section>
              <section className="demo-panel demo-spotlight">
                <div className="demo-panel-heading"><div><h2>Meet the school team</h2><p>Each person sees the right school information.</p></div></div>
                {demoRoles.slice(0, 3).map(([role, label]) => <button className="demo-team-row" key={role} type="button" onClick={() => setActiveRole(role)}><span className={`demo-team-avatar ${role}`}>{getInitials(demo.people[role])}</span><span><strong>{demo.people[role]}</strong><small>{label}</small></span><i aria-hidden="true">→</i></button>)}
                <button className="demo-panel-footer" type="button" onClick={() => setPage("people")}>Explore roles and access <span>→</span></button>
              </section>
            </div>
            <section className="demo-panel demo-student-snapshot">
              <div className="demo-panel-heading"><div><h2>Student progress snapshot</h2><p>A quick look at learners in {demo.school.grade} {demo.school.section}.</p></div><button className="demo-inline-link" type="button" onClick={() => setPage("students")}>Student register →</button></div>
              <div className="demo-student-chips">{demo.students.slice(0, 5).map((student) => <button key={student.id} type="button" onClick={() => { setSelectedStudentId(student.id); setPage("results"); }}><span>{getInitials(student.name)}</span><strong>{student.name}</strong><small>{student.average}% · Grade {student.grade}</small></button>)}</div>
            </section>
          </>}

          {page === "results" && <section className="demo-result-layout">
            <div className="demo-result-intro">
              <span className="demo-label">PUBLISHED REPORT PREVIEW</span><h2>Every subject, one clear picture.</h2><p>Choose a fictional student to preview a sample report card. These marks and identities are generated for this demo only.</p>
              <label htmlFor="demo-student-select">Student</label><select id="demo-student-select" value={selectedStudent.id} onChange={(event) => setSelectedStudentId(event.target.value)}>{demo.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
              <div className="demo-result-note"><span>✓</span><p>Published reports give students and families a simple, read-only view of school-approved results.</p></div>
            </div>
            <article className="demo-report-card">
              <div className="demo-report-top"><div className="demo-report-logo"><AsterLogoMark /></div><span><strong>{demo.school.name}</strong><small>{demo.school.location}</small></span><i>PUBLISHED</i></div>
              <div className="demo-report-title"><span>STUDENT REPORT CARD</span><h2>Term 1 Results</h2><p>{demo.school.academicYear} academic year</p></div>
              <div className="demo-report-student"><div><small>STUDENT</small><strong>{selectedStudent.name}</strong></div><div><small>CLASS</small><strong>{demo.school.grade} {demo.school.section}</strong></div><div><small>ADMISSION NO.</small><strong>{selectedStudent.admissionNumber}</strong></div></div>
              <div className="demo-report-summary"><div><small>OVERALL AVERAGE</small><strong>{selectedStudent.average}%</strong><span>Across {selectedStudent.scores.length} subjects</span></div><div><small>OVERALL GRADE</small><strong>{selectedStudent.grade}</strong><span>Class position {demo.students.slice().sort((left, right) => right.average - left.average).findIndex((student) => student.id === selectedStudent.id) + 1} of {demo.students.length}</span></div></div>
              <div className="demo-report-table-wrap"><table className="demo-report-table"><thead><tr><th>SUBJECT</th><th>SCORE</th><th>GRADE</th><th>COMMENT</th></tr></thead><tbody>{selectedStudent.scores.map((item) => <tr key={item.subject}><td>{item.subject}</td><td>{item.score}%</td><td><span>{gradeForPercentage(item.score, defaultGradingSettings.bands)}</span></td><td>{item.score >= 80 ? "Excellent" : item.score >= 60 ? "Good progress" : "Keep practising"}</td></tr>)}</tbody></table></div>
              <div className="demo-report-signatures"><span><i /><b>Form teacher</b><small>{demo.people.formTeacher}</small></span><span><i /><b>Principal</b><small>{demo.people.admin}</small></span><span><i /><b>Parent / guardian</b><small>Signature</small></span></div>
              <p className="demo-report-disclaimer">Fictional sample report · Not an official school record</p>
            </article>
          </section>}

          {page === "students" && <section className="demo-panel demo-register-panel">
            <div className="demo-panel-heading"><div><h2>{demo.school.grade} {demo.school.section} student register</h2><p>Sample records with class placement and the latest published average.</p></div><span className="demo-label">{demo.students.length} SAMPLE STUDENTS</span></div>
            <div className="demo-table-wrap"><table className="demo-register-table"><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>CLASS</th><th>AVERAGE</th><th>GRADE</th><th>PROGRESS</th></tr></thead><tbody>{demo.students.map((student) => <tr key={student.id}><td><span className="demo-register-avatar">{getInitials(student.name)}</span><strong>{student.name}</strong></td><td>{student.admissionNumber}</td><td>{demo.school.grade} {demo.school.section}</td><td><b>{student.average}%</b></td><td><span className="demo-grade-badge">{student.grade}</span></td><td><div className="demo-register-progress"><i style={{ width: `${student.average}%` }} /></div></td></tr>)}</tbody></table></div>
          </section>}

          {page === "people" && <section className="demo-people-grid">
            {demoRoles.map(([role, label]) => <article className="demo-panel demo-person-card" key={role}><span className={`demo-team-avatar ${role}`}>{getInitials(demo.people[role])}</span><span className="demo-label">{label}</span><h2>{demo.people[role]}</h2><p>{role === "admin" ? "Manages the school profile, academic setup, staff, and published results." : role === "formTeacher" ? `Supports ${demo.school.grade} ${demo.school.section}, its student records, and class progress.` : role === "subjectTeacher" ? `Prepares ${demo.subjectTeacherSubject} assessments and submits marks for review.` : "Checks published results and tracks personal learning progress."}</p><button className="demo-person-view" type="button" onClick={() => { setActiveRole(role); setPage("overview"); }}>Preview this workspace <span>→</span></button></article>)}
          </section>}

          <footer className="demo-footer"><span>Demo data is fictional, generated in your browser, and never saved to Aster.</span><button type="button" onClick={onCreateAccount}>Ready to set up your school? <b>Create an account →</b></button></footer>
        </div>
      </main>
    </div>
  );
}

export default DemoMode;
