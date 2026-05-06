import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class11");
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
  return 11;
}

function normalizeRoman(v) {
  return clean(v)
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/\bpart\s*[-]?\s*1\b/gi, "Part-I")
    .replace(/\bpart\s*[-]?\s*i\b/gi, "Part-I")
    .replace(/\bpart\s*[-]?\s*2\b/gi, "Part-II")
    .replace(/\bpart\s*[-]?\s*ii\b/gi, "Part-II")
    .replace(/\s*-\s*I\b/g, "-I")
    .replace(/\s*-\s*II\b/g, "-II")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBookName(bookName) {
  const b = normalizeRoman(bookName);
  const compact = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const exact = {
    "financial accounting i": "Financial Accounting-I",
    "financial accounting part i": "Financial Accounting-I",
    "financial accounting ii": "Financial Accounting Part II",
    "financial accounting part ii": "Financial Accounting Part II",
    "biology": "Biology",
    "business studies": "Business Studies",
    "chemistry": "Chemistry",
    "chemistry ii": "Chemistry II",
    "rasayan vigyan bhag ii": "Rasayan Vigyan Bhag-II",
    "indian economic development": "Indian Economic Development",
    "statistics for economics": "Statistics for Economics",
    "hornbill": "Hornbill",
    "fundamentals of physical geography": "Fundamentals of Physical Geography",
    "india physical environment": "India Physical Environment",
    "abhivyakti aur madhyam": "Abhivyakti Aur Madhyam",
    "aroh": "Aroh",
    "vitan": "Vitan",
    "themes in world history": "Themes in World History",
    "themes of world history": "Themes in World History",
    "mathematics": "Mathematics",
    "physics i": "Physics-I",
    "physics ii": "Physics-II",
    "indian constitution at work": "Indian Constitution at Work",
    "political theory": "Political Theory",
    "psychology": "Psychology",
    "bhaswati": "Bhaswati",
    "introducing sociology": "Introducing Sociology",
  };

  return exact[compact] || b;
}

function deriveSubjectCode(subjectName, bookName) {
  const s = clean(subjectName).toLowerCase();
  const b = clean(bookName).toLowerCase();

  if (s === "accountancy" && b.includes("financial accounting-i")) return "acc11fa1";
  if (s === "accountancy" && b.includes("financial accounting part ii")) return "acc11fa2";
  if (s === "biology") return "bio11";
  if (s === "business studies") return "bst11";
  if (s === "chemistry" && b === "chemistry") return "chem11p1";
  if (s === "chemistry" && b === "chemistry ii") return "chem11p2";
  if (s === "chemistry" && b.includes("rasayan")) return "chem11hi2";
  if (s === "economics" && b.includes("indian economic")) return "eco11ied";
  if (s === "economics" && b.includes("statistics")) return "eco11stat";
  if (s === "english") return "eng11horn";
  if (s === "geography" && b.includes("fundamentals")) return "geo11fpg";
  if (s === "geography" && b.includes("india physical")) return "geo11ipe";
  if (s === "hindi" && b.includes("abhivyakti")) return "hin11abh";
  if (s === "hindi" && b.includes("aroh")) return "hin11aroh";
  if (s === "hindi" && b.includes("vitan")) return "hin11vitan";
  if (s === "history") return "hist11twh";
  if (s === "mathematics") return "math11";
  if (s === "physics" && (b === "physics-ii" || b.includes("physics-ii"))) return "phy11p2";
  if (s === "physics" && (b === "physics-i" || b.includes("physics-i"))) return "phy11p1";
  if (s === "political science" && b.includes("indian constitution")) return "pol11icw";
  if (s === "political science" && b.includes("political theory")) return "pol11pt";
  if (s === "psychology") return "psy11";
  if (s === "sanskrit") return "san11bha";
  if (s === "sociology") return "soc11intro";

  return (s.replace(/[^a-z0-9]+/g, "").slice(0, 8) + "11");
}

function chapterTypeFallback(subjectName, chapterType) {
  const given = clean(chapterType);
  if (given) return given.toLowerCase();

  const s = clean(subjectName).toLowerCase();
  if (["english", "hindi", "sanskrit"].includes(s)) return "literature";
  if (["mathematics"].includes(s)) return "concept";
  if (["physics", "chemistry", "biology"].includes(s)) return "science";
  if (["history", "geography", "political science", "economics", "sociology", "psychology", "business studies", "accountancy"].includes(s)) return "humanities";
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

  const skipWords = ["prelim", "prelims", "preface", "foreword", "contents", "answer", "answers", "appendix", "appendices", "index"];
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
  const preferred = ["Textbook_Master_Entry", "Master Sheet", "Master", "Sheet1", "Class 11 Mathematics"];
  for (const name of preferred) {
    if (workbook.SheetNames.includes(name)) return name;
  }

  let best = workbook.SheetNames[0];
  let bestRows = -1;

  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes("summary")) continue;
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
    if (rows.length > bestRows) {
      best = name;
      bestRows = rows.length;
    }
  }

  return best;
}

function buildRowsFromSheet(ws) {
  const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

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

const files = fs.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".xlsx"));

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
    const classNumber = parseClassNumber(r.class_number || r.class || "11");
    const subjectName = clean(r.subject_name || r.subject);
    const bookName = normalizeBookName(r.book_name || r.book);
    const textbookSeries = clean(r.textbook_series) || `NCERT ${bookName}`;
    const chapterNumber = clean(r.chapter_number || r.chapter_no);
    const chapterTitle = clean(r.chapter_title || r.chapter_name);
    const chapterType = clean(r.chapter_type || r.topic_type || r.content_type || r.type);
    const topicTitle = clean(r.topic_title || r.topic_name);
    const topicNumber = clean(r.topic_number || r.topic_no);

    if (!board || classNumber !== 11 || !subjectName || !bookName) continue;

    const gk = [board, classNumber, subjectName.toLowerCase(), bookName.toLowerCase()].join("|");

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
    .sort((a, b) => a.number - b.number);

  const relDir = path.join(group.board, `class${group.classNumber}`);
  const fileBase = `${slugify(group.subjectName)}${slugify(group.bookName)}`;
  const exportName = safeExportName([group.board, "Class", group.classNumber, group.subjectName, group.bookName]);
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
console.log("Generated Class 11 masters:", generated.length);

for (const g of generated) {
  console.log(`- ${g.subjectCode} | ${g.subjectName} | ${g.bookName} | chapters=${g.chapterCount} | topics=${g.topicCount}`);
}

const expectedCodes = [
  "acc11fa1",
  "acc11fa2",
  "bio11",
  "bst11",
  "chem11p1",
  "chem11p2",
  "chem11hi2",
  "eco11ied",
  "eco11stat",
  "eng11horn",
  "geo11fpg",
  "geo11ipe",
  "hin11abh",
  "hin11aroh",
  "hin11vitan",
  "hist11twh",
  "math11",
  "phy11p1",
  "phy11p2",
  "pol11icw",
  "pol11pt",
  "psy11",
  "san11bha",
  "soc11intro",
];

const foundCodes = new Set(generated.map((g) => g.subjectCode));

console.log("");
console.log("Expected Class 11 code check:");

for (const code of expectedCodes) {
  console.log(`${foundCodes.has(code) ? "OK" : "MISSING"} - ${code}`);
}

const missing = expectedCodes.filter((c) => !foundCodes.has(c));
const zero = generated.filter((g) => g.chapterCount === 0);

if (missing.length || zero.length) {
  if (missing.length) console.error("Missing codes:", missing.join(", "));
  if (zero.length) {
    console.error("Zero chapter masters:");
    for (const g of zero) console.error(`- ${g.subjectCode} | ${g.subjectName} | ${g.bookName}`);
  }
  process.exit(1);
}


