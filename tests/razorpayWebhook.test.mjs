import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  capturedPaymentFromWebhook,
  finalizeCapturedWebhookPayment,
  webhookSignatureMatches,
} from "../app/lib/razorpayWebhookCore.mjs";

const webhookRoute = await readFile(
  new URL("../app/api/razorpay/webhook/route.ts", import.meta.url),
  "utf8"
);

const payload = Buffer.from(JSON.stringify({ event: "payment.captured" }));
const secret = "test-only-secret";
const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

test("valid webhook signatures are accepted", () => {
  assert.equal(webhookSignatureMatches(payload, validSignature, secret), true);
});

test("invalid webhook signatures are rejected before parsing or mutation", () => {
  assert.equal(webhookSignatureMatches(payload, "invalid", secret), false);
  assert.ok(
    webhookRoute.indexOf("if (!webhookSignatureMatches") <
      webhookRoute.indexOf("const capturedPayment = capturedPaymentFromWebhook")
  );
  assert.ok(
    webhookRoute.indexOf("if (!webhookSignatureMatches") <
      webhookRoute.indexOf("await finalizeCapturedWebhookPayment")
  );
});

test("payment.captured is normalized for atomic finalization", () => {
  assert.deepEqual(
    capturedPaymentFromWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_1",
            amount: 49900,
            currency: "inr",
            status: "captured",
            notes: { student_mobile: "9999999999", plan_code: "REGULAR" },
          },
        },
      },
    }),
    {
      orderId: "order_1",
      paymentId: "pay_1",
      amountPaise: 49900,
      currency: "INR",
      noteStudentMobile: "9999999999",
      notePlanCode: "REGULAR",
    }
  );
});

test("order.paid duplicate events normalize to the same payment identity", () => {
  const event = {
    event: "order.paid",
    payload: {
      order: { entity: { id: "order_1", notes: { plan_code: "REGULAR" } } },
      payment: {
        entity: {
          id: "pay_1",
          order_id: "order_1",
          amount: 49900,
          currency: "INR",
          status: "captured",
        },
      },
    },
  };
  assert.deepEqual(capturedPaymentFromWebhook(event), capturedPaymentFromWebhook(event));
});

test("non-success events and non-captured payments are ignored", () => {
  assert.equal(capturedPaymentFromWebhook({ event: "payment.failed" }), null);
  assert.equal(
    capturedPaymentFromWebhook({
      event: "payment.captured",
      payload: { payment: { entity: { status: "authorized" } } },
    }),
    null
  );
});

test("conflicting payment and order identifiers cannot normalize", () => {
  assert.equal(capturedPaymentFromWebhook({
    event: "order.paid",
    payload: {
      order: { entity: { id: "order_1" } },
      payment: { entity: { id: "pay_1", order_id: "order_2", amount: 100,
        currency: "INR", status: "captured" } },
    },
  }), null);
});

function webhookDb({ stored = { student_mobile: "9999999999", plan_code: "REGULAR" }, rpc } = {}) {
  const calls = [];
  return {
    calls,
    from() { return { select() { return { eq() { return { async maybeSingle() {
      return { data: stored, error: null };
    } }; } }; } }; },
    async rpc(name, args) {
      calls.push({ name, args });
      return rpc || { data: { ok: true, already_processed: false }, error: null };
    },
  };
}

const normalized = {
  orderId: "order_1", paymentId: "pay_1", amountPaise: 49900, currency: "INR",
  noteStudentMobile: "9999999999", notePlanCode: "REGULAR",
};

test("webhook finalization derives ownership from mocked database state", async () => {
  const db = webhookDb();
  const result = await finalizeCapturedWebhookPayment(db, normalized);
  assert.equal(result.ok, true);
  assert.equal(db.calls[0].args.p_student_mobile, "9999999999");
  assert.equal(db.calls[0].args.p_plan_code, "REGULAR");
});

test("webhook ownership conflicts stop before RPC", async () => {
  const db = webhookDb({ stored: { student_mobile: "8888888888", plan_code: "REGULAR" } });
  assert.deepEqual(await finalizeCapturedWebhookPayment(db, normalized), { error: "conflict", status: 409 });
  assert.equal(db.calls.length, 0);
});

test("duplicate webhook result is passed through without another mutation layer", async () => {
  const db = webhookDb({ rpc: { data: { ok: true, already_processed: true }, error: null } });
  const result = await finalizeCapturedWebhookPayment(db, normalized);
  assert.equal(result.finalization.already_processed, true);
  assert.equal(db.calls.length, 1);
});
