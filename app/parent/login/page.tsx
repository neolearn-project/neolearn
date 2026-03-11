"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PARENT_STORAGE_KEY = "neolearn_parent_mobile";

export default function ParentLoginPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMobile = mobile.trim();

    if (!/^\d{10}$/.test(trimmedMobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: trimmedMobile }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `OTP send failed (HTTP ${res.status})`);
      }

      setStep("otp");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMobile = mobile.trim();
    const code = otp.trim();

    if (!/^\d{10}$/.test(trimmedMobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!/^\d{4,10}$/.test(code)) {
      setError("Please enter the OTP you received.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: trimmedMobile, otp: code }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `OTP verify failed (HTTP ${res.status})`);
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PARENT_STORAGE_KEY, trimmedMobile);
      }

      router.replace("/parent/dashboard");
    } catch (e: any) {
      setError(e?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm border border-slate-200 p-5 text-sm">
        <div className="mb-3 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">NeoLearn</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Parent Login</h1>
          <p className="mt-1 text-slate-600">
            Login with your registered parent mobile number.
          </p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "mobile" ? (
          <form className="space-y-3" onSubmit={handleSendOtp}>
            <input
              inputMode="numeric"
              maxLength={10}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Parent mobile (10 digits)"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
            />

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={handleOtpSubmit}>
            <div className="text-xs text-slate-600">
              Enter the OTP sent to <span className="font-semibold">{mobile}</span>
            </div>

            <input
              inputMode="numeric"
              maxLength={10}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                setStep("mobile");
                setOtp("");
                setError(null);
              }}
            >
              Change mobile number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}