export function normalizeSchoolInput(body = {}) {
  const school = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    schoolType: typeof body.schoolType === "string" ? body.schoolType.trim() : "",
    country: typeof body.country === "string" ? body.country.trim() : "",
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
    accessMode: typeof body.accessMode === "string" ? body.accessMode : "",
  };
  const validSchoolTypes = new Set([
    "Primary school",
    "Secondary school",
    "All-through school",
    "College / sixth form",
  ]);
  const validAccessModes = new Set(["invite", "school-code", "public"]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.email);

  if (
    school.name.length < 2 ||
    school.name.length > 120 ||
    !validSchoolTypes.has(school.schoolType) ||
    school.country.length < 2 ||
    school.country.length > 80 ||
    !validEmail ||
    !validAccessModes.has(school.accessMode)
  ) {
    return null;
  }

  return school;
}

export function createSchoolSlug(name, id) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "school";

  return `${base}-${id.slice(0, 6)}`;
}
