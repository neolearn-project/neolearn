import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = path.resolve("data/masters/class12");

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(k) {
  return clean(k)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function findDataSheet(workbook) {
  const preferred = [
    "Textbook_Master_Entry",
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
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
    if (rows.length > bestRows) {
      best = name;
      bestRows = rows.length;
    }
  }

  return best;
}

function buildRows(ws) {
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
        "chapter",
        "chapter_no",
        "chapter_number",
        "chapter_title",
        "topic",
        "topic_title",
        "topic_name",
      ].includes(k)
    ).length;

    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const headers = matrix[headerIndex].map((c) => normalizeKey(c));
  const rows = [];

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = matrix[i][idx];
    });

    const values = Object.values(obj).map(clean);
    if (!values.some(Boolean)) continue;
    rows.push(obj);
  }

  return { rows, headerIndex, headers };
}

if (!fs.existsSync(inputDir)) {
  console.error("Class 12 folder not found:", inputDir);
  process.exit(1);
}

const files = fs.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".xlsx"));

if (!files.length) {
  console.error("No .xlsx files found in:", inputDir);
  process.exit(1);
}

console.log("Class 12 Excel verification");
console.log("===========================");
console.log("Files found:", files.length);
console.log("");

let totalRows = 0;

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const wb = xlsx.readFile(fullPath);
  const sheetName = findDataSheet(wb);
  const ws = wb.Sheets[sheetName];
  const { rows, headerIndex, headers } = buildRows(ws);

  totalRows += rows.length;

  const sample = rows[0] || {};
  const subject =
    clean(sample.subject_name || sample.subject || sample.subjects) || "(not detected)";
  const book =
    clean(sample.book_name || sample.book || sample.textbook || sample.textbook_name) ||
    "(not detected)";

  const blankChapter = rows.filter((r) => {
    const ch =
      clean(r.chapter_title || r.chapter_name || r.chapter || r.lesson_title || r.unit_title);
    return !ch;
  }).length;

  const blankTopic = rows.filter((r) => {
    const t =
      clean(r.topic_title || r.topic_name || r.topic || r.subtopic || r.section);
    return !t;
  }).length;

  console.log(`FILE: ${file}`);
  console.log(`  sheet       : ${sheetName}`);
  console.log(`  header row  : ${headerIndex + 1}`);
  console.log(`  rows        : ${rows.length}`);
  console.log(`  subject     : ${subject}`);
  console.log(`  book        : ${book}`);
  console.log(`  blankChapter: ${blankChapter}`);
  console.log(`  blankTopic  : ${blankTopic}`);
  console.log(`  headers     : ${headers.filter(Boolean).join(", ")}`);
  console.log("");
}

console.log("TOTAL ROWS:", totalRows);
