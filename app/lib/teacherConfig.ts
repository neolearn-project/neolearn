// app/lib/teacherConfig.ts

export type SubjectId = "maths" | "science" | "english";
export type ClassId = "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";
export type BoardId = "cbse" | "tbse" | "icse";
export type LangCode = "en" | "hi" | "bn";

export interface Chapter {
  id: string;
  title: string; // English title for prompts
}

export interface TeacherConfig {
  id: string; // e.g. "maths-6"
  subjectId: SubjectId;
  classId: ClassId;
  displayName: string; // for UI / prompts
  boards: BoardId[];
  languages: LangCode[];
  chapters: Chapter[];
}

// Shared basic math chapters (good for many classes)
const BASIC_MATH_CHAPTERS: Chapter[] = [
  { id: "fractions", title: "Fractions" },
  { id: "decimals", title: "Decimals" },
  { id: "ratio-and-percentage", title: "Ratio and Percentage" },
];

// Full Class 6 NCERT-style chapters
const CLASS6_CHAPTERS: Chapter[] = [
  { id: "knowing-our-numbers", title: "Knowing Our Numbers" },
  { id: "whole-numbers", title: "Whole Numbers" },
  { id: "playing-with-numbers", title: "Playing with Numbers" },
  { id: "basic-geometrical-ideas", title: "Basic Geometrical Ideas" },
  {
    id: "understanding-elementary-shapes",
    title: "Understanding Elementary Shapes",
  },
  { id: "integers", title: "Integers" },
  { id: "fractions", title: "Fractions" },
  { id: "decimals", title: "Decimals" },
  { id: "data-handling", title: "Data Handling" },
  { id: "mensuration", title: "Mensuration" },
  { id: "algebra", title: "Algebra" },
  {
    id: "ratio-and-proportion",
    title: "Ratio and Proportion",
  },
  { id: "symmetry", title: "Symmetry" },
  { id: "practical-geometry", title: "Practical Geometry" },
];

// For now, other classes reuse BASIC_MATH_CHAPTERS as core topics.
// Later we can add full class-wise chapters easily.
export const TEACHER_CONFIGS: TeacherConfig[] = [
  {
    id: "maths-5",
    subjectId: "maths",
    classId: "5",
    displayName: "Class 5 Maths Teacher",
    boards: ["cbse", "tbse", "icse"],
    languages: ["en", "hi", "bn"],
    chapters: BASIC_MATH_CHAPTERS,
  },
  {
    id: "maths-6",
    subjectId: "maths",
    classId: "6",
    displayName: "Class 6 Maths Teacher",
    boards: ["cbse", "tbse", "icse"],
    languages: ["en", "hi", "bn"],
    chapters: CLASS6_CHAPTERS,
  },
  {
    id: "maths-7",
    subjectId: "maths",
    classId: "7",
    displayName: "Class 7 Maths Teacher",
    boards: ["cbse", "tbse", "icse"],
    languages: ["en", "hi", "bn"],
    chapters: BASIC_MATH_CHAPTERS,
  },
  {
    id: "maths-8",
    subjectId: "maths",
    classId: "8",
    displayName: "Class 8 Maths Teacher",
    boards: ["cbse", "tbse", "icse"],
    languages: ["en", "hi", "bn"],
    chapters: BASIC_MATH_CHAPTERS,
  },
  {
    id: "maths-9",
    subjectId: "maths",
    classId: "9",
    displayName: "Class 9 Maths Teacher",
    boards: ["cbse", "tbse", "icse"],
    languages: ["en", "hi", "bn"],
    chapters: BASIC_MATH_CHAPTERS,
  },
  // Later: maths-10, science-8, english-9, etc.
];

export function getTeacherConfig(
  subjectId: SubjectId,
  classId: ClassId | string
): TeacherConfig {
  const match = TEACHER_CONFIGS.find(
    (c) => c.subjectId === subjectId && c.classId === classId
  );
  if (match) return match;

  // Safe default
  return TEACHER_CONFIGS.find((c) => c.id === "maths-6")!;
}
