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
  const validAccessModes = new Set(["invite"]);
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

export function normalizeTeacherRegistrationInput(body = {}) {
  const input = body && typeof body === "object" ? body : {};
  const teacherName = typeof input.teacherName === "string" ? input.teacherName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (
    teacherName.length < 2 ||
    teacherName.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return null;
  }
  return { teacherName, email };
}

export function normalizeSignatureData(value) {
  if (typeof value !== "string" || value.length > 88_000) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;

  const image = Buffer.from(match[1], "base64");
  if (
    image.length < 24
    || image.length > 65_536
    || image.toString("base64") !== match[1]
    || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || image.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }

  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width < 1 || width > 1600 || height < 1 || height > 600) return null;
  return value;
}

export function createSchoolSlug(name, id) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "school";

  return `${base}-${id.replaceAll("-", "").slice(0, 12)}`;
}
