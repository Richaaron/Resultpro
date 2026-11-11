import { createSchool, listSchools } from "../server/school-repository.js";
import { normalizeSchoolInput } from "../server/school-input.js";

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    if (request.method === "GET") {
      const schools = await listSchools();
      return response.status(200).json({ schools });
    }

    const school = normalizeSchoolInput(request.body);
    if (!school) {
      return response.status(400).json({
        error: "Enter a valid school name, type, country, email, and access option.",
      });
    }

    return response.status(201).json({ school: await createSchool(school) });
  } catch (error) {
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
}
