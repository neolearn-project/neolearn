"use client";

import { useEffect, useState } from "react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import ResetPasswordForm from "./ResetPasswordForm";

export default function AuthModal({
  open,
  onClose,
}: {
  open: null | "login" | "signup";
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");

  useEffect(() => {
    if (open) setMode(open);
  }, [open]);

  if (!open) return null;

  const isSignup = mode === "signup";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-4 sm:px-4">
      <div
        className={`w-full rounded-2xl bg-white shadow-xl border border-slate-200 ${
          isSignup ? "max-w-2xl" : "max-w-md"
        } max-h-[92vh] overflow-hidden`}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-lg font-semibold">
              {mode === "login"
                ? "Login"
                : mode === "signup"
                ? "Create new account"
                : "Reset password"}
            </div>
            <div className="text-[12px] text-gray-500">
              {mode === "login"
                ? "Access your NeoLearn account"
                : mode === "signup"
                ? "Create parent and student accounts in one signup"
                : "Verify mobile OTP and set a new password"}
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-sm hover:bg-slate-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 max-h-[calc(92vh-76px)]">
          {mode === "login" && (
            <>
              <LoginForm onDone={onClose} />

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => setMode("reset")}
                >
                  Forgot password?
                </button>

                <button
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </div>
            </>
          )}

          {mode === "signup" && (
            <SignupForm
              onDone={() => {
                setMode("login");
                onClose();
              }}
              onSwitchToLogin={() => setMode("login")}
            />
          )}

          {mode === "reset" && (
  <ResetPasswordForm
    mode="student"
    onDone={() => setMode("login")}
    onBack={() => setMode("login")}
  />
)}
        </div>
      </div>
    </div>
  );
}