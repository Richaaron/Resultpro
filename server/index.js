import express from "express";
import "dotenv/config";
import { createSchool, listSchools } from "./school-repository.js";
import { normalizeSchoolInput } from "./school-input.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(filename), "..");

const app = express();
const port = Number(process.env.PORT) || 4000;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/schools", async (_request, response) => {
  try {
    const schools = await listSchools();
    return response.json({ schools });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools", async (request, response) => {
  const normalized = normalizeSchoolInput(request.body);
  if (!normalized) {
    return response.status(400).json({ error: "Enter a valid school name, type, country, email, and access option." });
  }

  try {
    const school = await createSchool(normalized);
    return response.status(201).json({ school });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

function handleDatabaseError(error, response) {
  if (error.code === "23505") {
    return response.status(409).json({
      error: "A school profile already exists for that email address.",
    });
  }
  if (error.code === "DATABASE_URL_MISSING") {
    return response.status(503).json({
      error: "Database not configured. Set DATABASE_URL to your Neon connection string.",
    });
  }
  console.error("School API request failed:", error);
  return response.status(500).json({
    error: "We couldn’t complete the school request. Please try again.",
  });
}

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
