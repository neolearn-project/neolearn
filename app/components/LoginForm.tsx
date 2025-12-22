"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ClassId = "5" | "6" | "7" | "8" | "9";

const STUDENT_STORAGE_KEY = "neolearnStudent";          // ✅ must match StudentDashboardPage
const PARENT_STORAGE_KEY = "neolearnParentMobile";      // ✅ must match Parent dashboard

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"otp" | "role">("otp");

  // Student quick fields (needed because /student expects these)
  const [studentName, setStudentName] = useState("");
  const [classId, setClassId] = useState<ClassId>("6");

  const [error, setError] = useState<string | null>(null);

  const requestOtp = () => {
    setError(null);
    if (mobile.trim().length !== 10) {
      setError("Enter 10-digit mobile number.");
      return;
    }
    setStage("role");
  };

  const goStudent = () => {
    setError(null);

    if (otp !== "1234") {
      setError("Invalid OTP. Use demo OTP: 1234");
      return;
    }
    if (!studentName.trim()) {
      setError("Please enter student name.");
      return;
    }

    // ✅ This is the EXACT localStorage format your student dashboard reads
    const payload = {
      name: studentName.trim(),
      mobile: mobile.trim(),
      classId,
    };

    localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(payload));

    onDone();
    router.push("/student");
  };

  const goParent = () => {
    setError(null);

    if (otp !== "1234") {
      setError("Invalid OTP. Use demo OTP: 1234");
      return;
    }

    // ✅ Parent dashboard reads this key
    localStorage.setItem(PARENT_STORAGE_KEY, mobile.trim());

    onDone();
    router.push("/parent/dashboard");
  };

  return (
    <div className="space-y-3">
      {/* Mobile */}
      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="10-digit mobile number"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
      />

      {/* OTP */}
      {stage === "role" && (
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter OTP (demo: 1234)"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Stage 1 */}
      {stage === "otp" ? (
        <button className="btn btn-primary w-full" onClick={requestOtp}>
          Get OTP
        </button>
      ) : (
        <>
          {/* Student extra fields (only required if user chooses Student) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Continue as Student (needs profile)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Student name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={classId}
                onChange={(e) => setClassId(e.target.value as ClassId)}
              >
                <option value="5">Class 5</option>
                <option value="6">Class 6</option>
                <option value="7">Class 7</option>
                <option value="8">Class 8</option>
                <option value="9">Class 9</option>
              </select>
            </div>

            <button className="btn btn-primary w-full mt-2" onClick={goStudent}>
              Continue as Student
            </button>
          </div>

          {/* Parent */}
          <button className="btn btn-ghost w-full" onClick={goParent}>
            Continue as Parent
          </button>
        </>
      )}
    </div>
  );
}
