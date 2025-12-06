"use client";

import { useState } from "react";

export default function AdminSyllabusPage() {
  const [adminPassword, setAdminPassword] = useState("");
  const [board, setBoard] = useState("cbse");
  const [classNumber, setClassNumber] = useState("6");
  const [subjectName, setSubjectName] = useState("Mathematics");
  const [subjectCode, setSubjectCode] = useState("maths6");
  const [overwrite, setOverwrite] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setStatus(null);
    if (!adminPassword.trim()) {
      setStatus("Please enter admin password.");
      return;
    }
    if (!subjectName.trim()) {
      setStatus("Please enter subject name.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai-syllabus-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword,
          board,
          classNumber: Number(classNumber || 6),
          subjectName,
          subjectCode: subjectCode || subjectName.toLowerCase().replace(/\s+/g, ""),
          overwrite,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus(
          data?.error || `Failed with HTTP ${res.status}. Check logs in Vercel.`
        );
        return;
      }

      setStatus(
        `✅ Done! subject_id=${data.subjectId}, chapters inserted=${data.chaptersInserted}. ` +
          `Check “subjects / chapters / topics” tables in Supabase.`
      );
    } catch (err: any) {
      console.error("AI syllabus admin error:", err);
      setStatus("Unexpected error. See console / server logs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="font-semibold text-lg">NeoLearn Admin Console</div>
        <div className="text-xs text-gray-500">AI Auto Syllabus</div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">Generate AI Syllabus (per subject)</h1>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Admin password
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Same password you use on /admin/leads"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Board
            </label>
            <select
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="cbse">CBSE</option>
              <option value="icse">ICSE</option>
              <option value="tbse">TBSE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Class
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={classNumber}
              onChange={(e) => setClassNumber(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subject name
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Mathematics / Science / English …"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subject code (optional)
            </label>
            <input
              type="text"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="maths6 / sci6 / eng6 …"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2 mt-1">
            <input
              id="overwrite"
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="overwrite"
              className="text-xs text-gray-700 select-none"
            >
              Overwrite existing chapters for this subject (delete and re-create).
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate Syllabus"}
        </button>

        {status && (
          <p className="mt-4 text-sm whitespace-pre-wrap text-gray-800">
            {status}
          </p>
        )}
      </main>
    </div>
  );
}
