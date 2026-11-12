import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSchoolSlug } from "./school-input.js";

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
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (school_id, user_id)
          )
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
      INSERT INTO school_members (school_id, user_id, role)
      VALUES (${id}, ${userId}, 'admin')
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
      RETURNING school_id, role
    ),
    added AS (
      INSERT INTO school_members (school_id, user_id, role)
      SELECT school_id, ${userId}, role FROM claimed
      ON CONFLICT (school_id, user_id) DO NOTHING
      RETURNING school_id, user_id
    )
    SELECT claimed.school_id AS "schoolId", claimed.role
    FROM claimed
    LEFT JOIN added ON added.school_id = claimed.school_id
  `;
  return membership ?? null;
}
