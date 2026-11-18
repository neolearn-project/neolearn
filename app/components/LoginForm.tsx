"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import StudentOtpLogin from "./StudentOtpLogin";
import { storedStudentFromResponse } from "@/app/lib/studentLoginCore.mjs";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [method,setMethod]=useState<"password"|"otp">("otp");
  const loginLock=useRef(false);

  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if(loginLock.current)return;
    setError(null);

    const username = loginUserId.trim().toLowerCase();
    const password = loginPassword;

    if (!username) {
      setError("Enter Student User ID.");
      return;
    }

    if (!password) {
      setError("Enter password.");
      return;
    }

    loginLock.current=true;
    setLoading(true);

    try {
      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Invalid username or password.");
      }

      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(storedStudentFromResponse(data)));

      onDone();
      router.push("/student");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      loginLock.current=false;
      setLoading(false);
    }
  }

  return (
    <div className="neo-mobile-auth-form space-y-4">
      <div className="neo-login-methods flex gap-2" role="group" aria-label="Student login method">
        <button type="button" disabled={loading} aria-pressed={method==="password"} onClick={()=>{setMethod("password");setError(null);}} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm">User ID / password</button>
        <button type="button" disabled={loading} aria-pressed={method==="otp"} onClick={()=>{setMethod("otp");setError(null);}} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm">Mobile OTP</button>
      </div>
      {method==="otp" ? <StudentOtpLogin onDone={onDone}/> : <>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <input
        className="neo-mobile-auth-input w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Student User ID"
        autoComplete="username"
        placeholder="Student User ID"
        value={loginUserId}
        onChange={(e) => setLoginUserId(e.target.value.toLowerCase())}
      />

      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          className="neo-mobile-auth-input w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Password"
          autoComplete="current-password"
          placeholder="Password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
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
        type="button"
        disabled={loading}
        onClick={handleLogin}
        className="neo-mobile-auth-submit w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Login"}
      </button>
      </>}
    </div>
  );
}


