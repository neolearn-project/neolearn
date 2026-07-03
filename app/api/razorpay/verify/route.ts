import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PAYMENT_SUCCESS_TEMPLATE =
  process.env.WA_TEMPLATE_PAYMENT_SUCCESS_PARENT || "neolearn_payment_success_parent";

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  }
  return createClient(supabaseUrl, supabaseKey);
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys missing.");
  }

  return {
    keySecret,
    instance: new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    }),
  };
}

function signaturesMatch(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function addDaysIso(startIso: string, days: number) {
  const d = new Date(startIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function safeText(value: any, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeMobileForMatch(value: any) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

function formatDateForWhatsApp(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const studentMobile = String(body?.studentMobile || "").trim();
    const planCode = String(body?.planCode || "").trim().toUpperCase();
    const razorpayOrderId = String(body?.razorpay_order_id || "").trim();
    const razorpayPaymentId = String(body?.razorpay_payment_id || "").trim();
    const razorpaySignature = String(body?.razorpay_signature || "").trim();

    if (!/^\d{10}$/.test(studentMobile)) {
      return NextResponse.json(
        { ok: false, error: "Invalid student mobile." },
        { status: 400 }
      );
    }

    if (!planCode || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { ok: false, error: "Missing required payment verification fields." },
        { status: 400 }
      );
    }

    const { keySecret: razorpaySecret, instance: razorpay } = getRazorpay();

    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (!signaturesMatch(expectedSignature, razorpaySignature)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payment signature." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("code, name, track, price, validity_days, is_active")
      .eq("code", planCode)
      .maybeSingle();

    if (planError) {
      return NextResponse.json(
        { ok: false, error: planError.message },
        { status: 500 }
      );
    }

    if (!plan) {
      return NextResponse.json(
        { ok: false, error: "Plan not found." },
        { status: 404 }
      );
    }

    if (!plan.is_active) {
      return NextResponse.json(
        { ok: false, error: "This plan is inactive." },
        { status: 400 }
      );
    }

    const expectedAmountPaise = Math.round(Number(plan.price) * 100);
    const expectedCurrency = "INR";

    if (!Number.isFinite(expectedAmountPaise) || expectedAmountPaise <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan price." },
        { status: 400 }
      );
    }

    const [providerOrder, initialProviderPayment] = await Promise.all([
      razorpay.orders.fetch(razorpayOrderId),
      razorpay.payments.fetch(razorpayPaymentId),
    ]);

    const orderAmount = Number(providerOrder.amount);
    const orderCurrency = String(providerOrder.currency || "").toUpperCase();
    const paymentAmount = Number(initialProviderPayment.amount);
    const paymentCurrency = String(initialProviderPayment.currency || "").toUpperCase();
    const orderStudentMobile = String(
      providerOrder.notes?.student_mobile ?? ""
    ).trim();
    const orderPlanCode = String(providerOrder.notes?.plan_code ?? "")
      .trim()
      .toUpperCase();

    if (initialProviderPayment.order_id !== razorpayOrderId) {
      return NextResponse.json(
        { ok: false, error: "Payment does not belong to the submitted order." },
        { status: 400 }
      );
    }

    if (
      orderAmount !== expectedAmountPaise ||
      paymentAmount !== orderAmount ||
      orderCurrency !== expectedCurrency ||
      paymentCurrency !== orderCurrency
    ) {
      return NextResponse.json(
        { ok: false, error: "Payment amount or currency mismatch." },
        { status: 400 }
      );
    }

    if (
      orderStudentMobile !== studentMobile ||
      orderPlanCode !== planCode
    ) {
      return NextResponse.json(
        { ok: false, error: "Payment order details do not match the request." },
        { status: 400 }
      );
    }

    let providerPayment = initialProviderPayment;

    if (providerPayment.status === "authorized") {
      try {
        providerPayment = await razorpay.payments.capture(
          razorpayPaymentId,
          orderAmount,
          orderCurrency
        );
      } catch (captureError) {
        // Auto-capture can complete between fetch and capture. Re-fetch before failing.
        providerPayment = await razorpay.payments.fetch(razorpayPaymentId);
        if (providerPayment.status !== "captured") {
          throw captureError;
        }
      }
    }

    if (providerPayment.status !== "captured" || !providerPayment.captured) {
      return NextResponse.json(
        {
          ok: false,
          error: `Payment is not captured (status: ${providerPayment.status}).`,
        },
        { status: 400 }
      );
    }

    if (
      Number(providerPayment.amount) !== orderAmount ||
      String(providerPayment.currency || "").toUpperCase() !== orderCurrency
    ) {
      return NextResponse.json(
        { ok: false, error: "Captured payment amount or currency mismatch." },
        { status: 400 }
      );
    }

    const { data: paymentIdRows, error: paymentIdLookupError } = await supabase
      .from("student_payments")
      .select("id, razorpay_order_id, razorpay_payment_id, payment_status")
      .eq("razorpay_payment_id", razorpayPaymentId)
      .limit(1);

    if (paymentIdLookupError) {
      return NextResponse.json(
        { ok: false, error: paymentIdLookupError.message },
        { status: 500 }
      );
    }

    const existingPaymentIdRow = paymentIdRows?.[0] || null;
    if (existingPaymentIdRow) {
      if (
        existingPaymentIdRow.razorpay_order_id === razorpayOrderId &&
        existingPaymentIdRow.payment_status === "paid"
      ) {
        return NextResponse.json({
          ok: true,
          alreadyProcessed: true,
          message: "Payment was already verified.",
          payment: {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
          },
        });
      }

      return NextResponse.json(
        { ok: false, error: "Payment is already being processed or was previously used." },
        { status: 409 }
      );
    }

    const { data: paymentRecord, error: paymentRecordError } = await supabase
      .from("student_payments")
      .select(
        "id, student_mobile, plan_code, amount, currency, payment_status, razorpay_payment_id"
      )
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (paymentRecordError) {
      return NextResponse.json(
        { ok: false, error: paymentRecordError.message },
        { status: 500 }
      );
    }

    if (!paymentRecord) {
      return NextResponse.json(
        { ok: false, error: "Original payment order record not found." },
        { status: 404 }
      );
    }

    if (
      paymentRecord.student_mobile !== studentMobile ||
      String(paymentRecord.plan_code || "").toUpperCase() !== planCode ||
      Math.round(Number(paymentRecord.amount) * 100) !== orderAmount ||
      String(paymentRecord.currency || "").toUpperCase() !== orderCurrency
    ) {
      return NextResponse.json(
        { ok: false, error: "Stored payment order does not match Razorpay." },
        { status: 409 }
      );
    }

    if (
      paymentRecord.payment_status === "paid" &&
      paymentRecord.razorpay_payment_id === razorpayPaymentId
    ) {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        message: "Payment was already verified.",
        payment: {
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
        },
      });
    }

    if (paymentRecord.payment_status !== "created" || paymentRecord.razorpay_payment_id) {
      return NextResponse.json(
        { ok: false, error: "Payment order is not available for verification." },
        { status: 409 }
      );
    }

    const claimTime = new Date().toISOString();
    const { data: claimedPayment, error: claimError } = await supabase
      .from("student_payments")
      .update({
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        source: "verify",
        updated_at: claimTime,
        notes: {
          validity_days: plan.validity_days,
          track: plan.track,
          provider_payment_status: providerPayment.status,
        },
      })
      .eq("id", paymentRecord.id)
      .eq("payment_status", "created")
      .is("razorpay_payment_id", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      return NextResponse.json(
        { ok: false, error: claimError.message },
        { status: 500 }
      );
    }

    if (!claimedPayment) {
      return NextResponse.json(
        { ok: false, error: "Payment is already being processed." },
        { status: 409 }
      );
    }

    const releasePaymentClaim = async () => {
      const { error } = await supabase
        .from("student_payments")
        .update({
          razorpay_payment_id: null,
          razorpay_signature: null,
          source: "create_order",
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRecord.id)
        .eq("payment_status", "created")
        .eq("razorpay_payment_id", razorpayPaymentId);

      if (error) {
        console.error("payment claim release failed:", error);
      }
    };

    const nowIso = new Date().toISOString();
    const endAtIso = addDaysIso(nowIso, Number(plan.validity_days));

    const { error: deactivateError } = await supabase
      .from("student_subscriptions")
      .update({ is_active: false })
      .eq("student_mobile", studentMobile)
      .eq("is_active", true);

    if (deactivateError) {
      await releasePaymentClaim();
      return NextResponse.json(
        { ok: false, error: deactivateError.message },
        { status: 500 }
      );
    }

    const { error: subError } = await supabase.from("student_subscriptions").insert({
      student_mobile: studentMobile,
      plan_code: plan.code,
      payment_status: "paid",
      is_active: true,
      start_at: nowIso,
      end_at: endAtIso,
      created_at: nowIso,
    });

    if (subError) {
      await releasePaymentClaim();
      return NextResponse.json(
        { ok: false, error: subError.message },
        { status: 500 }
      );
    }

    const { data: completedPayment, error: completePaymentError } = await supabase
      .from("student_payments")
      .update({
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id)
      .eq("payment_status", "created")
      .eq("razorpay_payment_id", razorpayPaymentId)
      .select("id")
      .maybeSingle();

    if (completePaymentError || !completedPayment) {
      console.error("payment completion update failed:", completePaymentError);
      return NextResponse.json(
        { ok: false, error: "Subscription activated but payment finalization failed." },
        { status: 500 }
      );
    }

    let whatsappPaymentSent = false;
    let whatsappPaymentError: string | null = null;
    let whatsappPaymentTo: string | null = null;

    try {
      const { data: childLinks, error: childLinkError } = await supabase
        .from("children")
        .select("parent_mobile, child_mobile, child_name");

      if (childLinkError) {
        whatsappPaymentError = childLinkError.message;
      }

      const normalizedStudentMobile = normalizeMobileForMatch(studentMobile);
      const childLink = (childLinks || []).find((row: any) => {
        return normalizeMobileForMatch(row.child_mobile) === normalizedStudentMobile;
      });

      const parentMobile = safeText(childLink?.parent_mobile, "");
      const studentName = safeText(childLink?.child_name, "Student");
      const planName = safeText(plan.name, plan.code);
      const amountText = String(Number(plan.price));
      const validTill = formatDateForWhatsApp(endAtIso);

      if (parentMobile) {
        await sendWhatsAppTemplate({
          to: parentMobile,
          templateName: PAYMENT_SUCCESS_TEMPLATE,
          languageCode: "en",
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "Parent" },
                { type: "text", text: studentName },
                { type: "text", text: planName },
                { type: "text", text: amountText },
                { type: "text", text: validTill },
              ],
            },
          ],
        });

        whatsappPaymentSent = true;
        whatsappPaymentTo = parentMobile;
      } else {
        whatsappPaymentError = `Parent mobile not found for student ${studentMobile}.`;
      }
    } catch (waErr: any) {
      whatsappPaymentError = waErr?.message || "Payment WhatsApp send failed.";
      console.error("payment success whatsapp failed:", waErr);
    }

    return NextResponse.json({
      ok: true,
      message: "Payment verified and subscription activated.",
      whatsappPayment: {
        sent: whatsappPaymentSent,
        to: whatsappPaymentTo,
        error: whatsappPaymentError,
        template: PAYMENT_SUCCESS_TEMPLATE,
      },
      payment: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
      },
      subscription: {
        student_mobile: studentMobile,
        plan_code: plan.code,
        payment_status: "paid",
        is_active: true,
        start_at: nowIso,
        end_at: endAtIso,
      },
    });
  } catch (e: any) {
    console.error("verify payment error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
