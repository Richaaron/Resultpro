import express from "express";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchoolSlug, normalizeSchoolInput } from "./school-input.js";

const filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(filename), "..");
const dataDirectory = path.join(projectRoot, "data");
mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(path.join(dataDirectory, "aster.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    school_type TEXT NOT NULL,
    country TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    access_mode TEXT NOT NULL CHECK (access_mode IN ('invite', 'school-code', 'public')),
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = express();
const port = Number(process.env.PORT) || 4000;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/schools", (_request, response) => {
  const schools = database.prepare(`
    SELECT id, name, school_type AS schoolType, country, email,
           access_mode AS accessMode, slug, created_at AS createdAt
    FROM schools
    ORDER BY created_at DESC
  `).all();
  response.json({ schools });
});

app.post("/api/schools", (request, response) => {
  const normalized = normalizeSchoolInput(request.body);
  if (!normalized) {
    return response.status(400).json({ error: "Enter a valid school name, type, country, email, and access option." });
  }

  const id = randomUUID();
  const slug = createSchoolSlug(normalized.name, id);

  try {
    database.prepare(`
      INSERT INTO schools (id, name, school_type, country, email, access_mode, slug)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, normalized.name, normalized.schoolType, normalized.country, normalized.email, normalized.accessMode, slug);
  } catch (error) {
    if (error.errcode === 2067) {
      return response.status(409).json({ error: "A school profile already exists for that email address." });
    }
    console.error("Could not save school profile:", error);
    return response.status(500).json({ error: "We couldn’t save the school profile. Please try again." });
  }

  return response.status(201).json({
    school: {
      id,
      ...normalized,
      slug,
      portalUrl: `/school/${slug}`,
    },
  });
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API endpoint not found." });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(projectRoot, "dist", "index.html")));
}

app.listen(port, () => {
  console.log(`Aster API listening on http://localhost:${port}`);
});
