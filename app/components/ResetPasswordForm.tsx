"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type ResetRole = "student" | "parent";

type ResetPasswordFormProps = {
  role?: ResetRole;
  defaultMobile?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

function getResetMessage(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;

  if (value instanceof Error && value.message) {
    return value.message;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [
      obj.message,
      obj.error,
      obj.msg,
      obj.details,
      obj.detail,
      obj.description,
      obj.code,
    ];

    for (const item of candidates) {
      if (typeof item === "string" && item.trim()) return item;
    }

    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") return json;
    } catch {
      // ignore
    }
  }

  return fallback;
}

export default function ResetPasswordForm({
  role = "student",
  defaultMobile = "",
  onSuccess,
  onCancel,
}: ResetPasswordFormProps) {
  const safeDefaultMobile =
    typeof defaultMobile === "string" ? defaultMobile : "";

  const [mobile, setMobile] = useState(String(safeDefaultMobile || ""));
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [stage, setStage] = useState<"details" | "otp" | "success">("details");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<"info" | "error" | "success">("info");

  const isStudent = role === "student";

  async function sendOtp() {
    setMsg(null);
    setMsgType("info");

    const m = mobile.trim().replace(/\D/g, "");
    if (!/^\d{10}$/.test(m)) {
      setMsgType("error");
      setMsg("Enter valid 10-digit mobile.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mobile: m }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getResetMessage(data?.error || data, "OTP send failed."));
      }

      setStage("otp");
      setMsgType("success");
      setMsg(`OTP sent to ${isStudent ? "student" : "parent"} mobile.`);
    } catch (e: unknown) {
      setMsgType("error");
      setMsg(getResetMessage(e, "OTP send failed."));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setMsg(null);
    setMsgType("info");

    const m = mobile.trim().replace(/\D/g, "");
    const cleanOtp = otp.trim().replace(/\D/g, "");
    const password = newPassword.trim();

    if (!/^\d{10}$/.test(m)) {
      setMsgType("error");
      setMsg("Enter valid 10-digit mobile.");
      return;
    }

    if (!/^\d{4,10}$/.test(cleanOtp)) {
      setMsgType("error");
      setMsg("Enter a valid OTP.");
      return;
    }

    if (!password || password.length < 6) {
      setMsgType("error");
      setMsg("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsgType("error");
      setMsg("Password and confirm password must match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          role,
          mobile: m,
          otp: cleanOtp,
          newPassword: password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getResetMessage(data?.error || data, "Reset failed."));
      }

      setStage("success");
      setMsgType("success");
      setMsg("Password updated successfully. Please login now.");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      setMsgType("error");
      setMsg(getResetMessage(e, "Reset failed."));
    } finally {
      setLoading(false);
    }
  }

  function PasswordToggle() {
    return (
      <button
        type="button"
        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => setShowPassword((s) => !s)}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    );
  }

  const msgClass =
    msgType === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : msgType === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${msgClass}`}>
          {msg}
        </div>
      )}

      {stage !== "success" && (
        <>
          <input
            inputMode="numeric"
            maxLength={10}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={isStudent ? "Student mobile (10 digits)" : "Parent mobile (10 digits)"}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          />

          <button
            type="button"
            disabled={loading}
            className="btn btn-primary w-full"
            onClick={sendOtp}
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>

          {stage === "otp" && (
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
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <PasswordToggle />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <PasswordToggle />
              </div>

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
        </>
      )}

      {stage === "success" && (
        <button type="button" className="btn btn-primary w-full" onClick={onSuccess}>
          Go to Login
        </button>
      )}

      <button type="button" className="btn btn-ghost w-full" onClick={onCancel}>
        Back
      </button>
    </div>
  );
}
