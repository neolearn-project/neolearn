import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class7");
const outBase = path.resolve("app/lib/textbookMasters");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function clean(v) {
  return String(v ?? "").trim();
}

function normalizeKey(k) {
  return clean(k)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function headerMap(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    out[normalizeKey(k)] = row[k];
  }
  return out;
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

function normalizeBoard(v) {
  const s = clean(v).toLowerCase();
  if (s.includes("cbse")) return "cbse";
  return s;
}

function toInt(v, fallback = 0) {
  const s = clean(v);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function deriveSubjectCode(subjectName, classNumber) {
  const s = clean(subjectName).toLowerCase();
  if (s === "english") return `eng${classNumber}`;
  if (s === "hindi") return `hin${classNumber}`;
  if (s === "mathematics") return `math${classNumber}`;
  if (s === "science") return `sci${classNumber}`;
  if (s === "social science") return `sst${classNumber}`;
  if (s === "sanskrit") return `san${classNumber}`;
  if (s === "urdu") return `urd${classNumber}`;
  return s.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 8) + classNumber;
}

function chapterTypeFallback(subjectName, chapterType) {
  const given = clean(chapterType);
  if (given) return given.toLowerCase();

  const s = clean(subjectName).toLowerCase();
  if (["english", "hindi", "sanskrit", "urdu"].includes(s)) return "literature";
  if (s === "mathematics") return "concept";
  if (s === "science") return "science";
  if (s === "social science") return "sst";
  return "general";
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

  if (["english", "hindi", "sanskrit", "urdu"].includes(s)) {
    return [
      { number: 1, name: "Summary" },
      { number: 2, name: "Vocabulary and Meanings" },
      { number: 3, name: "Questions and Answers" },
    ];
  }

  return [
    { number: 1, name: "Overview" },
    { number: 2, name: "Important Points" },
    { number: 3, name: "Practice" },
  ];
}

function findDataSheet(workbook) {
  const preferred = ["Textbook_Master_Entry", "Master"];
  for (const name of preferred) {
    if (workbook.SheetNames.includes(name)) return name;
  }
  return workbook.SheetNames[0];
}

function parseChapterNumber(raw) {
  const s = clean(raw);
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (/^\d+\.\d+$/.test(s)) return parseInt(s.split(".")[0], 10);
  if (/^[Pp](\.\d+)?$/.test(s) || s.toLowerCase().includes("prelim")) return 0;
  return 0;
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

    const firstCell = clean(Object.values(r)[0] ?? "");
    if (
      firstCell.toLowerCase().includes("master sheet") ||
      firstCell.toLowerCase().includes("generated:")
    ) {
      continue;
    }

    const boardCell = clean(r.board);
    if (boardCell.toLowerCase() === "board") continue;

    if (isSanskritShiftedRow(r)) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class || r.class_number),
        subject_name: clean(r.subject || r.subject_name),
        book_name: clean(r.book || r.book_name),
        textbook_series: "",
        chapter_number: clean(r.textbook_series),
        chapter_title: clean(r.chapter_number),
        chapter_type: clean(r.topic_number),
        topic_number: clean(r.chapter_title),
        topic_title: clean(r.chapter_type),
      });
      continue;
    }

    // English Poorvi format
    if ("unit_no" in r && "literary_piece_passage" in r) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class),
        subject_name: clean(r.subject),
        book_name: clean(r.book),
        textbook_series: `NCERT ${clean(r.book)}`,
        chapter_number: clean(r.unit_no),
        chapter_title: clean(r.unit_title || r.literary_piece_passage),
        chapter_type: clean(r.type),
        topic_number: clean(r.topic_no),
        topic_title: clean(r.topic_title),
      });
      continue;
    }

    // Hindi format
    if ("chapter_no" in r && "genre_type" in r) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class),
        subject_name: clean(r.subject),
        book_name: clean(r.book),
        textbook_series: `NCERT ${clean(r.book)}`,
        chapter_number: clean(r.chapter_no),
        chapter_title: clean(r.chapter_title),
        chapter_type: clean(r.genre_type),
        topic_number: clean(r.topic_no),
        topic_title: clean(r.topic_title),
      });
      continue;
    }

    // Science format
    if ("chapter_no" in r && "page_ref" in r) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class),
        subject_name: clean(r.subject),
        book_name: clean(r.book),
        textbook_series: `NCERT ${clean(r.book)}`,
        chapter_number: clean(r.chapter_no),
        chapter_title: clean(r.chapter_title),
        chapter_type: clean(r.topic_type),
        topic_number: clean(r.topic_no),
        topic_title: clean(r.topic_title),
      });
      continue;
    }

    // Social Science part files
    if ("theme_section" in r && "content_type" in r) {
      out.push({
        board: clean(r.board),
        class_number: clean(r.class),
        subject_name: clean(r.subject),
        book_name: clean(r.book),
        textbook_series: `NCERT ${clean(r.book)}`,
        chapter_number: clean(r.chapter_no),
        chapter_title: clean(r.chapter_title),
        chapter_type: clean(r.content_type),
        topic_number: clean(r.topic_no),
        topic_title: clean(r.topic_title),
      });
      continue;
    }

    // Mathematics / generic textbook format
    out.push({
      board: clean(r.board),
      class_number: clean(r.class_number || r.class),
      subject_name: clean(r.subject_name || r.subject),
      book_name: clean(r.book_name || r.book),
      textbook_series: clean(r.textbook_series),
      chapter_number: clean(r.chapter_number || r.chapter_no),
      chapter_title: clean(r.chapter_title),
      chapter_type: clean(r.chapter_type),
      topic_number: clean(r.topic_number || r.topic_no || r.topic_id),
      topic_title: clean(r.topic_title),
    });
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

const grouped = new Map();

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const wb = xlsx.readFile(fullPath);
  const sheetName = findDataSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
  const normalizedRows = normalizeWorkbookRows(rows);

  for (const row of normalizedRows) {
    const board = normalizeBoard(row.board);
    const classNumber = toInt(row.class_number);
    const subjectName = clean(row.subject_name);
    const bookName = clean(row.book_name);
    const textbookSeries = clean(row.textbook_series) || `NCERT ${bookName}`;

    if (!board || !classNumber || !subjectName || !bookName) continue;

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
    const chNo = parseChapterNumber(row.chapter_number);
    const chTitle = clean(row.chapter_title);
    const chType = chapterTypeFallback(group.subjectName, row.chapter_type);
    const topicTitle = clean(row.topic_title);

    if (!chTitle) continue;
    if (chNo === 0 && chTitle.toLowerCase().includes("prelims")) continue;

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
      if (!chapter.topics.some((t) => t.name === topicTitle)) {
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

const existingImports = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";

const newImportLines = generated
  .map((g) => `import { ${g.exportName} } from "./${g.relFile.replace(/\.ts$/, "")}";`)
  .filter((line) => !existingImports.includes(line))
  .join("\n");

const marker = "const masters: MasterSubject[] = [";
let nextIndex = existingImports;

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

const masters: MasterSubject[] = [
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
}

if (newImportLines) {
  nextIndex = nextIndex.replace('import { MasterSubject } from "./types";', `import { MasterSubject } from "./types";\n${newImportLines}`);
}

const addMasters = generated
  .map((g) => `  ${g.exportName},`)
  .filter((line) => !nextIndex.includes(line))
  .join("\n");

if (addMasters) {
  nextIndex = nextIndex.replace(marker, `${marker}\n${addMasters}`);
}

fs.writeFileSync(indexPath, nextIndex, "utf8");

console.log("Generated Class 7 masters:", generated.length);
for (const g of generated) {
  console.log(`- ${g.subjectName} | ${g.bookName} | chapters=${g.chapterCount} | topics=${g.topicCount}`);
}
