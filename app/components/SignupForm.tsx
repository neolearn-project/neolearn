"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "details" | "otp" | "success";
type Track = "regular" | "competitive";
type CompetitiveExam =
  | "JEE"
  | "NEET"
  | "CUET"
  | "SSC"
  | "Banking"
  | "UPSC"
  | "Foundation";

type FormState = {
  studentName: string;
  studentMobile: string;
  studentUserId: string;
  studentPassword: string;
  confirmStudentPassword: string;
  parentName: string;
  parentMobile: string;
  parentPassword: string;
  confirmParentPassword: string;
  track: Track;
  board: string;
  classNumber: string;
  competitiveExam: CompetitiveExam;
  country: string;
  preferredLanguage: string;
};

const EXAMS: CompetitiveExam[] = [
  "JEE",
  "NEET",
  "CUET",
  "SSC",
  "Banking",
  "UPSC",
  "Foundation",
];

const LANGUAGES = ["English", "Hindi", "Bengali"];
const COUNTRIES = ["India", "Bangladesh", "Nepal"];

function PasswordField({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600 hover:text-blue-700"
        onClick={() => setShow((s) => !s)}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export default function SignupForm({
  onDone,
  onSwitchToLogin,
}: {
  onDone: () => void;
  onSwitchToLogin?: () => void;
}) {
  const router = useRouter();
  const formTopRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<Step>("details");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState("");

  const [form, setForm] = useState<FormState>({
    studentName: "",
    studentMobile: "",
    studentUserId: "",
    studentPassword: "",
    confirmStudentPassword: "",
    parentName: "",
    parentMobile: "",
    parentPassword: "",
    confirmParentPassword: "",
    track: "regular",
    board: "CBSE",
    classNumber: "6",
    competitiveExam: "JEE",
    country: "India",
    preferredLanguage: "English",
  });

  const isRegularTrack = form.track === "regular";
  const isCompetitiveTrack = form.track === "competitive";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setTrack(track: Track) {
    setForm((prev) => ({
      ...prev,
      track,
      board: track === "regular" ? prev.board || "CBSE" : "",
      classNumber: track === "regular" ? prev.classNumber || "6" : "",
      competitiveExam: track === "competitive" ? prev.competitiveExam || "JEE" : "JEE",
    }));
  }

  function showError(message: string) {
    setMsg(message);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validateDetails() {
    if (!form.studentName.trim()) return "Enter student name.";
    if (!/^\d{10}$/.test(form.studentMobile.trim())) {
      return "Enter valid student mobile (10 digits).";
    }
    if (!form.studentUserId.trim() || form.studentUserId.trim().length < 4) {
      return "Student User ID must be at least 4 characters.";
    }
    if (!form.studentPassword || form.studentPassword.length < 6) {
      return "Student password must be at least 6 characters.";
    }
    if (form.studentPassword !== form.confirmStudentPassword) {
      return "Student password and confirm password must match.";
    }

    if (!form.parentName.trim()) return "Enter parent name.";
    if (!/^\d{10}$/.test(form.parentMobile.trim())) {
      return "Enter valid parent mobile (10 digits).";
    }
    if (!form.parentPassword || form.parentPassword.length < 6) {
      return "Parent password must be at least 6 characters.";
    }
    if (form.parentPassword !== form.confirmParentPassword) {
      return "Parent password and confirm password must match.";
    }

    if (isRegularTrack) {
      if (!form.board.trim()) return "Select board.";
      if (!form.classNumber.trim()) return "Select class.";
    }

    if (isCompetitiveTrack && !form.competitiveExam.trim()) {
      return "Select competitive exam.";
    }

    if (!form.country.trim()) return "Select country.";
    if (!form.preferredLanguage.trim()) return "Select preferred language.";

    return null;
  }

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const error = validateDetails();
    if (error) {
      showError(error);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        studentName: form.studentName.trim(),
        studentMobile: form.studentMobile.trim(),
        studentUserId: form.studentUserId.trim().toLowerCase(),
        studentPassword: form.studentPassword,
        parentName: form.parentName.trim(),
        parentMobile: form.parentMobile.trim(),
        parentPassword: form.parentPassword,
        track: form.track,
        board: isRegularTrack ? form.board : null,
        classNumber: isRegularTrack ? form.classNumber : null,
        competitiveExam: isCompetitiveTrack ? form.competitiveExam : null,
        country: form.country.trim(),
        preferredLanguage: form.preferredLanguage.trim(),
      };

      const res = await fetch("/api/auth/family-signup-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Failed to send OTP (HTTP ${res.status})`);
      }

      if (!data?.otpToken) {
        throw new Error("OTP token missing from response.");
      }

      setOtpToken(String(data.otpToken));
      setOtp("");
      setStep("otp");
      setMsg("OTP sent to parent mobile.");
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err: any) {
      showError(err?.message || "Failed to start family signup.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!otpToken) {
      showError("Session expired. Please start again.");
      return;
    }

    if (!/^\d{4,10}$/.test(otp.trim())) {
      showError("Enter a valid OTP.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        otpToken,
        otp: otp.trim(),
        studentName: form.studentName.trim(),
        studentMobile: form.studentMobile.trim(),
        studentUserId: form.studentUserId.trim().toLowerCase(),
        studentPassword: form.studentPassword,
        parentName: form.parentName.trim(),
        parentMobile: form.parentMobile.trim(),
        parentPassword: form.parentPassword,
        track: form.track,
        board: isRegularTrack ? form.board : null,
        classNumber: isRegularTrack ? form.classNumber : null,
        competitiveExam: isCompetitiveTrack ? form.competitiveExam : null,
        country: form.country.trim(),
        preferredLanguage: form.preferredLanguage.trim(),
      };

      const res = await fetch("/api/auth/family-signup-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Verification failed (HTTP ${res.status})`);
      }

      setStep("success");
      setMsg(null);
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err: any) {
      showError(err?.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "success") {
    return (
      <div ref={formTopRef} className="space-y-4 rounded-2xl border border-green-200 bg-green-50 p-4">
        <div>
          <div className="text-base font-semibold text-green-800">Family signup successful ✅</div>
          <p className="mt-1 text-sm text-green-700">
            Parent and student accounts have been created successfully.
          </p>
        </div>

        <ul className="list-disc pl-5 text-sm text-green-700">
          <li>Parent account ready</li>
          <li>Student account ready</li>
        </ul>

        <button
          type="button"
          className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-100"
          onClick={() => {
            onDone();
            router.push("/parent/login");
          }}
        >
          Go to Parent Login
        </button>

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            if (onSwitchToLogin) onSwitchToLogin();
            onDone();
          }}
        >
          Go to Student Login
        </button>
      </div>
    );
  }

  return (
    <div ref={formTopRef} className="max-h-[78vh] overflow-y-auto pr-1">
      <div className="space-y-4">
        {msg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {msg}
          </div>
        )}

        {step === "details" && (
          <form className="space-y-4" onSubmit={handleDetailsSubmit}>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Student Details</h3>
              <p className="mt-1 text-xs text-slate-500">
                Create student login credentials and learning profile.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2"
                placeholder="Student name"
                value={form.studentName}
                onChange={(e) => updateField("studentName", e.target.value)}
              />

              <input
                inputMode="numeric"
                maxLength={10}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Student mobile"
                value={form.studentMobile}
                onChange={(e) => updateField("studentMobile", e.target.value.replace(/\D/g, ""))}
              />

              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Student User ID"
                value={form.studentUserId}
                onChange={(e) => updateField("studentUserId", e.target.value.toLowerCase())}
              />

              <div className="sm:col-span-2">
                <PasswordField
                  placeholder="Student password"
                  value={form.studentPassword}
                  onChange={(value) => updateField("studentPassword", value)}
                />
              </div>

              <div className="sm:col-span-2">
                <PasswordField
                  placeholder="Confirm student password"
                  value={form.confirmStudentPassword}
                  onChange={(value) => updateField("confirmStudentPassword", value)}
                />
                {form.confirmStudentPassword &&
                  form.studentPassword !== form.confirmStudentPassword && (
                    <div className="mt-1 text-xs text-red-600">
                      Student password and confirm password must match.
                    </div>
                  )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2">
              <h3 className="text-sm font-semibold text-slate-900">Parent Details</h3>
              <p className="mt-1 text-xs text-slate-500">
                Parent mobile will be verified once with OTP during signup.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2"
                placeholder="Parent name"
                value={form.parentName}
                onChange={(e) => updateField("parentName", e.target.value)}
              />

              <input
                inputMode="numeric"
                maxLength={10}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Parent mobile"
                value={form.parentMobile}
                onChange={(e) => updateField("parentMobile", e.target.value.replace(/\D/g, ""))}
              />

              <div className="sm:col-span-1">
                <PasswordField
                  placeholder="Parent password"
                  value={form.parentPassword}
                  onChange={(value) => updateField("parentPassword", value)}
                />
              </div>

              <div className="sm:col-span-2">
                <PasswordField
                  placeholder="Confirm parent password"
                  value={form.confirmParentPassword}
                  onChange={(value) => updateField("confirmParentPassword", value)}
                />
                {form.confirmParentPassword &&
                  form.parentPassword !== form.confirmParentPassword && (
                    <div className="mt-1 text-xs text-red-600">
                      Parent password and confirm password must match.
                    </div>
                  )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2">
              <h3 className="text-sm font-semibold text-slate-900">Learning Track</h3>
              <p className="mt-1 text-xs text-slate-500">
                Choose school syllabus or competitive preparation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-3 text-sm">
                <input
                  type="radio"
                  name="track"
                  checked={isRegularTrack}
                  onChange={() => setTrack("regular")}
                />
                Regular School
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-3 text-sm">
                <input
                  type="radio"
                  name="track"
                  checked={isCompetitiveTrack}
                  onChange={() => setTrack("competitive")}
                />
                Competitive Exam
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                disabled={!isRegularTrack}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                value={form.board}
                onChange={(e) => updateField("board", e.target.value)}
              >
                <option value="CBSE">CBSE</option>
                <option value="TBSE">TBSE</option>
                <option value="ICSE">ICSE</option>
              </select>

              <select
                disabled={!isRegularTrack}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                value={form.classNumber}
                onChange={(e) => updateField("classNumber", e.target.value)}
              >
                {["6", "7", "8", "9", "10", "11", "12"].map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>

              <select
                disabled={!isCompetitiveTrack}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                value={form.competitiveExam}
                onChange={(e) => updateField("competitiveExam", e.target.value as CompetitiveExam)}
              >
                {EXAMS.map((exam) => (
                  <option key={exam} value={exam}>
                    {exam}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={form.country}
                onChange={(e) => updateField("country", e.target.value)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>

              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={form.preferredLanguage}
                onChange={(e) => updateField("preferredLanguage", e.target.value)}
              >
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Sending OTP..." : "Continue"}
            </button>

            {onSwitchToLogin && (
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
            )}
          </form>
        )}

        {step === "otp" && (
          <form className="space-y-4" onSubmit={handleOtpSubmit}>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Verify Parent Mobile</h3>
              <p className="mt-1 text-xs text-slate-500">
                Enter the OTP sent to <span className="font-medium">{form.parentMobile}</span>.
              </p>
            </div>

            <input
              inputMode="numeric"
              maxLength={10}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Verifying..." : "Verify & Create Accounts"}
            </button>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50"
              onClick={() => {
                setStep("details");
                setMsg(null);
              }}
            >
              Edit details
            </button>
          </form>
        )}
      </div>
    </div>
  );
}