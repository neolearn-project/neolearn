"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);

    const username = loginUserId.trim().toLowerCase();
    const password = loginPassword.trim();

    if (!username) {
      setError("Enter Student User ID.");
      return;
    }

    if (!password) {
      setError("Enter password.");
      return;
    }

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

      const st = data.student || {};

      const payload = {
        name: st.full_name || st.name || "Student",
        mobile: st.mobile || "",
        classId: String(st.class_id || st.classId || "6"),
        board: st.board || "CBSE",
        track: st.track || st.subject_type || st.subjectType || "regular",
        subjectType: st.subject_type || st.subjectType || st.track || "regular",
        competitiveExam: st.competitiveExam || null,
        studentId: st.user_id || st.studentId || "",
        username: st.username || username,
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Student User ID"
        value={loginUserId}
        onChange={(e) => setLoginUserId(e.target.value.toLowerCase())}
      />

      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
        />

        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600 hover:text-blue-700"
          onClick={() => setShowPassword((s) => !s)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleLogin}
        className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Login"}
      </button>
    </div>
  );
}

