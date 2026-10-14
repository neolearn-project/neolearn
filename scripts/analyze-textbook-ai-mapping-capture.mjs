import { readdir,readFile } from "node:fs/promises";
import path from "node:path";
import { analyzeCapturedEvidence,TEXTBOOK_AI_CAPTURE_DIR } from "../app/lib/textbookAiMappingCapture.mjs";

let capturePath=process.argv[2];
if(!capturePath){const root=path.resolve(process.cwd(),TEXTBOOK_AI_CAPTURE_DIR),files=(await readdir(root)).filter(name=>name.endsWith(".json")).sort();if(!files.length)throw new Error(`No captures found in ${root}`);capturePath=path.join(root,files.at(-1));}
const capture=JSON.parse(await readFile(path.resolve(capturePath),"utf8"));
process.stdout.write(`${JSON.stringify(analyzeCapturedEvidence(capture,{captureFilename:path.basename(capturePath)}),null,2)}\n`);
