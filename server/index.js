import express from "express";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

app.post("/api/schools", (request, response) => {
  const { name, schoolType, country, email, accessMode } = request.body ?? {};
  const normalized = {
    name: typeof name === "string" ? name.trim() : "",
    schoolType: typeof schoolType === "string" ? schoolType.trim() : "",
    country: typeof country === "string" ? country.trim() : "",
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    accessMode: typeof accessMode === "string" ? accessMode : "",
  };
  const validSchoolTypes = new Set([
    "Primary school",
    "Secondary school",
    "All-through school",
    "College / sixth form",
  ]);
  const validAccessModes = new Set(["invite", "school-code", "public"]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email);

  if (
    normalized.name.length < 2 ||
    normalized.name.length > 120 ||
    !validSchoolTypes.has(normalized.schoolType) ||
    normalized.country.length < 2 ||
    normalized.country.length > 80 ||
    !validEmail ||
    !validAccessModes.has(normalized.accessMode)
  ) {
    return response.status(400).json({ error: "Enter a valid school name, type, country, email, and access option." });
  }

  const id = randomUUID();
  const slugBase = normalized.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "school";
  const slug = `${slugBase}-${id.slice(0, 6)}`;

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
