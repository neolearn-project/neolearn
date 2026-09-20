import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const image = process.env.NEOLEARN_AI_CREDIT_POSTGRES_IMAGE ?? "postgres:17";
const database = "neolearn_ai_credit_fixture";

if (!/^postgres:[1-9][0-9]*$/.test(image)) {
  throw new Error(`NEOLEARN_AI_CREDIT_POSTGRES_IMAGE must match postgres:<numeric-major>; received ${JSON.stringify(image)}`);
}

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function assertSucceeded(result, description) {
  assert.equal(result.error, undefined, `${description}: ${result.error?.message || "spawn failed"}`);
  assert.equal(result.status, 0, `${description}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function psql(container, args = []) {
  return docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", ...args]);
}

function concurrentSql(container, marker, sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-A", "-t",
      "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c",
      `set application_name='${marker}'; ${sql}`], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ error, stdout, stderr, status: null }));
    child.on("close", (status) => resolve({ stdout, stderr, status }));
  });
}

function holdTransaction(container, lockSql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-A", "-t",
      "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`lock barrier timed out: ${stderr || stdout}`)), 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("NEOLEARN_LOCK_READY")) {
        clearTimeout(timeout);
        resolve({ child, stdout: () => stdout, stderr: () => stderr });
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.stdin.write(`begin;\n${lockSql};\nselect 'NEOLEARN_LOCK_READY';\n`);
  });
}

async function releaseTransaction(barrier) {
  await new Promise((resolve, reject) => {
    barrier.child.once("close", (status) => status === 0 ? resolve() : reject(
      new Error(`lock barrier failed: ${barrier.stderr() || barrier.stdout()}`)
    ));
    barrier.child.stdin.end("commit;\n\\q\n");
  });
}

async function waitForBlockedWorkers(container, marker, expected) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = psql(container, ["-A", "-t", "-c",
      `select count(*) from pg_catalog.pg_stat_activity where application_name='${marker}' and wait_event_type='Lock'`]);
    if (result.status === 0 && Number(result.stdout.trim()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${expected} workers did not simultaneously block at barrier ${marker}`);
}

async function runConcurrently(container, description, lockSql, statements) {
  const marker = `ai_credit_${randomBytes(6).toString("hex")}`;
  const barrier = await holdTransaction(container, lockSql);
  const pending = statements.map((sql) => concurrentSql(container, marker, sql));
  try {
    await waitForBlockedWorkers(container, marker, statements.length);
  } finally {
    await releaseTransaction(barrier);
  }
  const results = await Promise.all(pending);
  results.forEach((result, index) => assertSucceeded(result, `${description} session ${index + 1}`));
}

test("AI credit shadow persistence is atomic on PostgreSQL 17", { timeout: 120_000 }, async (t) => {
  const container = `neolearn-ai-credit-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    assertSucceeded(docker(["run", "--detach", "--name", container,
      "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`,
      "--mount", `type=bind,source=${repository},target=/workspace,readonly`, image]),
    `start ${image} container`);

    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (psql(container, ["-A", "-t", "-c", "select 1"]).status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(ready, true, "PostgreSQL did not become ready");
    const version = assertSucceeded(psql(container, ["-A", "-t", "-c", "show server_version"]),
      "read PostgreSQL version").trim();
    assert.match(version, /^17\./);
    t.diagnostic(`PostgreSQL server version: ${version} (${image})`);

    assertSucceeded(psql(container, ["-f", "/workspace/tests/postgres/aiCreditShadow.behavior.sql"]),
      "load AI credit behavior fixture");

    await runConcurrently(container, "idempotent reservation",
      "select id from public.ai_usage_ledger where id='00000000-0000-0000-0000-000000000001' for update", [
      "select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000001', 900)",
      "select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000001', 900)",
    ]);
    await runConcurrently(container, "monthly account and grant",
      "select id from public.ai_usage_ledger where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003') for update", [
      "select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000002', 900)",
      "select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000003', 900)",
    ]);
    await runConcurrently(container, "idempotent settlement",
      "select id from public.ai_usage_ledger where id='00000000-0000-0000-0000-000000000001' for update", [
      "select public.settle_ai_credit_shadow((select id from public.ai_credit_reservations where ai_usage_ledger_id='00000000-0000-0000-0000-000000000001'))",
      "select public.settle_ai_credit_shadow((select id from public.ai_credit_reservations where ai_usage_ledger_id='00000000-0000-0000-0000-000000000001'))",
    ]);

    assertSucceeded(psql(container, ["-c",
      "select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000004', 900)"]),
    "prepare settle-release race");
    await runConcurrently(container, "settle-release race",
      "select id from public.ai_usage_ledger where id='00000000-0000-0000-0000-000000000004' for update", [
      "select public.settle_ai_credit_shadow((select id from public.ai_credit_reservations where ai_usage_ledger_id='00000000-0000-0000-0000-000000000004'))",
      "select public.release_ai_credit_shadow((select id from public.ai_credit_reservations where ai_usage_ledger_id='00000000-0000-0000-0000-000000000004'), 'provider_cleanup')",
    ]);

    assertSucceeded(psql(container, ["-f", "/workspace/tests/postgres/aiCreditShadow.assertions.sql"]),
      "verify AI credit shadow behavior");
  } finally {
    docker(["rm", "--force", container]);
  }
});
