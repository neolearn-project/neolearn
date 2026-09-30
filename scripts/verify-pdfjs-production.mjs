import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeTracePath = path.join(root, ".next/server/app/api/admin/textbooks/process/route.js.nft.json");
const nextBin = path.join(root, "node_modules/next/dist/bin/next");

async function runBuild(env) {
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [nextBin, "build"], { cwd: root, env, stdio: "ignore" });
    build.once("error", reject);
    build.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Production build exited ${code}.`)));
  });
}

function makeTextPdf(text) {
  const stream = `BT\n/F1 18 Tf\n20 80 Td\n(${text}) Tj\nET\n`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  const chunks = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let i = 0; i < bodies.length; i++) {
    offsets.push(offset);
    const chunk = Buffer.from(`${i + 1} 0 obj\n${bodies[i]}\nendobj\n`, "ascii");
    chunks.push(chunk);
    offset += chunk.length;
  }
  const xrefOffset = offset;
  chunks.push(Buffer.from(
    `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    "ascii"
  ));
  return Buffer.concat(chunks);
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const pdfText = "Production route extracts this PDF text.";
const pdfBytes = makeTextPdf(pdfText);
const expectedByteSize = pdfBytes.byteLength;
const expectedSha256 = createHash("sha256").update(pdfBytes).digest("hex");
const expectInvalidFinalize = process.argv.includes("--expect-invalid-finalize");
const checkpoints = [];
const finalizations = [];
const mock = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/rest/v1/rpc/claim_textbook_processing") {
    response.writeHead(200, { "content-type": "application/json" }).end("true");
    return;
  }
  if (url.pathname === "/rest/v1/textbook_sources") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ storage_path: "fixture/gepr101-fixture.pdf" }));
    return;
  }
  if (url.pathname === "/storage/v1/object/textbook-pdfs/fixture/gepr101-fixture.pdf") {
    response.writeHead(200, { "content-type": "application/pdf", "content-length": pdfBytes.length }).end(pdfBytes);
    return;
  }
  if (url.pathname === "/rest/v1/textbook_processing_pages" || url.pathname === "/rest/v1/textbook_pages") {
    response.writeHead(200, { "content-type": "application/json" }).end("[]");
    return;
  }
  if (url.pathname === "/rest/v1/rpc/checkpoint_textbook_page") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    checkpoints.push(JSON.parse(raw));
    response.writeHead(204).end();
    return;
  }
  if (url.pathname === "/rest/v1/rpc/finalize_textbook_processing") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const params = JSON.parse(raw);
    finalizations.push(params);
    // Mirror the migration's finalize_textbook_processing metadata guards.
    const valid = Number.isInteger(params.p_page_count) && params.p_page_count >= 1 && params.p_page_count <= 250
      && Number.isInteger(params.p_byte_size) && params.p_byte_size >= 1 && params.p_byte_size <= 25 * 1024 * 1024
      && typeof params.p_sha256 === "string" && /^[0-9a-f]{64}$/.test(params.p_sha256);
    if (!valid) {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({
        code: "P0001", message: "Invalid processed PDF metadata",
      }));
      return;
    }
    response.writeHead(204).end();
    return;
  }
  response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "Unexpected local fixture request" }));
});
await new Promise((resolve, reject) => mock.once("error", reject).listen(0, "127.0.0.1", resolve));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const appPort = await unusedPort();
const testEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: mockUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-test-service-key",
  ADMIN_PASSWORD: "local-test-admin-password",
};

let app;
let testError;
try {
  await runBuild(testEnv);
  const routeTrace = JSON.parse(await readFile(routeTracePath, "utf8"));
  assert.ok(
    routeTrace.files.some((file) => file.replaceAll("\\", "/").endsWith("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")),
    "the production route trace must include the matching installed PDF.js worker"
  );
  app = spawn(process.execPath, [nextBin, "start", "-p", String(appPort)], {
    cwd: root,
    env: testEnv,
    stdio: ["ignore", "ignore", "ignore"],
  });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error(`Production server exited before becoming ready (${app.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(1000);
  }
  assert.ok(ready, "production Next.js server did not become ready");

  const response = await fetch(`http://127.0.0.1:${appPort}/api/admin/textbooks/process`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-password": "local-test-admin-password" },
    body: JSON.stringify({ sourceId: "11111111-1111-4111-8111-111111111111" }),
  });
  const result = await response.json();
  assert.equal(finalizations.length, 1, "the route must finalize exactly once");
  assert.equal(finalizations[0].p_page_count, 1, "finalization must report the fixture's actual page count");
  assert.equal(finalizations[0].p_sha256, expectedSha256, "finalization must report the original PDF's SHA-256");
  assert.match(finalizations[0].p_sha256, /^[0-9a-f]{64}$/, "finalization SHA-256 must satisfy the SQL format constraint");
  if (expectInvalidFinalize) {
    assert.equal(response.status, 422, JSON.stringify(result));
    assert.match(result.error, /Invalid processed PDF metadata/);
    assert.equal(finalizations[0].p_byte_size, 0, "pre-fix reproduction should show PDF.js detached the source buffer");
    console.log(`PASS: reproduced SQL metadata rejection after PDF.js detached the source buffer (submitted byte size 0; original ${expectedByteSize}).`);
  } else {
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(finalizations[0].p_byte_size, expectedByteSize, "finalization must preserve the exact validated original PDF byte size");
    assert.equal(result.pageCount, 1);
  }
  assert.equal(checkpoints.length, 1);
  assert.match(checkpoints[0].p_text, /Production route extracts this PDF text/);
  if (!expectInvalidFinalize) console.log("PASS: built Next.js production route loaded its traced PDF.js worker, extracted fixture text, and finalized exact SQL-valid PDF metadata.");
} catch (error) {
  testError = error;
} finally {
  if (app && app.exitCode === null) {
    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
      const killer = spawn(path.join(systemRoot, "System32", "taskkill.exe"), ["/pid", String(app.pid), "/t", "/f"], { stdio: "ignore" });
      killer.unref();
    } else {
      app.kill("SIGTERM");
    }
    app.unref();
  }
  mock.closeAllConnections();
  const closing = new Promise((resolve) => mock.close(() => resolve()));
  await Promise.race([closing, delay(1500)]);
}
if (testError) throw testError;
