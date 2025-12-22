import crypto from "crypto";

export const runtime = "nodejs";

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

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (expected !== signature) {
    console.error("Webhook signature mismatch");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody.toString("utf8"));

  // ✅ Typical event: "payment.captured"
  // For now just log it. Next we’ll update Supabase and unlock access.
  console.log("✅ Razorpay webhook event:", event?.event);

  return Response.json({ ok: true });
}
