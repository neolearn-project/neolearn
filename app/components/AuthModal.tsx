"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

export default function AuthModal({
  open,
  onClose,
}: {
  open: null | "login" | "signup";
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  if (!open) return null;

  // keep mode synced with open
  if (open !== mode) setTimeout(() => setMode(open), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">
              {mode === "login" ? "Login" : "Sign up (Free Trial)"}
            </div>
            <div className="text-[11px] text-gray-500">
              Demo OTP: <b>1234</b> (we’ll connect real OTP later)
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-4 flex gap-2">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                mode === "login"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                mode === "signup"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          {mode === "login" ? (
            <LoginForm onDone={onClose} />
          ) : (
            <SignupForm onDone={() => setMode("login")} />
          )}
        </div>
      </div>
    </div>
  );
}
