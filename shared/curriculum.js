export const curriculumGrades = {
  primary: ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"],
  juniorSecondary: ["JSS 1", "JSS 2", "JSS 3"],
  seniorSecondary: ["SSS 1", "SSS 2", "SSS 3"],
};

export const curriculumLevels = [
  { code: "primary", label: "Primary school", grades: curriculumGrades.primary },
  { code: "juniorSecondary", label: "Junior secondary school", grades: curriculumGrades.juniorSecondary },
  { code: "seniorSecondary", label: "Senior secondary school", grades: curriculumGrades.seniorSecondary },
];

export function getNextGradeForSchool(grade, enabledLevelCodes) {
  const grades = curriculumLevels.flatMap((level) => level.grades);
  const gradeIndex = grades.indexOf(grade);
  if (gradeIndex < 0) return null;
  const nextGrade = grades[gradeIndex + 1];
  if (!nextGrade) return null;

  const nextLevel = curriculumLevels.find((level) => level.grades.includes(nextGrade));
  return nextLevel && enabledLevelCodes.includes(nextLevel.code) ? nextGrade : null;
}

export function normalizeEducationalLevelSelection(levelCodes) {
  const allowedCodes = new Set(curriculumLevels.map((level) => level.code));
  if (!Array.isArray(levelCodes) || levelCodes.length < 1 || levelCodes.length > allowedCodes.size) {
    return null;
  }
  if (new Set(levelCodes).size !== levelCodes.length || levelCodes.some((code) => !allowedCodes.has(code))) {
    return null;
  }
  return levelCodes;
}

const subjectsByBand = {
  primary: [
    "English Studies",
    "Mathematics",
    "Nigerian Language",
    "Basic Science and Technology",
    "Physical and Health Education",
    "Social Studies",
    "Civic Education",
    "Cultural and Creative Arts",
    "Agricultural Science",
    "Computer Studies",
    "Christian Religious Studies",
    "Islamic Religious Studies",
    "French",
  ],
  juniorSecondary: [
    "English Studies",
    "Mathematics",
    "Nigerian Language",
    "Basic Science",
    "Basic Technology",
    "Business Studies",
    "Social Studies",
    "Civic Education",
    "Physical and Health Education",
    "Cultural and Creative Arts",
    "Agricultural Science",
    "Computer Studies",
    "Christian Religious Studies",
    "Islamic Religious Studies",
    "French",
    "Arabic",
  ],
  seniorSecondary: [
    "English Language",
    "Mathematics",
    "Civic Education",
    "Biology",
    "Chemistry",
    "Physics",
    "Agricultural Science",
    "Economics",
    "Geography",
    "Government",
    "History",
    "Literature in English",
    "Christian Religious Studies",
    "Islamic Religious Studies",
    "Financial Accounting",
    "Commerce",
    "Further Mathematics",
    "Computer Studies",
    "Data Processing",
    "French",
    "Nigerian Language",
    "Food and Nutrition",
    "Technical Drawing",
    "Visual Arts",
    "Music",
  ],
};

const gradeBands = [
  [curriculumGrades.primary, "primary"],
  [curriculumGrades.juniorSecondary, "juniorSecondary"],
  [curriculumGrades.seniorSecondary, "seniorSecondary"],
];

export const curriculumByGrade = Object.fromEntries(
  gradeBands.flatMap(([grades, band]) =>
    grades.map((grade) => [grade, subjectsByBand[band]]),
  ),
);

export function normalizeSubjectSelection(grade, subjects) {
  const allowedSubjects = typeof grade === "string" && Object.hasOwn(curriculumByGrade, grade)
    ? curriculumByGrade[grade]
    : null;
  if (!Array.isArray(allowedSubjects) || !Array.isArray(subjects) || subjects.length > allowedSubjects.length) {
    return null;
  }

  const normalized = [...new Set(subjects)];
  if (normalized.length !== subjects.length || normalized.some((subject) => !allowedSubjects.includes(subject))) {
    return null;
  }
  return normalized;
}
