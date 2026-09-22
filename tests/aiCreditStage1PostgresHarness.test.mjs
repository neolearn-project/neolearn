import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const image = process.env.NEOLEARN_AI_CREDIT_POSTGRES_IMAGE ?? "postgres:17";
const database = "neolearn_stage1_replay_fixture";
const docker = (args) => spawnSync("docker", args, { encoding: "utf8" });
const psql = (container, args) => docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...args]);

function concurrentPsql(container, sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ status: null, error, stderr, stdout }));
    child.on("close", (status) => resolve({ status, stderr, stdout }));
  });
}

test("Stage 1 replay uniqueness and conditional failure retry on PostgreSQL 17", { timeout: 120_000 }, async (t) => {
  const container = `neolearn-stage1-replay-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    const started = docker(["run", "--detach", "--name", container,
      "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`,
      "--mount", `type=bind,source=${repository},target=/workspace,readonly`, image]);
    if (started.error?.code === "ENOENT") {
      t.skip("Docker is unavailable; PostgreSQL 17 replay fixture prepared but unverified");
      return;
    }
    assert.equal(started.status, 0, started.stderr || started.error?.message);
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (psql(container, ["-c", "select 1"]).status === 0) { ready = true; break; }
    }
    assert.equal(ready, true, "PostgreSQL did not become ready");
    const version = psql(container, ["-A", "-t", "-c", "show server_version"]);
    assert.equal(version.status, 0);
    assert.match(version.stdout.trim(), /^17\./);
    const fixture = psql(container, ["-f", "/workspace/tests/postgres/aiCreditStage1Replay.behavior.sql"]);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const insert = "insert into public.ai_usage_requests (student_id, feature, request_id, request_hash) values ('auth-user', 'avatar_lesson', 'concurrent', 'hash')";
    const first = concurrentPsql(container, `begin; ${insert}; select pg_sleep(1); commit;`);
    const second = concurrentPsql(container, insert);
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map((result) => result.status).sort(), [0, 1], JSON.stringify(results));
    assert.match(results.find((result) => result.status === 1).stderr, /duplicate key value/i);
    const count = psql(container, ["-A", "-t", "-c", "select count(*) from public.ai_usage_requests where student_id='auth-user' and feature='avatar_lesson' and request_id='concurrent'"]);
    assert.equal(count.status, 0);
    assert.equal(count.stdout.trim(), "1");

    const failure = psql(container, ["-c", "update public.ai_usage_requests set status='failure' where student_id='auth-user' and feature='avatar_lesson' and request_id='concurrent'"]);
    assert.equal(failure.status, 0, failure.stderr || failure.stdout);
    const claim = "update public.ai_usage_requests set status='in_progress', attempt_count=attempt_count+1 where student_id='auth-user' and feature='avatar_lesson' and request_id='concurrent' and status='failure' returning attempt_count";
    const retryResults = await Promise.all([concurrentPsql(container, claim), concurrentPsql(container, claim)]);
    assert.equal(retryResults.filter((result) => result.status === 0 && /\b1\b/.test(result.stdout)).length, 1);
    const final = psql(container, ["-A", "-t", "-c", "select status || ':' || attempt_count from public.ai_usage_requests where student_id='auth-user' and feature='avatar_lesson' and request_id='concurrent'"]);
    assert.equal(final.status, 0);
    assert.equal(final.stdout.trim(), "in_progress:1");
  } finally {
    docker(["rm", "--force", container]);
  }
});
