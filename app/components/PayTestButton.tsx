"use client";

export default function PayTestButton() {
  const payNow = async () => {
    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 10, plan: "test_weekly", mobile: "9999999999" }),
    });

    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Failed to create order");
      return;
    }

    const order = data.order;

    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      alert("Razorpay script not loaded. Check layout.tsx <script> tag.");
      return;
    }

    const rzp = new Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: "NeoLearn",
      description: "Test Payment",
      order_id: order.id,
      handler: function () {
        alert("Payment done ✅. Now webhook will confirm.");
      },
      prefill: {
        name: "NeoLearn Tester",
        contact: "9999999999",
      },
      theme: { color: "#2563eb" },
    });

    rzp.open();
  };

  return (
    <button
      onClick={payNow}
      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      Pay ₹10 (Live Test)
    </button>
  );
}
