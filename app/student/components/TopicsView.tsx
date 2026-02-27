"use client";

import type { ChapterRow, SubjectRow, TopicRow } from "../types";

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
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Topics</h1>

      {(!currentSubject || !currentChapter) && (
        <p className="text-xs text-gray-500">
          Please select subject and chapter first under{" "}
          <b>Subjects</b> and <b>Chapters</b> tabs.
        </p>
      )}

      {loading && (
        <p className="text-xs text-gray-500">Loading topics…</p>
      )}
      {error && (
        <p className="text-xs text-red-500">
          Failed to load topics: {error}
        </p>
      )}

      {currentSubject &&
        currentChapter &&
        topics.length === 0 &&
        !loading &&
        !error && (
          <p className="text-xs text-gray-500">
            No topics found for this chapter yet.
          </p>
        )}

      {currentSubject && currentChapter && topics.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">
            Subject:{" "}
            <span className="font-semibold">
              {currentSubject.subject_name}
            </span>
          </div>
          <div className="text-xs text-gray-600">
            Chapter:{" "}
            <span className="font-semibold">
              {currentChapter.chapter_number}. {currentChapter.chapter_name}
            </span>
          </div>

          <label className="text-xs font-medium text-gray-600">
            Select topic
          </label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedTopicId ?? ""}
            onChange={(e) =>
              setSelectedTopicId(
                e.target.value ? Number(e.target.value) : null
              )
            }
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.topic_number}. {t.topic_name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">
            The selected topic is what the AI Teacher will explain in the
            Classroom tab.
          </p>
        </div>
      )}
    </div>
  );
}
