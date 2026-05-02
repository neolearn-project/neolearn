import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class10");
const outBase = path.resolve("app/lib/textbookMasters");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(k) {
  return clean(k)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function stripPartWords(v) {
  return clean(v)
    .replace(/\bpart\s*[-–—]?\s*ii\b/gi, "")
    .replace(/\bpart\s*[-–—]?\s*2\b/gi, "")
    .replace(/\s*[-–—]\s*ii\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePart(v) {
  const s = clean(v).toLowerCase();
  if (!s) return "";
  if (s.includes("ii") || s === "2" || s.includes("part 2")) return "Part-II";
  if (s.includes("i") || s === "1" || s.includes("part 1")) return "Part-I";
  return "";
}

function normalizeBookName(bookName, partValue = "") {
  let b = clean(bookName).replace(/–/g, "-").replace(/—/g, "-");
  let part = normalizePart(partValue);

  const lowerOriginal = b.toLowerCase();
  if (!part && (/\bpart\s*[-]?\s*ii\b/i.test(b) || /\bpart\s*2\b/i.test(b) || /-\s*ii\b/i.test(b))) {
    part = "Part-II";
  }

  b = stripPartWords(b);

  const compact = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (compact === "first flight") return "First Flight";
  if (compact === "footprints without feet") return "Footprints without Feet";

  if (compact === "kritika") return "Kritika Part-II";
  if (compact === "kshitiz") return "Kshitiz Part-II";

  if (compact === "mathematics" || compact === "math") return "Mathematics";
  if (compact === "science") return "Science";

  if (compact === "contemporary india") return "Contemporary India Part-II";
  if (compact === "democratic politics") return "Democratic Politics-II";
  if (compact === "india and the contemporary world") return "India and the Contemporary World Part-II";
  if (compact === "understanding economic development") return "Understanding Economic Development";

  if (lowerOriginal.includes("kritika")) return "Kritika Part-II";
  if (lowerOriginal.includes("kshitiz")) return "Kshitiz Part-II";
  if (lowerOriginal.includes("contemporary india")) return "Contemporary India Part-II";
  if (lowerOriginal.includes("india and the contemporary world")) return "India and the Contemporary World Part-II";

  return clean(bookName);
}

function guessBookFromFile(file) {
  const f = file.toLowerCase();

  if (f.includes("first_flight") || f.includes("first-flight") || f.includes("first flight")) return "First Flight";
  if (f.includes("footprints")) return "Footprints without Feet";
  if (f.includes("kritika")) return "Kritika Part-II";
  if (f.includes("kshitiz")) return "Kshitiz Part-II";
  if (f.includes("mathematics") || f.includes("math")) return "Mathematics";
  if (f.includes("science") && !f.includes("sst")) return "Science";
  if (f.includes("contemporary_india") || f.includes("contemporary-india") || f.includes("contemporary india")) return "Contemporary India Part-II";
  if (f.includes("democratic_politics") || f.includes("democratic-politics") || f.includes("democratic politics")) return "Democratic Politics-II";
  if (f.includes("india_and_the_contemporary_world") || f.includes("india-and-the-contemporary-world") || f.includes("india and the contemporary world")) return "India and the Contemporary World Part-II";
  if (f.includes("understanding_economic_development") || f.includes("understanding-economic-development") || f.includes("understanding economic development")) return "Understanding Economic Development";

  return "";
}

function normalizeBoard(v) {
  const s = clean(v).toLowerCase();
  if (!s) return "cbse";
  if (s.includes("cbse")) return "cbse";
  if (s.includes("ncert")) return "cbse";
  return s;
}

function parseClassNumber(v) {
  const s = clean(v);
  const m = s.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 10;
}

function guessSubjectFromBook(bookName, fallbackSubject) {
  const b = clean(bookName).toLowerCase();
  const s = clean(fallbackSubject).toLowerCase();

  if (b.includes("first flight") || b.includes("footprints")) return "English";
  if (b.includes("kritika") || b.includes("kshitiz")) return "Hindi";
  if (b === "mathematics" || b.includes("mathematics")) return "Mathematics";
  if (b === "science" || b.includes("science")) return "Science";

  if (
    b.includes("contemporary india") ||
    b.includes("democratic politics") ||
    b.includes("india and the contemporary world") ||
    b.includes("understanding economic development")
  ) {
    return "Social Science";
  }

  if (s === "sst") return "Social Science";
  if (s.includes("sst")) return "Social Science";
  if (s.includes("social science")) return "Social Science";
  if (s.includes("economics")) return "Social Science";
  if (s === "math") return "Mathematics";

  return clean(fallbackSubject);
}

function deriveSubjectCode(subjectName, classNumber) {
  const s = clean(subjectName).toLowerCase();

  if (s === "english") return `eng${classNumber}`;
  if (s === "hindi") return `hin${classNumber}`;
  if (s === "mathematics") return `math${classNumber}`;
  if (s === "science") return `sci${classNumber}`;
  if (s === "social science") return `sst${classNumber}`;
  if (s === "sanskrit") return `san${classNumber}`;

  return s.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 8) + classNumber;
}

function chapterTypeFallback(subjectName, chapterType, bookName) {
  const given = clean(chapterType);
  if (given && !given.toLowerCase().includes("prelim")) return given.toLowerCase();

  const s = clean(subjectName).toLowerCase();
  const b = clean(bookName).toLowerCase();

  if (["english", "hindi", "sanskrit", "urdu"].includes(s)) return "literature";
  if (s === "mathematics") return "concept";
  if (s === "science") return "science";

  if (s === "social science") {
    if (b.includes("contemporary india")) return "geography";
    if (b.includes("democratic politics")) return "political_science";
    if (b.includes("india and the contemporary world")) return "history";
    if (b.includes("understanding economic development")) return "economics";
    return "sst";
  }

  return "general";
}

function slugify(input) {
  return clean(input)
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "")
    .replace(/^[A-Z]/, (m) => m.toLowerCase());
}

function safeExportName(parts) {
  return parts.map((p) => clean(p).replace(/[^\p{L}\p{N}]/gu, "")).join("");
}

function parseChapterNumber(raw) {
  const s = clean(raw);
  if (!s) return 0;

  const m1 = s.match(/^(\d+)(?:\.\d+)?$/);
  if (m1) return parseInt(m1[1], 10);

  const m2 = s.match(/^(\d+)\s*[\.\-\)]\s+/);
  if (m2) return parseInt(m2[1], 10);

  const m3 = s.match(/^chapter\s*(\d+)/i);
  if (m3) return parseInt(m3[1], 10);

  if (/prelim/i.test(s)) return 0;
  return 0;
}

function splitChapterField(raw) {
  const s = clean(raw);
  if (!s) return { number: "", title: "" };

  const m1 = s.match(/^(\d+)(?:\.\d+)?\s*[\.\-\)]\s*(.+)$/);
  if (m1) {
    return { number: m1[1], title: clean(m1[2]) };
  }

  return { number: "", title: s };
}

function isSkippableChapter(chapterNumber, chapterTitle) {
  const n = clean(chapterNumber).toLowerCase();
  const t = clean(chapterTitle).toLowerCase();

  if (!t) return true;
  if (n === "p" || n.startsWith("p.") || n.includes("prelim")) return true;

  const skipWords = [
    "prelim",
    "prelims",
    "preface",
    "foreword",
    "contents",
    "answer",
    "answers",
    "appendix",
    "appendices",
    "index",
  ];

  return skipWords.some((w) => t === w || t.includes(w));
}

function defaultTopics(subjectName) {
  const s = clean(subjectName).toLowerCase();

  if (s === "mathematics") {
    return [
      { number: 1, name: "Concepts and Definitions" },
      { number: 2, name: "Worked Examples" },
      { number: 3, name: "Practice and Applications" },
    ];
  }

  if (s === "science") {
    return [
      { number: 1, name: "Key Concepts" },
      { number: 2, name: "Experiments and Activities" },
      { number: 3, name: "Uses and Applications" },
    ];
  }

  if (s === "social science") {
    return [
      { number: 1, name: "Main Ideas" },
      { number: 2, name: "Important Terms and Facts" },
      { number: 3, name: "Practice and Discussion" },
    ];
  }

  return [
    { number: 1, name: "Summary" },
    { number: 2, name: "Vocabulary and Meanings" },
    { number: 3, name: "Questions and Answers" },
  ];
}

function findDataSheet(workbook) {
  const preferred = ["Textbook_Master_Entry", "Master Sheet", "Master", "Sheet1"];

  for (const name of preferred) {
    if (workbook.SheetNames.includes(name)) return name;
  }

  return workbook.SheetNames[0];
}

function buildRowsFromSheet(ws, fileName) {
  const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let headerIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(matrix.length, 8); i++) {
    const keys = matrix[i].map((c) => normalizeKey(c));
    const score = keys.filter((k) =>
      [
        "board",
        "class",
        "class_number",
        "subject",
        "subject_name",
        "book",
        "book_name",
        "chapter",
        "chapter_no",
        "chapter_number",
        "chapter_title",
        "topic",
        "topic_title",
        "topic_subtopic",
      ].includes(k)
    ).length;

    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const headers = matrix[headerIndex].map((c) => normalizeKey(c));
  const rawRows = [];

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = matrix[i][idx];
    });

    const values = Object.values(obj).map(clean);
    if (!values.some(Boolean)) continue;

    rawRows.push(obj);
  }

  return rawRows;
}

function normalizeWorkbookRows(rows, fileName) {
  const out = [];
  const fileBookGuess = guessBookFromFile(fileName);

  for (const r of rows) {
    const board = normalizeBoard(r.board || "cbse");

    let rawBook = clean(
      r.book_name ||
      r.book ||
      r.textbook ||
      r.textbook_name ||
      fileBookGuess
    );

    let partValue = clean(r.part || "");
    let bookName = normalizeBookName(rawBook || fileBookGuess, partValue);

    if (!bookName && fileBookGuess) bookName = fileBookGuess;

    let subjectName = guessSubjectFromBook(
      bookName,
      clean(r.subject_name || r.subject || r.subjects)
    );

    let chapterNumber = clean(
      r.chapter_number ||
      r.chapter_no ||
      r.chapter_num ||
      r.chapter ||
      r.unit_no ||
      r.unit_number ||
      ""
    );

    let chapterTitle = clean(
      r.chapter_title ||
      r.chapter_name ||
      r.lesson_title ||
      r.lesson_name ||
      r.unit_title ||
      r.literary_piece_passage ||
      ""
    );

    if (!chapterTitle && clean(r.chapter)) {
      const split = splitChapterField(r.chapter);
      if (!chapterNumber || chapterNumber === clean(r.chapter)) chapterNumber = split.number;
      chapterTitle = split.title;
    }

    if (chapterNumber && !chapterTitle) {
      const split = splitChapterField(chapterNumber);
      if (split.number && split.title) {
        chapterNumber = split.number;
        chapterTitle = split.title;
      }
    }

    let topicTitle = clean(
      r.topic_title ||
      r.topic_name ||
      r.topic_subtopic ||
      r.suggested_lesson_title ||
      r.subtopic ||
      r.sub_topic ||
      r.section ||
      r.theme_section ||
      r.content_point ||
      r.key_point ||
      r.learning_point ||
      r.topic ||
      ""
    );

    if (!topicTitle && chapterTitle) topicTitle = chapterTitle;

    const chapterType = clean(
      r.chapter_type ||
      r.topic_type ||
      r.genre_type ||
      r.content_type ||
      r.type ||
      r.category ||
      r.unit_section ||
      ""
    );

    const topicNumber = clean(
      r.topic_number ||
      r.topic_no ||
      r.topic_id ||
      r.subtopic_no ||
      r.section_no ||
      ""
    );

    out.push({
      board,
      class_number: clean(r.class_number || r.class || r.class_no || "10"),
      subject_name: subjectName,
      book_name: bookName,
      textbook_series: clean(r.textbook_series) || `NCERT ${bookName}`,
      chapter_number: chapterNumber,
      chapter_title: chapterTitle,
      chapter_type: chapterType,
      topic_number: topicNumber,
      topic_title: topicTitle,
    });
  }

  return out;
}

if (!fs.existsSync(inputDir)) {
  console.error("Input folder not found:", inputDir);
  process.exit(1);
}

const files = fs.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".xlsx"));

if (!files.length) {
  console.error("No .xlsx files found in:", inputDir);
  process.exit(1);
}

ensureDir(outBase);

const grouped = new Map();

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const wb = xlsx.readFile(fullPath);
  const sheetName = findDataSheet(wb);
  const ws = wb.Sheets[sheetName];

  const rawRows = buildRowsFromSheet(ws, file);
  const normalizedRows = normalizeWorkbookRows(rawRows, file);

  console.log(`Reading ${file} | sheet=${sheetName} | rows=${normalizedRows.length}`);

  for (const row of normalizedRows) {
    const board = normalizeBoard(row.board);
    const classNumber = parseClassNumber(row.class_number);
    const bookName = normalizeBookName(row.book_name);
    const subjectName = guessSubjectFromBook(bookName, row.subject_name);
    const textbookSeries = clean(row.textbook_series) || `NCERT ${bookName}`;

    if (!board || !classNumber || !subjectName || !bookName) continue;
    if (classNumber !== 10) continue;

    const gk = [board, classNumber, subjectName.toLowerCase(), bookName.toLowerCase()].join("|");

    if (!grouped.has(gk)) {
      grouped.set(gk, {
        board,
        classNumber,
        subjectName,
        subjectCode: deriveSubjectCode(subjectName, classNumber),
        bookName,
        textbookSeries,
        rows: [],
      });
    }

    grouped.get(gk).rows.push(row);
  }
}

const generated = [];

for (const group of grouped.values()) {
  const chapterMap = new Map();

  for (const row of group.rows) {
    let chNo = parseChapterNumber(row.chapter_number);
    let chTitle = clean(row.chapter_title);

    if (!chNo && chTitle) {
      const split = splitChapterField(chTitle);
      if (split.number) {
        chNo = parseChapterNumber(split.number);
        chTitle = split.title;
      }
    }

    if (isSkippableChapter(row.chapter_number, chTitle)) continue;
    if (!chNo || !chTitle) continue;

    const chType = chapterTypeFallback(group.subjectName, row.chapter_type, group.bookName);
    const topicTitle = clean(row.topic_title);

    const chapterKey = `${chNo}__${chTitle}`;

    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, {
        number: chNo,
        name: chTitle,
        chapterType: chType,
        topics: [],
      });
    }

    if (topicTitle && topicTitle.toLowerCase() !== "topic title") {
      const chapter = chapterMap.get(chapterKey);

      if (!chapter.topics.some((t) => t.name.toLowerCase() === topicTitle.toLowerCase())) {
        chapter.topics.push({
          number: chapter.topics.length + 1,
          name: topicTitle,
        });
      }
    }
  }

  const chapters = Array.from(chapterMap.values())
    .filter((c) => c.number > 0)
    .sort((a, b) => a.number - b.number)
    .map((ch) => ({
      ...ch,
      topics: ch.topics.length ? ch.topics : defaultTopics(group.subjectName),
    }));

  const relDir = path.join(group.board, `class${group.classNumber}`);
  const fileBase = slugify(group.subjectName) + slugify(group.bookName);
  const exportName = safeExportName([
    group.board,
    "Class",
    group.classNumber,
    group.subjectName,
    group.bookName,
  ]);

  const relFile = path.join(relDir, `${fileBase}.ts`);
  const fullOut = path.join(outBase, relFile);

  ensureDir(path.dirname(fullOut));

  const fileContent = `import { MasterSubject } from "../../types";

export const ${exportName}: MasterSubject = {
  board: ${JSON.stringify(group.board)},
  classNumber: ${group.classNumber},
  subjectName: ${JSON.stringify(group.subjectName)},
  subjectCode: ${JSON.stringify(group.subjectCode)},
  bookName: ${JSON.stringify(group.bookName)},
  textbookSeries: ${JSON.stringify(group.textbookSeries)},
  chapters: ${JSON.stringify(chapters, null, 2)},
};
`;

  fs.writeFileSync(fullOut, fileContent, "utf8");

  generated.push({
    ...group,
    exportName,
    relFile: relFile.replace(/\\/g, "/"),
    chapterCount: chapters.length,
    topicCount: chapters.reduce((n, c) => n + c.topics.length, 0),
  });
}

const indexPath = path.join(outBase, "index.ts");
const typesPath = path.join(outBase, "types.ts");

if (!fs.existsSync(typesPath)) {
  fs.writeFileSync(
    typesPath,
`export type MasterTopic = {
  number: number;
  name: string;
};

export type MasterChapter = {
  number: number;
  name: string;
  chapterType?: string;
  topics: MasterTopic[];
};

export type MasterSubject = {
  board: string;
  classNumber: number;
  subjectName: string;
  subjectCode: string;
  bookName?: string;
  textbookSeries?: string;
  chapters: MasterChapter[];
};
`,
    "utf8"
  );
}

const existingIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";

const newImportLines = generated
  .map((g) => `import { ${g.exportName} } from "./${g.relFile.replace(/\.ts$/, "")}";`)
  .filter((line) => !existingIndex.includes(line))
  .join("\n");

const marker = "const masters: MasterSubject[] = [";

let nextIndex = existingIndex;

if (!nextIndex || !nextIndex.includes(marker)) {
  nextIndex = `import { MasterSubject } from "./types";

function keyOf(args: {
  board: string;
  classNumber: number;
  subjectName: string;
  bookName?: string;
}) {
  return [
    String(args.board || "").trim().toLowerCase(),
    Number(args.classNumber || 0),
    String(args.subjectName || "").trim().toLowerCase(),
    String(args.bookName || "").trim().toLowerCase(),
  ].join("|");
}

const masters: MasterSubject[] = [];

export const TEXTBOOK_MASTERS: Record<string, MasterSubject> = Object.fromEntries(
  masters.map((m) => [
    keyOf({
      board: m.board,
      classNumber: m.classNumber,
      subjectName: m.subjectName,
      bookName: m.bookName || "",
    }),
    m,
  ])
);

export function getTextbookMaster(args: {
  board: string;
  classNumber: number;
  subjectName: string;
  bookName?: string;
}) {
  return (
    TEXTBOOK_MASTERS[
      keyOf({
        board: args.board,
        classNumber: args.classNumber,
        subjectName: args.subjectName,
        bookName: args.bookName || "",
      })
    ] || null
  );
}

export * from "./types";
`;
}

if (newImportLines) {
  nextIndex = nextIndex.replace(
    'import { MasterSubject } from "./types";',
    `import { MasterSubject } from "./types";\n${newImportLines}`
  );
}

const addMasters = generated
  .map((g) => `  ${g.exportName},`)
  .filter((line) => !nextIndex.includes(line))
  .join("\n");

if (addMasters) {
  nextIndex = nextIndex.replace(marker, `${marker}\n${addMasters}`);
}

fs.writeFileSync(indexPath, nextIndex, "utf8");

console.log("");
console.log("Generated Class 10 masters:", generated.length);

for (const g of generated) {
  console.log(`- ${g.subjectName} | ${g.bookName} | chapters=${g.chapterCount} | topics=${g.topicCount}`);
}

const expectedBooks = [
  "First Flight",
  "Footprints without Feet",
  "Kritika Part-II",
  "Kshitiz Part-II",
  "Mathematics",
  "Science",
  "Contemporary India Part-II",
  "Democratic Politics-II",
  "India and the Contemporary World Part-II",
  "Understanding Economic Development",
];

const foundBooks = new Set(generated.map((g) => g.bookName));

console.log("");
console.log("Expected Class 10 book check:");

for (const book of expectedBooks) {
  console.log(`${foundBooks.has(book) ? "OK" : "MISSING"} - ${book}`);
}

const missing = expectedBooks.filter((book) => !foundBooks.has(book));
const zeroChapters = generated.filter((g) => g.chapterCount === 0);

if (zeroChapters.length) {
  console.error("");
  console.error("Zero chapter masters found:");
  for (const g of zeroChapters) {
    console.error(`- ${g.subjectName} | ${g.bookName}`);
  }
  process.exit(1);
}

if (missing.length) {
  console.error("");
  console.error("Missing books:", missing.join(", "));
  process.exit(1);
}
