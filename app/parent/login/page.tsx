"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

const PARENT_STORAGE_KEY = "neolearn_parent_mobile";

function parentMobileToEmail(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

export default function ParentLoginPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMobile = mobile.trim();
    const trimmedPassword = password.trim();

    if (!/^\d{10}$/.test(trimmedMobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!trimmedPassword) {
      setError("Please enter password.");
      return;
    }

    setLoading(true);
    try {
      const email = parentMobileToEmail(trimmedMobile);

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: trimmedPassword,
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Parent login failed.");

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PARENT_STORAGE_KEY, trimmedMobile);
      }

      router.replace("/parent/dashboard");
    } catch (e: any) {
      setError(e?.message || "Parent login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm border border-slate-200 p-5 text-sm">
        <div className="mb-3 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">NeoLearn</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Parent Login</h1>
          <p className="mt-1 text-slate-600">
            Login with your registered parent mobile number and password.
          </p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="space-y-3" onSubmit={handleLogin}>
          <input
            inputMode="numeric"
            maxLength={10}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Parent mobile (10 digits)"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600 hover:text-blue-700"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}