import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { createSchoolSlug } from "./school-input.js";

let initializedDatabaseUrl;
let initializePromise;

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
    if (!initializePromise) {
      initializePromise = database.sql`
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
      `.then(() => {
        initializedDatabaseUrl = database.databaseUrl;
      }).catch((error) => {
        initializePromise = undefined;
        throw error;
      });
    }
    await initializePromise;
  }
  return database.sql;
}

export async function listSchools() {
  const sql = await getReadyDatabase();
  return sql`
    SELECT id, name, school_type AS "schoolType", country, email,
           access_mode AS "accessMode", slug, created_at AS "createdAt"
    FROM schools
    ORDER BY created_at DESC
  `;
}

export async function createSchool(school) {
  const sql = await getReadyDatabase();
  const id = randomUUID();
  const slug = createSchoolSlug(school.name, id);
  await sql`
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
  `;
  return { id, ...school, slug, portalUrl: `/school/${slug}` };
}
