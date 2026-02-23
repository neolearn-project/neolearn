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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
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
                ? "7-day free trial starts after signup"
                : "Verify mobile OTP and set a new password"}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 w-9 h-9 flex items-center justify-center text-sm hover:bg-slate-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5">
          {mode === "login" && (
            <>
              <LoginForm onDone={onClose} />

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  className="text-blue-600 font-medium hover:underline"
                  onClick={() => setMode("reset")}
                >
                  Forgot password?
                </button>

                <button
                  className="text-blue-600 font-medium hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </div>
            </>
          )}

          {mode === "signup" && (
            <>
              <SignupForm
                onDone={() => {
                  setMode("login");
                  onClose();
                }}
                onSwitchToLogin={() => setMode("login")}
              />

              <p className="mt-4 text-center text-sm text-gray-600">
                Already have an account?{" "}
                <button
                  className="text-blue-600 font-medium hover:underline"
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
              </p>
            </>
          )}

          {mode === "reset" && (
            <ResetPasswordForm
              onDone={() => setMode("login")}
              onBack={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  );
}