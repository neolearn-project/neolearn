import fs from "fs";
import path from "path";

const dir = path.resolve("app/lib/textbookMasters/cbse/class10");

if (!fs.existsSync(dir)) {
  console.error("Missing folder:", dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith(".ts"));

for (const file of files) {
  const oldPath = path.join(dir, file);
  const lowerFile = file.toLowerCase();
  const finalPath = path.join(dir, lowerFile);

  if (file !== lowerFile) {
    const tmpPath = path.join(dir, "__tmp_casefix_" + Date.now() + "_" + lowerFile);

    fs.renameSync(oldPath, tmpPath);
    fs.renameSync(tmpPath, finalPath);

    console.log("Renamed:", file, "=>", lowerFile);
  }
}

console.log("Final Class 10 files:");
for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".ts")).sort()) {
  console.log(file);
}
