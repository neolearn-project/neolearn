"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClassId = "5" | "6" | "7" | "8" | "9";
type BoardId = "cbse" | "icse" | "tbse";

type Mode = "login" | "signup";
type Step = "details" | "otp" | "logged-in";

const CLASSES: { id: ClassId; label: string }[] = [
  { id: "5", label: "Class 5" },
  { id: "6", label: "Class 6" },
  { id: "7", label: "Class 7" },
  { id: "8", label: "Class 8" },
  { id: "9", label: "Class 9" },
];

const BOARDS: { id: BoardId; label: string }[] = [
  { id: "cbse", label: "CBSE" },
  { id: "icse", label: "ICSE" },
  { id: "tbse", label: "TBSE" },
];

const STORAGE_KEY = "neolearnStudentAuth"; // store login state

type StoredStudent = {
  userId: string;
  username: string;
  name?: string;
  classId?: string;
  board?: string;
  mobile?: string;
  access_token?: string;
};

export default function StudentLogin() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>("details");

  // Common fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [classId, setClassId] = useState<ClassId>("6");
  const [board, setBoard] = useState<BoardId>("cbse");

  // Parent fields (optional for now)
  const [parentName, setParentName] = useState("");
  const [parentMobile, setParentMobile] = useState("");

  // Auth fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // OTP
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState<string>(""); // phone in E.164 from backend

  // State
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [student, setStudent] = useState<StoredStudent | null>(null);

  // Load existing login from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredStudent;
        if (parsed?.userId && parsed?.username) {
          setStudent(parsed);
          setStep("logged-in");
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function saveStudent(s: StoredStudent) {
    setStudent(s);
    setStep("logged-in");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }
  }

  function clearStudent() {
    setStudent(null);
    setStep("details");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  function resetForm() {
    setError(null);
    setLoading(false);

    setName("");
    setMobile("");
    setParentName("");
    setParentMobile("");
    setClassId("6");
    setBoard("cbse");

    setUsername("");
    setPassword("");
    setOtp("");
    setOtpToken("");

    setStep("details");
  }

  // -----------------------------
  // SIGNUP: Step 1 - send OTP
  // -----------------------------
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const nm = name.trim();
      const mb = mobile.trim();
      const un = username.trim().toLowerCase();
      const pw = password.trim();

      if (!nm) throw new Error("Enter student name.");
      if (!/^\d{10}$/.test(mb.replace(/\D/g, "")))
        throw new Error("Enter valid 10-digit mobile.");
      if (!un) throw new Error("Enter a User ID (username).");
      if (un.length < 4) throw new Error("User ID should be at least 4 characters.");
      if (!pw || pw.length < 6) throw new Error("Password must be at least 6 characters.");

      const res = await fetch("/api/auth/student-signup-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nm,
          mobile: mb,
          username: un,
          classId,
          board,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to send OTP (HTTP ${res.status})`);

      setOtpToken(data.otpToken); // phone in E.164
      setStep("otp");
    } catch (err: any) {
      setError(err?.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // SIGNUP: Step 2 - verify OTP + create user
  // -----------------------------
  async function handleVerifyOtpAndCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/student-signup-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otpToken,
          otp: otp.trim(),
          name: name.trim(),
          mobile: mobile.trim(),
          classId,
          board,
          username: username.trim().toLowerCase(),
          password: password.trim(),
          parentName: parentName.trim(),
          parentMobile: parentMobile.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Signup failed (HTTP ${res.status})`);

      // After signup, you can auto-login or keep it "logged in" locally.
      saveStudent({
        userId: data.userId,
        username: username.trim().toLowerCase(),
        name: name.trim(),
        classId,
        board,
        mobile: mobile.trim(),
      });

      setOpen(false);
      router.push("/student");
    } catch (err: any) {
      setError(err?.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // LOGIN: username + password
  // -----------------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const un = username.trim().toLowerCase();
      const pw = password.trim();
      if (!un) throw new Error("Enter User ID.");
      if (!pw) throw new Error("Enter password.");

      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: un, password: pw }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Login failed (HTTP ${res.status})`);

      const profile = data?.student || {};
      saveStudent({
        userId: profile.user_id || profile.userId || data?.userId || "unknown",
        username: profile.username || un,
        name: profile.full_name || profile.name || "",
        classId: String(profile.class_id || ""),
        board: String(profile.board || ""),
        mobile: String(profile.mobile || ""),
        access_token: data?.session?.access_token,
      });

      setOpen(false);
      router.push("/student");
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  // UI pill
  return (
    <>
      <div className="mb-2 flex justify-end">
        {student ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-800">
              {student.username}
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-xl border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              Manage
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setMode("signup");
              setOpen(true);
            }}
            className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Student Login / Sign up
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {student ? "Student Profile" : "Sign up / Login"}
              </h3>
              <button
                type="button"
                className="ml-2 rounded-full px-2 text-sm text-gray-500 hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            {!student && (
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setStep("details");
                    setError(null);
                    setOtp("");
                    setOtpToken("");
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold border ${
                    mode === "login"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-800 border-slate-200"
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setStep("details");
                    setError(null);
                    setOtp("");
                    setOtpToken("");
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold border ${
                    mode === "signup"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-800 border-slate-200"
                  }`}
                >
                  Sign up
                </button>
              </div>
            )}

            {error && (
              <div className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {student ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">{student.username}</div>
                  <div className="text-xs text-gray-600">
                    {student.name ? `Name: ${student.name} • ` : ""}
                    {student.classId ? `Class: ${student.classId} • ` : ""}
                    {student.mobile ? `Mobile: ${student.mobile}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearStudent();
                      resetForm();
                      setMode("login");
                    }}
                    className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Log out
                  </button>
                </div>
              </div>
            ) : mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-2 text-xs">
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="User ID (username)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Login"}
                </button>
              </form>
            ) : step === "details" ? (
              <form onSubmit={handleSendOtp} className="space-y-2 text-xs">
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Student name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <input
                  type="tel"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Student mobile (10-digit)"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />

                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Create User ID (username)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />

                <input
                  type="password"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Create password (min 6 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="w-full rounded-xl border border-gray-300 px-3 py-2"
                    value={board}
                    onChange={(e) => setBoard(e.target.value as BoardId)}
                  >
                    {BOARDS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="w-full rounded-xl border border-gray-300 px-3 py-2"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value as ClassId)}
                  >
                    {CLASSES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional parent info */}
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Parent name (optional)"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
                <input
                  type="tel"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Parent WhatsApp mobile (optional)"
                  value={parentMobile}
                  onChange={(e) => setParentMobile(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>
              </form>
            ) : (
              // step === "otp"
              <form onSubmit={handleVerifyOtpAndCreate} className="space-y-2 text-xs">
                <div className="text-gray-700">
                  OTP sent to <b>{mobile}</b>. Enter OTP to verify and create account.
                </div>

                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loading ? "Verifying..." : "Verify & Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("details");
                      setOtp("");
                      setError(null);
                    }}
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
