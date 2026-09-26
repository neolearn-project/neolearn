import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const image = process.env.NEOLEARN_AI_CREDIT_POSTGRES_IMAGE ?? "postgres:17";
const database = "neolearn_ai_credit_stage4_fixture";
const docker = (args) => spawnSync("docker", args, { encoding: "utf8" });
const psql = (container, args) => docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...args]);

function concurrentPsql(container, sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("Stage 4 operational monitoring behaves on PostgreSQL 17", { timeout: 120000 }, async () => {
  assert.match(image, /^postgres:17(?:\D|$)/);
  const container = `neolearn-ai-credit-stage4-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    const started = docker(["run", "--detach", "--name", container, "-e", "POSTGRES_PASSWORD=fixture-password",
      "-e", `POSTGRES_DB=${database}`, "--mount", `type=bind,source=${repository},target=/workspace,readonly`, image]);
    assert.equal(started.status, 0, started.error?.message || started.stderr);
    let ready = false;
    for (let i=0;i<80;i+=1) if (psql(container,["-c","select 1"]).status===0) { ready=true; break; }
    assert.equal(ready,true);
    assert.match(psql(container,["-A","-t","-c","show server_version"]).stdout.trim(),/^17\./);
    const fixture=psql(container,["-f","/workspace/tests/postgres/aiCreditOperationalMonitoring.behavior.sql"]);
    assert.equal(fixture.status,0,fixture.stderr||fixture.stdout);
    const query="select public.read_ai_credit_operational_monitor('2026-01-10T12:00:00Z',50,interval '30 minutes',9000,false)::text";
    const reads=await Promise.all(Array.from({length:8},()=>concurrentPsql(container,query)));
    assert.deepEqual(reads.map(({status})=>status),Array(8).fill(0),JSON.stringify(reads));
    assert.equal(new Set(reads.map(({stdout})=>stdout.trim())).size,1,"concurrent reads differed");
  } finally { docker(["rm","--force",container]); }
});
