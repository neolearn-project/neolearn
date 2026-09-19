import { rupeesToPaise } from "./paymentAmount.mjs";

export async function verifyProviderAndFinalize({
  razorpay,
  supabase,
  orderId,
  paymentId,
  authenticatedMobile,
  requestedPlanCode,
  paymentSignature,
  source = "verify",
}) {
  const { data: storedPayment, error: storedError } = await supabase
    .from("student_payments")
    .select("student_mobile, plan_code, amount, currency, purchase_validity_days")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (storedError) return { error: "lookup", status: 500 };
  if (!storedPayment) return { error: "not_found", status: 404 };

  const storedMobile = String(storedPayment.student_mobile || "").trim();
  const storedPlanCode = String(storedPayment.plan_code || "").trim().toUpperCase();
  const storedCurrency = String(storedPayment.currency || "").trim().toUpperCase();
  const storedAmountPaise = rupeesToPaise(storedPayment.amount);
  const storedValidityDays = Number(storedPayment.purchase_validity_days);

  if (
    storedMobile !== authenticatedMobile ||
    storedPlanCode !== requestedPlanCode ||
    storedCurrency !== "INR" ||
    storedAmountPaise === null ||
    !Number.isSafeInteger(storedValidityDays) ||
    storedValidityDays <= 0
  ) {
    return { error: "conflict", status: 409 };
  }

  const [providerOrder, initialProviderPayment] = await Promise.all([
    razorpay.orders.fetch(orderId),
    razorpay.payments.fetch(paymentId),
  ]);

  const orderAmount = Number(providerOrder.amount);
  const orderCurrency = String(providerOrder.currency || "").toUpperCase();
  const paymentAmount = Number(initialProviderPayment.amount);
  const paymentCurrency = String(initialProviderPayment.currency || "").toUpperCase();
  const orderStudentMobile = String(providerOrder.notes?.student_mobile ?? "").trim();
  const orderPlanCode = String(providerOrder.notes?.plan_code ?? "").trim().toUpperCase();

  if (initialProviderPayment.order_id !== orderId) return { error: "provider_order", status: 400 };
  if (
    !Number.isSafeInteger(orderAmount) ||
    !Number.isSafeInteger(paymentAmount) ||
    orderAmount !== storedAmountPaise ||
    paymentAmount !== storedAmountPaise ||
    orderCurrency !== storedCurrency ||
    paymentCurrency !== storedCurrency
  ) return { error: "provider_amount", status: 400 };
  if (orderStudentMobile !== storedMobile || orderPlanCode !== storedPlanCode) {
    return { error: "provider_details", status: 400 };
  }

  let providerPayment = initialProviderPayment;
  if (providerPayment.status === "authorized") {
    try {
      providerPayment = await razorpay.payments.capture(paymentId, orderAmount, orderCurrency);
    } catch (captureError) {
      providerPayment = await razorpay.payments.fetch(paymentId);
      if (providerPayment.status !== "captured") throw captureError;
    }
  }
  if (providerPayment.status !== "captured" || !providerPayment.captured) {
    return { error: "not_captured", status: 400, providerStatus: String(providerPayment.status || "") };
  }
  if (
    Number(providerPayment.amount) !== storedAmountPaise ||
    String(providerPayment.currency || "").toUpperCase() !== storedCurrency
  ) return { error: "captured_amount", status: 400 };

  const { data, error } = await supabase.rpc("finalize_razorpay_student_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_student_mobile: storedMobile,
    p_plan_code: storedPlanCode,
    p_amount_paise: storedAmountPaise,
    p_currency: storedCurrency,
    p_source: source,
    p_payment_signature: source === "verify" ? paymentSignature : null,
  });
  if (error) return { error: "rpc", status: 500, rpcMessage: String(error.message || "") };
  const finalization = Array.isArray(data) ? data[0] : data;
  if (!finalization?.ok) return { error: "rpc", status: 500, rpcMessage: "" };
  return { ok: true, finalization, storedPayment: { ...storedPayment, amountPaise: storedAmountPaise } };
}
