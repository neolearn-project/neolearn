"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type ClassId = "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";
type CourseType = "regular" | "competitive";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export default function SignupForm({
  onDone,
  onSwitchToLogin,
}: {
  onDone: () => void;
  onSwitchToLogin: () => void;
}) {
  const router = useRouter();

  const [stage, setStage] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [studentName, setStudentName] = useState("");
  const [mobile, setMobile] = useState("");
  const [classId, setClassId] = useState<ClassId>("6");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  // NEW variables
  const [country, setCountry] = useState("India");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [courseType, setCourseType] = useState<CourseType>("regular");

  const [otp, setOtp] = useState("");

  const toEmailFromUserId = useMemo(() => {
    return (id: string) => `${id.toLowerCase()}@neolearn.local`;
  }, []);

  async function sendOtp() {
    setMsg(null);
    const m = mobile.trim();
    if (!/^\d{10}$/.test(m)) return setMsg("Enter valid 10-digit mobile.");

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
      setMsg("OTP sent ✅");
    } catch (e: any) {
      setMsg(e?.message || "OTP send failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(): Promise<boolean> {
    setMsg(null);
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
      setMsg(e?.message || "OTP verify failed");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    setMsg(null);

    if (!studentName.trim()) return setMsg("Enter student name.");
    if (!/^\d{10}$/.test(mobile.trim())) return setMsg("Enter valid mobile.");
    if (!userId.trim() || userId.trim().length < 3) return setMsg("User ID must be at least 3 chars.");
    if (!password.trim() || password.trim().length < 6) return setMsg("Password must be at least 6 chars.");
    if (!otp.trim()) return setMsg("Enter OTP.");

    const ok = await verifyOtp();
    if (!ok) return;

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
          // NEW fields
          country,
          preferredLanguage,
          courseType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // auto login
      const email = toEmailFromUserId(userId.trim());
      const { data: loginData, error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: password.trim(),
      });
      if (loginErr) throw new Error(loginErr.message);

      const payload = {
        name: studentName.trim(),
        mobile: mobile.trim(),
        classId,
        studentId: loginData.user?.id,
        country,
        preferredLanguage,
        courseType,
      };
      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(payload));

      setMsg("Account created ✅");
      onDone();
      router.push("/student");
    } catch (e: any) {
      setMsg(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-slate-700">{msg}</div>}

      {/* DETAILS */}
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
        {["5","6","7","8","9","10","11","12"].map((c) => (
          <option key={c} value={c}>Class {c}</option>
        ))}
      </select>

      {/* NEW */}
      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        {["India","Bangladesh","Nepal","Bhutan","Other"].map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
        value={preferredLanguage}
        onChange={(e) => setPreferredLanguage(e.target.value)}
      >
        {["English","Hindi","Bengali"].map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>

      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
        value={courseType}
        onChange={(e) => setCourseType(e.target.value as CourseType)}
      >
        <option value="regular">Regular (Class V–XII)</option>
        <option value="competitive">Competitive (TPS/TCS, IAS/IPS, Banking etc.)</option>
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

      {/* OTP */}
      {stage === "details" ? (
        <button type="button" disabled={loading} className="btn btn-primary w-full" onClick={sendOtp}>
          {loading ? "Sending OTP..." : "Send OTP"}
        </button>
      ) : (
        <>
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <button type="button" disabled={loading} className="btn btn-primary w-full" onClick={createAccount}>
            {loading ? "Creating..." : "Verify OTP & Create Account"}
          </button>
        </>
      )}

      <div className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <button
          type="button"
          className="font-semibold text-blue-600 hover:underline"
          onClick={onSwitchToLogin}
        >
          Login
        </button>
      </div>
    </div>
  );
}
