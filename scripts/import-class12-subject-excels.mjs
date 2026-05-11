import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class12");
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
  return 12;
}

function normalizeBookName(bookName) {
  const b = clean(bookName).replace(/–/g, "-").replace(/—/g, "-");
  const compact = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const exact = {
    "accountancy part i": "Accountancy Part I",
    "accountancy part ii": "Accountancy Part II",
    "biology": "Biology",

    "business studies part i": "Business Studies Part I",
    "business studies part ii": "Business Studies Part II",

    "chemistry part i": "Chemistry Part I",
    "chemistry part ii": "Chemistry Part II",

    "macroeconomics part i": "Macroeconomics Part I",
    "macroeconomics part ii": "Macroeconomics Part II",

    "flamingo": "Flamingo",
    "vistas supplementary": "Vistas (Supplementary)",
    "vistas": "Vistas (Supplementary)",

    "fundamentals of human geography": "Fundamentals of Human Geography",
    "india people and economy": "India People and Economy",

    "aroh part ii": "Aroh Part-II",
    "vitan part ii": "Vitan Part-II",

    "themes in indian history part i": "Themes in Indian History Part I",
    "themes in indian history part ii": "Themes in Indian History Part II",
    "themes in indian history part iii": "Themes in Indian History Part III",

    "mathematics part i": "Mathematics Part I",
    "mathematics part ii": "Mathematics Part II",

    "physics part i": "Physics Part I",
    "physics i": "Physics Part I",
    "physics ii": "Physics II",
    "physics part ii": "Physics II",

    "contemporary world politics": "Contemporary World Politics",
    "politics in india since independence": "Politics in India Since Independence",

    "psychology": "Psychology",
    "bhaswati": "Bhaswati",
    "indian society": "Indian Society",
  };

  return exact[compact] || b;
}

function deriveSubjectCode(subjectName, bookName) {
  const s = clean(subjectName).toLowerCase();
  const b = clean(bookName).toLowerCase();

  if (s === "accountancy" && b === "accountancy part i") return "acc12p1";
  if (s === "accountancy" && b === "accountancy part ii") return "acc12p2";

  if (s === "biology") return "bio12";

  if (s === "business studies" && b === "business studies part i") return "bst12p1";
  if (s === "business studies" && b === "business studies part ii") return "bst12p2";

  if (s === "chemistry" && b === "chemistry part i") return "chem12p1";
  if (s === "chemistry" && b === "chemistry part ii") return "chem12p2";

  if (s === "economics" && b === "macroeconomics part i") return "eco12mac1";
  if (s === "economics" && b === "macroeconomics part ii") return "eco12mac2";

  if (s === "english" && b === "flamingo") return "eng12flam";
  if (s === "english" && b.includes("vistas")) return "eng12vist";

  if (s === "geography" && b === "fundamentals of human geography") return "geo12fhg";
  if (s === "geography" && b === "india people and economy") return "geo12ipe";

  if (s === "hindi" && b === "aroh part-ii") return "hin12aroh";
  if (s === "hindi" && b === "vitan part-ii") return "hin12vitan";

  if (s === "history" && b === "themes in indian history part i") return "hist12p1";
  if (s === "history" && b === "themes in indian history part ii") return "hist12p2";
  if (s === "history" && b === "themes in indian history part iii") return "hist12p3";

  if (s === "mathematics" && b === "mathematics part i") return "math12p1";
  if (s === "mathematics" && b === "mathematics part ii") return "math12p2";

  if (s === "physics" && b === "physics part i") return "phy12p1";
  if (s === "physics" && b === "physics ii") return "phy12p2";

  if (s === "political science" && b === "contemporary world politics") return "pol12cwp";
  if (s === "political science" && b === "politics in india since independence") return "pol12pii";

  if (s === "psychology") return "psy12";
  if (s === "sanskrit") return "san12bha";
  if (s === "sociology") return "soc12ind";

  return s.replace(/[^a-z0-9]+/g, "").slice(0, 8) + "12";
}

function chapterTypeFallback(subjectName, chapterType) {
  const given = clean(chapterType);
  if (given) return given.toLowerCase();

  const s = clean(subjectName).toLowerCase();

  if (["english", "hindi", "sanskrit"].includes(s)) return "literature";
  if (s === "mathematics") return "concept";
  if (["physics", "chemistry", "biology"].includes(s)) return "science";

  if (
    [
      "history",
      "geography",
      "political science",
      "economics",
      "sociology",
      "psychology",
      "business studies",
      "accountancy",
    ].includes(s)
  ) {
    return "humanities";
  }

  return "general";
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

  return 0;
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

function slugify(input) {
  return clean(input)
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "")
    .toLowerCase();
}

function safeExportName(parts) {
  return parts.map((p) => clean(p).replace(/[^\p{L}\p{N}]/gu, "")).join("");
}

function findDataSheet(workbook) {
  const preferred = [
    "Textbook_Master_Entry",
    "Master_Sheet",
    "Master Sheet",
    "Master",
    "Sheet1",
    "Class 12 Mathematics",
  ];

  for (const name of preferred) {
    if (workbook.SheetNames.includes(name)) return name;
  }

  let best = workbook.SheetNames[0];
  let bestRows = -1;

  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes("summary")) continue;

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], {
      defval: "",
    });

    if (rows.length > bestRows) {
      best = name;
      bestRows = rows.length;
    }
  }

  return best;
}

function buildRowsFromSheet(ws) {
  const matrix = xlsx.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  let headerIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
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
        "chapter_number",
        "chapter_title",
        "topic_number",
        "topic_title",
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

if (!fs.existsSync(inputDir)) {
  console.error("Input folder not found:", inputDir);
  process.exit(1);
}

const files = fs
  .readdirSync(inputDir)
  .filter((f) => f.toLowerCase().endsWith(".xlsx"));

if (!files.length) {
  console.error("No .xlsx files found in:", inputDir);
  process.exit(1);
}

ensureDir(outBase);

const grouped = new Map();

for (const file of files) {
  const wb = xlsx.readFile(path.join(inputDir, file));
  const sheetName = findDataSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rows = buildRowsFromSheet(ws);

  console.log(`Reading ${file} | sheet=${sheetName} | rows=${rows.length}`);

  for (const r of rows) {
    const board = normalizeBoard(r.board);
    const classNumber = parseClassNumber(r.class_number || r.class || "12");
    const subjectName = clean(r.subject_name || r.subject);
    const bookName = normalizeBookName(r.book_name || r.book);
    const textbookSeries = clean(r.textbook_series) || `NCERT ${bookName}`;

    const chapterNumber = clean(r.chapter_number || r.chapter_no);
    const chapterTitle = clean(r.chapter_title || r.chapter_name);
    const chapterType = clean(
      r.chapter_type || r.topic_type || r.content_type || r.type
    );
    const topicTitle = clean(r.topic_title || r.topic_name);
    const topicNumber = clean(r.topic_number || r.topic_no);

    if (!board || classNumber !== 12 || !subjectName || !bookName) continue;

    const gk = [
      board,
      classNumber,
      subjectName.toLowerCase(),
      bookName.toLowerCase(),
    ].join("|");

    if (!grouped.has(gk)) {
      grouped.set(gk, {
        board,
        classNumber,
        subjectName,
        subjectCode: deriveSubjectCode(subjectName, bookName),
        bookName,
        textbookSeries,
        rows: [],
      });
    }

    grouped.get(gk).rows.push({
      chapter_number: chapterNumber,
      chapter_title: chapterTitle,
      chapter_type: chapterType,
      topic_number: topicNumber,
      topic_title: topicTitle,
    });
  }
}

const generated = [];

for (const group of grouped.values()) {
  const chapterMap = new Map();

  for (const row of group.rows) {
    const chNo = parseChapterNumber(row.chapter_number);
    const chTitle = clean(row.chapter_title);
    const topicTitle = clean(row.topic_title);

    if (isSkippableChapter(row.chapter_number, chTitle)) continue;
    if (!chNo || !chTitle) continue;

    const chapterKey = `${chNo}__${chTitle}`;

    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, {
        number: chNo,
        name: chTitle,
        chapterType: chapterTypeFallback(group.subjectName, row.chapter_type),
        topics: [],
      });
    }

    if (topicTitle) {
      const chapter = chapterMap.get(chapterKey);

      if (
        !chapter.topics.some(
          (t) => t.name.toLowerCase() === topicTitle.toLowerCase()
        )
      ) {
        chapter.topics.push({
          number: chapter.topics.length + 1,
          name: topicTitle,
        });
      }
    }
  }

  const chapters = Array.from(chapterMap.values())
    .filter((c) => c.number > 0)
    .sort((a, b) => a.number - b.number);

  const relDir = path.join(group.board, `class${group.classNumber}`);
  const fileBase = `${slugify(group.subjectName)}${slugify(group.bookName)}`;
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

console.log("");
console.log("Generated Class 12 masters:", generated.length);

for (const g of generated) {
  console.log(
    `- ${g.subjectCode} | ${g.subjectName} | ${g.bookName} | chapters=${g.chapterCount} | topics=${g.topicCount}`
  );
}

const expectedCodes = [
  "acc12p1",
  "acc12p2",
  "bio12",
  "bst12p1",
  "bst12p2",
  "chem12p1",
  "chem12p2",
  "eco12mac1",
  "eco12mac2",
  "eng12flam",
  "eng12vist",
  "geo12fhg",
  "geo12ipe",
  "hin12aroh",
  "hin12vitan",
  "hist12p1",
  "hist12p2",
  "hist12p3",
  "math12p1",
  "math12p2",
  "phy12p1",
  "phy12p2",
  "pol12cwp",
  "pol12pii",
  "psy12",
  "san12bha",
  "soc12ind",
];

const foundCodes = new Set(generated.map((g) => g.subjectCode));

console.log("");
console.log("Expected Class 12 code check:");

for (const code of expectedCodes) {
  console.log(`${foundCodes.has(code) ? "OK" : "MISSING"} - ${code}`);
}

const missing = expectedCodes.filter((c) => !foundCodes.has(c));
const zero = generated.filter((g) => g.chapterCount === 0);

if (missing.length || zero.length) {
  if (missing.length) console.error("Missing codes:", missing.join(", "));
  if (zero.length) {
    console.error("Zero chapter masters:");
    for (const g of zero) {
      console.error(`- ${g.subjectCode} | ${g.subjectName} | ${g.bookName}`);
    }
  }
  process.exit(1);
}
