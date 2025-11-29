"use client";

import React, { useState } from "react";

type Mode = "idle" | "loading" | "done" | "error";

type BoardId = "cbse" | "tbse" | "icse";
type LangCode = "en" | "hi" | "bn";
type ClassId = "5" | "6" | "7" | "8" | "9";

const BOARDS: { id: BoardId; label: string }[] = [
  { id: "cbse", label: "CBSE (NCERT)" },
  { id: "tbse", label: "TBSE (Tripura Board)" },
  { id: "icse", label: "ICSE (CISCE)" },
];

const CLASSES: { id: ClassId; label: string }[] = [
  { id: "5", label: "Class 5" },
  { id: "6", label: "Class 6" },
  { id: "7", label: "Class 7" },
  { id: "8", label: "Class 8" },
  { id: "9", label: "Class 9" },
];

const CHAPTERS = [
  {
    id: "fractions",
    labels: {
      en: "Fractions",
      hi: "भिन्न",
      bn: "ভগ্নাংশ",
    },
  },
  {
    id: "decimals",
    labels: {
      en: "Decimals",
      hi: "दशमलव",
      bn: "দশমিক সংখ্যা",
    },
  },
  {
    id: "ratio-and-percentage",
    labels: {
      en: "Ratio and Percentage",
      hi: "अनुपात और प्रतिशत",
      bn: "অনুপাত ও শতকরা",
    },
  },
];

export default function TeacherBot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [showPopup, setShowPopup] = useState(false);

  const [board, setBoard] = useState<BoardId>("cbse");
  const [lang, setLang] = useState<LangCode>("en");
  const [classId, setClassId] = useState<ClassId>("6");
  const [chapterId, setChapterId] = useState<string>("fractions");

  const currentChapter =
    CHAPTERS.find((ch) => ch.id === chapterId) ?? CHAPTERS[0];

  async function askTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setMode("loading");
    setAnswer("");

    try {
      const res = await fetch("/api/teacher-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          student_class: `Class ${classId}`,
          subjectId: "maths",
          classId,
          board,
          lang,
          chapterId,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        console.error("Teacher error:", data.error || res.statusText);
        setMode("error");
        setAnswer(data.error || "Sorry, I could not answer this question.");
        setShowPopup(true);
        return;
      }

      setAnswer(data.answer || "Sorry, I could not answer this question.");
      setMode("done");
      setShowPopup(true);
    } catch (err) {
      console.error("Teacher exception:", err);
      setMode("error");
      setAnswer("Something went wrong. Please try again.");
      setShowPopup(true);
    }
  }

  return (
    <div className="space-y-3">
      {/* Class / Board / Language row */}
      <div className="grid gap-2 md:grid-cols-4">
        {/* Class */}
        <select
          className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value as ClassId)}
        >
          {CLASSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Board */}
        <select
          className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          value={board}
          onChange={(e) => setBoard(e.target.value as BoardId)}
        >
          {BOARDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        {/* Chapter */}
        <select
          className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          value={chapterId}
          onChange={(e) => setChapterId(e.target.value)}
        >
          {CHAPTERS.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.labels[lang]}
            </option>
          ))}
        </select>

        {/* Language */}
        <select
          className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          value={lang}
          onChange={(e) => setLang(e.target.value as LangCode)}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="bn">বাংলা</option>
        </select>
      </div>

      <form onSubmit={askTeacher} className="space-y-2">
        <textarea
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Example: Sir/Ma'am, I don’t understand how to add fractions like 3/4 + 1/6."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={mode === "loading"}
        >
          {mode === "loading" ? "Thinking..." : "Ask Maths Teacher"}
        </button>
      </form>

      {mode === "loading" && (
        <div className="text-xs text-gray-500">Teacher is thinking…</div>
      )}

      {/* POPUP ANSWER MODAL */}
      {showPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-3">
          <div className="max-h-[80vh] w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                NeoLearn Maths Teacher (Class {classId})
              </h3>
              <button
                type="button"
                className="ml-2 rounded-full px-2 text-sm text-gray-500 hover:bg-gray-100"
                onClick={() => setShowPopup(false)}
              >
                ✕
              </button>
            </div>

            <div className="mb-2 text-xs text-gray-500 space-y-1">
              <div>
                <span className="font-semibold">Class:</span>{" "}
                {CLASSES.find((c) => c.id === classId)?.label}
              </div>
              <div>
                <span className="font-semibold">Board:</span>{" "}
                {BOARDS.find((b) => b.id === board)?.label}
              </div>
              <div>
                <span className="font-semibold">Chapter:</span>{" "}
                {currentChapter.labels[lang]}
              </div>
              <div>
                <span className="font-semibold">Language:</span>{" "}
                {lang === "en"
                  ? "English"
                  : lang === "hi"
                  ? "हिन्दी"
                  : "বাংলা"}
              </div>
              <div>
                <span className="font-semibold">Doubt:</span>{" "}
                <span className="text-gray-700">{question || "—"}</span>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 px-3 py-3 text-sm leading-relaxed">
              {answer}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                onClick={() => setShowPopup(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                onClick={() => {
                  setShowPopup(false);
                }}
              >
                Ask another doubt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
