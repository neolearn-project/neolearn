import { getTextbookMaster } from "../app/lib/textbookMasters/index";

const books = [
  ["English", "First Flight"],
  ["English", "Footprints without Feet"],
  ["Hindi", "Kritika Part-II"],
  ["Hindi", "Kshitiz Part-II"],
  ["Mathematics", "Mathematics"],
  ["Science", "Science"],
  ["Social Science", "Contemporary India Part-II"],
  ["Social Science", "Democratic Politics-II"],
  ["Social Science", "India and the Contemporary World Part-II"],
  ["Social Science", "Understanding Economic Development"],
];

for (const [subjectName, bookName] of books) {
  const m = getTextbookMaster({
    board: "cbse",
    classNumber: 10,
    subjectName,
    bookName,
  });

  if (!m) {
    console.log("MISSING =>", subjectName, "|", bookName);
  } else {
    const chapters = m.chapters?.length || 0;
    const topics = m.chapters?.reduce((n, c) => n + (c.topics?.length || 0), 0) || 0;
    console.log("FOUND   =>", subjectName, "|", bookName, "| chapters=" + chapters, "| topics=" + topics);
  }
}
