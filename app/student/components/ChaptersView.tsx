'use client';

import React from "react";
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
  // TODO: Move actual ChaptersView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Chapters</h1>
      {loading && <p className="text-xs text-gray-500">Loading chapters...</p>}
      {error && <p className="text-xs text-red-500">Error: {error}</p>}
      <div className="text-xs text-gray-500">Stub: paste ChaptersView implementation here.</div>
    </div>
  );
}
