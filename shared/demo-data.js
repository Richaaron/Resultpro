import { defaultGradingSettings, gradeForPercentage } from "./school-data.js";

const schoolNames = [
  "Willowbrook Academy",
  "Cedarfield College",
  "Brightstone School",
  "Oakridge Learning Centre",
  "Meadowview Academy",
  "Harbourlight School",
];
const schoolLocations = ["Lagos", "Abuja", "Ibadan", "Enugu", "Port Harcourt", "Kano"];
const firstNames = ["Amara", "Tomi", "Zara", "Chidi", "Dara", "Kelechi", "Nneka", "Tobi", "Sade", "Ife", "Mariam", "Emeka", "Lola", "Femi", "Ada", "Yusuf", "Chinwe", "Bolu"];
const lastNames = ["Okafor", "Adeyemi", "Bello", "Nwosu", "Eze", "Balogun", "Ibrahim", "Obi", "Adebayo", "Danladi", "Mensah", "Olawale", "Udo", "Garba", "Ojo", "Abiola"];
const subjects = ["Mathematics", "English Language", "Basic Science", "Social Studies", "Computer Studies", "Agricultural Science", "Civic Education"];
const classGrades = ["Primary 5", "JSS 1", "JSS 2", "JSS 3", "SS 1"];
const classSections = ["Gold", "Emerald", "Ruby", "Blue"];

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createDemoData(random = Math.random) {
  const selectedSubjects = shuffle(subjects, random).slice(0, 5);
  const grade = pick(classGrades, random);
  const section = pick(classSections, random);
  const locations = shuffle(schoolLocations, random);
  const schoolLocation = locations[0];
  const peopleNames = shuffle(
    firstNames.flatMap((firstName) => lastNames.map((lastName) => `${firstName} ${lastName}`)),
    random,
  );
  const nextPersonName = () => peopleNames.pop();
  const students = Array.from({ length: 10 }, (_, index) => {
    const scores = selectedSubjects.map((subject) => ({
      subject,
      score: 45 + Math.floor(random() * 54),
    }));
    const average = Math.round(scores.reduce((total, item) => total + item.score, 0) / scores.length);
    return {
      id: `demo-student-${index + 1}`,
      name: nextPersonName(),
      admissionNumber: `AST-${String(2020 + index).padStart(4, "0")}`,
      scores,
      average,
      grade: gradeForPercentage(average, defaultGradingSettings.bands),
    };
  });
  const reportStudent = students[Math.floor(random() * students.length)];

  return {
    school: {
      name: `${pick(schoolNames, random)} ${schoolLocation}`,
      location: schoolLocation,
      grade,
      section,
      academicYear: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
    },
    people: {
      admin: nextPersonName(),
      formTeacher: nextPersonName(),
      subjectTeacher: nextPersonName(),
      student: reportStudent.name,
    },
    subjectTeacherSubject: selectedSubjects[0],
    subjects: selectedSubjects,
    students,
    reportStudent,
  };
}
