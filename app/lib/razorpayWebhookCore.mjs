import crypto from "node:crypto";

export function webhookSignatureMatches(rawBody, suppliedSignature, secret) {
  if (!secret || !suppliedSignature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(String(suppliedSignature), "utf8");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export function capturedPaymentFromWebhook(event) {
  if (!isSupportedSuccessfulWebhookEvent(event)) return null;

  const payment = event?.payload?.payment?.entity;
  const order = event?.payload?.order?.entity;
  if (!payment || payment.status !== "captured") return null;

  const paymentOrderId = String(payment.order_id || "").trim();
  const payloadOrderId = String(order?.id || "").trim();
  if (paymentOrderId && payloadOrderId && paymentOrderId !== payloadOrderId) return null;

  const orderId = paymentOrderId || payloadOrderId;
  const paymentId = String(payment.id || "").trim();
  const amountPaise = Number(payment.amount);
  const currency = String(payment.currency || order?.currency || "").trim().toUpperCase();
  const notes = order?.notes || payment.notes || {};

  if (!orderId || !paymentId || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !currency) {
    return null;
  }

  return {
    orderId,
    paymentId,
    amountPaise,
    currency,
    noteStudentMobile: String(notes.student_mobile || "").trim(),
    notePlanCode: String(notes.plan_code || "").trim().toUpperCase(),
  };
}

export function isSupportedSuccessfulWebhookEvent(event) {
  return !!event && ["payment.captured", "order.paid"].includes(event.event);
}

export async function finalizeCapturedWebhookPayment(supabase, capturedPayment) {
  const { data: storedPayment, error: lookupError } = await supabase
    .from("student_payments")
    .select("student_mobile, plan_code")
    .eq("razorpay_order_id", capturedPayment.orderId)
    .maybeSingle();
  if (lookupError) return { error: "lookup", status: 500 };
  if (!storedPayment) return { error: "not_found", status: 404 };

  const storedMobile = String(storedPayment.student_mobile || "").trim();
  const storedPlanCode = String(storedPayment.plan_code || "").trim().toUpperCase();
  if (
    (capturedPayment.noteStudentMobile && capturedPayment.noteStudentMobile !== storedMobile) ||
    (capturedPayment.notePlanCode && capturedPayment.notePlanCode !== storedPlanCode)
  ) return { error: "conflict", status: 409 };

  const { data, error } = await supabase.rpc("finalize_razorpay_student_payment", {
    p_order_id: capturedPayment.orderId,
    p_payment_id: capturedPayment.paymentId,
    p_student_mobile: storedMobile,
    p_plan_code: storedPlanCode,
    p_amount_paise: capturedPayment.amountPaise,
    p_currency: capturedPayment.currency,
    p_source: "webhook",
    p_payment_signature: null,
  });
  if (error) return { error: "rpc", status: 500, rpcMessage: String(error.message || "") };
  const finalization = Array.isArray(data) ? data[0] : data;
  if (!finalization?.ok) return { error: "rpc", status: 500, rpcMessage: "" };
  return { ok: true, finalization };
}
