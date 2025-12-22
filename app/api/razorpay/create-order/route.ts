import Razorpay from "razorpay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ✅ SAFE: allow only small amounts for now (testing mode in live)
    // later we will remove this cap.
    const amountInRupees = Number(body.amountInRupees ?? 10); // default ₹10
    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return Response.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }
    if (amountInRupees > 50) {
      return Response.json(
        { ok: false, error: "Safety cap: max ₹50 allowed in testing." },
        { status: 400 }
      );
    }

    const key_id = process.env.RAZORPAY_KEY_ID!;
    const key_secret = process.env.RAZORPAY_KEY_SECRET!;
    if (!key_id || !key_secret) {
      return Response.json({ ok: false, error: "Razorpay keys missing" }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id, key_secret });

    const order = await razorpay.orders.create({
      amount: Math.round(amountInRupees * 100), // paise
      currency: "INR",
      receipt: `neolearn_rcpt_${Date.now()}`,
      notes: {
        purpose: "NeoLearn initial testing",
      },
    });

    return Response.json({
      ok: true,
      order,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (e: any) {
    console.error("create-order error:", e);
    return Response.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
