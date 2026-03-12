"use client";

import { useState } from "react";

type ResetMode = "student" | "parent";

export default function ResetPasswordForm({
  onDone,
  onBack,
  mode = "student",
}: {
  onDone: () => void;
  onBack: () => void;
  mode?: ResetMode;
}) {
  const [userId, setUserId] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [stage, setStage] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isStudent = mode === "student";
  const isParent = mode === "parent";

  async function sendOtp() {
    setMsg(null);

    const m = mobile.trim();

    if (isStudent && !userId.trim()) {
      setMsg("Enter Student User ID.");
      return;
    }

    if (!/^\d{10}$/.test(m)) {
      setMsg("Enter valid 10-digit mobile.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: m }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "OTP send failed");

      setStage("otp");
      setMsg("OTP sent successfully.");
    } catch (e: any) {
      setMsg(e?.message || "OTP send failed");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setMsg(null);

    const m = mobile.trim();

    if (isStudent && !userId.trim()) {
      setMsg("Enter Student User ID.");
      return;
    }

    if (!/^\d{10}$/.test(m)) {
      setMsg("Enter valid 10-digit mobile.");
      return;
    }

    if (!otp.trim()) {
      setMsg("Enter OTP.");
      return;
    }

    if (!newPassword.trim() || newPassword.trim().length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg("Password and confirm password must match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          userId: userId.trim(),
          mobile: m,
          otp: otp.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Reset failed");

      setMsg("Password updated successfully. Please login now.");
      onDone();
    } catch (e: any) {
      setMsg(e?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {msg}
        </div>
      )}

      {isStudent && (
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Student User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value.toLowerCase())}
        />
      )}

      <input
        inputMode="numeric"
        maxLength={10}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={isStudent ? "Student mobile (10 digits)" : "Parent mobile (10 digits)"}
        value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
      />

      {stage === "details" ? (
        <button
          type="button"
          disabled={loading}
          className="btn btn-primary w-full"
          onClick={sendOtp}
        >
          {loading ? "Sending OTP..." : "Send OTP"}
        </button>
      ) : (
        <>
          <input
            inputMode="numeric"
            maxLength={10}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="New password (min 6 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600 hover:text-blue-700"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <input
            type={showPassword ? "text" : "password"}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button
            type="button"
            disabled={loading}
            className="btn btn-primary w-full"
            onClick={resetPassword}
          >
            {loading ? "Updating..." : "Verify OTP & Reset Password"}
          </button>
        </>
      )}

      <button type="button" className="btn btn-ghost w-full" onClick={onBack}>
        Back
      </button>
    </div>
  );
}