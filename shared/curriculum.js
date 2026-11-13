export const curriculumGrades = {
  primary: ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"],
  juniorSecondary: ["JSS 1", "JSS 2", "JSS 3"],
  seniorSecondary: ["SSS 1", "SSS 2", "SSS 3"],
};

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
