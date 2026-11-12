import express from "express";
import dotenv from "dotenv";
import {
  acceptInvitation,
  createInvitation,
  createSchool,
  getSchoolRole,
  listSchools,
} from "./school-repository.js";
import { normalizeSchoolInput } from "./school-input.js";
import { createCorsMiddleware } from "./cors.js";
import { requireAuth } from "./auth.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(filename), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const app = express();
const port = Number(process.env.PORT) || 4000;

app.disable("x-powered-by");
app.use(createCorsMiddleware({
  production: process.env.NODE_ENV === "production",
  configuredOrigins: process.env.FRONTEND_ORIGINS,
}));
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/schools", requireAuth, async (request, response) => {
  try {
    const schools = await listSchools(request.auth.userId);
    return response.json({ schools });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools", requireAuth, async (request, response) => {
  const normalized = normalizeSchoolInput(request.body);
  if (!normalized) {
    return response.status(400).json({ error: "Enter a valid school name, type, country, email, and access option." });
  }

  try {
    const school = await createSchool(normalized, request.auth.userId);
    return response.status(201).json({ school });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/schools/:schoolId/invitations", requireAuth, async (request, response) => {
  const { schoolId } = request.params;
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const role = request.body?.role;
  if (!isUuid(schoolId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !["teacher", "student"].includes(role)) {
    return response.status(400).json({ error: "Enter a valid email address and choose Teacher or Student." });
  }

  try {
    const membershipRole = await getSchoolRole(schoolId, request.auth.userId);
    if (!membershipRole) return response.status(404).json({ error: "School not found." });
    if (membershipRole !== "admin") return response.status(403).json({ error: "Only a school administrator can invite members." });

    const invitation = await createInvitation({
      schoolId,
      email,
      role,
      userId: request.auth.userId,
    });
    return response.status(201).json({ invitation });
  } catch (error) {
    return handleDatabaseError(error, response);
  }
});

app.post("/api/invitations/accept", requireAuth, async (request, response) => {
  const token = request.body?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return response.status(400).json({ error: "This invitation link is invalid." });
  }

  try {
    const membership = await acceptInvitation({
      token,
      email: request.auth.email,
      userId: request.auth.userId,
    });
    if (!membership) {
      return response.status(404).json({
        error: "This invitation is invalid, expired, already used, or belongs to a different email address.",
      });
    }
    return response.json({ membership });
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
