"use client";

import type { ChapterRow, SubjectRow } from "../types";

export default function ChaptersView({
  chapters,
  currentSubject,
  selectedChapterId,
  setSelectedChapterId,
  loading,
  error,
}: {
  chapters: ChapterRow[];
  currentSubject: SubjectRow | null;
  selectedChapterId: number | null;
  setSelectedChapterId: (id: number | null) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Chapters</h1>

      {!currentSubject && (
        <p className="text-xs text-gray-500">
          Please select a subject first under the <b>Subjects</b> tab.
        </p>
      )}

      {loading && (
        <p className="text-xs text-gray-500">Loading chapters…</p>
      )}
      {error && (
        <p className="text-xs text-red-500">
          Failed to load chapters: {error}
        </p>
      )}

      {currentSubject && chapters.length === 0 && !loading && !error && (
        <p className="text-xs text-gray-500">
          No chapters found for {currentSubject.subject_name}.
        </p>
      )}

      {currentSubject && chapters.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">
            Subject:{" "}
            <span className="font-semibold">
              {currentSubject.subject_name}
            </span>
          </div>
          <label className="text-xs font-medium text-gray-600">
            Select chapter
          </label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedChapterId ?? ""}
            onChange={(e) =>
              setSelectedChapterId(
                e.target.value ? Number(e.target.value) : null
              )
            }
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.chapter_number}. {c.chapter_name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">
            Selected chapter will be used by the AI Teacher while explaining
            topics.
          </p>
        </div>
      )}
    </div>
  );
}
