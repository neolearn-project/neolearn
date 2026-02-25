'use client';

import React from "react";
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
  // TODO: Move actual SubjectsView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Subjects</h1>
      {loading && <p className="text-xs text-gray-500">Loading subjects from server...</p>}
      {error && <p className="text-xs text-red-500">Error: {error}</p>}
      <div className="text-xs text-gray-500">Stub: paste SubjectsView implementation here.</div>
    </div>
  );
}
