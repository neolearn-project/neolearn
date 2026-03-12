"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toEmailFromUserId(id: string) {
    return `${id.trim().toLowerCase()}@neolearn.in`;
  }

  async function handleLogin() {
    setError(null);

    if (!loginUserId.trim()) {
      setError("Enter User ID.");
      return;
    }

    if (!loginPassword.trim()) {
      setError("Enter password.");
      return;
    }

    setLoading(true);
    try {
      const email = toEmailFromUserId(loginUserId);

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: loginPassword.trim(),
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Student login failed.");

      const meta: any = data.user.user_metadata || {};

      const payload = {
        name: meta?.name || "Student",
        mobile: meta?.mobile || "",
        classId: meta?.classId || "6",
        studentId: data.user.id,
        username: loginUserId.trim().toLowerCase(),
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
    <div className="space-y-3">
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
        className="btn btn-primary w-full"
        onClick={handleLogin}
      >
        {loading ? "Logging in..." : "Login"}
      </button>
    </div>
  );
}