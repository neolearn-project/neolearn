"use client";

import { useState } from "react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function RazorpayPayButton() {
  const [loading, setLoading] = useState(false);

  async function loadScript() {
    return new Promise<boolean>((resolve) => {
      const existing = document.getElementById("rzp-script");
      if (existing) return resolve(true);

      const script = document.createElement("script");
      script.id = "rzp-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  const handlePay = async () => {
    setLoading(true);
    try {
      const ok = await loadScript();
      if (!ok) {
        alert("Failed to load Razorpay Checkout");
        return;
      }

      // ✅ SAFE TEST: ₹10 only (server will also cap)
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountInRupees: 10 }),
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Failed to create order");
        return;
      }

      const order = data.order;

      const options = {
        key: data.keyId, // public key id
        amount: order.amount,
        currency: order.currency,
        name: "NeoLearn",
        description: "NeoLearn testing payment",
        order_id: order.id,
        prefill: {
          name: "Parent",
          email: "neo.neolearn.ai@gmail.com",
        },
        theme: { color: "#2563eb" },
        handler: async function (response: any) {
          // response has razorpay_payment_id, razorpay_order_id, razorpay_signature
          // ✅ We will verify using webhook in next step
          alert("Payment success! PaymentId: " + response.razorpay_payment_id);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {loading ? "Opening..." : "Pay ₹10 (Safe Test)"}
    </button>
  );
}
