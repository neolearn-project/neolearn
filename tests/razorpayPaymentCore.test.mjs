import test from "node:test";
import assert from "node:assert/strict";
import { rupeesToPaise } from "../app/lib/paymentAmount.mjs";
import { verifyProviderAndFinalize } from "../app/lib/razorpayPaymentCore.mjs";

function clients(overrides = {}) {
  const stored = overrides.stored || {
    student_mobile: "9999999999",
    plan_code: "REGULAR",
    amount: "499.00",
    currency: "INR",
    purchase_validity_days: 30,
  };
  const rpcCalls = [];
  const supabase = {
    from() {
      return { select() { return { eq() { return { async maybeSingle() {
        return { data: stored, error: null };
      } }; } }; } };
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return overrides.rpcResult || {
        data: { ok: true, already_processed: false, is_active: true, recovered: false,
          start_at: "2026-09-17T00:00:00Z", end_at: "2026-10-17T00:00:00Z" },
        error: null,
      };
    },
  };
  const order = overrides.order || { amount: 49900, currency: "INR", notes: {
    student_mobile: stored.student_mobile, plan_code: stored.plan_code,
  } };
  const payment = overrides.payment || { id: "pay_1", order_id: "order_1", amount: 49900,
    currency: "INR", status: "captured", captured: true };
  const razorpay = {
    orders: { async fetch() { return order; } },
    payments: {
      async fetch() { return payment; },
      async capture() { return { ...payment, status: "captured", captured: true }; },
    },
  };
  return { supabase, razorpay, rpcCalls };
}

function run(c) {
  return verifyProviderAndFinalize({ razorpay: c.razorpay, supabase: c.supabase,
    orderId: "order_1", paymentId: "pay_1", authenticatedMobile: "9999999999",
    requestedPlanCode: "REGULAR", paymentSignature: "signature", source: "verify" });
}

test("decimal money conversion is exact and rejects unsafe input", () => {
  assert.equal(rupeesToPaise("499.00"), 49900);
  assert.equal(rupeesToPaise("0.01"), 1);
  for (const value of [null, "", "0", "1.001", "1e3", "-1", "90071992547410"]) {
    assert.equal(rupeesToPaise(value), null);
  }
});

test("stored purchase snapshot drives provider comparison and RPC", async () => {
  const c = clients();
  const result = await run(c);
  assert.equal(result.ok, true);
  assert.equal(c.rpcCalls.length, 1);
  assert.equal(c.rpcCalls[0].args.p_amount_paise, 49900);
  assert.equal(c.rpcCalls[0].args.p_student_mobile, "9999999999");
  assert.equal(c.rpcCalls[0].args.p_plan_code, "REGULAR");
});

test("ownership conflict stops before provider finalization", async () => {
  const c = clients();
  const result = await verifyProviderAndFinalize({ razorpay: c.razorpay, supabase: c.supabase,
    orderId: "order_1", paymentId: "pay_1", authenticatedMobile: "8888888888",
    requestedPlanCode: "REGULAR", paymentSignature: "signature" });
  assert.deepEqual(result, { error: "conflict", status: 409 });
  assert.equal(c.rpcCalls.length, 0);
});

test("provider amount and order conflicts never call RPC", async () => {
  const amountConflict = clients({ order: { amount: 50000, currency: "INR", notes: {
    student_mobile: "9999999999", plan_code: "REGULAR" } } });
  assert.equal((await run(amountConflict)).error, "provider_amount");
  assert.equal(amountConflict.rpcCalls.length, 0);

  const orderConflict = clients({ payment: { order_id: "other", amount: 49900,
    currency: "INR", status: "captured", captured: true } });
  assert.equal((await run(orderConflict)).error, "provider_order");
  assert.equal(orderConflict.rpcCalls.length, 0);
});

test("duplicate and recovered RPC results retain their original periods", async () => {
  const fixed = { ok: true, already_processed: true, recovered: true, is_active: false,
    start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-31T00:00:00Z" };
  const c = clients({ rpcResult: { data: fixed, error: null } });
  const first = await run(c);
  const second = await run(c);
  assert.deepEqual(first.finalization, fixed);
  assert.deepEqual(second.finalization, fixed);
  assert.equal(c.rpcCalls.length, 2);
});

test("concurrent requests delegate identical immutable claims to the serialized RPC", async () => {
  const c = clients();
  const [a, b] = await Promise.all([run(c), run(c)]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(c.rpcCalls[0].args, c.rpcCalls[1].args);
});
