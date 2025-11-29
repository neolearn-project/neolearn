// app/data/syllabus.ts

export type SyllabusChapter = {
  id: string;
  title: string;
  short?: string; // optional short description
};

export type SyllabusMap = {
  [board: string]: {
    [classLevel: string]: {
      [subject: string]: SyllabusChapter[];
    };
  };
};

// Initial syllabus: Class 6 Maths for CBSE, TBSE, ICSE
// You can expand this later for more classes/subjects.
export const syllabus: SyllabusMap = {
  CBSE: {
    "Class 6": {
      Maths: [
        { id: "fractions-intro", title: "Fractions – Introduction" },
        { id: "fractions-addition", title: "Fractions – Addition and Subtraction" },
        { id: "decimals", title: "Decimals" },
        { id: "integers", title: "Integers" },
        { id: "geometry-basics", title: "Basic Geometrical Ideas" },
        { id: "mensuration", title: "Mensuration – Perimeter and Area (Intro)" },
      ],
    },
  },
  TBSE: {
    "Class 6": {
      Maths: [
        { id: "fractions-intro", title: "Fractions – Concept and Representation" },
        { id: "fractions-operations", title: "Operations on Fractions" },
        { id: "decimals", title: "Decimals and Place Value" },
        { id: "integers", title: "Integers on Number Line" },
        { id: "geometry-basics", title: "Lines, Angles and Triangles" },
        { id: "mensuration", title: "Perimeter of Simple Figures" },
      ],
    },
  },
  ICSE: {
    "Class 6": {
      Maths: [
        { id: "fractions-intro", title: "Fractions – Proper, Improper & Mixed" },
        { id: "fractions-operations", title: "Addition and Subtraction of Fractions" },
        { id: "decimals", title: "Decimals – Conversion and Operations" },
        { id: "integers", title: "Integers – Basic Concepts" },
        { id: "geometry-basics", title: "Triangles and Quadrilaterals (Intro)" },
        { id: "mensuration", title: "Perimeter – Closed Figures" },
      ],
    },
  },
};
