"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";
import { Eye, EyeOff } from "lucide-react";

const PARENT_STORAGE_KEY = "neolearn_parent_mobile";

function parentMobileToEmail(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

type AuthStep = "mobile" | "otp";

export default function ParentLoginPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [parentName, setParentName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [step, setStep] = useState<AuthStep>("mobile");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
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
      const res = await fetch("/api/auth/parent-login-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          parentMobile: trimmedMobile,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.otpToken) {
        throw new Error(data?.error || "Failed to send parent OTP.");
      }

      setOtpToken(String(data.otpToken));
      setOtp("");
      setStep("otp");
    } catch (e: any) {
      setError(e?.message || "Failed to send parent OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMobile = mobile.trim();
    const trimmedOtp = otp.trim();

    if (!otpToken) {
      setError("OTP session expired. Please request OTP again.");
      setStep("mobile");
      return;
    }

    if (!/^\d{4,10}$/.test(trimmedOtp)) {
      setError("Enter a valid OTP.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/parent-login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          otpToken,
          otp: trimmedOtp,
          parentMobile: trimmedMobile,
          parentName: parentName.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.session) {
        throw new Error(data?.error || "Parent OTP verification failed.");
      }

      const { error: sessionError } = await supabaseBrowser.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) throw new Error(sessionError.message);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PARENT_STORAGE_KEY, trimmedMobile);
      }

      router.replace("/parent/dashboard");
    } catch (e: any) {
      setError(e?.message || "Parent OTP verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMobile = mobile.trim();
    const trimmedPassword = password.trim();

    if (!/^\d{10}$/.test(trimmedMobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!trimmedPassword) {
      setError("Please enter password.");
      return;
    }

    setLoading(true);
    try {
      const email = parentMobileToEmail(trimmedMobile);
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: trimmedPassword,
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Parent login failed.");

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PARENT_STORAGE_KEY, trimmedMobile);
      }

      router.replace("/parent/dashboard");
    } catch (e: any) {
      setError(e?.message || "Parent login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neo-parent-login-shell min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="neo-parent-login-card w-full max-w-sm rounded-2xl bg-white shadow-sm border border-slate-200 p-5 text-sm">
        <div className="neo-parent-ai-note mb-4 hidden items-center gap-3 sm:hidden">
          <div className="neo-parent-ai-icon">✦</div>
          <div>
            <div className="font-semibold text-slate-900">Parent progress hub</div>
            <div className="text-xs text-slate-600">
              Follow every learning milestone in one place.
            </div>
          </div>
        </div>

        <div className="mb-3 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">NeoLearn</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Parent Login / Signup</h1>
          <p className="mt-1 text-slate-600">
            Enter parent mobile. We will send an OTP and open the parent dashboard for linked children.
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
            className="neo-parent-login-input w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Parent mobile (10 digits)"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          />

          <input
            className="neo-parent-login-input w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Parent name (optional)"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
          />

          <button type="submit" disabled={loading} className="neo-parent-login-submit btn btn-primary w-full">
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>
        </form>
        ) : (
          <form className="space-y-3" onSubmit={handleVerifyOtp}>
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">
              OTP sent to parent mobile <span className="font-semibold">{mobile}</span>.
            </div>
            <input
              inputMode="numeric"
              maxLength={10}
              className="neo-parent-login-input w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" disabled={loading} className="neo-parent-login-submit btn btn-primary w-full">
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50"
              onClick={() => {
                setStep("mobile");
                setOtp("");
                setOtpToken("");
                setError(null);
              }}
            >
              Edit mobile
            </button>
          </form>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            className="text-sm font-medium text-blue-600 hover:underline"
            onClick={() => setShowPasswordLogin((show) => !show)}
          >
            Existing password login
          </button>

          {showPasswordLogin && (
            <form className="mt-3 space-y-3" onSubmit={handlePasswordLogin}>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="neo-parent-login-input w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-white disabled:opacity-60"
              >
                {loading ? "Logging in..." : "Login with password"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-center text-sm">
          <Link href="/parent/reset-password" className="font-medium text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <div className="mt-3 text-center text-xs text-slate-500">
          <Link href="/account-deletion" className="hover:text-blue-700 hover:underline">
            Request account deletion
          </Link>
        </div>
      </div>
    </div>
  );
}
