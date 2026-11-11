import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { createSchoolSlug, normalizeSchoolInput } from "../server/school-input.js";

function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(process.env.DATABASE_URL);
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    const school = request.method === "POST"
      ? normalizeSchoolInput(request.body)
      : null;
    if (request.method === "POST" && !school) {
      return response.status(400).json({
        error: "Enter a valid school name, type, country, email, and access option.",
      });
    }

    const sql = getDatabase();
    await sql`
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
    `;

    if (request.method === "GET") {
      const schools = await sql`
        SELECT id, name, school_type AS "schoolType", country, email,
               access_mode AS "accessMode", slug, created_at AS "createdAt"
        FROM schools
        ORDER BY created_at DESC
      `;
      return response.status(200).json({ schools });
    }

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

    return response.status(201).json({
      school: { id, ...school, slug, portalUrl: `/school/${slug}` },
    });
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({
        error: "A school profile already exists for that email address.",
      });
    }
    console.error("School API request failed:", error);
    return response.status(500).json({
      error: "We couldn’t complete the school request. Please try again.",
    });
  }
}
