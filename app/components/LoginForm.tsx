"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

type ClassId = "5" | "6" | "7" | "8" | "9";

const STUDENT_STORAGE_KEY = "neolearnStudent";
const PARENT_STORAGE_KEY = "neolearnParentMobile";

type Mode = "login" | "signup";

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");

  // Shared fields
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");

  // Signup fields
  const [studentName, setStudentName] = useState("");
  const [classId, setClassId] = useState<ClassId>("6");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  // Login fields
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [stage, setStage] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toEmailFromUserId(id: string) {
    return `${id.toLowerCase()}@neolearn.local`;
  }

  async function sendOtp() {
    setError(null);
    const m = mobile.trim();
    if (!/^\d{10}$/.test(m)) {
      setError("Enter valid 10-digit mobile.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setStage("otp");
    } catch (e: any) {
      setError(e?.message || "OTP send failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return true;
    } catch (e: any) {
      setError(e?.message || "OTP verify failed");
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ✅ SIGNUP (OTP once + create userId/password)
  async function handleStudentSignup() {
    setError(null);

    if (!studentName.trim()) return setError("Enter student name.");
    if (!/^\d{10}$/.test(mobile.trim())) return setError("Enter valid mobile.");
    if (!userId.trim() || userId.trim().length < 3) return setError("User ID must be at least 3 chars.");
    if (!password.trim() || password.trim().length < 6) return setError("Password must be at least 6 chars.");

    // 1) verify OTP
    const ok = await verifyOtp();
    if (!ok) return;

    // 2) create auth user + student_profile (server)
    setLoading(true);
    try {
      const res = await fetch("/api/auth/student-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          password: password.trim(),
          name: studentName.trim(),
          mobile: mobile.trim(),
          classId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // 3) auto login via supabase
      const email = toEmailFromUserId(userId.trim());
      const { data: loginData, error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: password.trim(),
      });
      if (loginErr) throw new Error(loginErr.message);

      // 4) store compatibility payload for current /student page (so nothing breaks)
      const payload = {
        name: studentName.trim(),
        mobile: mobile.trim(),
        classId,
        studentId: loginData.user?.id,
      };
      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(payload));

      onDone();
      router.push("/student");
    } catch (e: any) {
      setError(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  // ✅ LOGIN (username + password only)
  async function handleStudentLogin() {
    setError(null);

    if (!loginUserId.trim()) return setError("Enter User ID.");
    if (!loginPassword.trim()) return setError("Enter password.");

    setLoading(true);
    try {
      const email = toEmailFromUserId(loginUserId.trim());
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: loginPassword.trim(),
      });
      if (error) throw new Error(error.message);

      // user metadata to keep /student compatible
      const meta: any = data.user?.user_metadata || {};
      const payload = {
        name: meta?.name || "Student",
        mobile: meta?.mobile || "",
        classId: (meta?.classId || "6") as ClassId,
        studentId: data.user?.id,
      };
      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(payload));

      onDone();
      router.push("/student");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  // Parent login remains same old flow for now (we’ll convert after student)
  function goParentLegacy() {
    localStorage.setItem(PARENT_STORAGE_KEY, mobile.trim());
    onDone();
    router.push("/parent/dashboard");
  }

  return (
    <div className="space-y-3">
      {/* Mode Switch */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold border ${mode === "login" ? "bg-slate-900 text-white" : "bg-white"}`}
          onClick={() => {
            setMode("login");
            setError(null);
            setStage("details");
          }}
        >
          Login
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold border ${mode === "signup" ? "bg-slate-900 text-white" : "bg-white"}`}
          onClick={() => {
            setMode("signup");
            setError(null);
            setStage("details");
          }}
        >
          Sign up
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {mode === "login" ? (
        <div className="space-y-2">
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="User ID (example: anup123)"
            value={loginUserId}
            onChange={(e) => setLoginUserId(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
          <button
            type="button"
            disabled={loading}
            className="btn btn-primary w-full"
            onClick={handleStudentLogin}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Signup details */}
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Student name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="10-digit mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            value={classId}
            onChange={(e) => setClassId(e.target.value as ClassId)}
          >
            <option value="5">Class 5</option>
            <option value="6">Class 6</option>
            <option value="7">Class 7</option>
            <option value="8">Class 8</option>
            <option value="9">Class 9</option>
          </select>

          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Create User ID (example: anup123)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Create password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* OTP flow */}
          {stage === "details" ? (
            <button type="button" disabled={loading} className="btn btn-primary w-full" onClick={sendOtp}>
              {loading ? "Sending OTP..." : "Send OTP (Verify Mobile)"}
            </button>
          ) : (
            <>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <button
                type="button"
                disabled={loading}
                className="btn btn-primary w-full"
                onClick={handleStudentSignup}
              >
                {loading ? "Creating account..." : "Verify OTP & Create Account"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Keep parent legacy for now */}
      <button type="button" className="btn btn-ghost w-full" onClick={goParentLegacy}>
        Continue as Parent (legacy)
      </button>
    </div>
  );
}
