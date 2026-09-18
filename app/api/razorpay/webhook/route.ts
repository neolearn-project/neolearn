import { createClient } from "@supabase/supabase-js";
import {
  capturedPaymentFromWebhook,
  finalizeCapturedWebhookPayment,
  isSupportedSuccessfulWebhookEvent,
  webhookSignatureMatches,
} from "@/app/lib/razorpayWebhookCore.mjs";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase admin env missing.");
  return createClient(supabaseUrl, supabaseKey);
}

async function getRawBody(req: Request) {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret missing", { status: 500 });
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers.get("x-razorpay-signature") || "";

  if (!webhookSignatureMatches(rawBody, signature, webhookSecret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const capturedPayment = capturedPaymentFromWebhook(event);
  if (!capturedPayment) {
    if (isSupportedSuccessfulWebhookEvent(event)) {
      return new Response("Invalid successful payment payload", { status: 422 });
    }
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const supabase = getSupabase();
    const processed = await finalizeCapturedWebhookPayment(supabase, capturedPayment);
    if (!processed.ok && processed.error === "lookup") {
      console.error("payment webhook lookup failed");
      return new Response("Webhook processing failed", { status: 500 });
    }
    if (!processed.ok && processed.error === "not_found") {
      return new Response("Payment order not found", { status: 404 });
    }
    if (!processed.ok && processed.error === "conflict") {
      return new Response("Payment details conflict", { status: 409 });
    }
    if (!processed.ok) {
      const rpcMessage = String(processed.rpcMessage || "");
      if (rpcMessage.includes("PAYMENT_NOT_FOUND")) {
        return new Response("Payment order not found", { status: 404 });
      }
      if (rpcMessage.includes("PAYMENT_CONFLICT")) {
        return new Response("Payment details conflict", { status: 409 });
      }
      console.error("payment webhook finalization failed");
      return new Response("Webhook processing failed", { status: 500 });
    }

    return Response.json({
      ok: true,
      alreadyProcessed: !!processed.finalization?.already_processed,
    });
  } catch {
    console.error("payment webhook processing failed");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
