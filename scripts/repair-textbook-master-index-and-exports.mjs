import fs from "fs";
import path from "path";

const baseDir = path.resolve("app/lib/textbookMasters");

function walk(dir) {
  const out = [];

  if (!fs.existsSync(dir)) return out;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);

    if (item.isDirectory()) {
      out.push(...walk(full));
    } else if (
      item.isFile() &&
      item.name.endsWith(".ts") &&
      item.name !== "index.ts" &&
      item.name !== "types.ts"
    ) {
      out.push(full);
    }
  }

  return out;
}

function hashText(input) {
  let h = 2166136261;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return (h >>> 0).toString(36);
}

function safeIdentifierFromRel(rel) {
  const raw = rel
    .replace(/\\/g, "/")
    .replace(/\.ts$/i, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const clean = raw || "master";
  return `tm_${clean}_${hashText(rel)}`;
}

function toImportPath(file) {
  const rel = path
    .relative(baseDir, file)
    .replace(/\\/g, "/")
    .replace(/\.ts$/i, "");

  return `./${rel}`;
}

if (!fs.existsSync(baseDir)) {
  console.error("Folder not found:", baseDir);
  process.exit(1);
}

const files = walk(baseDir).sort();

const imports = [];
const masterNames = [];
const repaired = [];

for (const file of files) {
  const rel = path.relative(baseDir, file).replace(/\\/g, "/");
  let txt = fs.readFileSync(file, "utf8");

  if (!txt.includes("MasterSubject")) {
    continue;
  }

  const safeName = safeIdentifierFromRel(rel);

  const before = txt;

  txt = txt.replace(
    /export\s+const\s+[\s\S]*?:\s*MasterSubject\s*=\s*\{/m,
    `export const ${safeName}: MasterSubject = {`
  );

  if (txt === before && !txt.includes(`export const ${safeName}: MasterSubject`)) {
    console.warn("SKIPPED, export pattern not found:", rel);
    continue;
  }

  fs.writeFileSync(file, txt, "utf8");

  imports.push(`import { ${safeName} } from "${toImportPath(file)}";`);
  masterNames.push(`  ${safeName},`);
  repaired.push({ rel, safeName });
}

const indexContent = `import { MasterSubject } from "./types";
${imports.join("\n")}

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
${masterNames.join("\n")}
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

fs.writeFileSync(path.join(baseDir, "index.ts"), indexContent, "utf8");

console.log("Repaired textbook master exports:", repaired.length);
for (const r of repaired) {
  console.log(`- ${r.safeName} <= ${r.rel}`);
}
