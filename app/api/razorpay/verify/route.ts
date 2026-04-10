import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  }
  return createClient(supabaseUrl, supabaseKey);
}

function addDaysIso(startIso: string, days: number) {
  const d = new Date(startIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
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

    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || "";
    if (!razorpaySecret) {
      return NextResponse.json(
        { ok: false, error: "RAZORPAY_KEY_SECRET missing." },
        { status: 500 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
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

    const nowIso = new Date().toISOString();
    const endAtIso = addDaysIso(nowIso, Number(plan.validity_days));

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
      return NextResponse.json(
        { ok: false, error: subError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Payment verified and subscription activated.",
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
