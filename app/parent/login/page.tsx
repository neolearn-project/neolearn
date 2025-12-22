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

  const handleMobileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = mobile.trim();
    if (!trimmed || trimmed.length < 8) {
      setError("Please enter a valid mobile number.");
      return;
    }
    setStep("otp");
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Demo OTP: 1111
      if (otp.trim() !== "1111") {
        setError("Invalid OTP. For demo, use 1111.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PARENT_STORAGE_KEY, mobile.trim());
      }
      router.replace("/parent/dashboard");
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
            <span className="font-semibold">Demo OTP: 1111</span>
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
            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-2 hover:bg-blue-700"
            >
              Continue
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-3">
            <div className="text-[11px] text-gray-600 mb-1">
              We have (demo) sent an OTP to{" "}
              <span className="font-semibold">{mobile}</span>.
              <br />
              For now, use <span className="font-semibold">1111</span>.
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
                placeholder="Enter 4-digit OTP"
              />
            </div>
            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}
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
