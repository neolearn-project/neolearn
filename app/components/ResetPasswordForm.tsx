"use client";

import { useState } from "react";

export default function ResetPasswordForm({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [stage, setStage] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendOtp() {
    setMsg(null);

    const m = mobile.trim();
    if (!userId.trim()) return setMsg("Enter User ID.");
    if (!/^\d{10}$/.test(m)) return setMsg("Enter valid 10-digit mobile.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "OTP send failed");

      setStage("otp");
      setMsg("OTP sent ✅");
    } catch (e: any) {
      setMsg(e?.message || "OTP send failed");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setMsg(null);

    const m = mobile.trim();
    if (!userId.trim()) return setMsg("Enter User ID.");
    if (!/^\d{10}$/.test(m)) return setMsg("Enter valid 10-digit mobile.");
    if (!otp.trim()) return setMsg("Enter OTP.");
    if (!newPassword.trim() || newPassword.trim().length < 6)
      return setMsg("Password must be at least 6 characters.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          mobile: m,
          otp: otp.trim(),
          newPassword: newPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reset failed");

      setMsg("Password updated ✅ Please login now.");
      onDone(); // back to login
    } catch (e: any) {
      setMsg(e?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-slate-700">{msg}</div>}

      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
        placeholder="User ID (example: anup123)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />

      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
        placeholder="10-digit mobile"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
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
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />

          <input
            type="password"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="New password (min 6 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
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
        Back to Login
      </button>
    </div>
  );
}
