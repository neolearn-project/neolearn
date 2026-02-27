"use client";

import type { SubjectRow } from "../types";

export default function SubjectsView({
  subjects,
  selectedSubjectId,
  setSelectedSubjectId,
  loading,
  error,
}: {
  subjects: SubjectRow[];
  selectedSubjectId: number | null;
  setSelectedSubjectId: (id: number | null) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Subjects</h1>
      {loading && (
        <p className="text-xs text-gray-500">Loading subjects from server…</p>
      )}
      {error && (
        <p className="text-xs text-red-500">
          Failed to load subjects: {error}
        </p>
      )}

      {subjects.length === 0 && !loading && !error && (
        <p className="text-xs text-gray-500">No subjects found yet.</p>
      )}

      {subjects.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">
            Select subject for this student
          </label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedSubjectId ?? ""}
            onChange={(e) =>
              setSelectedSubjectId(
                e.target.value ? Number(e.target.value) : null
              )
            }
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_name} (Class {s.class_number.toString()})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">
            This subject selection is shared with the AI Teacher in the
            Classroom tab.
          </p>
        </div>
      )}
    </div>
  );
}
