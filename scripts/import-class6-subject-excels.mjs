import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class6");
const outBase = path.resolve("app/lib/textbookMasters");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function slugify(input) {
  return String(input || "")
    .trim()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "")
    .replace(/^[A-Z]/, (m) => m.toLowerCase());
}

function safeExportName(parts) {
  return parts
    .map((p) => String(p || "").replace(/[^\p{L}\p{N}]/gu, ""))
    .join("");
}

function normalizeKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(v) {
  return String(v ?? "").trim();
}

function headerMap(row) {
  const map = {};
  Object.keys(row).forEach((k) => {
    map[normalizeKey(k)] = row[k];
  });
  return map;
}

function toInt(v, fallback = 0) {
  const s = clean(v);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBoard(v) {
  const s = clean(v).toLowerCase();
  if (s.includes("cbse")) return "cbse";
  return s;
}

function deriveSubjectCode(subjectName, classNumber) {
  const s = clean(subjectName).toLowerCase();
  if (s === "english") return `eng${classNumber}`;
  if (s === "hindi") return `hin${classNumber}`;
  if (s === "mathematics") return `math${classNumber}`;
  if (s === "science") return `sci${classNumber}`;
  if (s === "social science") return `sst${classNumber}`;
  if (s === "sanskrit") return `san${classNumber}`;
  if (s === "arts") return `art${classNumber}`;
  if (s === "urdu") return `urd${classNumber}`;
  return s.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 8) + classNumber;
}

function chapterTypeFallback(subjectName, chapterType) {
  const given = clean(chapterType);
  if (given) return given.toLowerCase();

  const s = clean(subjectName).toLowerCase();
  if (s === "english") return "literature";
  if (s === "hindi") return "literature";
  if (s === "sanskrit") return "literature";
  if (s === "mathematics") return "concept";
  if (s === "science") return "science";
  if (s === "social science") return "sst";
  return "general";
}

function findDataSheet(workbook) {
  const preferred = ["Textbook_Master_Entry", "Master"];
  for (const name of preferred) {
    if (workbook.SheetNames.includes(name)) return name;
  }
  return workbook.SheetNames[0];
}

function isSanskritShiftedRow(r) {
  const subj = clean(r.subject_name || r.subject || "");
  const maybeChapterNo = clean(r.textbook_series);
  const maybeChapterTitle = clean(r.chapter_number);
  const maybeTopicNo = clean(r.chapter_title);
  const maybeTopicTitle = clean(r.chapter_type);

  return (
    subj.toLowerCase() === "sanskrit" &&
    /^\d+$/.test(maybeChapterNo) &&
    maybeChapterTitle.length > 0 &&
    /^\d+(\.\d+)?$/.test(maybeTopicNo) &&
    maybeTopicTitle.length > 0
  );
}

function normalizeWorkbookRows(rows) {
  const out = [];

  for (const raw of rows) {
    const r = headerMap(raw);

    const boardText = clean(r.board);
    const classText = clean(r.class_number || r.class);
    if (boardText.toLowerCase() === "board" || classText.toLowerCase() === "class") {
      continue;
    }

    if (isSanskritShiftedRow(r)) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class_number),
        subject_name: clean(r.subject_name || r.subject),
        book_name: clean(r.book_name || r.book),
        textbook_series: "",
        chapter_number: clean(r.textbook_series),   // shifted
        chapter_title: clean(r.chapter_number),     // shifted
        chapter_type: clean(r.topic_number),        // "Concept"
        topic_number: clean(r.chapter_title),       // shifted
        topic_title: clean(r.chapter_type),         // shifted
        source_url: clean(r.source_url),
        status: clean(r.status),
        notes: clean(r.notes),
      });
    } else {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class_number || r.class),
        subject_name: clean(r.subject_name || r.subject),
        book_name: clean(r.book_name || r.book),
        textbook_series: clean(r.textbook_series),
        chapter_number: clean(r.chapter_number),
        chapter_title: clean(r.chapter_title),
        chapter_type: clean(r.chapter_type),
        topic_number: clean(r.topic_number),
        topic_title: clean(r.topic_title),
        source_url: clean(r.source_url),
        status: clean(r.status),
        notes: clean(r.notes),
      });
    }
  }

  return out;
}

if (!fs.existsSync(inputDir)) {
  console.error("Input folder not found:", inputDir);
  process.exit(1);
}

const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".xlsx"));
if (!files.length) {
  console.error("No .xlsx files found in:", inputDir);
  process.exit(1);
}

ensureDir(outBase);
ensureDir(path.join(outBase, "cbse", "class6"));

const generated = [];

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const wb = xlsx.readFile(fullPath);
  const sheetName = findDataSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  if (!rows.length) {
    console.warn("Skipping empty workbook:", file);
    continue;
  }

  const normalizedRows = normalizeWorkbookRows(rows);
  if (!normalizedRows.length) {
    console.warn("No usable rows in:", file);
    continue;
  }

  const first = normalizedRows[0];

  const board = normalizeBoard(first.board);
  const classNumber = toInt(first.class_number);
  const subjectName = clean(first.subject_name);
  const bookName = clean(first.book_name);
  const textbookSeries = clean(first.textbook_series) || `NCERT ${bookName}`;
  const subjectCode = deriveSubjectCode(subjectName, classNumber);

  if (!board || !classNumber || !subjectName || !bookName) {
    console.warn("Skipping file due to missing top-level metadata:", file);
    continue;
  }

  const chapterMap = new Map();

  for (const row of normalizedRows) {
    const chNo = toInt(row.chapter_number);
    const chTitle = clean(row.chapter_title);
    const chType = chapterTypeFallback(subjectName, row.chapter_type);
    const topicNoRaw = clean(row.topic_number);
    const topicTitle = clean(row.topic_title);

    if (!chNo || !chTitle) continue;

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
      chapter.topics.push({
        number: chapter.topics.length + 1,
        name: topicTitle,
      });
    }
  }

  const chapters = Array.from(chapterMap.values()).sort((a, b) => a.number - b.number);

  const relDir = path.join(board, `class${classNumber}`);
  const fileBase = slugify(subjectName) + slugify(bookName);
  const exportName = safeExportName([board, "Class", classNumber, subjectName, bookName]);

  const relFile = path.join(relDir, `${fileBase}.ts`);
  const fullOut = path.join(outBase, relFile);
  ensureDir(path.dirname(fullOut));

  const fileContent = `import { MasterSubject } from "../../types";

export const ${exportName}: MasterSubject = {
  board: ${JSON.stringify(board)},
  classNumber: ${classNumber},
  subjectName: ${JSON.stringify(subjectName)},
  subjectCode: ${JSON.stringify(subjectCode)},
  bookName: ${JSON.stringify(bookName)},
  textbookSeries: ${JSON.stringify(textbookSeries)},
  chapters: ${JSON.stringify(chapters, null, 2)},
};
`;

  fs.writeFileSync(fullOut, fileContent, "utf8");

  generated.push({
    board,
    classNumber,
    subjectName,
    bookName,
    textbookSeries,
    exportName,
    relFile: relFile.replace(/\\/g, "/"),
    file,
    chapterCount: chapters.length,
    topicCount: chapters.reduce((n, c) => n + c.topics.length, 0),
  });
}

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

const importLines = generated
  .map((g) => `import { ${g.exportName} } from "./${g.relFile.replace(/\.ts$/, "")}";`)
  .join("\n");

const masterArray = generated.map((g) => `  ${g.exportName},`).join("\n");

const indexContent = `import { MasterSubject } from "./types";
${importLines}

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

const masters: MasterSubject[] = [
${masterArray}
];

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

fs.writeFileSync(path.join(outBase, "index.ts"), indexContent, "utf8");

console.log("Generated masters:", generated.length);
for (const g of generated) {
  console.log(
    `- ${g.subjectName} | ${g.bookName} | chapters=${g.chapterCount} | topics=${g.topicCount} | source=${g.file}`
  );
}
