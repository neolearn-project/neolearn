import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const image = process.env.NEOLEARN_AI_CREDIT_POSTGRES_IMAGE ?? "postgres:17";
const database = "neolearn_ai_credit_policy_fixture";
const docker = (args) => spawnSync("docker", args, { encoding: "utf8" });
const psql = (container, args) => docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...args]);

function concurrentPsql(container, sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("Stage 2 policy boundaries are atomic on PostgreSQL 17", { timeout: 120000 }, async () => {
  const container = `neolearn-ai-credit-policy-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    const started = docker(["run", "--detach", "--name", container, "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`, "--mount", `type=bind,source=${repository},target=/workspace,readonly`, image]);
    assert.equal(started.status, 0, started.stderr);
    let ready = false;
    for (let i = 0; i < 80; i += 1) if (psql(container, ["-c", "select 1"]).status === 0) { ready = true; break; }
    assert.equal(ready, true);
    assert.match(psql(container, ["-A", "-t", "-c", "show server_version"]).stdout.trim(), /^17\./);
    const fixture = psql(container, ["-f", "/workspace/tests/postgres/aiCreditPolicyV1.behavior.sql"]);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const call = "select public.create_ai_credit_entitlement_shadow('student:quarterly','10000000-0000-0000-0000-000000000003','subscription:q:period:1','2026-01-01Z','2026-04-01Z','subscription:q')";
    const results = await Promise.all([concurrentPsql(container, call), concurrentPsql(container, call)]);
    assert.deepEqual(results.map((result) => result.status), [0, 0], JSON.stringify(results));
    const count = psql(container, ["-A", "-t", "-c", "select count(*) || ':' || sum(credit_amount) from public.ai_credit_grant_tranches g join public.ai_credit_entitlement_periods e on e.id=g.entitlement_period_id where e.entitlement_identity='subscription:q:period:1'"]);
    assert.equal(count.stdout.trim(), "3:36000");

    const conflictingGrants = await Promise.all([
      concurrentPsql(container, "select public.create_ai_credit_entitlement_shadow('student:grant-race','10000000-0000-0000-0000-000000000002','grant-race','2026-05-01Z','2026-05-31Z','sub-a')"),
      concurrentPsql(container, "select public.create_ai_credit_entitlement_shadow('student:grant-race','10000000-0000-0000-0000-000000000002','grant-race','2026-05-01Z','2026-05-31Z','sub-b')"),
    ]);
    assert.equal(conflictingGrants.filter((result) => result.status === 0).length, 1, JSON.stringify(conflictingGrants));
    assert.equal(conflictingGrants.filter((result) => result.status !== 0).length, 1, JSON.stringify(conflictingGrants));

    const concurrentTrials = await Promise.all([
      concurrentPsql(container, "select public.create_ai_credit_entitlement_shadow('student:trial-race','10000000-0000-0000-0000-000000000001','trial-race-a','2026-06-01Z','2026-06-20Z',null)"),
      concurrentPsql(container, "select public.create_ai_credit_entitlement_shadow('student:trial-race','10000000-0000-0000-0000-000000000001','trial-race-b','2026-06-01Z','2026-06-20Z',null)"),
    ]);
    assert.equal(concurrentTrials.filter((result) => result.status === 0).length, 1, JSON.stringify(concurrentTrials));
    assert.equal(concurrentTrials.filter((result) => result.status !== 0).length, 1, JSON.stringify(concurrentTrials));
    const raceCount = psql(container, ["-A", "-t", "-c", "select count(*) from public.ai_credit_entitlement_periods where student_id in ('student:grant-race','student:trial-race')"]);
    assert.equal(raceCount.stdout.trim(), "2");
  } finally { docker(["rm", "--force", container]); }
});
