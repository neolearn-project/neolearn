import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const image = process.env.NEOLEARN_AI_CREDIT_POSTGRES_IMAGE ?? "postgres:17";
const database = "neolearn_ai_credit_reconcile_fixture";

function docker(args) { return spawnSync("docker", args, { encoding: "utf8" }); }
function run(container, args = []) {
  return docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", ...args]);
}

function concurrentReconcile(container) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1", "-c", "select public.reconcile_ai_credit_shadow_terminal(50)"],
    { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ status: null, error, stderr }));
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test("terminal reconciliation PostgreSQL 17 behavior", { timeout: 120_000 }, async (t) => {
  const container = `neolearn-ai-credit-reconcile-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    const started = docker(["run", "--detach", "--name", container,
      "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`,
      "--mount", `type=bind,source=${repository},target=/workspace,readonly`, image]);
    if (started.error?.code === "ENOENT") {
      t.skip("Docker is unavailable; PostgreSQL 17 fixture prepared but unverified");
      return;
    }
    assert.equal(started.status, 0, started.stderr || started.error?.message);
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (run(container, ["-c", "select 1"]).status === 0) { ready = true; break; }
    }
    assert.equal(ready, true, "PostgreSQL did not become ready");
    const version = run(container, ["-A", "-t", "-c", "show server_version"]);
    assert.equal(version.status, 0);
    assert.match(version.stdout.trim(), /^17\./);
    const fixture = run(container, ["-f", "/workspace/tests/postgres/aiCreditReconciliation.behavior.sql"]);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);
    for (const [name, signature] of [
      ["settle_ai_credit_shadow", "p_reservation_id uuid, p_extra text"],
      ["release_ai_credit_shadow", "p_reservation_id uuid, p_reason text, p_extra integer"],
    ]) {
      const created = run(container, ["-c", `create function public.${name}(${signature}) returns jsonb language sql as 'select null::jsonb'`]);
      assert.equal(created.status, 0, created.stderr || created.stdout);
      const rejected = run(container, ["-f", "/workspace/supabase/migrations/20260921_ai_credit_shadow_terminal_reconciliation_v1.sql"]);
      assert.notEqual(rejected.status, 0, `${name} overload was accepted`);
      assert.match(rejected.stderr, new RegExp(`PRECHECK: incompatible ${name} overload`));
      const removed = run(container, ["-c", `drop function public.${name}(${signature})`]);
      assert.equal(removed.status, 0, removed.stderr || removed.stdout);
    }
    const results = await Promise.all([concurrentReconcile(container), concurrentReconcile(container)]);
    results.forEach((result) => {
      assert.equal(result.status, 0, result.stderr || result.error?.message);
    });
  } finally {
    docker(["rm", "--force", container]);
  }
});
