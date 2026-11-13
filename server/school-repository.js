import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSchoolSlug } from "./school-input.js";
import { calculatePointsPercentage } from "../shared/school-data.js";

let initializedDatabaseUrl;
let initializePromise;
let initializingDatabaseUrl;

function getDatabase() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured.");
    error.code = "DATABASE_URL_MISSING";
    throw error;
  }
  return { databaseUrl: DATABASE_URL, sql: neon(DATABASE_URL) };
}

async function getReadyDatabase() {
  const database = getDatabase();
  if (initializedDatabaseUrl !== database.databaseUrl) {
    if (initializingDatabaseUrl !== database.databaseUrl) {
      initializingDatabaseUrl = database.databaseUrl;
      initializePromise = database.sql.transaction([
        database.sql`
          CREATE TABLE IF NOT EXISTS schools (
            id UUID PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            school_type VARCHAR(80) NOT NULL,
            country VARCHAR(80) NOT NULL,
            email VARCHAR(254) NOT NULL UNIQUE,
            access_mode VARCHAR(20) NOT NULL
              CHECK (access_mode IN ('invite', 'school-code', 'public')),
            slug VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_members (
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
            email VARCHAR(254),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, user_id)
          )
        `,
        database.sql`
          ALTER TABLE school_members ADD COLUMN IF NOT EXISTS email VARCHAR(254)
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_invitations (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            email VARCHAR(254) NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
            token_hash CHAR(64) NOT NULL UNIQUE,
            created_by TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            accepted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_subjects (
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            grade VARCHAR(32) NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, grade, subject_name)
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_classes (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            grade VARCHAR(32) NOT NULL,
            section VARCHAR(24) NOT NULL,
            academic_year VARCHAR(9) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (school_id, grade, section, academic_year),
            UNIQUE (school_id, id)
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_class_subjects (
            class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
            subject_name VARCHAR(100) NOT NULL,
            PRIMARY KEY (class_id, subject_name)
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_teaching_assignments (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL,
            class_id UUID NOT NULL,
            teacher_user_id TEXT NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (school_id, class_id, subject_name),
            CONSTRAINT school_teaching_assignments_class_fk
              FOREIGN KEY (school_id, class_id)
              REFERENCES school_classes(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_teaching_assignments_teacher_fk
              FOREIGN KEY (school_id, teacher_user_id)
              REFERENCES school_members(school_id, user_id) ON DELETE CASCADE,
            CONSTRAINT school_teaching_assignments_subject_fk
              FOREIGN KEY (class_id, subject_name)
              REFERENCES school_class_subjects(class_id, subject_name) ON DELETE CASCADE
          )
        `,
        database.sql`
          CREATE INDEX IF NOT EXISTS school_teaching_assignments_teacher_idx
          ON school_teaching_assignments (school_id, teacher_user_id, class_id)
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_students (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            class_id UUID NOT NULL,
            admission_number VARCHAR(32) NOT NULL,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            guardian_email VARCHAR(254),
            guardian_phone VARCHAR(24),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (school_id, admission_number),
            CONSTRAINT school_students_class_school_fk
              FOREIGN KEY (school_id, class_id)
              REFERENCES school_classes(school_id, id) ON DELETE RESTRICT
          )
        `,
        database.sql`
          CREATE INDEX IF NOT EXISTS school_students_class_active_idx
          ON school_students (school_id, class_id, is_active, last_name, first_name)
        `,
        database.sql`
          CREATE UNIQUE INDEX IF NOT EXISTS school_students_school_id_id_idx
          ON school_students (school_id, id)
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_assessments (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            class_id UUID NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            title VARCHAR(100) NOT NULL,
            term VARCHAR(12) NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
            max_score NUMERIC(7, 2) NOT NULL CHECK (max_score > 0 AND max_score <= 1000),
            due_date DATE,
            status VARCHAR(16) NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
            review_note VARCHAR(500),
            created_by TEXT NOT NULL,
            reviewed_by TEXT,
            submitted_at TIMESTAMPTZ,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (school_id, class_id, subject_name, title, term),
            UNIQUE (school_id, id),
            CONSTRAINT school_assessments_class_fk
              FOREIGN KEY (school_id, class_id)
              REFERENCES school_classes(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_assessments_subject_fk
              FOREIGN KEY (class_id, subject_name)
              REFERENCES school_class_subjects(class_id, subject_name) ON DELETE CASCADE,
            CONSTRAINT school_assessments_creator_fk
              FOREIGN KEY (school_id, created_by)
              REFERENCES school_members(school_id, user_id) ON DELETE RESTRICT,
            CONSTRAINT school_assessments_reviewer_fk
              FOREIGN KEY (school_id, reviewed_by)
              REFERENCES school_members(school_id, user_id) ON DELETE RESTRICT
          )
        `,
        database.sql`
          CREATE INDEX IF NOT EXISTS school_assessments_school_status_idx
          ON school_assessments (school_id, status, created_at DESC)
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_assessment_marks (
            school_id UUID NOT NULL,
            assessment_id UUID NOT NULL,
            student_id UUID NOT NULL,
            score NUMERIC(7, 2) CHECK (score >= 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (assessment_id, student_id),
            CONSTRAINT school_assessment_marks_assessment_fk
              FOREIGN KEY (school_id, assessment_id)
              REFERENCES school_assessments(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_assessment_marks_student_fk
              FOREIGN KEY (school_id, student_id)
              REFERENCES school_students(school_id, id) ON DELETE RESTRICT
          )
        `,
        database.sql`
          CREATE INDEX IF NOT EXISTS school_assessment_marks_school_student_idx
          ON school_assessment_marks (school_id, student_id, assessment_id)
        `,
      ]).then(() => {
        initializedDatabaseUrl = database.databaseUrl;
      }).catch((error) => {
        if (initializingDatabaseUrl === database.databaseUrl) {
          initializingDatabaseUrl = undefined;
          initializePromise = undefined;
        }
        throw error;
      });
    }
    await initializePromise;
  }
  return database.sql;
}

export async function listSchools(userId) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT s.id, s.name, s.school_type AS "schoolType", s.country, s.email,
           s.access_mode AS "accessMode", s.slug, s.created_at AS "createdAt",
           m.role
    FROM schools s
    JOIN school_members m ON m.school_id = s.id
    WHERE m.user_id = ${userId}
    ORDER BY s.created_at DESC
  `;
}

export async function createSchool(school, userId) {
  const sql = await getReadyDatabase();
  const id = randomUUID();
  const slug = createSchoolSlug(school.name, id);
  const [[created]] = await sql.transaction([
    sql`
      INSERT INTO schools (id, name, school_type, country, email, access_mode, slug)
      VALUES (
        ${id},
        ${school.name},
        ${school.schoolType},
        ${school.country},
        ${school.email},
        ${school.accessMode},
        ${slug}
      )
      RETURNING id, name, school_type AS "schoolType", country, email,
                access_mode AS "accessMode", slug, created_at AS "createdAt"
    `,
    sql`
      INSERT INTO school_members (school_id, user_id, role, email)
      VALUES (${id}, ${userId}, 'admin', ${school.email})
    `,
  ]);
  return { ...created, role: "admin", portalUrl: `/school/${slug}` };
}

export async function getSchoolRole(schoolId, userId) {
  const sql = await getReadyDatabase();
  const [membership] = await sql`
    SELECT role FROM school_members
    WHERE school_id = ${schoolId} AND user_id = ${userId}
  `;
  return membership?.role ?? null;
}

export async function listSchoolSubjects(schoolId) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT grade, subject_name AS subject
    FROM school_subjects
    WHERE school_id = ${schoolId}
    ORDER BY grade, subject_name
  `;
}

export async function replaceSchoolSubjects(schoolId, grade, subjects) {
  const sql = await getReadyDatabase();
  const statements = [
    sql`DELETE FROM school_subjects WHERE school_id = ${schoolId} AND grade = ${grade}`,
    ...subjects.map((subject) => sql`
      INSERT INTO school_subjects (school_id, grade, subject_name)
      VALUES (${schoolId}, ${grade}, ${subject})
    `),
  ];
  await sql.transaction(statements);
  return subjects;
}

export async function listSchoolClasses(schoolId, academicYear, teacherUserId = null) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT c.id, c.grade, c.section, c.academic_year AS "academicYear",
           c.created_at AS "createdAt",
           COUNT(DISTINCT st.id)::int AS "studentCount",
           COALESCE(
             ARRAY_AGG(DISTINCT cs.subject_name ORDER BY cs.subject_name)
               FILTER (WHERE cs.subject_name IS NOT NULL),
             ARRAY[]::text[]
           ) AS subjects
    FROM school_classes c
    LEFT JOIN school_students st
      ON st.school_id = c.school_id AND st.class_id = c.id
    LEFT JOIN school_class_subjects cs ON cs.class_id = c.id
    LEFT JOIN school_teaching_assignments ta
      ON ta.class_id = cs.class_id AND ta.subject_name = cs.subject_name
    WHERE c.school_id = ${schoolId}
      AND (${academicYear}::text IS NULL OR c.academic_year = ${academicYear})
      AND (
        ${teacherUserId}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM school_teaching_assignments assigned
          WHERE assigned.school_id = c.school_id
            AND assigned.class_id = c.id
            AND assigned.teacher_user_id = ${teacherUserId}
        )
      )
      AND (${teacherUserId}::text IS NULL OR ta.teacher_user_id = ${teacherUserId})
    GROUP BY c.id
    ORDER BY c.grade, c.section
  `;
}

export async function listSchoolResultSheet(schoolId, classId, term, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const rows = await sql`
    WITH selected_class AS MATERIALIZED (
      SELECT id, grade, section, academic_year
      FROM school_classes
      WHERE school_id = ${schoolId} AND id = ${classId}
    ),
    roster AS MATERIALIZED (
      SELECT st.id, st.admission_number, st.first_name, st.last_name
      FROM school_students st
      JOIN selected_class c ON c.id = st.class_id
      WHERE st.school_id = ${schoolId}
        AND st.is_active
      UNION
      SELECT st.id, st.admission_number, st.first_name, st.last_name
      FROM school_assessment_marks historical_mark
      JOIN school_assessments historical_assessment
        ON historical_assessment.school_id = historical_mark.school_id
        AND historical_assessment.id = historical_mark.assessment_id
      JOIN school_students st
        ON st.school_id = historical_mark.school_id AND st.id = historical_mark.student_id
      WHERE historical_mark.school_id = ${schoolId}
        AND historical_assessment.class_id = ${classId}
        AND historical_assessment.term = ${term}
        AND historical_assessment.status = 'approved'
    ),
    subjects AS MATERIALIZED (
      SELECT cs.subject_name,
             tm.email AS teacher_email
      FROM selected_class c
      JOIN school_class_subjects cs ON cs.class_id = c.id
      LEFT JOIN school_teaching_assignments ta
        ON ta.school_id = ${schoolId}
        AND ta.class_id = c.id
        AND ta.subject_name = cs.subject_name
      LEFT JOIN school_members tm
        ON tm.school_id = ta.school_id AND tm.user_id = ta.teacher_user_id
      WHERE (${teacherUserId}::text IS NULL OR ta.teacher_user_id = ${teacherUserId})
    ),
    approved_totals AS (
      SELECT m.student_id, a.subject_name,
             SUM(m.score)::float8 AS "earnedPoints",
             SUM(a.max_score)::float8 AS "possiblePoints",
             COUNT(*)::int AS "assessmentCount"
      FROM school_assessments a
      JOIN school_assessment_marks m
        ON m.school_id = a.school_id AND m.assessment_id = a.id
      WHERE a.school_id = ${schoolId}
        AND a.class_id = ${classId}
        AND a.term = ${term}
        AND a.status = 'approved'
        AND m.score IS NOT NULL
      GROUP BY m.student_id, a.subject_name
    )
    SELECT c.id AS "classId", c.grade, c.section,
           c.academic_year AS "academicYear", ${term} AS term,
           r.id AS "studentId", r.admission_number AS "admissionNumber",
           r.first_name AS "firstName", r.last_name AS "lastName",
           s.subject_name AS subject, s.teacher_email AS "teacherEmail",
           totals."earnedPoints", totals."possiblePoints",
           COALESCE(totals."assessmentCount", 0)::int AS "assessmentCount"
    FROM selected_class c
    CROSS JOIN roster r
    CROSS JOIN subjects s
    LEFT JOIN approved_totals totals
      ON totals.student_id = r.id AND totals.subject_name = s.subject_name
    ORDER BY s.subject_name, r.last_name, r.first_name, r.admission_number
  `;
  return rows.map((row) => ({
    ...row,
    percentage: calculatePointsPercentage(row.earnedPoints, row.possiblePoints),
  }));
}

export async function listSchoolTeachers(schoolId) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT user_id AS "userId", email, created_at AS "joinedAt"
    FROM school_members
    WHERE school_id = ${schoolId} AND role = 'teacher' AND email IS NOT NULL
    ORDER BY email
  `;
}

export async function listTeachingAssignments(schoolId, teacherUserId = null) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT a.id, a.class_id AS "classId", c.grade, c.section,
           c.academic_year AS "academicYear", a.subject_name AS subject,
           a.teacher_user_id AS "teacherUserId", m.email AS "teacherEmail"
    FROM school_teaching_assignments a
    JOIN school_classes c
      ON c.school_id = a.school_id AND c.id = a.class_id
    JOIN school_members m
      ON m.school_id = a.school_id AND m.user_id = a.teacher_user_id
    WHERE a.school_id = ${schoolId}
      AND (${teacherUserId}::text IS NULL OR a.teacher_user_id = ${teacherUserId})
    ORDER BY c.grade, c.section, a.subject_name, m.email
  `;
}

export async function saveTeachingAssignment(schoolId, assignment) {
  const sql = await getReadyDatabase();
  const [saved] = await sql`
    INSERT INTO school_teaching_assignments
      (id, school_id, class_id, teacher_user_id, subject_name)
    SELECT ${randomUUID()}, c.school_id, c.id, m.user_id, cs.subject_name
    FROM school_classes c
    JOIN school_class_subjects cs
      ON cs.class_id = c.id AND cs.subject_name = ${assignment.subject}
    JOIN school_members m
      ON m.school_id = c.school_id
      AND m.user_id = ${assignment.teacherUserId}
      AND m.role = 'teacher'
    WHERE c.school_id = ${schoolId} AND c.id = ${assignment.classId}
    ON CONFLICT (school_id, class_id, subject_name)
    DO UPDATE SET
      teacher_user_id = EXCLUDED.teacher_user_id,
      updated_at = NOW()
    RETURNING id, class_id AS "classId", teacher_user_id AS "teacherUserId",
              subject_name AS subject
  `;
  return saved ?? null;
}

export async function removeTeachingAssignment(schoolId, assignmentId) {
  const sql = await getReadyDatabase();
  const [removed] = await sql`
    DELETE FROM school_teaching_assignments
    WHERE school_id = ${schoolId} AND id = ${assignmentId}
    RETURNING id
  `;
  return Boolean(removed);
}

export async function listSchoolAssessments(schoolId, teacherUserId = null) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT a.id, a.class_id AS "classId", c.grade, c.section,
           c.academic_year AS "academicYear", a.subject_name AS subject,
           a.title, a.term, a.max_score::float8 AS "maxScore",
           a.due_date AS "dueDate", a.status, a.review_note AS "reviewNote",
           a.submitted_at AS "submittedAt", a.reviewed_at AS "reviewedAt",
           a.created_at AS "createdAt", tm.email AS "teacherEmail",
           COUNT(DISTINCT m.student_id)::int AS "studentCount",
           COUNT(DISTINCT m.student_id) FILTER (WHERE m.score IS NOT NULL)::int AS "markedCount"
    FROM school_assessments a
    JOIN school_classes c
      ON c.school_id = a.school_id AND c.id = a.class_id
    LEFT JOIN school_teaching_assignments ta
      ON ta.school_id = a.school_id
      AND ta.class_id = a.class_id
      AND ta.subject_name = a.subject_name
    LEFT JOIN school_members tm
      ON tm.school_id = ta.school_id AND tm.user_id = ta.teacher_user_id
    LEFT JOIN school_assessment_marks m
      ON m.school_id = a.school_id AND m.assessment_id = a.id
    WHERE a.school_id = ${schoolId}
      AND (${teacherUserId}::text IS NULL OR ta.teacher_user_id = ${teacherUserId})
    GROUP BY a.id, c.id, tm.email
    ORDER BY a.created_at DESC, c.grade, c.section, a.subject_name, a.title
  `;
}

export async function createSchoolAssessment(schoolId, creatorUserId, assessment) {
  const sql = await getReadyDatabase();
  const [assignment] = await sql`
    SELECT (
      SELECT COUNT(*)::int FROM school_students st
      WHERE st.school_id = c.school_id AND st.class_id = c.id AND st.is_active
    ) AS "studentCount"
    FROM school_classes c
    JOIN school_class_subjects cs
      ON cs.class_id = c.id AND cs.subject_name = ${assessment.subject}
    JOIN school_teaching_assignments ta
      ON ta.school_id = c.school_id
      AND ta.class_id = c.id
      AND ta.subject_name = cs.subject_name
    WHERE c.school_id = ${schoolId} AND c.id = ${assessment.classId}
  `;
  if (!assignment) return { error: "assignment" };
  if (assignment.studentCount === 0) return { error: "students" };

  const assessmentId = randomUUID();
  const [createdRows] = await sql.transaction([
    sql`
      INSERT INTO school_assessments
        (id, school_id, class_id, subject_name, title, term, max_score, due_date, created_by)
      VALUES (
        ${assessmentId},
        ${schoolId},
        ${assessment.classId},
        ${assessment.subject},
        ${assessment.title},
        ${assessment.term},
        ${assessment.maxScore},
        ${assessment.dueDate},
        ${creatorUserId}
      )
      ON CONFLICT (school_id, class_id, subject_name, title, term) DO NOTHING
      RETURNING id, class_id AS "classId", subject_name AS subject,
                title, term, max_score::float8 AS "maxScore",
                due_date AS "dueDate", status
    `,
    sql`
      INSERT INTO school_assessment_marks (school_id, assessment_id, student_id)
      SELECT ${schoolId}, ${assessmentId}, st.id
      FROM school_students st
      WHERE st.school_id = ${schoolId}
        AND st.class_id = ${assessment.classId}
        AND st.is_active
        AND EXISTS (
          SELECT 1 FROM school_assessments a
          WHERE a.school_id = ${schoolId} AND a.id = ${assessmentId}
        )
      ON CONFLICT (assessment_id, student_id) DO NOTHING
    `,
  ]);
  const [created] = createdRows;
  return created ? { assessment: created } : { error: "duplicate" };
}

export async function getSchoolAssessment(schoolId, assessmentId, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const [assessment] = await sql`
    SELECT a.id, a.class_id AS "classId", c.grade, c.section,
           c.academic_year AS "academicYear", a.subject_name AS subject,
           a.title, a.term, a.max_score::float8 AS "maxScore",
           a.due_date AS "dueDate", a.status, a.review_note AS "reviewNote",
           a.submitted_at AS "submittedAt", a.reviewed_at AS "reviewedAt",
           a.created_at AS "createdAt"
    FROM school_assessments a
    JOIN school_classes c
      ON c.school_id = a.school_id AND c.id = a.class_id
    WHERE a.school_id = ${schoolId}
      AND a.id = ${assessmentId}
      AND (
        ${teacherUserId}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM school_teaching_assignments ta
          WHERE ta.school_id = a.school_id
            AND ta.class_id = a.class_id
            AND ta.subject_name = a.subject_name
            AND ta.teacher_user_id = ${teacherUserId}
        )
      )
  `;
  if (!assessment) return null;

  const students = await sql`
    SELECT st.id, st.admission_number AS "admissionNumber",
           st.first_name AS "firstName", st.last_name AS "lastName",
           m.score::float8 AS score
    FROM school_assessment_marks m
    JOIN school_students st
      ON st.school_id = m.school_id AND st.id = m.student_id
    WHERE m.school_id = ${schoolId} AND m.assessment_id = ${assessmentId}
    ORDER BY st.last_name, st.first_name, st.admission_number
  `;
  return { assessment, students };
}

export async function saveSchoolAssessmentMarks(schoolId, assessmentId, teacherUserId, marks) {
  const sql = await getReadyDatabase();
  const input = JSON.stringify(marks.map(({ studentId, score }) => ({ student_id: studentId, score })));
  const [result] = await sql`
    WITH provided AS MATERIALIZED (
      SELECT student_id, score
      FROM jsonb_to_recordset(${input}::jsonb) AS item(student_id UUID, score NUMERIC)
    ),
    context AS MATERIALIZED (
      SELECT a.id, a.school_id, a.class_id, a.max_score
      FROM school_assessments a
      JOIN school_teaching_assignments ta
        ON ta.school_id = a.school_id
        AND ta.class_id = a.class_id
        AND ta.subject_name = a.subject_name
        AND ta.teacher_user_id = ${teacherUserId}
      WHERE a.school_id = ${schoolId}
        AND a.id = ${assessmentId}
        AND a.status IN ('draft', 'returned')
    ),
    valid_marks AS MATERIALIZED (
      SELECT provided.student_id, provided.score
      FROM provided
      CROSS JOIN context
      JOIN school_students st
        ON st.school_id = context.school_id
        AND st.id = provided.student_id
      JOIN school_assessment_marks roster
        ON roster.school_id = context.school_id
        AND roster.assessment_id = context.id
        AND roster.student_id = provided.student_id
      WHERE provided.score IS NULL OR provided.score BETWEEN 0 AND context.max_score
    ),
    saved AS (
      INSERT INTO school_assessment_marks
        (school_id, assessment_id, student_id, score, updated_at)
      SELECT context.school_id, context.id, valid_marks.student_id, valid_marks.score, NOW()
      FROM valid_marks
      CROSS JOIN context
      WHERE (SELECT COUNT(*) FROM valid_marks) = (SELECT COUNT(*) FROM provided)
      ON CONFLICT (assessment_id, student_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()
      RETURNING student_id
    )
    SELECT COUNT(*)::int AS saved FROM saved
  `;
  return result.saved === marks.length;
}

export async function submitSchoolAssessment(schoolId, assessmentId, teacherUserId) {
  const sql = await getReadyDatabase();
  const [submitted] = await sql`
    UPDATE school_assessments a
    SET status = 'submitted', submitted_at = NOW(),
        review_note = NULL, reviewed_by = NULL, reviewed_at = NULL
    WHERE a.school_id = ${schoolId}
      AND a.id = ${assessmentId}
      AND a.status IN ('draft', 'returned')
      AND EXISTS (
        SELECT 1 FROM school_teaching_assignments ta
        WHERE ta.school_id = a.school_id
          AND ta.class_id = a.class_id
          AND ta.subject_name = a.subject_name
          AND ta.teacher_user_id = ${teacherUserId}
      )
      AND EXISTS (
        SELECT 1 FROM school_assessment_marks roster
        WHERE roster.school_id = a.school_id AND roster.assessment_id = a.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM school_assessment_marks roster
        WHERE roster.school_id = a.school_id
          AND roster.assessment_id = a.id
          AND roster.score IS NULL
      )
    RETURNING id, status, submitted_at AS "submittedAt"
  `;
  return submitted ?? null;
}

export async function reviewSchoolAssessment(schoolId, assessmentId, reviewerUserId, review) {
  const sql = await getReadyDatabase();
  const [updated] = await sql`
    UPDATE school_assessments
    SET status = ${review.decision},
        review_note = ${review.note},
        reviewed_by = ${reviewerUserId},
        reviewed_at = NOW()
    WHERE school_id = ${schoolId}
      AND id = ${assessmentId}
      AND status = 'submitted'
    RETURNING id, status, review_note AS "reviewNote",
              reviewed_at AS "reviewedAt"
  `;
  return updated ?? null;
}

export async function createSchoolClass(schoolId, classDetails) {
  const sql = await getReadyDatabase();
  const subjects = await sql`
    SELECT subject_name AS subject
    FROM school_subjects
    WHERE school_id = ${schoolId} AND grade = ${classDetails.grade}
    ORDER BY subject_name
  `;
  if (subjects.length === 0) {
    const error = new Error("Choose at least one subject for this grade before creating a class.");
    error.code = "CLASS_SUBJECTS_REQUIRED";
    throw error;
  }

  const classId = randomUUID();
  const statements = [
    sql`
      INSERT INTO school_classes (id, school_id, grade, section, academic_year)
      VALUES (${classId}, ${schoolId}, ${classDetails.grade}, ${classDetails.section}, ${classDetails.academicYear})
      RETURNING id, grade, section, academic_year AS "academicYear", created_at AS "createdAt"
    `,
    ...subjects.map(({ subject }) => sql`
      INSERT INTO school_class_subjects (class_id, subject_name)
      VALUES (${classId}, ${subject})
    `),
  ];
  const [created] = await sql.transaction(statements);
  return { ...created[0], studentCount: 0, subjects: subjects.map(({ subject }) => subject) };
}

export async function deleteSchoolClass(schoolId, classId) {
  const sql = await getReadyDatabase();
  const [deleted] = await sql`
    DELETE FROM school_classes c
    WHERE c.school_id = ${schoolId}
      AND c.id = ${classId}
      AND NOT EXISTS (
        SELECT 1 FROM school_students st
        WHERE st.school_id = c.school_id AND st.class_id = c.id
      )
    RETURNING c.id
  `;
  if (deleted) return true;

  const [existing] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM school_classes WHERE school_id = ${schoolId} AND id = ${classId}
    ) AS "exists"
  `;
  if (existing?.exists) {
    const error = new Error("This class still has student records and cannot be deleted.");
    error.code = "CLASS_HAS_STUDENTS";
    throw error;
  }
  return false;
}

export async function listSchoolStudents(schoolId, { classId, search, limit, offset }) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT st.id, st.admission_number AS "admissionNumber",
           st.first_name AS "firstName", st.last_name AS "lastName",
           st.guardian_email AS "guardianEmail", st.guardian_phone AS "guardianPhone",
           st.is_active AS "isActive", st.class_id AS "classId",
           c.grade, c.section, c.academic_year AS "academicYear"
    FROM school_students st
    JOIN school_classes c ON c.school_id = st.school_id AND c.id = st.class_id
    WHERE st.school_id = ${schoolId}
      AND (${classId}::uuid IS NULL OR st.class_id = ${classId})
      AND (
        ${search}::text IS NULL
        OR st.admission_number ILIKE ${search}
        OR st.first_name ILIKE ${search}
        OR st.last_name ILIKE ${search}
      )
    ORDER BY st.is_active DESC, st.last_name, st.first_name
      LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function countSchoolStudents(schoolId, { classId, search }) {
  const sql = await getReadyDatabase();
  const [result] = await sql`
      SELECT COUNT(*)::int AS total
      FROM school_students st
      WHERE st.school_id = ${schoolId}
        AND (${classId}::uuid IS NULL OR st.class_id = ${classId})
        AND (
          ${search}::text IS NULL
          OR st.admission_number ILIKE ${search}
          OR st.first_name ILIKE ${search}
          OR st.last_name ILIKE ${search}
        )
  `;
  return result.total;
}

export async function createSchoolStudent(schoolId, student) {
  const sql = await getReadyDatabase();
  const [created] = await sql`
    INSERT INTO school_students
      (id, school_id, class_id, admission_number, first_name, last_name, guardian_email, guardian_phone)
    SELECT ${randomUUID()}, ${schoolId}, c.id, ${student.admissionNumber},
           ${student.firstName}, ${student.lastName}, ${student.guardianEmail}, ${student.guardianPhone}
    FROM school_classes c
    WHERE c.school_id = ${schoolId} AND c.id = ${student.classId}
    RETURNING id, admission_number AS "admissionNumber", first_name AS "firstName",
              last_name AS "lastName", guardian_email AS "guardianEmail",
              guardian_phone AS "guardianPhone", is_active AS "isActive", class_id AS "classId"
  `;
  return created ?? null;
}

export async function updateSchoolStudent(schoolId, studentId, student) {
  const sql = await getReadyDatabase();
  const [updated] = await sql`
    UPDATE school_students st
    SET class_id = c.id,
        admission_number = ${student.admissionNumber},
        first_name = ${student.firstName},
        last_name = ${student.lastName},
        guardian_email = ${student.guardianEmail},
        guardian_phone = ${student.guardianPhone}
    FROM school_classes c
    WHERE st.school_id = ${schoolId}
      AND st.id = ${studentId}
      AND c.school_id = ${schoolId}
      AND c.id = ${student.classId}
    RETURNING st.id, st.admission_number AS "admissionNumber",
              st.first_name AS "firstName", st.last_name AS "lastName",
              st.guardian_email AS "guardianEmail", st.guardian_phone AS "guardianPhone",
              st.is_active AS "isActive", st.class_id AS "classId"
  `;
  return updated ?? null;
}

export async function setSchoolStudentActive(schoolId, studentId, isActive) {
  const sql = await getReadyDatabase();
  const [updated] = await sql`
    UPDATE school_students
    SET is_active = ${isActive}
    WHERE school_id = ${schoolId} AND id = ${studentId}
    RETURNING id, is_active AS "isActive"
  `;
  return updated ?? null;
}

export async function createInvitation({ schoolId, email, role, userId }) {
  const sql = await getReadyDatabase();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invitation] = await sql`
    INSERT INTO school_invitations
      (id, school_id, email, role, token_hash, created_by, expires_at)
    VALUES (
      ${randomUUID()},
      ${schoolId},
      ${email},
      ${role},
      ${tokenHash},
      ${userId},
      NOW() + INTERVAL '7 days'
    )
    RETURNING email, role, expires_at AS "expiresAt"
  `;
  return { ...invitation, token };
}

export async function acceptInvitation({ token, email, userId }) {
  const sql = await getReadyDatabase();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [membership] = await sql`
    WITH claimed AS (
      UPDATE school_invitations
      SET accepted_at = NOW()
      WHERE token_hash = ${tokenHash}
        AND email = ${email}
        AND accepted_at IS NULL
        AND expires_at > NOW()
      RETURNING school_id, role, email
    ),
    added AS (
      INSERT INTO school_members (school_id, user_id, role, email)
      SELECT school_id, ${userId}, role, email FROM claimed
      ON CONFLICT (school_id, user_id)
      DO UPDATE SET email = COALESCE(school_members.email, EXCLUDED.email)
      RETURNING school_id, user_id
    )
    SELECT claimed.school_id AS "schoolId", claimed.role
    FROM claimed
    LEFT JOIN added ON added.school_id = claimed.school_id
  `;
  return membership ?? null;
}
