"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toEmailFromUserId(id: string) {
    return `${id.toLowerCase()}@neolearn.local`;
  }

  async function handleLogin() {
    setError(null);

    if (!loginUserId.trim()) return setError("Enter User ID.");
    if (!loginPassword.trim()) return setError("Enter password.");

    setLoading(true);
    try {
      const email = toEmailFromUserId(loginUserId.trim());

      const { data, error } =
        await supabaseBrowser.auth.signInWithPassword({
          email,
          password: loginPassword.trim(),
        });

      if (error) throw new Error(error.message);

      const meta: any = data.user?.user_metadata || {};

      const payload = {
        name: meta?.name || "Student",
        mobile: meta?.mobile || "",
        classId: meta?.classId || "6",
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

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-red-600">{error}</div>}

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
        onClick={handleLogin}
      >
        {loading ? "Logging in..." : "Login"}
      </button>
    </div>
  );
}
