import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const database = "neolearn_payment_fixture";
const postgresImage = process.env.NEOLEARN_PAYMENT_POSTGRES_IMAGE ?? "postgres:17";

if (!/^postgres:[1-9][0-9]*$/.test(postgresImage)) {
  throw new Error(
    `NEOLEARN_PAYMENT_POSTGRES_IMAGE must match postgres:<numeric-major>; received ${JSON.stringify(postgresImage)}`
  );
}

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function assertSucceeded(result, description) {
  assert.equal(result.error, undefined, `${description}: ${result.error?.message || "spawn failed"}`);
  assert.equal(result.status, 0, `${description}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function execPsql(containerName, args = []) {
  return docker(["exec", containerName, "psql", "-X", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", ...args]);
}

function concurrentFinalization(containerName) {
  const sql = `select pg_sleep(0.5); select public.finalize_razorpay_student_payment(
    'order_fixture', 'pay_fixture', '9999999999', 'SNAPSHOT', 49900, 'INR', 'webhook', null);`;
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", containerName, "psql", "-X", "-A", "-t",
      "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ error, stdout, stderr, status: null }));
    child.on("close", (status) => resolve({ stdout, stderr, status }));
  });
}

test("atomic payment RPC behavior in two disposable PostgreSQL sessions", { timeout: 120_000 }, async (t) => {
  const containerName = `neolearn-payment-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    assertSucceeded(docker(["run", "--detach", "--name", containerName,
      "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`,
      "--mount", `type=bind,source=${repository},target=/workspace,readonly`, postgresImage]),
    `start ${postgresImage} container`);

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (docker(["exec", containerName, "pg_isready", "-U", "postgres", "-d", database]).status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(ready, true, "PostgreSQL did not become ready");
    const serverVersion = assertSucceeded(execPsql(containerName, ["-A", "-t", "-c", "show server_version"]),
      "read PostgreSQL server version").trim();
    assert.match(serverVersion, new RegExp(`^${postgresImage.slice("postgres:".length)}\\.`));
    t.diagnostic(`PostgreSQL server version: ${serverVersion} (${postgresImage})`);
    assertSucceeded(execPsql(containerName, ["-f", "/workspace/tests/postgres/paymentFinalization.behavior.sql"]),
      "load payment fixture");

    const results = await Promise.all([
      concurrentFinalization(containerName), concurrentFinalization(containerName),
    ]);
    for (const [index, result] of results.entries()) {
      assertSucceeded(result, `concurrent finalization session ${index + 1}`);
    }
    const responses = results.map(({ stdout }) => {
      const line = stdout.split(/\r?\n/).map((value) => value.trim()).find((value) => value.startsWith("{"));
      assert.ok(line, `missing JSON RPC result in ${stdout}`);
      return JSON.parse(line);
    });
    assert.ok(responses.every((response) => response.ok === true), "both retries must resolve safely");
    assert.deepEqual(responses.map((response) => response.already_processed).sort(), [false, true]);
    assert.equal(new Set(responses.map((response) => response.subscription_id)).size, 1);
    assert.equal(new Set(responses.map((response) => response.start_at)).size, 1);
    assert.equal(new Set(responses.map((response) => response.end_at)).size, 1);

    assertSucceeded(execPsql(containerName, ["-f", "/workspace/tests/postgres/paymentFinalization.assertions.sql"]),
      "verify payment behavior");
  } finally {
    docker(["rm", "--force", containerName]);
  }
});
