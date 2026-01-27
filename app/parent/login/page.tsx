"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const PARENT_STORAGE_KEY = "neolearnParentMobile";

export default function ParentLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in → go directly to dashboard
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem(PARENT_STORAGE_KEY);
    if (existing) {
      router.replace("/parent/dashboard");
    }
  }, [router]);

  const handleMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = mobile.trim();

    // basic validation (India 10-digit)
    if (!/^\d{10}$/.test(trimmed)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to send OTP (HTTP ${res.status})`);
      }

      setStep("otp");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
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
    if (!/^\d{4,8}$/.test(code)) {
      setError("Please enter the OTP you received.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: trimmedMobile, code }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `OTP verify failed (HTTP ${res.status})`);
      }

      // ✅ Parent dashboard reads this key
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
          <div className="text-xs font-semibold text-gray-500 uppercase">
            NeoLearn
          </div>
          <h1 className="text-lg font-semibold mt-1">Parent Login</h1>
          <p className="text-[11px] text-gray-500 mt-1">
            Use your WhatsApp number to see your child&apos;s progress.
            <br />
            OTP will be sent to your mobile for verification.
          </p>
        </div>

        {step === "mobile" && (
          <form onSubmit={handleMobileSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Parent mobile number
              </label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="10-digit WhatsApp number"
              />
            </div>

            {error && <p className="text-[11px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Sending OTP…" : "Continue"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-3">
            <div className="text-[11px] text-gray-600 mb-1">
              We sent an OTP to <span className="font-semibold">{mobile}</span>.
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Enter OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter OTP"
              />
            </div>

            {error && <p className="text-[11px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify & Continue"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("mobile");
                setOtp("");
                setError(null);
              }}
              className="w-full rounded-xl border border-slate-300 text-[11px] py-2 mt-1 hover:bg-slate-100"
            >
              Edit mobile number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
