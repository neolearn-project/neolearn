"use client";

import { useRouter } from "next/navigation";

import React, { useEffect, useState } from "react";

type ClassId = "5" | "6" | "7" | "8" | "9";

interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;
}

type Step = "details" | "otp" | "logged-in";

const CLASSES: { id: ClassId; label: string }[] = [
  { id: "5", label: "Class 5" },
  { id: "6", label: "Class 6" },
  { id: "7", label: "Class 7" },
  { id: "8", label: "Class 8" },
  { id: "9", label: "Class 9" },
];

const STORAGE_KEY = "neolearnStudent";

export default function StudentLogin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [classId, setClassId] = useState<ClassId>("6");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [open, setOpen] = useState(false);

  // On mount, load student from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StudentInfo;
        setStudent(parsed);
        setStep("logged-in");
      }
    } catch {
      // ignore
    }
  }, []);

  function resetFormFromStudent(info?: StudentInfo | null) {
    if (info) {
      setName(info.name);
      setMobile(info.mobile);
      setClassId(info.classId);
      setStep("logged-in");
    } else {
      setName("");
      setMobile("");
      setClassId("6");
      setOtp("");
      setStep("details");
    }
    setError(null);
  }

  function handleGetOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !mobile.trim()) {
      setError("Please enter name and mobile number.");
      return;
    }
    if (!/^\d{10}$/.test(mobile.trim())) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    // Real system: call backend to send SMS OTP
    // Demo: OTP = 1234
    setStep("otp");
  }

  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (otp.trim() !== "1234") {
      setError("Incorrect OTP. For demo use 1234.");
      return;
    }

    const info: StudentInfo = {
      name: name.trim(),
      mobile: mobile.trim(),
      classId,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    }

    setStudent(info);
    setStep("logged-in");
    setOpen(false); // close popup after successful login
    router.push("/student");
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setStudent(null);
    resetFormFromStudent(null);
    setOpen(false);
  }

  // ---------- COLLAPSED TOP-RIGHT BUTTON (like Facebook) ----------

  return (
    <>
      {/* Top-right login / profile pill */}
      <div className="mb-2 flex justify-end">
        {student ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-800">
              {student.name} • Class {student.classId}
            </span>
            <button
              type="button"
              onClick={() => {
                resetFormFromStudent(student);
                setOpen(true);
              }}
              className="rounded-xl border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              Manage
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              resetFormFromStudent(null);
              setOpen(true);
            }}
            className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Student Login / Sign up
          </button>
        )}
      </div>

      {/* ---------- POPUP MODAL ---------- */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {student ? "Student Profile" : "Student Login / Sign up"}
              </h3>
              <button
                type="button"
                className="ml-2 rounded-full px-2 text-sm text-gray-500 hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-gray-600 mb-3">
              This is a simple demo login. Enter details, then use OTP{" "}
              <b>1234</b> to sign in. Later we can connect real SMS-based OTP.
            </div>

            {error && (
              <div className="mb-2 rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-700">
                {error}
              </div>
            )}

            {step === "logged-in" && student ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {student.name} (Class {student.classId})
                  </div>
                  <div className="text-xs text-gray-600">
                    Mobile: {student.mobile}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("details")}
                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Log out
                  </button>
                </div>
              </div>
            ) : step === "details" ? (
              <form onSubmit={handleGetOtp} className="space-y-2 text-xs">
                <div className="space-y-2">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-300 px-2 py-1"
                    placeholder="Student name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    type="tel"
                    className="w-full rounded-xl border border-gray-300 px-2 py-1"
                    placeholder="10-digit mobile"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                  <select
                    className="w-full rounded-xl border border-gray-300 px-2 py-1"
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

                <button
                  type="submit"
                  className="mt-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Get OTP
                </button>
              </form>
            ) : (
              // step === "otp"
              <form onSubmit={handleVerifyOtp} className="space-y-2 text-xs">
                <div className="text-gray-700">
                  OTP has been (demo) “sent” to <b>{mobile}</b>. For now, please
                  use <b>1234</b> as OTP.
                </div>
                <input
                  type="tel"
                  className="w-full rounded-xl border border-gray-300 px-2 py-1"
                  placeholder="Enter OTP (1234 for demo)"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    Verify & Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtp("");
                      setStep("details");
                    }}
                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
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
                className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
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
