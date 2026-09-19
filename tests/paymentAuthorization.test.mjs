import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const createOrder = await readFile(
  new URL("../app/api/razorpay/create-order/route.ts", import.meta.url),
  "utf8"
);
const verify = await readFile(
  new URL("../app/api/razorpay/verify/route.ts", import.meta.url),
  "utf8"
);
const studentPage = await readFile(
  new URL("../app/student/page.tsx", import.meta.url),
  "utf8"
);
const webhook = await readFile(
  new URL("../app/api/razorpay/webhook/route.ts", import.meta.url),
  "utf8"
);
const migration = await readFile(
  new URL("../supabase/migrations/20260917_atomic_razorpay_finalization.sql", import.meta.url),
  "utf8"
);
const paymentCore = await readFile(
  new URL("../app/lib/razorpayPaymentCore.mjs", import.meta.url),
  "utf8"
);
const webhookCore = await readFile(
  new URL("../app/lib/razorpayWebhookCore.mjs", import.meta.url),
  "utf8"
);

test("unauthorized payment requests are rejected through the ownership contract", () => {
  for (const route of [createOrder, verify]) {
    assert.match(route, /await requireStudentMobile\(req, studentMobile\)/);
    assert.match(route, /e instanceof OwnershipError/);
    assert.match(route, /ownershipErrorResponse\(e\)/);
  }
});

test("body-mobile mismatch is rejected and valid authenticated identity is accepted", () => {
  for (const route of [createOrder, verify]) {
    assert.match(route, /requireStudentMobile/);
  }
  assert.match(verify, /authenticatedMobile: studentMobile/);
  assert.match(paymentCore, /p_student_mobile: storedMobile/);
  assert.match(migration, /payment_row\.student_mobile is distinct from p_student_mobile/);
});

test("browser payment calls send existing student bearer-auth headers", () => {
  const paymentCalls = studentPage.match(/fetch\("\/api\/razorpay\/(?:create-order|verify)"[\s\S]*?headers: studentAuthHeaders\(true\)/g) || [];
  assert.equal(paymentCalls.length, 2);
});

test("signed webhook remains isolated from browser student authorization", () => {
  assert.doesNotMatch(webhook, /requireStudentMobile|studentAuthHeaders|OwnershipError/);
  assert.match(webhook, /x-razorpay-signature/);
  assert.match(webhook, /webhookSignatureMatches/);
  assert.match(webhook, /finalizeCapturedWebhookPayment/);
  assert.match(webhookCore, /finalize_razorpay_student_payment/);
});

test("verify delegates all subscription and payment mutation to the atomic RPC", () => {
  assert.match(verify, /verifyProviderAndFinalize/);
  assert.match(paymentCore, /finalize_razorpay_student_payment/);
  assert.doesNotMatch(verify, /\.from\("student_subscriptions"\)/);
  assert.doesNotMatch(verify, /\.from\("student_payments"\)/);
});
