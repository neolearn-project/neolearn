'use client';

import React from "react";
import type { TopicRow, SubjectRow, ChapterRow } from "../types";

export default function TopicsView({
  topics,
  currentSubject,
  currentChapter,
  selectedTopicId,
  setSelectedTopicId,
  loading,
  error,
}: {
  topics: TopicRow[];
  currentSubject: SubjectRow | null;
  currentChapter: ChapterRow | null;
  selectedTopicId: number | null;
  setSelectedTopicId: (id: number | null) => void;
  loading: boolean;
  error: string | null;
}) {
  // TODO: Move actual TopicsView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Topics</h1>
      {loading && <p className="text-xs text-gray-500">Loading topics...</p>}
      {error && <p className="text-xs text-red-500">Error: {error}</p>}
      <div className="text-xs text-gray-500">Stub: paste TopicsView implementation here.</div>
    </div>
  );
}
