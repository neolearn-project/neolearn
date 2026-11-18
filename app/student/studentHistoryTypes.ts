export type NoteType = "full_exam_notes" | "quick_revision" | "important_qna" | "mcq_only";

export type StoredSession = {
  messages?: { author: "Teacher" | "You"; text: string }[];
  draft?: string;
  cloud?: boolean;
  cloudSummary?: boolean;
  id: string;
  studentMobile: string;
  subjectId?: number | null;
  chapterId?: number | null;
  topicId?: number | null;
  subject: string;
  chapter: string;
  topic: string;
  language: string;
  startedAt: string; // ISO
  endedAt: string;   // ISO
  transcript: string; // current topic/session transcript only
};

