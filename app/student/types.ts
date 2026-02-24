export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type ActiveTab =
  | "classroom"
  | "subjects"
  | "chapters"
  | "topics"
  | "progress"
  | "payments"
  | "gallery"
  | "routine";

export type ChatMessage = {
  id: string;
  role: "Teacher" | "You" | "System";
  text: string;
  isError?: boolean;
  ts?: number;
};

export type SubjectRow = {
  id: number;
  subject_code?: string | null;
  subject_name?: string | null;
};

export type ChapterRow = {
  id: number;
  chapter_name?: string | null;
  subject_id?: number | null;
};

export type TopicRow = {
  id: number;
  topic_name?: string | null;
  chapter_id?: number | null;
  status?: string | null;
};

export type StudentInfo = {
  studentId?: string | null;
  name: string;
  mobile: string;
  classId: string;
};

export type TopicTestQuestion = {
  id: number;
  question: string;
  options: string[];
  correctIndex?: number | null;
};

