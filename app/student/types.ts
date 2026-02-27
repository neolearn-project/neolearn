export type ClassId = "5" | "6" | "7" | "8" | "9";

export interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;
}

export interface SubjectRow {
  id: number;
  board: string;
  class_number: number;
  subject_code: string;
  subject_name: string;
}

export interface ChapterRow {
  id: number;
  subject_id: number;
  chapter_number: number;
  chapter_name: string;
}

export interface TopicRow {
  id: number;
  chapter_id: number;
  topic_number: number;
  topic_name: string;
  content: any;
  is_active: boolean;
  status?: "completed" | "in_progress" | "needs_revision" | "not_started" | string;
}

export interface WeeklyProgressRow {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
}

export interface DailyProgressRow {
  date: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
}

export interface SyllabusResponse {
  ok: boolean;
  data?: {
    subjects: SubjectRow[];
    chapters: ChapterRow[];
    topics: TopicRow[];
  };
  error?: string;
}

export type ActiveTab =
  | "classroom"
  | "subjects"
  | "chapters"
  | "topics"
  | "progress"
  | "payments"
  | "gallery";

export type MessageAuthor = "Teacher" | "You";

export interface ChatMessage {
  id: number;
  author: MessageAuthor;
  text: string;
  ts: string;
  isError?: boolean;
}

export interface TopicTestQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export type LanguageOption = "English" | "Hindi" | "Bengali";
export type SpeedOption = "Slow" | "Normal" | "Fast";
