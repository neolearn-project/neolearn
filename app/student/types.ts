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
  id: string | number;
  author: "Teacher" | "You" | "System";
  text: string;
  isError?: boolean;
  ts: string;
};

export type SubjectRow = {
  id: number;
  board: string;
  class_number: number;
  subject_code: string;
  subject_name: string;
};

export type ChapterRow = {
  id: number;
  subject_id: number;
  chapter_number: number;
  chapter_name: string;
};

export type TopicRow = {
  id: number;
  chapter_id: number;
  topic_number: number;
  topic_name: string;
  content?: string | null;
  is_active?: boolean;
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


