import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSchoolSlug } from "./school-input.js";
import {
  applyGradingSettingsToRows,
  calculatePointsPercentage,
  defaultGradingSettings,
} from "../shared/school-data.js";

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
          CREATE TABLE IF NOT EXISTS school_grading_settings (
            school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
            grade_bands JSONB NOT NULL,
            tie_method VARCHAR(20) NOT NULL
              CHECK (tie_method IN ('competition', 'dense', 'none')),
            incomplete_policy VARCHAR(20) NOT NULL
              CHECK (incomplete_policy IN ('require_all', 'graded_only')),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_members (
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'parent')),
            email VARCHAR(254),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, user_id)
          )
        `,
        database.sql`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'school_members_role_check'
                AND conrelid = 'school_members'::regclass
                AND pg_get_constraintdef(oid) NOT LIKE '%parent%'
            ) THEN
              ALTER TABLE school_members DROP CONSTRAINT school_members_role_check;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'school_members_role_check'
                AND conrelid = 'school_members'::regclass
            ) THEN
              ALTER TABLE school_members
                ADD CONSTRAINT school_members_role_check
                CHECK (role IN ('admin', 'teacher', 'student', 'parent'));
            END IF;
          END;
          $$
        `,
        database.sql`
          ALTER TABLE school_members ADD COLUMN IF NOT EXISTS email VARCHAR(254)
        `,
        database.sql`
          ALTER TABLE school_members ADD COLUMN IF NOT EXISTS display_name VARCHAR(120)
        `,
        database.sql`
          ALTER TABLE school_members ADD COLUMN IF NOT EXISTS teacher_code VARCHAR(24)
        `,
        database.sql`
          CREATE UNIQUE INDEX IF NOT EXISTS school_members_teacher_code_idx
          ON school_members (school_id, teacher_code)
          WHERE teacher_code IS NOT NULL
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_invitations (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            email VARCHAR(254) NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student', 'parent')),
            token_hash CHAR(64) NOT NULL UNIQUE,
            created_by TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            accepted_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            student_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        database.sql`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'school_invitations_role_check'
                AND conrelid = 'school_invitations'::regclass
                AND pg_get_constraintdef(oid) NOT LIKE '%parent%'
            ) THEN
              ALTER TABLE school_invitations DROP CONSTRAINT school_invitations_role_check;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'school_invitations_role_check'
                AND conrelid = 'school_invitations'::regclass
            ) THEN
              ALTER TABLE school_invitations
                ADD CONSTRAINT school_invitations_role_check
                CHECK (role IN ('teacher', 'student', 'parent'));
            END IF;
          END;
          $$
        `,
        database.sql`
          ALTER TABLE school_invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ
        `,
        database.sql`
          ALTER TABLE school_invitations ADD COLUMN IF NOT EXISTS student_id UUID
        `,
        database.sql`
          ALTER TABLE school_invitations ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(120)
        `,
        database.sql`
          ALTER TABLE school_invitations ADD COLUMN IF NOT EXISTS teacher_code VARCHAR(24)
        `,
        database.sql`
          CREATE UNIQUE INDEX IF NOT EXISTS school_invitations_teacher_code_idx
          ON school_invitations (school_id, teacher_code)
          WHERE teacher_code IS NOT NULL
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
            user_id TEXT,
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
          ALTER TABLE school_students ADD COLUMN IF NOT EXISTS user_id TEXT
        `,
        database.sql`
          CREATE UNIQUE INDEX IF NOT EXISTS school_students_user_id_idx
          ON school_students (school_id, user_id)
          WHERE user_id IS NOT NULL
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_parent_students (
            school_id UUID NOT NULL,
            parent_user_id TEXT NOT NULL,
            student_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, parent_user_id, student_id),
            CONSTRAINT school_parent_students_parent_fk
              FOREIGN KEY (school_id, parent_user_id)
              REFERENCES school_members(school_id, user_id) ON DELETE CASCADE,
            CONSTRAINT school_parent_students_student_fk
              FOREIGN KEY (school_id, student_id)
              REFERENCES school_students(school_id, id) ON DELETE CASCADE
          )
        `,
        database.sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'school_invitations_student_fk'
                AND conrelid = 'school_invitations'::regclass
            ) THEN
              ALTER TABLE school_invitations
                ADD CONSTRAINT school_invitations_student_fk
                FOREIGN KEY (school_id, student_id)
                REFERENCES school_students(school_id, id) ON DELETE CASCADE;
            END IF;
          END;
          $$
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_attendance (
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            class_id UUID NOT NULL,
            attendance_date DATE NOT NULL,
            student_id UUID NOT NULL,
            status VARCHAR(12) NOT NULL
              CHECK (status IN ('present', 'absent', 'late', 'excused')),
            recorded_by TEXT NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, class_id, attendance_date, student_id),
            CONSTRAINT school_attendance_class_fk
              FOREIGN KEY (school_id, class_id)
              REFERENCES school_classes(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_attendance_student_fk
              FOREIGN KEY (school_id, student_id)
              REFERENCES school_students(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_attendance_recorder_fk
              FOREIGN KEY (school_id, recorded_by)
              REFERENCES school_members(school_id, user_id) ON DELETE RESTRICT
          )
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
        database.sql`
          CREATE TABLE IF NOT EXISTS school_result_publications (
            id UUID PRIMARY KEY,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            class_id UUID NOT NULL,
            term VARCHAR(12) NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
            academic_year VARCHAR(9) NOT NULL,
            published_by TEXT NOT NULL,
            grading_settings JSONB,
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (school_id, class_id, term),
            UNIQUE (school_id, id),
            CONSTRAINT school_result_publications_class_fk
              FOREIGN KEY (school_id, class_id)
              REFERENCES school_classes(school_id, id) ON DELETE RESTRICT,
            CONSTRAINT school_result_publications_publisher_fk
              FOREIGN KEY (school_id, published_by)
              REFERENCES school_members(school_id, user_id) ON DELETE RESTRICT
          )
        `,
        database.sql`
          ALTER TABLE school_result_publications
          ADD COLUMN IF NOT EXISTS grading_settings JSONB
        `,
        database.sql`
          CREATE TABLE IF NOT EXISTS school_published_results (
            school_id UUID NOT NULL,
            publication_id UUID NOT NULL,
            student_id UUID NOT NULL,
            admission_number VARCHAR(32) NOT NULL,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            teacher_email VARCHAR(254),
            earned_points NUMERIC(10, 2),
            possible_points NUMERIC(10, 2),
            percentage NUMERIC(5, 2),
            grade VARCHAR(12),
            overall_percentage NUMERIC(5, 2),
            overall_grade VARCHAR(12),
            class_position INTEGER,
            assessment_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (publication_id, student_id, subject_name),
            CONSTRAINT school_published_results_publication_fk
              FOREIGN KEY (school_id, publication_id)
              REFERENCES school_result_publications(school_id, id) ON DELETE CASCADE,
            CONSTRAINT school_published_results_student_fk
              FOREIGN KEY (school_id, student_id)
              REFERENCES school_students(school_id, id) ON DELETE RESTRICT
          )
        `,
        database.sql`
          ALTER TABLE school_published_results
          ADD COLUMN IF NOT EXISTS grade VARCHAR(12)
        `,
        database.sql`
          ALTER TABLE school_published_results
          ADD COLUMN IF NOT EXISTS overall_percentage NUMERIC(5, 2)
        `,
        database.sql`
          ALTER TABLE school_published_results
          ADD COLUMN IF NOT EXISTS overall_grade VARCHAR(12)
        `,
        database.sql`
          ALTER TABLE school_published_results
          ADD COLUMN IF NOT EXISTS class_position INTEGER
        `,
        database.sql`
          CREATE INDEX IF NOT EXISTS school_published_results_student_idx
          ON school_published_results (school_id, student_id, publication_id)
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

export async function getSchoolGradingSettings(schoolId) {
  const sql = await getReadyDatabase();
  await sql`
    INSERT INTO school_grading_settings
      (school_id, grade_bands, tie_method, incomplete_policy)
    VALUES (
      ${schoolId},
      ${JSON.stringify(defaultGradingSettings.bands)}::jsonb,
      ${defaultGradingSettings.tieMethod},
      ${defaultGradingSettings.incompletePolicy}
    )
    ON CONFLICT (school_id) DO NOTHING
  `;
  const [settings] = await sql`
    SELECT grade_bands AS bands, tie_method AS "tieMethod",
           incomplete_policy AS "incompletePolicy"
    FROM school_grading_settings
    WHERE school_id = ${schoolId}
  `;
  return settings;
}

export async function saveSchoolGradingSettings(schoolId, settings) {
  const sql = await getReadyDatabase();
  const [saved] = await sql`
    INSERT INTO school_grading_settings
      (school_id, grade_bands, tie_method, incomplete_policy, updated_at)
    VALUES (
      ${schoolId},
      ${JSON.stringify(settings.bands)}::jsonb,
      ${settings.tieMethod},
      ${settings.incompletePolicy},
      NOW()
    )
    ON CONFLICT (school_id) DO UPDATE SET
      grade_bands = EXCLUDED.grade_bands,
      tie_method = EXCLUDED.tie_method,
      incomplete_policy = EXCLUDED.incomplete_policy,
      updated_at = NOW()
    RETURNING grade_bands AS bands, tie_method AS "tieMethod",
              incomplete_policy AS "incompletePolicy",
              updated_at AS "updatedAt"
  `;
  return saved;
}

export async function getSchoolDashboard(schoolId, userId, role) {
  const sql = await getReadyDatabase();
  const [summary] = await sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM school_students st
        WHERE st.school_id = ${schoolId}
          AND st.is_active
          AND (
            ${role} = 'admin'
            OR (
              ${role} = 'teacher'
              AND EXISTS (
              SELECT 1 FROM school_teaching_assignments ta
              WHERE ta.school_id = st.school_id
                AND ta.class_id = st.class_id
                AND ta.teacher_user_id = ${userId}
              )
            )
            OR (
              ${role} = 'parent'
              AND EXISTS (
                SELECT 1 FROM school_parent_students ps
                WHERE ps.school_id = st.school_id
                  AND ps.parent_user_id = ${userId}
                  AND ps.student_id = st.id
              )
            )
          )
      ) AS "studentCount",
      (
        SELECT COUNT(*)::int
        FROM school_members m
        WHERE m.school_id = ${schoolId}
          AND m.role = 'teacher'
          AND ${role} = 'admin'
      ) AS "teacherCount",
      (
        SELECT COUNT(*)::int
        FROM school_classes c
        WHERE c.school_id = ${schoolId}
          AND (
            ${role} = 'admin'
            OR (
              ${role} = 'teacher'
              AND EXISTS (
                SELECT 1 FROM school_teaching_assignments ta
                WHERE ta.school_id = c.school_id
                  AND ta.class_id = c.id
                  AND ta.teacher_user_id = ${userId}
              )
            )
            OR (
              ${role} = 'student'
              AND EXISTS (
                SELECT 1 FROM school_students st
                WHERE st.school_id = c.school_id
                  AND st.class_id = c.id
                  AND st.user_id = ${userId}
              )
            )
            OR (
              ${role} = 'parent'
              AND EXISTS (
                SELECT 1
                FROM school_parent_students ps
                JOIN school_students st
                  ON st.school_id = ps.school_id AND st.id = ps.student_id
                WHERE ps.school_id = c.school_id
                  AND ps.parent_user_id = ${userId}
                  AND st.class_id = c.id
              )
            )
          )
      ) AS "classCount",
      (
        SELECT COUNT(*)::int
        FROM school_assessments a
        WHERE a.school_id = ${schoolId}
          AND a.status = 'submitted'
          AND ${role} NOT IN ('student', 'parent')
          AND (
            ${role} = 'admin'
            OR EXISTS (
              SELECT 1 FROM school_teaching_assignments ta
              WHERE ta.school_id = a.school_id
                AND ta.class_id = a.class_id
                AND ta.subject_name = a.subject_name
                AND ta.teacher_user_id = ${userId}
            )
          )
      ) AS "submittedCount",
      (
        SELECT COUNT(*)::int
        FROM school_assessments a
        WHERE a.school_id = ${schoolId}
          AND a.status IN ('draft', 'returned')
          AND ${role} = 'teacher'
          AND EXISTS (
            SELECT 1 FROM school_teaching_assignments ta
            WHERE ta.school_id = a.school_id
              AND ta.class_id = a.class_id
              AND ta.subject_name = a.subject_name
              AND ta.teacher_user_id = ${userId}
          )
      ) AS "toCompleteCount",
      (
        SELECT COUNT(DISTINCT p.id)::int
        FROM school_result_publications p
        WHERE p.school_id = ${schoolId}
          AND (
            ${role} = 'admin'
            OR (
              ${role} = 'teacher'
              AND EXISTS (
                SELECT 1 FROM school_teaching_assignments ta
                WHERE ta.school_id = p.school_id
                  AND ta.class_id = p.class_id
                  AND ta.teacher_user_id = ${userId}
              )
            )
            OR (
              ${role} = 'student'
              AND EXISTS (
                SELECT 1
                FROM school_students st
                JOIN school_published_results r
                  ON r.school_id = st.school_id
                  AND r.student_id = st.id
                  AND r.publication_id = p.id
                WHERE st.school_id = p.school_id
                  AND st.user_id = ${userId}
              )
            )
            OR (
              ${role} = 'parent'
              AND EXISTS (
                SELECT 1
                FROM school_parent_students ps
                JOIN school_published_results r
                  ON r.school_id = ps.school_id AND r.student_id = ps.student_id
                WHERE ps.school_id = p.school_id
                  AND ps.parent_user_id = ${userId}
                  AND r.publication_id = p.id
              )
            )
          )
      ) AS "publishedSheetCount",
      (
        SELECT COUNT(DISTINCT r.subject_name)::int
        FROM school_published_results r
        JOIN school_result_publications p
          ON p.school_id = r.school_id AND p.id = r.publication_id
        WHERE r.school_id = ${schoolId}
          AND (
            (${role} = 'student' AND r.student_id = (
              SELECT st.id FROM school_students st
              WHERE st.school_id = ${schoolId} AND st.user_id = ${userId}
            ))
            OR (${role} = 'parent' AND EXISTS (
              SELECT 1 FROM school_parent_students ps
              WHERE ps.school_id = r.school_id
                AND ps.parent_user_id = ${userId}
                AND ps.student_id = r.student_id
            ))
          )
          AND p.id = (
            SELECT p2.id
            FROM school_result_publications p2
            JOIN school_published_results r2
              ON r2.school_id = p2.school_id AND r2.publication_id = p2.id
            WHERE p2.school_id = ${schoolId}
              AND r2.student_id = r.student_id
            ORDER BY p2.published_at DESC, p2.id
            LIMIT 1
          )
      ) AS "latestSubjectCount",
      (
        SELECT COALESCE(SUM(r.assessment_count), 0)::int
        FROM school_published_results r
        JOIN school_result_publications p
          ON p.school_id = r.school_id AND p.id = r.publication_id
        WHERE r.school_id = ${schoolId}
          AND (
            (${role} = 'student' AND r.student_id = (
              SELECT st.id FROM school_students st
              WHERE st.school_id = ${schoolId} AND st.user_id = ${userId}
            ))
            OR (${role} = 'parent' AND EXISTS (
              SELECT 1 FROM school_parent_students ps
              WHERE ps.school_id = r.school_id
                AND ps.parent_user_id = ${userId}
                AND ps.student_id = r.student_id
            ))
          )
          AND p.id = (
            SELECT p2.id
            FROM school_result_publications p2
            JOIN school_published_results r2
              ON r2.school_id = p2.school_id AND r2.publication_id = p2.id
            WHERE p2.school_id = ${schoolId}
              AND r2.student_id = r.student_id
            ORDER BY p2.published_at DESC, p2.id
            LIMIT 1
          )
      ) AS "latestAssessmentCount",
      (
        SELECT AVG(r.percentage)::float8
        FROM school_published_results r
        JOIN school_result_publications p
          ON p.school_id = r.school_id AND p.id = r.publication_id
        WHERE r.school_id = ${schoolId}
          AND (
            ${role} = 'admin'
            OR (
              ${role} = 'teacher'
              AND EXISTS (
                SELECT 1 FROM school_teaching_assignments ta
                WHERE ta.school_id = r.school_id
                  AND ta.class_id = p.class_id
                  AND ta.subject_name = r.subject_name
                  AND ta.teacher_user_id = ${userId}
              )
            )
            OR (
              ${role} = 'student'
              AND r.student_id = (
                SELECT st.id FROM school_students st
                WHERE st.school_id = ${schoolId} AND st.user_id = ${userId}
              )
              AND p.id = (
                SELECT p2.id
                FROM school_result_publications p2
                JOIN school_published_results r2
                  ON r2.school_id = p2.school_id AND r2.publication_id = p2.id
                WHERE p2.school_id = ${schoolId}
                  AND r2.student_id = r.student_id
                ORDER BY p2.published_at DESC, p2.id
                LIMIT 1
              )
            )
            OR (
              ${role} = 'parent'
              AND EXISTS (
                SELECT 1
                FROM school_parent_students ps
                WHERE ps.school_id = r.school_id
                  AND ps.parent_user_id = ${userId}
                  AND ps.student_id = r.student_id
              )
              AND p.id = (
                SELECT p2.id
                FROM school_result_publications p2
                JOIN school_published_results r2
                  ON r2.school_id = p2.school_id AND r2.publication_id = p2.id
                WHERE p2.school_id = ${schoolId}
                  AND r2.student_id = r.student_id
                ORDER BY p2.published_at DESC, p2.id
                LIMIT 1
              )
            )
          )
      ) AS "averagePercentage"
  `;

  const activity = role === "student" || role === "parent"
    ? await sql`
      SELECT
        p.id,
        CASE WHEN ${role} = 'parent'
          THEN CONCAT(st.first_name, ' ', st.last_name, ' · ', c.grade, ' ', c.section, ' · ', p.term)
          ELSE CONCAT(c.grade, ' ', c.section, ' · ', p.term)
        END AS title,
        p.academic_year AS "academicYear",
        COUNT(DISTINCT r.subject_name)::int AS "subjectCount",
        AVG(r.percentage)::float8 AS "averagePercentage",
        p.published_at AS "createdAt"
      FROM school_published_results r
      JOIN school_result_publications p
        ON p.school_id = r.school_id AND p.id = r.publication_id
      JOIN school_classes c
        ON c.school_id = p.school_id AND c.id = p.class_id
      JOIN school_students st
        ON st.school_id = r.school_id AND st.id = r.student_id
      WHERE r.school_id = ${schoolId}
        AND (
          (${role} = 'student' AND r.student_id = (
            SELECT linked.id FROM school_students linked
            WHERE linked.school_id = ${schoolId} AND linked.user_id = ${userId}
          ))
          OR (${role} = 'parent' AND EXISTS (
            SELECT 1 FROM school_parent_students ps
            WHERE ps.school_id = r.school_id
              AND ps.parent_user_id = ${userId}
              AND ps.student_id = r.student_id
          ))
        )
      GROUP BY p.id, c.id, st.id
      ORDER BY p.published_at DESC
      LIMIT 4
    `
    : await sql`
      SELECT a.id, a.title,
             CONCAT(c.grade, ' ', c.section, ' · ', a.subject_name, ' · ', a.term) AS detail,
             a.status, a.created_at AS "createdAt",
             COUNT(DISTINCT m.student_id) FILTER (WHERE m.score IS NOT NULL)::int AS "markedCount",
             COUNT(DISTINCT m.student_id)::int AS "studentCount"
      FROM school_assessments a
      JOIN school_classes c
        ON c.school_id = a.school_id AND c.id = a.class_id
      LEFT JOIN school_assessment_marks m
        ON m.school_id = a.school_id AND m.assessment_id = a.id
      WHERE a.school_id = ${schoolId}
        AND ${role} NOT IN ('student', 'parent')
        AND (
          ${role} = 'admin'
          OR EXISTS (
            SELECT 1 FROM school_teaching_assignments ta
            WHERE ta.school_id = a.school_id
              AND ta.class_id = a.class_id
              AND ta.subject_name = a.subject_name
              AND ta.teacher_user_id = ${userId}
          )
        )
      GROUP BY a.id, c.id
      ORDER BY a.created_at DESC
      LIMIT 4
    `;

  return { summary, activity };
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

export async function getSchoolClassAttendance(schoolId, classId, date, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const rows = await sql`
    WITH selected_class AS MATERIALIZED (
      SELECT c.id, c.grade, c.section, c.academic_year
      FROM school_classes c
      WHERE c.school_id = ${schoolId}
        AND c.id = ${classId}
        AND (
          ${teacherUserId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM school_teaching_assignments ta
            WHERE ta.school_id = c.school_id
              AND ta.class_id = c.id
              AND ta.teacher_user_id = ${teacherUserId}
          )
        )
    )
    SELECT c.id AS "classId", c.grade, c.section, c.academic_year AS "academicYear",
           st.id AS "studentId", st.admission_number AS "admissionNumber",
           st.first_name AS "firstName", st.last_name AS "lastName",
           a.status, a.recorded_at AS "recordedAt"
    FROM selected_class c
    LEFT JOIN school_students st
      ON st.school_id = ${schoolId} AND st.class_id = c.id AND st.is_active
    LEFT JOIN school_attendance a
      ON a.school_id = ${schoolId}
      AND a.class_id = c.id
      AND a.attendance_date = ${date}::date
      AND a.student_id = st.id
    ORDER BY st.last_name, st.first_name, st.admission_number
  `;
  if (!rows.length) return null;
  const { classId: resultClassId, grade, section, academicYear } = rows[0];
  return {
    schoolClass: { id: resultClassId, grade, section, academicYear },
    date,
    rows: rows.filter((row) => row.studentId).map((row) => ({
      studentId: row.studentId,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
    })),
  };
}

export async function getSchoolClassAttendanceReport(schoolId, classId, from, to, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const rows = await sql`
    WITH selected_class AS MATERIALIZED (
      SELECT c.id, c.grade, c.section, c.academic_year
      FROM school_classes c
      WHERE c.school_id = ${schoolId}
        AND c.id = ${classId}
        AND (
          ${teacherUserId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM school_teaching_assignments ta
            WHERE ta.school_id = c.school_id
              AND ta.class_id = c.id
              AND ta.teacher_user_id = ${teacherUserId}
          )
        )
    ),
    roster AS MATERIALIZED (
      SELECT st.id, st.admission_number, st.first_name, st.last_name
      FROM school_students st
      JOIN selected_class c ON c.id = st.class_id
      WHERE st.school_id = ${schoolId}
        AND st.is_active
      UNION
      SELECT st.id, st.admission_number, st.first_name, st.last_name
      FROM school_attendance a
      JOIN school_students st
        ON st.school_id = a.school_id AND st.id = a.student_id
      JOIN selected_class c ON c.id = a.class_id
      WHERE a.school_id = ${schoolId}
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
    ),
    student_totals AS (
      SELECT a.student_id,
             COUNT(*)::int AS "daysRecorded",
             COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
             COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
             COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
             COUNT(*) FILTER (WHERE a.status = 'excused')::int AS excused
      FROM school_attendance a
      JOIN selected_class c ON c.id = a.class_id
      WHERE a.school_id = ${schoolId}
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY a.student_id
    ),
    attendance_days AS (
      SELECT COUNT(DISTINCT a.attendance_date)::int AS total
      FROM school_attendance a
      JOIN selected_class c ON c.id = a.class_id
      WHERE a.school_id = ${schoolId}
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
    )
    SELECT c.id AS "classId", c.grade, c.section,
           c.academic_year AS "academicYear",
           days.total AS "recordedDays",
           st.id AS "studentId", st.admission_number AS "admissionNumber",
           st.first_name AS "firstName", st.last_name AS "lastName",
           COALESCE(totals."daysRecorded", 0)::int AS "daysRecorded",
           COALESCE(totals.present, 0)::int AS present,
           COALESCE(totals.absent, 0)::int AS absent,
           COALESCE(totals.late, 0)::int AS late,
           COALESCE(totals.excused, 0)::int AS excused
    FROM selected_class c
    CROSS JOIN attendance_days days
    LEFT JOIN roster st ON TRUE
    LEFT JOIN student_totals totals ON totals.student_id = st.id
    ORDER BY st.last_name, st.first_name, st.admission_number
  `;
  if (!rows.length) return null;
  const { classId: resultClassId, grade, section, academicYear, recordedDays } = rows[0];
  return {
    schoolClass: { id: resultClassId, grade, section, academicYear },
    from,
    to,
    recordedDays,
    rows: rows.filter((row) => row.studentId).map((row) => ({
      studentId: row.studentId,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      daysRecorded: row.daysRecorded,
      present: row.present,
      absent: row.absent,
      late: row.late,
      excused: row.excused,
    })),
  };
}

export async function saveSchoolClassAttendance(schoolId, classId, date, userId, marks, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const [result] = await sql`
    WITH eligible_class AS MATERIALIZED (
      SELECT c.id
      FROM school_classes c
      WHERE c.school_id = ${schoolId}
        AND c.id = ${classId}
        AND (
          ${teacherUserId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM school_teaching_assignments ta
            WHERE ta.school_id = c.school_id
              AND ta.class_id = c.id
              AND ta.teacher_user_id = ${teacherUserId}
          )
        )
    ),
    active_roster AS MATERIALIZED (
      SELECT st.id
      FROM school_students st
      JOIN eligible_class c ON c.id = st.class_id
      WHERE st.school_id = ${schoolId} AND st.is_active
    ),
    incoming AS MATERIALIZED (
      SELECT mark.student_id, mark.status
      FROM jsonb_to_recordset(${JSON.stringify(marks.map(({ studentId, status }) => ({ student_id: studentId, status })))}::jsonb)
        AS mark(student_id uuid, status text)
    ),
    batch_valid AS MATERIALIZED (
      SELECT EXISTS (SELECT 1 FROM eligible_class)
        AND (SELECT COUNT(*) FROM active_roster) = (SELECT COUNT(*) FROM incoming)
        AND NOT EXISTS (
          SELECT id FROM active_roster
          EXCEPT
          SELECT student_id FROM incoming
        )
        AND NOT EXISTS (
          SELECT student_id FROM incoming
          EXCEPT
          SELECT id FROM active_roster
        ) AS is_valid
    ),
    saved AS (
      INSERT INTO school_attendance
        (school_id, class_id, attendance_date, student_id, status, recorded_by)
      SELECT ${schoolId}, ${classId}, ${date}::date, incoming.student_id, incoming.status, ${userId}
      FROM incoming
      CROSS JOIN batch_valid
      WHERE batch_valid.is_valid
      ON CONFLICT (school_id, class_id, attendance_date, student_id)
      DO UPDATE SET status = EXCLUDED.status,
                    recorded_by = EXCLUDED.recorded_by,
                    recorded_at = NOW()
      RETURNING student_id
    )
    SELECT EXISTS (SELECT 1 FROM eligible_class) AS "classFound",
           (SELECT is_valid FROM batch_valid) AS "batchValid",
           (SELECT COUNT(*)::int FROM saved) AS "savedCount"
  `;
  if (!result.classFound) return { error: "class" };
  if (!result.batchValid) return { error: "roster" };
  return { savedCount: result.savedCount };
}

export async function listSchoolResultSheet(schoolId, classId, term, teacherUserId = null, savedGradingSettings = null) {
  const sql = await getReadyDatabase();
  const gradingSettings = savedGradingSettings || await getSchoolGradingSettings(schoolId);
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
  return applyGradingSettingsToRows(rows.map((row) => ({
    ...row,
    percentage: calculatePointsPercentage(row.earnedPoints, row.possiblePoints),
  })), gradingSettings, { includeOverall: teacherUserId === null });
}

export async function getSchoolPublishedResultSheet(schoolId, classId, term, teacherUserId = null) {
  const sql = await getReadyDatabase();
  const [publication] = await sql`
    SELECT p.id, p.class_id AS "classId", c.grade, c.section,
           p.academic_year AS "academicYear", p.term,
           p.published_at AS "publishedAt", p.grading_settings AS "gradingSettings",
           m.email AS "publishedBy"
    FROM school_result_publications p
    JOIN school_classes c
      ON c.school_id = p.school_id AND c.id = p.class_id
    JOIN school_members m
      ON m.school_id = p.school_id AND m.user_id = p.published_by
    WHERE p.school_id = ${schoolId}
      AND p.class_id = ${classId}
      AND p.term = ${term}
      AND (
        ${teacherUserId}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM school_teaching_assignments ta
          WHERE ta.school_id = p.school_id
            AND ta.class_id = p.class_id
            AND ta.teacher_user_id = ${teacherUserId}
        )
      )
  `;
  if (!publication) return null;

  const rows = await sql`
    SELECT student_id AS "studentId", admission_number AS "admissionNumber",
           first_name AS "firstName", last_name AS "lastName",
           subject_name AS subject, teacher_email AS "teacherEmail",
           earned_points::float8 AS "earnedPoints",
           possible_points::float8 AS "possiblePoints",
           percentage::float8 AS percentage, grade,
           overall_percentage::float8 AS "overallPercentage",
           overall_grade AS "overallGrade", class_position AS "classPosition",
           assessment_count AS "assessmentCount"
    FROM school_published_results
    WHERE school_id = ${schoolId} AND publication_id = ${publication.id}
      AND (
        ${teacherUserId}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM school_teaching_assignments ta
          WHERE ta.school_id = ${schoolId}
            AND ta.class_id = ${classId}
            AND ta.subject_name = school_published_results.subject_name
            AND ta.teacher_user_id = ${teacherUserId}
        )
      )
    ORDER BY subject_name, last_name, first_name, admission_number
  `;
  return { publication, rows };
}

export async function publishSchoolResultSheet(schoolId, classId, term, publisherUserId) {
  const sql = await getReadyDatabase();
  const gradingSettings = await getSchoolGradingSettings(schoolId);
  const publicationId = randomUUID();
  const [created] = await sql`
    WITH grading_config AS MATERIALIZED (
      SELECT ${JSON.stringify(gradingSettings)}::jsonb AS config
    ),
    selected_class AS MATERIALIZED (
      SELECT c.id, c.school_id, c.grade, c.section, c.academic_year
      FROM school_classes c
      WHERE c.school_id = ${schoolId} AND c.id = ${classId}
      FOR UPDATE
    ),
    roster AS MATERIALIZED (
      SELECT st.id, st.admission_number, st.first_name, st.last_name
      FROM school_students st
      JOIN selected_class c ON c.id = st.class_id
      WHERE st.school_id = ${schoolId} AND st.is_active
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
      SELECT cs.subject_name, teacher.email AS teacher_email
      FROM selected_class c
      JOIN school_class_subjects cs ON cs.class_id = c.id
      LEFT JOIN school_teaching_assignments ta
        ON ta.school_id = c.school_id
        AND ta.class_id = c.id
        AND ta.subject_name = cs.subject_name
      LEFT JOIN school_members teacher
        ON teacher.school_id = ta.school_id AND teacher.user_id = ta.teacher_user_id
    ),
    approved_totals AS MATERIALIZED (
      SELECT m.student_id, a.subject_name,
             SUM(m.score) AS earned_points,
             SUM(a.max_score) AS possible_points,
             COUNT(*)::int AS assessment_count
      FROM school_assessments a
      JOIN school_assessment_marks m
        ON m.school_id = a.school_id AND m.assessment_id = a.id
      WHERE a.school_id = ${schoolId}
        AND a.class_id = ${classId}
        AND a.term = ${term}
        AND a.status = 'approved'
        AND m.score IS NOT NULL
      GROUP BY m.student_id, a.subject_name
    ),
    snapshot_rows AS MATERIALIZED (
      SELECT r.id AS student_id, r.admission_number, r.first_name, r.last_name,
             s.subject_name, s.teacher_email,
             totals.earned_points, totals.possible_points,
             CASE WHEN totals.possible_points > 0
               THEN ROUND(totals.earned_points / totals.possible_points * 100, 2)
               ELSE NULL
             END AS percentage,
             COALESCE(totals.assessment_count, 0)::int AS assessment_count
      FROM selected_class c
      CROSS JOIN roster r
      CROSS JOIN subjects s
      LEFT JOIN approved_totals totals
        ON totals.student_id = r.id AND totals.subject_name = s.subject_name
    ),
    student_totals AS MATERIALIZED (
      SELECT student_id,
             SUM(COALESCE(earned_points, 0)) AS earned_points,
             SUM(COALESCE(possible_points, 0)) AS possible_points,
             COUNT(*) FILTER (WHERE percentage IS NOT NULL)::int AS graded_subject_count,
             COUNT(*)::int AS subject_count
      FROM snapshot_rows
      GROUP BY student_id
    ),
    overall_results AS MATERIALIZED (
      SELECT totals.student_id,
             CASE WHEN totals.possible_points > 0
               THEN ROUND(totals.earned_points / totals.possible_points * 100, 2)
               ELSE NULL
             END AS overall_percentage,
             CASE WHEN totals.possible_points > 0
               AND (
                 grading_config.config->>'incompletePolicy' = 'graded_only'
                 OR totals.graded_subject_count = totals.subject_count
               )
               THEN ROUND(totals.earned_points / totals.possible_points * 100, 2)
               ELSE NULL
             END AS position_percentage
      FROM student_totals totals
      CROSS JOIN grading_config
    ),
    ranked_results AS MATERIALIZED (
      SELECT overall.student_id, overall.overall_percentage,
             overall.position_percentage,
             CASE
               WHEN grading_config.config->>'tieMethod' = 'competition'
                 THEN RANK() OVER (ORDER BY overall.position_percentage DESC NULLS LAST)
               WHEN grading_config.config->>'tieMethod' = 'dense'
                 THEN DENSE_RANK() OVER (ORDER BY overall.position_percentage DESC NULLS LAST)
               ELSE NULL
             END AS class_position
      FROM overall_results overall
      CROSS JOIN grading_config
    ),
    graded_snapshot_rows AS MATERIALIZED (
      SELECT snapshot.*,
             subject_grade.label AS grade,
             ranked.overall_percentage,
             overall_grade.label AS overall_grade,
             CASE WHEN ranked.position_percentage IS NOT NULL
               THEN ranked.class_position
               ELSE NULL
             END AS class_position
      FROM snapshot_rows snapshot
      JOIN ranked_results ranked ON ranked.student_id = snapshot.student_id
      CROSS JOIN grading_config
      LEFT JOIN LATERAL (
        SELECT band.value->>'label' AS label
        FROM jsonb_array_elements(grading_config.config->'bands') AS band(value)
        WHERE snapshot.percentage >= (band.value->>'minimum')::numeric
        ORDER BY (band.value->>'minimum')::numeric DESC
        LIMIT 1
      ) subject_grade ON TRUE
      LEFT JOIN LATERAL (
        SELECT band.value->>'label' AS label
        FROM jsonb_array_elements(grading_config.config->'bands') AS band(value)
        WHERE ranked.overall_percentage >= (band.value->>'minimum')::numeric
        ORDER BY (band.value->>'minimum')::numeric DESC
        LIMIT 1
      ) overall_grade ON TRUE
    ),
    created_publication AS (
      INSERT INTO school_result_publications
        (id, school_id, class_id, term, academic_year, published_by, grading_settings)
      SELECT ${publicationId}, c.school_id, c.id, ${term}, c.academic_year,
             ${publisherUserId}, grading_config.config
      FROM selected_class c
      CROSS JOIN grading_config
      WHERE EXISTS (SELECT 1 FROM snapshot_rows)
        AND EXISTS (
          SELECT 1 FROM school_students st
          WHERE st.school_id = c.school_id AND st.class_id = c.id AND st.is_active
        )
        AND EXISTS (
          SELECT 1 FROM school_assessments a
          WHERE a.school_id = c.school_id AND a.class_id = c.id AND a.term = ${term}
        )
        AND NOT EXISTS (
          SELECT 1 FROM school_assessments a
          WHERE a.school_id = c.school_id
            AND a.class_id = c.id
            AND a.term = ${term}
            AND a.status <> 'approved'
        )
      ON CONFLICT (school_id, class_id, term) DO NOTHING
      RETURNING id, school_id
    ),
    saved_results AS (
      INSERT INTO school_published_results
        (school_id, publication_id, student_id, admission_number, first_name,
         last_name, subject_name, teacher_email, earned_points, possible_points,
         percentage, grade, overall_percentage, overall_grade, class_position,
         assessment_count)
      SELECT publication.school_id, publication.id, snapshot.student_id,
             snapshot.admission_number, snapshot.first_name, snapshot.last_name,
             snapshot.subject_name, snapshot.teacher_email, snapshot.earned_points,
             snapshot.possible_points, snapshot.percentage, snapshot.grade,
             snapshot.overall_percentage, snapshot.overall_grade,
             snapshot.class_position, snapshot.assessment_count
      FROM graded_snapshot_rows snapshot
      CROSS JOIN created_publication publication
      ON CONFLICT (publication_id, student_id, subject_name) DO NOTHING
      RETURNING publication_id
    )
    SELECT id FROM created_publication
  `;
  if (created) return { published: true, publicationId: created.id };

  const [state] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM school_result_publications
      WHERE school_id = ${schoolId} AND class_id = ${classId} AND term = ${term}
    ) AS published,
    EXISTS (
      SELECT 1 FROM school_classes
      WHERE school_id = ${schoolId} AND id = ${classId}
    ) AS has_class,
    EXISTS (
      SELECT 1 FROM school_assessments
      WHERE school_id = ${schoolId} AND class_id = ${classId} AND term = ${term}
    ) AS has_assessments,
    EXISTS (
      SELECT 1 FROM school_assessments
      WHERE school_id = ${schoolId} AND class_id = ${classId} AND term = ${term}
        AND status <> 'approved'
    ) AS has_unapproved,
    EXISTS (
      SELECT 1 FROM school_students
      WHERE school_id = ${schoolId} AND class_id = ${classId} AND is_active
    ) AS has_active_students
  `;
  if (state.published) return { error: "published" };
  if (!state.has_class) return { error: "class" };
  if (!state.has_active_students) return { error: "students" };
  if (!state.has_assessments) return { error: "no_assessments" };
  if (state.has_unapproved) return { error: "unapproved" };
  return { error: "class" };
}

export async function listStudentPublishedResultSheets(schoolId, userId) {
  const sql = await getReadyDatabase();
  const [student] = await sql`
    SELECT id
    FROM school_students
    WHERE school_id = ${schoolId} AND user_id = ${userId}
  `;
  if (!student) return { linked: false, sheets: [] };

  const rows = await sql`
    SELECT p.id AS "publicationId", p.term, p.academic_year AS "academicYear",
           p.published_at AS "publishedAt", c.grade, c.section,
           r.admission_number AS "admissionNumber", r.first_name AS "firstName",
           r.last_name AS "lastName", r.subject_name AS subject,
           r.teacher_email AS "teacherEmail", r.earned_points::float8 AS "earnedPoints",
           r.possible_points::float8 AS "possiblePoints",
           r.percentage::float8 AS percentage,
           r.grade, r.overall_percentage::float8 AS "overallPercentage",
           r.overall_grade AS "overallGrade", r.class_position AS "classPosition",
           r.assessment_count AS "assessmentCount"
    FROM school_published_results r
    JOIN school_result_publications p
      ON p.school_id = r.school_id AND p.id = r.publication_id
    JOIN school_classes c
      ON c.school_id = p.school_id AND c.id = p.class_id
    WHERE r.school_id = ${schoolId} AND r.student_id = ${student.id}
    ORDER BY p.published_at DESC, p.term, r.subject_name
  `;
  const sheetsById = new Map();
  for (const row of rows) {
    let sheet = sheetsById.get(row.publicationId);
    if (!sheet) {
      sheet = {
        id: row.publicationId,
        term: row.term,
        academicYear: row.academicYear,
        publishedAt: row.publishedAt,
        grade: row.grade,
        section: row.section,
        rows: [],
      };
      sheetsById.set(row.publicationId, sheet);
    }
    sheet.rows.push({
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      subject: row.subject,
      teacherEmail: row.teacherEmail,
      earnedPoints: row.earnedPoints,
      possiblePoints: row.possiblePoints,
      percentage: row.percentage,
      grade: row.grade,
      overallPercentage: row.overallPercentage,
      overallGrade: row.overallGrade,
      classPosition: row.classPosition,
      assessmentCount: row.assessmentCount,
    });
  }
  return { linked: true, sheets: [...sheetsById.values()] };
}

export async function listParentPublishedResultSheets(schoolId, userId) {
  const sql = await getReadyDatabase();
  const children = await sql`
    SELECT st.id AS "studentId", st.admission_number AS "admissionNumber",
           st.first_name AS "firstName", st.last_name AS "lastName",
           c.grade, c.section
    FROM school_parent_students ps
    JOIN school_students st
      ON st.school_id = ps.school_id AND st.id = ps.student_id
    JOIN school_classes c
      ON c.school_id = st.school_id AND c.id = st.class_id
    WHERE ps.school_id = ${schoolId} AND ps.parent_user_id = ${userId}
    ORDER BY st.last_name, st.first_name, st.admission_number
  `;
  if (!children.length) return { linked: false, children: [] };

  const rows = await sql`
    SELECT r.student_id AS "studentId", p.id AS "publicationId",
           p.term, p.academic_year AS "academicYear",
           p.published_at AS "publishedAt", c.grade, c.section,
           r.admission_number AS "admissionNumber", r.first_name AS "firstName",
           r.last_name AS "lastName", r.subject_name AS subject,
           r.teacher_email AS "teacherEmail", r.earned_points::float8 AS "earnedPoints",
           r.possible_points::float8 AS "possiblePoints",
           r.percentage::float8 AS percentage, r.grade AS "subjectGrade",
           r.overall_percentage::float8 AS "overallPercentage",
           r.overall_grade AS "overallGrade", r.class_position AS "classPosition",
           r.assessment_count AS "assessmentCount"
    FROM school_parent_students ps
    JOIN school_published_results r
      ON r.school_id = ps.school_id AND r.student_id = ps.student_id
    JOIN school_result_publications p
      ON p.school_id = r.school_id AND p.id = r.publication_id
    JOIN school_classes c
      ON c.school_id = p.school_id AND c.id = p.class_id
    WHERE ps.school_id = ${schoolId} AND ps.parent_user_id = ${userId}
    ORDER BY p.published_at DESC, p.term, r.subject_name
  `;
  const sheetsByStudent = new Map(children.map((child) => [child.studentId, new Map()]));
  for (const row of rows) {
    const sheets = sheetsByStudent.get(row.studentId);
    let sheet = sheets.get(row.publicationId);
    if (!sheet) {
      sheet = {
        id: row.publicationId,
        term: row.term,
        academicYear: row.academicYear,
        publishedAt: row.publishedAt,
        grade: row.grade,
        section: row.section,
        rows: [],
      };
      sheets.set(row.publicationId, sheet);
    }
    sheet.rows.push({
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      subject: row.subject,
      teacherEmail: row.teacherEmail,
      earnedPoints: row.earnedPoints,
      possiblePoints: row.possiblePoints,
      percentage: row.percentage,
      grade: row.subjectGrade,
      overallPercentage: row.overallPercentage,
      overallGrade: row.overallGrade,
      classPosition: row.classPosition,
      assessmentCount: row.assessmentCount,
    });
  }
  return {
    linked: true,
    children: children.map((child) => ({
      ...child,
      sheets: [...sheetsByStudent.get(child.studentId).values()],
    })),
  };
}

export async function listSchoolTeachers(schoolId) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT user_id AS "userId", email, display_name AS "teacherName",
           teacher_code AS "teacherCode", created_at AS "joinedAt"
    FROM school_members
    WHERE school_id = ${schoolId} AND role = 'teacher' AND email IS NOT NULL
    ORDER BY display_name, email
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
  const assessmentId = randomUUID();
  const [createdRows] = await sql.transaction([
    sql`
      WITH locked_class AS MATERIALIZED (
        SELECT c.id, c.school_id
        FROM school_classes c
        WHERE c.school_id = ${schoolId} AND c.id = ${assessment.classId}
        FOR UPDATE
      ),
      eligible AS MATERIALIZED (
        SELECT c.id, c.school_id,
               (
                 SELECT COUNT(*)::int FROM school_students st
                 WHERE st.school_id = c.school_id
                   AND st.class_id = c.id AND st.is_active
               ) AS student_count
        FROM locked_class c
        JOIN school_class_subjects cs
          ON cs.class_id = c.id AND cs.subject_name = ${assessment.subject}
        JOIN school_teaching_assignments ta
          ON ta.school_id = c.school_id
          AND ta.class_id = c.id
          AND ta.subject_name = cs.subject_name
        WHERE NOT EXISTS (
          SELECT 1 FROM school_result_publications p
          WHERE p.school_id = c.school_id
            AND p.class_id = c.id
            AND p.term = ${assessment.term}
        )
      )
      INSERT INTO school_assessments
        (id, school_id, class_id, subject_name, title, term, max_score, due_date, created_by)
      SELECT ${assessmentId}, eligible.school_id, eligible.id,
             ${assessment.subject}, ${assessment.title}, ${assessment.term},
             ${assessment.maxScore}, ${assessment.dueDate}, ${creatorUserId}
      FROM eligible
      WHERE eligible.student_count > 0
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
  if (created) return { assessment: created };

  const [state] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM school_result_publications
      WHERE school_id = ${schoolId} AND class_id = ${assessment.classId}
        AND term = ${assessment.term}
    ) AS published,
    EXISTS (
      SELECT 1 FROM school_classes c
      JOIN school_class_subjects cs
        ON cs.class_id = c.id AND cs.subject_name = ${assessment.subject}
      JOIN school_teaching_assignments ta
        ON ta.school_id = c.school_id AND ta.class_id = c.id
        AND ta.subject_name = cs.subject_name
      WHERE c.school_id = ${schoolId} AND c.id = ${assessment.classId}
    ) AS assigned,
    EXISTS (
      SELECT 1 FROM school_students
      WHERE school_id = ${schoolId} AND class_id = ${assessment.classId} AND is_active
    ) AS has_active_students,
    EXISTS (
      SELECT 1 FROM school_assessments
      WHERE school_id = ${schoolId} AND class_id = ${assessment.classId}
        AND subject_name = ${assessment.subject}
        AND title = ${assessment.title} AND term = ${assessment.term}
    ) AS duplicate
  `;
  if (state.published) return { error: "published" };
  if (!state.assigned) return { error: "assignment" };
  if (!state.has_active_students) return { error: "students" };
  if (state.duplicate) return { error: "duplicate" };
  return { error: "class" };
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
      AND NOT EXISTS (
        SELECT 1 FROM school_result_publications p
        WHERE p.school_id = c.school_id AND p.class_id = c.id
      )
    RETURNING c.id
  `;
  if (deleted) return true;

  const [existing] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM school_classes WHERE school_id = ${schoolId} AND id = ${classId}
    ) AS "exists",
    EXISTS (
      SELECT 1 FROM school_result_publications
      WHERE school_id = ${schoolId} AND class_id = ${classId}
    ) AS has_results
  `;
  if (existing?.exists) {
    const error = new Error(existing.has_results
      ? "This class has published results and cannot be deleted."
      : "This class still has student records and cannot be deleted.");
    error.code = existing.has_results ? "CLASS_HAS_RESULTS" : "CLASS_HAS_STUDENTS";
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
           (st.user_id IS NOT NULL) AS "isPortalLinked",
           EXISTS (
             SELECT 1 FROM school_parent_students ps
             WHERE ps.school_id = st.school_id AND ps.student_id = st.id
           ) AS "isParentPortalLinked",
           EXISTS (
             SELECT 1 FROM school_invitations i
             WHERE i.school_id = st.school_id AND i.student_id = st.id
               AND i.role = 'parent' AND i.accepted_at IS NULL
               AND i.revoked_at IS NULL AND i.expires_at > NOW()
           ) AS "parentInvitationPending",
           linked.email AS "portalEmail",
           c.grade, c.section, c.academic_year AS "academicYear"
    FROM school_students st
    JOIN school_classes c ON c.school_id = st.school_id AND c.id = st.class_id
    LEFT JOIN school_members linked
      ON linked.school_id = st.school_id
      AND linked.user_id = st.user_id
      AND linked.role = 'student'
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

export async function importSchoolStudents(schoolId, classId, students) {
  const sql = await getReadyDatabase();
  const records = students.map((student) => ({
    id: randomUUID(),
    admission_number: student.admissionNumber,
    first_name: student.firstName,
    last_name: student.lastName,
    guardian_email: student.guardianEmail,
    guardian_phone: student.guardianPhone,
  }));
  const [result] = await sql`
    WITH input AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
        AS student_import(id uuid, admission_number text, first_name text, last_name text,
                          guardian_email text, guardian_phone text)
    ),
    eligible_class AS MATERIALIZED (
      SELECT c.id
      FROM school_classes c
      WHERE c.school_id = ${schoolId} AND c.id = ${classId}
      FOR KEY SHARE
    ),
    batch_duplicates AS MATERIALIZED (
      SELECT admission_number
      FROM input
      GROUP BY admission_number
      HAVING COUNT(*) > 1
    ),
    existing_duplicates AS MATERIALIZED (
      SELECT DISTINCT input.admission_number
      FROM input
      JOIN school_students existing
        ON existing.school_id = ${schoolId}
        AND existing.admission_number = input.admission_number
    ),
    inserted AS (
      INSERT INTO school_students
        (id, school_id, class_id, admission_number, first_name, last_name,
         guardian_email, guardian_phone)
      SELECT input.id, ${schoolId}, eligible_class.id, input.admission_number,
             input.first_name, input.last_name, input.guardian_email, input.guardian_phone
      FROM input
      CROSS JOIN eligible_class
      WHERE NOT EXISTS (SELECT 1 FROM batch_duplicates)
        AND NOT EXISTS (SELECT 1 FROM existing_duplicates)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM eligible_class) AS "classFound",
           COALESCE((SELECT ARRAY_AGG(admission_number) FROM batch_duplicates), ARRAY[]::text[])
             AS "duplicateAdmissions",
           COALESCE((SELECT ARRAY_AGG(admission_number) FROM existing_duplicates), ARRAY[]::text[])
             AS "existingAdmissions",
           (SELECT COUNT(*)::int FROM inserted) AS "importedCount"
  `;
  if (!result.classFound) return { error: "class" };
  if (result.duplicateAdmissions.length) {
    return { error: "duplicates", admissions: result.duplicateAdmissions };
  }
  if (result.existingAdmissions.length) {
    return { error: "existing", admissions: result.existingAdmissions };
  }
  return { importedCount: result.importedCount };
}

export async function updateSchoolStudent(schoolId, studentId, student) {
  const sql = await getReadyDatabase();
  const [updated] = await sql`
    WITH updated AS (
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
    ),
    revoked_links AS (
      DELETE FROM school_parent_students ps
      USING updated u, school_members m
      WHERE ps.school_id = ${schoolId}
        AND ps.student_id = u.id
        AND m.school_id = ps.school_id
        AND m.user_id = ps.parent_user_id
        AND (u."guardianEmail" IS NULL OR LOWER(m.email) <> LOWER(u."guardianEmail"))
      RETURNING ps.student_id
    ),
    revoked_invitations AS (
      UPDATE school_invitations i
      SET revoked_at = NOW()
      FROM updated u
      WHERE i.school_id = ${schoolId}
        AND i.student_id = u.id
        AND i.role = 'parent'
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND (u."guardianEmail" IS NULL OR LOWER(i.email) <> LOWER(u."guardianEmail"))
      RETURNING i.id
    )
    SELECT * FROM updated
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

export async function createInvitation({ schoolId, email, role, userId, studentId = null, teacherName = null }) {
  const sql = await getReadyDatabase();
  const [school] = await sql`
    SELECT name AS "schoolName", slug AS "schoolSlug"
    FROM schools
    WHERE id = ${schoolId}
  `;
  if (!school) return null;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let invitation;
  if (studentId && role === "student") {
    [invitation] = await sql`
      WITH target AS MATERIALIZED (
        SELECT st.id
        FROM school_students st
        WHERE st.school_id = ${schoolId}
          AND st.id = ${studentId}
          AND st.user_id IS NULL
        FOR UPDATE
      )
      INSERT INTO school_invitations
        (id, school_id, email, role, token_hash, created_by, expires_at, student_id)
      SELECT ${randomUUID()}, ${schoolId}, ${email}, 'student', ${tokenHash},
             ${userId}, NOW() + INTERVAL '7 days', target.id
      FROM target
      RETURNING email, role, expires_at AS "expiresAt"
    `
  } else if (studentId && role === "parent") {
    [invitation] = await sql`
      WITH target AS MATERIALIZED (
        SELECT st.id, st.guardian_email
        FROM school_students st
        WHERE st.school_id = ${schoolId}
          AND st.id = ${studentId}
          AND st.is_active
          AND LOWER(st.guardian_email) = LOWER(${email})
        FOR UPDATE
      )
      INSERT INTO school_invitations
        (id, school_id, email, role, token_hash, created_by, expires_at, student_id)
      SELECT ${randomUUID()}, ${schoolId}, target.guardian_email, 'parent', ${tokenHash},
             ${userId}, NOW() + INTERVAL '7 days', target.id
      FROM target
      WHERE NOT EXISTS (
        SELECT 1 FROM school_invitations active
        WHERE active.school_id = ${schoolId}
          AND active.student_id = target.id
          AND active.role = 'parent'
          AND active.accepted_at IS NULL
          AND active.revoked_at IS NULL
          AND active.expires_at > NOW()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM school_parent_students ps
        JOIN school_members parent
          ON parent.school_id = ps.school_id AND parent.user_id = ps.parent_user_id
        WHERE ps.school_id = ${schoolId}
          AND ps.student_id = target.id
          AND parent.role = 'parent'
          AND LOWER(parent.email) = LOWER(target.guardian_email)
      )
      AND NOT EXISTS (
        SELECT 1 FROM school_members existing
        WHERE existing.school_id = ${schoolId}
          AND LOWER(existing.email) = LOWER(target.guardian_email)
          AND existing.role <> 'parent'
      )
      RETURNING email, role, expires_at AS "expiresAt"
    `;
  } else if (role === "teacher") {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const teacherCode = `TCH-${randomBytes(8).toString("hex").toUpperCase()}`;
      [invitation] = await sql`
        INSERT INTO school_invitations
          (id, school_id, email, role, token_hash, created_by, expires_at,
           teacher_name, teacher_code)
        SELECT ${randomUUID()}, ${schoolId}, ${email}, 'teacher', ${tokenHash},
               ${userId}, NOW() + INTERVAL '7 days', ${teacherName}, ${teacherCode}
        WHERE NOT EXISTS (
          SELECT 1 FROM school_members m
          WHERE m.school_id = ${schoolId} AND m.email = ${email}
        )
        AND NOT EXISTS (
          SELECT 1 FROM school_invitations i
          WHERE i.school_id = ${schoolId}
            AND i.email = ${email}
            AND i.role = 'teacher'
            AND i.accepted_at IS NULL
            AND i.revoked_at IS NULL
            AND i.expires_at > NOW()
        )
        RETURNING email, role, teacher_name AS "teacherName",
                  teacher_code AS "teacherCode", expires_at AS "expiresAt"
      `;
      if (invitation) break;
      const [codeInUse] = await sql`
        SELECT EXISTS (
          SELECT 1 FROM school_members
          WHERE school_id = ${schoolId} AND teacher_code = ${teacherCode}
          UNION ALL
          SELECT 1 FROM school_invitations
          WHERE school_id = ${schoolId} AND teacher_code = ${teacherCode}
        ) AS used
      `;
      if (!codeInUse?.used) break;
    }
  } else {
    [invitation] = await sql`
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
  }
  if (!invitation) return null;
  return { ...invitation, ...school, token };
}

export async function listSchoolInvitations(schoolId) {
  const sql = await getReadyDatabase();
  return sql`
    SELECT i.id, i.email, i.role,
           COALESCE(i.teacher_name, NULLIF(CONCAT_WS(' ', st.first_name, st.last_name), '')) AS "inviteeName",
           i.teacher_code AS "teacherCode",
           i.expires_at AS "expiresAt",
           i.created_at AS "createdAt",
           CASE WHEN i.expires_at <= NOW() THEN 'expired' ELSE 'pending' END AS status
    FROM school_invitations i
    LEFT JOIN school_students st
      ON st.school_id = i.school_id AND st.id = i.student_id
    WHERE i.school_id = ${schoolId}
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 100
  `;
}

export async function renewSchoolInvitation(schoolId, invitationId) {
  const sql = await getReadyDatabase();
  const [school] = await sql`
    SELECT name AS "schoolName", slug AS "schoolSlug"
    FROM schools
    WHERE id = ${schoolId}
  `;
  if (!school) return null;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invitation] = await sql`
    UPDATE school_invitations i
    SET token_hash = ${tokenHash},
        expires_at = NOW() + INTERVAL '7 days'
    WHERE i.school_id = ${schoolId}
      AND i.id = ${invitationId}
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
      AND (
        i.role <> 'teacher'
        OR NOT EXISTS (
          SELECT 1 FROM school_invitations active
          WHERE active.school_id = i.school_id
            AND active.email = i.email
            AND active.role = 'teacher'
            AND active.id <> i.id
            AND active.accepted_at IS NULL
            AND active.revoked_at IS NULL
            AND active.expires_at > NOW()
        )
      )
      AND (
        i.role <> 'parent'
        OR EXISTS (
          SELECT 1 FROM school_students st
          WHERE st.school_id = i.school_id
            AND st.id = i.student_id
            AND st.is_active
            AND LOWER(st.guardian_email) = LOWER(i.email)
        )
      )
    RETURNING i.id, i.email, i.role, i.teacher_name AS "teacherName",
              i.teacher_code AS "teacherCode", i.expires_at AS "expiresAt"
  `;
  if (!invitation) return null;
  return { ...invitation, ...school, token };
}

export async function revokeSchoolInvitation(schoolId, invitationId) {
  const sql = await getReadyDatabase();
  const [revoked] = await sql`
    UPDATE school_invitations
    SET revoked_at = NOW()
    WHERE school_id = ${schoolId}
      AND id = ${invitationId}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    RETURNING id
  `;
  return revoked ?? null;
}

export async function acceptInvitation({ token, email, userId }) {
  const sql = await getReadyDatabase();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [membership] = await sql`
    WITH candidate AS MATERIALIZED (
      SELECT i.id, i.school_id, i.role, i.email, i.student_id,
             i.teacher_name, i.teacher_code
      FROM school_invitations i
      WHERE i.token_hash = ${tokenHash}
        AND i.email = ${email}
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM school_members existing
          WHERE existing.school_id = i.school_id
            AND existing.user_id = ${userId}
            AND existing.role <> i.role
        )
        AND (
          i.role <> 'parent'
          OR EXISTS (
            SELECT 1 FROM school_students st
            WHERE st.school_id = i.school_id
              AND st.id = i.student_id
              AND st.is_active
              AND LOWER(st.guardian_email) = LOWER(i.email)
          )
        )
        AND (
          i.role <> 'student'
          OR i.student_id IS NULL
          OR (
            EXISTS (
              SELECT 1 FROM school_students st
              WHERE st.school_id = i.school_id AND st.id = i.student_id
                AND (st.user_id IS NULL OR st.user_id = ${userId})
            )
            AND NOT EXISTS (
              SELECT 1 FROM school_students other
              WHERE other.school_id = i.school_id
                AND other.user_id = ${userId}
                AND other.id <> i.student_id
            )
          )
        )
      FOR UPDATE OF i
    ),
    locked_student AS MATERIALIZED (
      SELECT st.school_id, st.id
      FROM school_students st
      JOIN candidate c
        ON c.school_id = st.school_id AND c.student_id = st.id
      WHERE c.role = 'student'
        AND (st.user_id IS NULL OR st.user_id = ${userId})
      FOR UPDATE OF st
    ),
    locked_parent_student AS MATERIALIZED (
      SELECT st.school_id, st.id
      FROM school_students st
      JOIN candidate c
        ON c.school_id = st.school_id AND c.student_id = st.id
      WHERE c.role = 'parent'
        AND st.is_active
        AND LOWER(st.guardian_email) = LOWER(c.email)
      FOR UPDATE OF st
    ),
    claimed AS (
      UPDATE school_invitations i
      SET accepted_at = NOW()
      FROM candidate c
      WHERE i.id = c.id
        AND (c.student_id IS NULL OR (c.role = 'student' AND EXISTS (
          SELECT 1 FROM locked_student st
          WHERE st.school_id = c.school_id AND st.id = c.student_id
        )) OR (c.role = 'parent' AND EXISTS (
          SELECT 1 FROM locked_parent_student st
          WHERE st.school_id = c.school_id AND st.id = c.student_id
        )))
      RETURNING i.school_id, i.role, i.email, i.student_id,
                i.teacher_name, i.teacher_code
    ),
    added AS (
      INSERT INTO school_members
        (school_id, user_id, role, email, display_name, teacher_code)
      SELECT school_id, ${userId}, role, email, teacher_name, teacher_code FROM claimed
      ON CONFLICT (school_id, user_id)
      DO UPDATE SET
        email = COALESCE(school_members.email, EXCLUDED.email),
        display_name = COALESCE(school_members.display_name, EXCLUDED.display_name),
        teacher_code = COALESCE(school_members.teacher_code, EXCLUDED.teacher_code)
        WHERE school_members.role = EXCLUDED.role
      RETURNING school_id, user_id
    ),
    linked AS (
      UPDATE school_students st
      SET user_id = ${userId}
      FROM claimed c
      JOIN added a ON a.school_id = c.school_id
      WHERE c.student_id IS NOT NULL
        AND c.role = 'student'
        AND st.school_id = c.school_id
        AND st.id = c.student_id
        AND (st.user_id IS NULL OR st.user_id = ${userId})
      RETURNING st.school_id, st.id
    ),
    parent_linked AS (
      INSERT INTO school_parent_students (school_id, parent_user_id, student_id)
      SELECT c.school_id, ${userId}, c.student_id
      FROM claimed c
      JOIN added a ON a.school_id = c.school_id
      WHERE c.role = 'parent'
      ON CONFLICT (school_id, parent_user_id, student_id)
      DO UPDATE SET created_at = school_parent_students.created_at
      RETURNING school_id, parent_user_id, student_id
    )
    SELECT claimed.school_id AS "schoolId", claimed.role
    FROM claimed
    JOIN added ON added.school_id = claimed.school_id
    WHERE claimed.student_id IS NULL
      OR EXISTS (
        SELECT 1 FROM linked
        WHERE linked.school_id = claimed.school_id
          AND linked.id = claimed.student_id
      )
      OR EXISTS (
        SELECT 1 FROM parent_linked
        WHERE parent_linked.school_id = claimed.school_id
          AND parent_linked.parent_user_id = ${userId}
          AND parent_linked.student_id = claimed.student_id
      )
  `;
  return membership ?? null;
}
