"use client";

import React, { useState } from "react";

type Mode = "idle" | "loading" | "done" | "error";

export default function TeacherBot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [showPopup, setShowPopup] = useState(false);

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
          student_class: "Class 6",
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
      <form onSubmit={askTeacher} className="space-y-2">
        <textarea
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Example: Ma'am, I don’t understand how to add fractions like 3/4 + 1/6."
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

      {/* Optional: keep a small inline message when no popup */}
      {mode === "loading" && (
        <div className="text-xs text-gray-500">Teacher is thinking…</div>
      )}

      {/* POPUP ANSWER MODAL */}
      {showPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-3">
          <div className="max-h-[80vh] w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                NeoLearn Maths Teacher
              </h3>
              <button
                type="button"
                className="ml-2 rounded-full px-2 text-sm text-gray-500 hover:bg-gray-100"
                onClick={() => setShowPopup(false)}
              >
                ✕
              </button>
            </div>

            <div className="mb-3 text-xs text-gray-500">
              Doubt asked:{" "}
              <span className="font-medium text-gray-700">
                {question || "—"}
              </span>
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
                  // keep previous question so parent can tweak it
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
