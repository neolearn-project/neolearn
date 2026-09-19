import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentMobile,
} from "@/lib/auth/ownership";
import { verifyProviderAndFinalize } from "@/app/lib/razorpayPaymentCore.mjs";

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

    await requireStudentMobile(req, studentMobile);

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

    const processed = await verifyProviderAndFinalize({
      razorpay,
      supabase,
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      authenticatedMobile: studentMobile,
      requestedPlanCode: planCode,
      paymentSignature: razorpaySignature,
      source: "verify",
    });

    if (!processed.ok) {
      const rpcMessage = String(processed.rpcMessage || "");
      if (rpcMessage.includes("PAYMENT_NOT_FOUND")) {
        return NextResponse.json(
          { ok: false, error: "Original payment order record not found." },
          { status: 404 }
        );
      }
      if (rpcMessage.includes("PAYMENT_CONFLICT")) {
        return NextResponse.json(
          { ok: false, error: "Stored payment order does not match Razorpay." },
          { status: 409 }
        );
      }
      if (processed.error === "not_found") {
        return NextResponse.json(
          { ok: false, error: "Original payment order record not found." },
          { status: 404 }
        );
      }
      if (processed.error === "conflict") {
        return NextResponse.json(
          { ok: false, error: "Stored payment order does not match Razorpay." },
          { status: 409 }
        );
      }
      if (processed.error === "provider_order") {
        return NextResponse.json(
          { ok: false, error: "Payment does not belong to the submitted order." },
          { status: 400 }
        );
      }
      if (["provider_amount", "captured_amount"].includes(String(processed.error || ""))) {
        return NextResponse.json(
          { ok: false, error: "Payment amount or currency mismatch." },
          { status: 400 }
        );
      }
      if (processed.error === "provider_details") {
        return NextResponse.json(
          { ok: false, error: "Payment order details do not match the request." },
          { status: 400 }
        );
      }
      if (processed.error === "not_captured") {
        return NextResponse.json(
          { ok: false, error: `Payment is not captured (status: ${processed.providerStatus}).` },
          { status: 400 }
        );
      }
      console.error("payment verification or finalization failed");
      return NextResponse.json(
        { ok: false, error: "Payment finalization failed." },
        { status: 500 }
      );
    }

    const finalization: any = processed.finalization;
    const storedPayment: any = processed.storedPayment;

    if (finalization.already_processed) {
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

    const nowIso = String(finalization.start_at || "");
    const endAtIso = String(finalization.end_at || "");
    const subscriptionIsActive = finalization.is_active === true;

    const { data: plan } = await supabase
      .from("plans")
      .select("code, name")
      .eq("code", storedPayment.plan_code)
      .maybeSingle();

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
      const planName = safeText(plan?.name, storedPayment.plan_code);
      const amountText = (storedPayment.amountPaise / 100).toFixed(2);
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
        whatsappPaymentError = "Parent mobile not found for this student.";
      }
    } catch {
      whatsappPaymentError = "Payment WhatsApp send failed.";
      console.error("payment success notification failed");
    }

    return NextResponse.json({
      ok: true,
      message: subscriptionIsActive
        ? finalization.recovered
          ? "Payment verified and subscription recovered."
          : "Payment verified and subscription activated."
        : "Payment verified; the recovered subscription period is not active.",
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
        plan_code: storedPayment.plan_code,
        payment_status: "paid",
        is_active: subscriptionIsActive,
        start_at: nowIso,
        end_at: endAtIso,
      },
    });
  } catch (e: any) {
    if (e instanceof OwnershipError) return ownershipErrorResponse(e);
    console.error("verify payment request failed");
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
