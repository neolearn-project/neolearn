import { NextResponse } from "next/server";
import Razorpay from "razorpay";
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

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID || "";
  const key_secret = process.env.RAZORPAY_KEY_SECRET || "";

  if (!key_id || !key_secret) {
    throw new Error("Razorpay keys missing.");
  }

  return {
    keyId: key_id,
    instance: new Razorpay({ key_id, key_secret }),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const studentMobile = String(body?.studentMobile || "").trim();
    const planCode = String(body?.planCode || "").trim().toUpperCase();

    if (!/^\d{10}$/.test(studentMobile)) {
      return NextResponse.json(
        { ok: false, error: "Invalid student mobile." },
        { status: 400 }
      );
    }

    if (!planCode) {
      return NextResponse.json(
        { ok: false, error: "Plan code is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, code, name, track, price, validity_days, is_active, sort_order")
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
        { ok: false, error: "This plan is currently inactive." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(plan.price) || Number(plan.price) <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan price." },
        { status: 400 }
      );
    }

    const amountPaise = Math.round(Number(plan.price) * 100);

    const { keyId, instance } = getRazorpay();

    const receipt = `nl_${studentMobile}_${plan.code}_${Date.now()}`.slice(0, 40);

    const order = await instance.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        student_mobile: studentMobile,
        plan_code: plan.code,
        plan_name: plan.name,
        track: plan.track,
        validity_days: String(plan.validity_days),
        purpose: "NeoLearn subscription purchase",
      },
    });

    await supabase.from("student_payments").insert({
      student_mobile: studentMobile,
      plan_code: plan.code,
      amount: Number(plan.price),
      currency: "INR",
      payment_status: "created",
      razorpay_order_id: order.id,
      source: "create_order",
      notes: {
        plan_name: plan.name,
        validity_days: plan.validity_days,
        track: plan.track,
      },
    });

    return NextResponse.json({
      ok: true,
      keyId,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      },
      plan: {
        code: plan.code,
        name: plan.name,
        track: plan.track,
        price: plan.price,
        validity_days: plan.validity_days,
      },
      studentMobile,
    });
  } catch (e: any) {
    console.error("create-order error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}


