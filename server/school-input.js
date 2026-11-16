import {
  curriculumByGrade,
  curriculumLevels,
  normalizeEducationalLevelSelection,
  normalizeSubjectSelection,
} from "../shared/curriculum.js";

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

export function normalizeSchoolCurriculumInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const levelCodes = normalizeEducationalLevelSelection(body.levelCodes);
  const submittedSubjects = body.subjectsByGrade;
  if (!levelCodes || !submittedSubjects || typeof submittedSubjects !== "object" || Array.isArray(submittedSubjects)) {
    return null;
  }

  const knownGrades = new Set(Object.keys(curriculumByGrade));
  if (Object.keys(submittedSubjects).some((grade) => !knownGrades.has(grade))) return null;

  const selectedGrades = curriculumLevels
    .filter((level) => levelCodes.includes(level.code))
    .flatMap((level) => level.grades);
  const subjectsByGrade = {};
  let hasSelectedSubject = false;

  for (const grade of selectedGrades) {
    const subjects = Object.hasOwn(submittedSubjects, grade)
      ? normalizeSubjectSelection(grade, submittedSubjects[grade])
      : [];
    if (!subjects) return null;
    subjectsByGrade[grade] = subjects;
    if (subjects.length > 0) hasSelectedSubject = true;
  }

  if (!hasSelectedSubject) return null;
  return { levelCodes, subjectsByGrade };
}

export function normalizeAcademicSessionInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const academicYear = typeof body.academicYear === "string" ? body.academicYear.trim() : "";
  const years = /^(\d{4})\/(\d{4})$/.exec(academicYear);
  if (!years || Number(years[2]) !== Number(years[1]) + 1) return null;
  if (body.isCurrent !== undefined && typeof body.isCurrent !== "boolean") return null;
  return { academicYear, isCurrent: body.isCurrent === true };
}

export function normalizeAcademicTermDates(value) {
  const termNames = ["Term 1", "Term 2", "Term 3"];
  if (!Array.isArray(value) || value.length !== termNames.length) return null;

  const normalized = [];
  for (const termName of termNames) {
    const matches = value.filter((item) => item?.term === termName);
    if (matches.length !== 1) return null;
    const item = matches[0];
    const startDate = item.startDate === "" || item.startDate == null ? null : item.startDate;
    const endDate = item.endDate === "" || item.endDate == null ? null : item.endDate;
    if ((startDate === null) !== (endDate === null)) return null;
    if (startDate !== null && (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate >= endDate)) return null;
    normalized.push({ term: termName, startDate, endDate });
  }

  const scheduledTerms = normalized.filter((term) => term.startDate !== null);
  for (let index = 1; index < scheduledTerms.length; index += 1) {
    if (scheduledTerms[index - 1].endDate >= scheduledTerms[index].startDate) return null;
  }
  return normalized;
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
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

function normalizePngData(value, { maxLength, maxBytes, maxWidth, maxHeight }) {
  if (typeof value !== "string" || value.length > maxLength) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;

  const image = Buffer.from(match[1], "base64");
  if (
    image.length < 24
    || image.length > maxBytes
    || image.toString("base64") !== match[1]
    || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || image.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }

  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width < 1 || width > maxWidth || height < 1 || height > maxHeight) return null;
  return value;
}

export function normalizeSignatureData(value) {
  return normalizePngData(value, { maxLength: 88_000, maxBytes: 65_536, maxWidth: 1600, maxHeight: 600 });
}

export function normalizeSchoolLogoData(value) {
  return normalizePngData(value, { maxLength: 88_000, maxBytes: 65_536, maxWidth: 512, maxHeight: 512 });
}

export function normalizeProfilePhotoData(value) {
  return normalizePngData(value, { maxLength: 22_000, maxBytes: 16_000, maxWidth: 128, maxHeight: 128 });
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
