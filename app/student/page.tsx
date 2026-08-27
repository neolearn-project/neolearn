"use client";

declare global {
  interface Window {
    Razorpay: any;
  }
}

import Image from "next/image";
import { getAvatarForSubject } from "../lib/teacherAvatar";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RealtimeTeacherClient } from "./realtimeTeacherClient";
import jsPDF from "jspdf";
import {
  BookOpen,
  Camera,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HelpCircle,
  History,
  Images,
  Lightbulb,
  ListChecks,
  Loader2,
  Maximize2,
  Menu,
  Mic,
  Minimize2,
  Monitor,
  MoreVertical,
  Pencil,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Target,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { ClientAuthError, loginAgainMessage, studentAuthHeaders } from "@/app/lib/clientAuth";
import { readJsonResponse } from "@/app/lib/safeResponse";

type ClassId = "6" | "7" | "8" | "9" | "10" | "11" | "12";

type NoteType = "full_exam_notes" | "quick_revision" | "important_qna" | "mcq_only";

interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;
  board?: string;
  track?: "regular" | "competitive" | string;
  subjectType?: "regular" | "competitive" | string;
  competitiveExam?: string | null;

  // Supabase Auth user id (needed for Persona Engine)
  studentId?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number | null;
}

interface SubjectRow {
  id: number;
  board: string;
  class_number: number;
  subject_code: string;
  subject_name: string;
}

interface ChapterRow {
  id: number;
  subject_id: number;
  chapter_number: number;
  chapter_name: string;
}

interface TopicRow {
  id: number;
  chapter_id: number;
  topic_number: number;
  topic_name: string;
  content: any;
  is_active: boolean;

  // Added for UI (even if backend does not send it sometimes)
  status?: "completed" | "in_progress" | "needs_revision" | "not_started" | string;
}

interface WeeklyProgressRow {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
}

type DailyMissionTaskType = "learn_topic" | "topic_test" | "review_weak_area";

interface DailyMissionTask {
  id: string;
  task_type: DailyMissionTaskType;
  title: string;
  status: "pending" | "completed";
  sort_order: number;
}

interface DailyMission {
  id: string;
  mission_date: string;
  status: "pending" | "in_progress" | "completed";
  topic_id: number | null;
  subject_id: number | null;
  chapter_id: number | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_name: string;
  weak_area: string | null;
  latest_score: number | null;
}

function isRawMissionLabel(value: unknown) {
  const text = String(value ?? "").trim();
  return /^topic\s*\d+$/i.test(text) || /^\d+$/.test(text);
}

function missionLabel(value: unknown, fallback = "current topic") {
  const text = String(value ?? "").trim();
  if (!text || isRawMissionLabel(text)) return fallback;
  return text;
}

function missionWeakAreaLabel(value: unknown, topicName: unknown) {
  const text = String(value ?? "").trim();
  if (!text || /\btopic\s*\d+\b/i.test(text)) {
    const topic = missionLabel(topicName, "today's topic");
    return topic === "today's topic" ? "Mistakes from today's test" : `Mistakes from ${topic}`;
  }
  return text;
}

function missionTaskTitle(taskType: DailyMissionTaskType, topicName: unknown) {
  if (taskType === "learn_topic") return `Learn: ${missionLabel(topicName, "Continue current topic")}`;
  if (taskType === "topic_test") return "Practice: Take 5-question Topic Test";
  return "Review: Fix mistakes from today's test";
}

interface SyllabusResponse {
  ok: boolean;
  data?: {
    subjects: SubjectRow[];
    chapters: ChapterRow[];
    topics: TopicRow[];
  };
  error?: string;
}

type ActiveTab =
  | "dashboard"
  | "classroom"
  | "subjects"
  | "chapters"
  | "topics"
  | "progress"
  | "payments"
  | "gallery"
  | "routine";

type MessageAuthor = "Teacher" | "You";

interface ChatMessage {
  id: number;
  author: MessageAuthor;
  text: string;
  ts: string;
  isError?: boolean;
}

type ClassSession = {
  id: string;
  startTime: number;   // timestamp
  endTime: number;     // timestamp
  isLive: boolean;
  subjects: string[];  // ["Maths", "Science"]
};

type StoredSession = {
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

type SessionHistoryResult = {
  sessions: StoredSession[];
  error: string | null;
};

const HISTORY_LIST_LIMIT = 200;
const HISTORY_INITIAL_VISIBLE = 30;
const TRANSCRIPT_PREVIEW_LENGTH = 140;
const TRANSCRIPT_DETAIL_CHUNK = 8000;
const TRANSCRIPT_DETAIL_MAX = 32000;

function safeHistoryText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeHistoryDate(value: unknown) {
  const text = safeHistoryText(value);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function formatHistoryDate(value: unknown) {
  const date = safeHistoryDate(value);
  return date ? date.toLocaleString() : "Date unavailable";
}

function normalizeStoredSession(
  value: unknown,
  index: number
): StoredSession | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const endedAt =
    safeHistoryDate(raw.endedAt)?.toISOString() ||
    safeHistoryDate(raw.startedAt)?.toISOString() ||
    new Date(0).toISOString();
  const startedAt =
    safeHistoryDate(raw.startedAt)?.toISOString() || endedAt;
  const transcript = safeHistoryText(raw.transcript);
  const studentMobile = safeHistoryText(raw.studentMobile);

  if (!studentMobile || !transcript) return null;

  const numberOrNull = (input: unknown) => {
    if (input === null || input === undefined || input === "") return null;
    const number = Number(input);
    return Number.isFinite(number) ? number : null;
  };

  return {
    id:
      safeHistoryText(raw.id) ||
      `legacy-${studentMobile}-${Date.parse(endedAt)}-${index}`,
    studentMobile,
    subjectId: numberOrNull(raw.subjectId),
    chapterId: numberOrNull(raw.chapterId),
    topicId: numberOrNull(raw.topicId),
    subject: safeHistoryText(raw.subject, "Unknown Subject"),
    chapter: safeHistoryText(raw.chapter, "Unknown Chapter"),
    topic: safeHistoryText(raw.topic, "Unknown Topic"),
    language: safeHistoryText(raw.language, "Unknown"),
    startedAt,
    endedAt,
    transcript,
  };
}

function compactTranscriptForSave(value: string) {
  const blocks = String(value || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const compacted: string[] = [];

  for (const block of blocks) {
    if (compacted[compacted.length - 1] !== block) {
      compacted.push(block);
    }
  }

  return compacted.join("\n\n").trim();
}

function extractTranscriptDelta(previousValue: string, nextValue: string) {
  const previous = String(previousValue || "");
  const next = String(nextValue || "");

  if (!next || next === previous || previous.startsWith(next)) return "";
  if (!previous) return next;
  if (next.startsWith(previous)) return next.slice(previous.length);
  if (previous.includes(next)) return "";

  let commonPrefixLength = 0;
  const prefixLimit = Math.min(previous.length, next.length);
  while (
    commonPrefixLength < prefixLimit &&
    previous[commonPrefixLength] === next[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  if (
    commonPrefixLength >= 60 ||
    commonPrefixLength >= Math.floor(previous.length * 0.7)
  ) {
    return next.slice(commonPrefixLength);
  }

  const overlapLimit = Math.min(previous.length, next.length, 2000);
  for (let size = overlapLimit; size >= 24; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) {
      return next.slice(size);
    }
  }

  return `\n\n${next}`;
}

function pauseAndResetAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.pause();
  } catch {}
  try {
    audio.currentTime = 0;
  } catch {}
}

function pauseAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.pause();
  } catch {}
}

const TOPIC_STATUS_UI: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  needs_revision: "Needs Revision",
  not_started: "Not Started",
};

const SESSION_HISTORY_KEY = "neolearnSessionHistory";
const LESSON_LOADING_MESSAGE = "Generating your lesson. Please wait a moment...";

const STORAGE_KEY = "neolearnStudent";
const HELPDESK_URL = "https://neo-voicedesk.vercel.app/help/neolearn";
type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

const WEEKDAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type RoutineDayPlan = {
  time: string; // "18:30" (24h)
  subject1Id: number | null;
  subject2Id: number | null;
  minutesPerSubject: number; // 30-45 recommended
};

type WeeklyRoutine = Record<Weekday, RoutineDayPlan>;

function getTodayWeekday(): Weekday {
  // JS: Sunday=0 ... Saturday=6
  const d = new Date().getDay();
  const map: Weekday[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return map[d];
}

function defaultRoutine(): WeeklyRoutine {
  const base: RoutineDayPlan = {
    time: "18:30",
    subject1Id: null,
    subject2Id: null,
    minutesPerSubject: 30,
  };
  return {
    Monday: { ...base },
    Tuesday: { ...base },
    Wednesday: { ...base },
    Thursday: { ...base },
    Friday: { ...base },
    Saturday: { ...base },
    Sunday: { ...base },
  };
}

function cleanSubjectName(value: string | undefined | null) {
  return String(value || "AI")
    .replace(/\bPhyscs\b/gi, "Physics")
    .replace(/\bPhyics\b/gi, "Physics")
    .trim();
}
function slugifyNeoLearn(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const COMPETITIVE_SUBJECTS: Record<string, string[]> = {
  JEE: ["Physics", "Chemistry", "Mathematics"],
  NEET: ["Physics", "Chemistry", "Biology"],
  CUET: ["English", "General Test", "Domain Subjects"],
  SSC: ["Reasoning", "Quantitative Aptitude", "English", "General Awareness"],
  Banking: ["Reasoning", "Quantitative Aptitude", "English", "Banking Awareness", "Computer Awareness"],
  UPSC: ["History", "Polity", "Geography", "Economy", "Environment", "Current Affairs"],
  Foundation: ["Mathematics", "Science", "Reasoning", "English"],
};

const COMPETITIVE_TOPIC_SETS: Record<string, string[]> = {
  Physics: ["Units and Measurements", "Motion", "Laws of Motion", "Work, Energy and Power", "Electricity Basics"],
  Chemistry: ["Atomic Structure", "Chemical Bonding", "Mole Concept", "Acids, Bases and Salts", "Organic Chemistry Basics"],
  Mathematics: ["Algebra Basics", "Trigonometry", "Coordinate Geometry", "Calculus Foundation", "Probability"],
  Biology: ["Cell Biology", "Human Physiology", "Genetics", "Plant Physiology", "Ecology"],
  English: ["Grammar Basics", "Reading Comprehension", "Vocabulary", "Error Detection", "Para Jumbles"],
  "General Test": ["Numerical Ability", "Logical Reasoning", "General Knowledge", "Current Affairs", "Data Interpretation"],
  "Domain Subjects": ["Domain Concept Practice", "Important Formulae", "NCERT Based Questions", "MCQ Practice", "Previous Pattern Practice"],
  Reasoning: ["Analogy", "Series", "Coding-Decoding", "Blood Relation", "Syllogism"],
  "Quantitative Aptitude": ["Number System", "Percentage", "Profit and Loss", "Time and Work", "Data Interpretation"],
  "General Awareness": ["Indian History", "Indian Polity", "Geography", "Economy", "Current Affairs"],
  "Banking Awareness": ["Banking Basics", "RBI", "Financial Awareness", "Banking Terms", "Current Banking Updates"],
  "Computer Awareness": ["Computer Basics", "Internet", "MS Office", "Cyber Security", "Digital Payments"],
  History: ["Ancient India", "Medieval India", "Modern India", "World History", "Freedom Movement"],
  Polity: ["Constitution", "Parliament", "Fundamental Rights", "Directive Principles", "Judiciary"],
  Geography: ["Physical Geography", "Indian Geography", "Climate", "Resources", "Maps"],
  Economy: ["Basic Economics", "Budget", "Banking", "Inflation", "Planning and Development"],
  Environment: ["Ecology", "Biodiversity", "Pollution", "Climate Change", "Conservation"],
  "Current Affairs": ["National Affairs", "International Affairs", "Science and Technology", "Sports", "Government Schemes"],
  Science: ["Physics Basics", "Chemistry Basics", "Biology Basics", "Daily Life Science", "MCQ Practice"],
};

function getCompetitiveSyllabus(examRaw: string | null | undefined) {
  const exam = String(examRaw || "Foundation").trim() || "Foundation";
  const subjectNames = COMPETITIVE_SUBJECTS[exam] || COMPETITIVE_SUBJECTS.Foundation;

  const subjects: SubjectRow[] = [];
  const chapters: ChapterRow[] = [];
  const topics: TopicRow[] = [];

  subjectNames.forEach((subjectName, sIndex) => {
    const subjectId = 900000 + sIndex + 1;
    const chapterBase = 910000 + (sIndex + 1) * 100;
    const topicBase = 920000 + (sIndex + 1) * 1000;

    subjects.push({
      id: subjectId,
      board: exam,
      class_number: 0,
      subject_code: `${slugifyNeoLearn(exam)}-${slugifyNeoLearn(subjectName)}`,
      subject_name: subjectName,
    });

    const chapterNames = [
      "Core Concepts",
      "Exam Shortcuts",
      "MCQ Practice",
    ];

    chapterNames.forEach((chapterName, cIndex) => {
      const chapterId = chapterBase + cIndex + 1;

      chapters.push({
        id: chapterId,
        subject_id: subjectId,
        chapter_number: cIndex + 1,
        chapter_name: chapterName,
      });

      const baseTopics = COMPETITIVE_TOPIC_SETS[subjectName] || [
        "Concept Basics",
        "Important Questions",
        "Shortcut Methods",
        "Practice MCQs",
        "Previous Pattern Questions",
      ];

      baseTopics.forEach((topicName, tIndex) => {
        topics.push({
          id: topicBase + cIndex * 100 + tIndex + 1,
          chapter_id: chapterId,
          topic_number: tIndex + 1,
          topic_name:
            cIndex === 0
              ? topicName
              : cIndex === 1
              ? `${topicName} - Shortcut Approach`
              : `${topicName} - MCQ Practice`,
          content: "",
          is_active: true,
        });
      });
    });
  });

  return { subjects, chapters, topics };
}

function getFallbackSyllabus(classId: string) {
  const fallbackSubjects: SubjectRow[] = [
    {
      id: 1001,
      board: "cbse",
      class_number: Number(classId || "6"),
      subject_code: "maths",
      subject_name: "Mathematics",
    },
  ];

  const fallbackChapters: ChapterRow[] = [
    { id: 2001, subject_id: 1001, chapter_number: 1, chapter_name: "Fractions" },
    { id: 2002, subject_id: 1001, chapter_number: 2, chapter_name: "Decimals" },
  ];

  const fallbackTopics: TopicRow[] = [
    {
      id: 3001,
      chapter_id: 2001,
      topic_number: 1,
      topic_name: "Introduction to Fractions",
      content: null,
      is_active: true,
    },
    {
      id: 3002,
      chapter_id: 2001,
      topic_number: 2,
      topic_name: "Addition of Fractions",
      content: null,
      is_active: true,
    },
    {
      id: 3003,
      chapter_id: 2002,
      topic_number: 1,
      topic_name: "Place Value in Decimals",
      content: null,
      is_active: true,
    },
  ];

  return {
    subjects: fallbackSubjects,
    chapters: fallbackChapters,
    topics: fallbackTopics,
  };
}

export default function StudentDashboardPage() {
  const router = useRouter();

const [teacherAvatar, setTeacherAvatar] = useState<string>(
    "/avatars/niya-math.png"
  );

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(true);
const [payingPlanCode, setPayingPlanCode] = useState<string | null>(null);
const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
const [focusFullscreenActive, setFocusFullscreenActive] = useState(false);
const [studentProfileOpen, setStudentProfileOpen] = useState(false);
const [studentMenuOpen, setStudentMenuOpen] = useState(false);
const [settingsNoticeOpen, setSettingsNoticeOpen] = useState(false);
const studentHeaderActionsRef = useRef<HTMLDivElement | null>(null);
const [startFlowOpen, setStartFlowOpen] = useState(false);
const [guidedStartPendingTopicId, setGuidedStartPendingTopicId] = useState<number | null>(null);
const [guidedStartStatus, setGuidedStartStatus] = useState<string | null>(null);
const [trialLimitNotice, setTrialLimitNotice] = useState<{
  topicId: number | null;
  message: string;
} | null>(null);

useEffect(() => {
  if (activeTab !== "classroom") setFocusFullscreenActive(false);
}, [activeTab]);

useEffect(() => {
  if (!studentProfileOpen && !studentMenuOpen && !settingsNoticeOpen) return;

  const closeStudentMenus = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (studentHeaderActionsRef.current?.contains(target)) return;

    setStudentProfileOpen(false);
    setStudentMenuOpen(false);
    setSettingsNoticeOpen(false);
  };

  document.addEventListener("pointerdown", closeStudentMenus);
  return () => document.removeEventListener("pointerdown", closeStudentMenus);
}, [studentProfileOpen, studentMenuOpen, settingsNoticeOpen]);

  // ---------------- Notes Engine (v1) ----------------
const [noteType, setNoteType] = useState<NoteType>("full_exam_notes");
  const [notesMarkdown, setNotesMarkdown] = useState<string>("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

 const [routine, setRoutine] = useState<WeeklyRoutine>(defaultRoutine());
  const [routineLoaded, setRoutineLoaded] = useState(false);

   const startTodayClass = (dayOverride?: Weekday) => {
    const day = dayOverride ?? getTodayWeekday();
    const plan = routine[day];

    if (!plan?.subject1Id || !plan?.subject2Id) {
      alert(`Routine not set for ${day}. Please select 2 subjects first.`);
      return;
    }

    setSelectedSubjectId(plan.subject1Id);
    setSelectedChapterId(null);
    setSelectedTopicId(null);

    setActiveTab("classroom");

    setAutoStartPayload({
      subject1Id: plan.subject1Id,
      subject2Id: plan.subject2Id,
      minutesPerSubject: plan.minutesPerSubject || 30,
    });
    setAutoStartToken((n) => n + 1);
  };

       
  // Used to trigger "auto start" inside ClassroomView
  const [autoStartToken, setAutoStartToken] = useState(0);
  const [autoStartPayload, setAutoStartPayload] = useState<{
    subject1Id: number;
    subject2Id: number;
    minutesPerSubject: number;
  } | null>(null);


const [savedSessions, setSavedSessions] = useState<StoredSession[]>([]);
const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyError, setHistoryError] = useState<string | null>(null);
const loadedHistoryStudentRef = useRef<string | null>(null);


const [classSession, setClassSession] = useState<ClassSession | null>(null);
const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
// Store the full realtime transcript for this class session
const [sessionTranscript, setSessionTranscript] = useState<string>("");
const sessionTranscriptRef = useRef<string>("");

const resetSessionTranscript = useCallback(() => {
  sessionTranscriptRef.current = "";
  setSessionTranscript("");
}, []);

const appendSessionTranscript = useCallback((line: string) => {
  let clean = String(line || "").trim();
  if (!clean) return;

  const current = sessionTranscriptRef.current.trim();
  const recentTranscript = current.slice(
    -Math.max(4000, Math.min(clean.length * 2, 16000))
  );
  if (
    current &&
    (current.endsWith(clean) || recentTranscript.includes(clean))
  ) {
    return;
  }

  if (current && clean.startsWith(current)) {
    clean = clean.slice(current.length).trim();
  }
  if (!clean) return;

  sessionTranscriptRef.current = [current, clean]
    .filter(Boolean)
    .join("\n\n");
}, []);

  const handleLogout = () => {
    const audio =
      typeof document !== "undefined"
        ? (document.getElementById("lesson-audio") as HTMLAudioElement | null)
        : null;
    pauseAndResetAudio(audio);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    router.replace("/");
  };
const printSession = () => {
  if (typeof window === "undefined") return;
  window.print();
};

// DEV: Start a live class session (temporary)
const startClassSession = () => {
  const now = Date.now();
  const durationMinutes = 40;

  const session: ClassSession = {
    id: crypto.randomUUID(),
    startTime: now,
    endTime: now + durationMinutes * 60 * 1000,
    isLive: true,
    subjects: ["Maths", "Science"],
  };

  setClassSession(session);
  setRemainingSeconds(durationMinutes * 60);
};
function loadSessionHistory(): SessionHistoryResult {
  if (typeof window === "undefined") {
    return { sessions: [], error: null };
  }

  try {
    const raw = window.localStorage.getItem(SESSION_HISTORY_KEY);
    if (!raw) return { sessions: [], error: null };

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        sessions: [],
        error: "Saved class history is not in a supported format.",
      };
    }

    const sessions = parsed
      .slice(0, HISTORY_LIST_LIMIT)
      .map(normalizeStoredSession)
      .filter((session): session is StoredSession => !!session);
    const malformedCount =
      Math.min(parsed.length, HISTORY_LIST_LIMIT) - sessions.length;

    return {
      sessions,
      error:
        malformedCount > 0
          ? `${malformedCount} malformed class ${
              malformedCount === 1 ? "record was" : "records were"
            } skipped. Existing saved data was not changed.`
          : null,
    };
  } catch {
    return {
      sessions: [],
      error: "Saved class history could not be read.",
    };
  }
}

function saveSessionHistory(item: StoredSession) {
  if (typeof window === "undefined") {
    return { ok: false, error: "Class history is unavailable." };
  }

  try {
    const raw = window.localStorage.getItem(SESSION_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        error: "Existing class history is not in a supported format.",
      };
    }

    const previous = parsed.filter((session) => {
      if (!session || typeof session !== "object") return true;
      return safeHistoryText((session as Record<string, unknown>).id) !== item.id;
    });
    const next = [item, ...previous].slice(0, HISTORY_LIST_LIMIT);
    window.localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(next));
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error:
        "Class history could not be saved. Your browser storage may be full.",
    };
  }
}

// End class session + save transcript chapter-wise
const endClassSession = () => {
  if (!student) return;

  const subject = currentSubject?.subject_name || "Unknown Subject";
  const chapter = currentChapter?.chapter_name || "Unknown Chapter";
  const topic = currentTopic?.topic_name || "Unknown Topic";

  const currentVisibleMessages = messages
    .filter((m) => {
      const t = String(m.text || "").trim();
      if (!t) return false;
      if (t.includes("Select your subject, chapter, and topic")) return false;
      return true;
    });

  const transcriptText =
    sessionTranscriptRef.current.trim() ||
    sessionTranscript.trim() ||
    currentVisibleMessages
      .map((m) => `${m.author}: ${m.text}`)
      .join("\n\n")
      .trim();

  if (!transcriptText) {
    alert("No class transcript or chat found to save.");
    setClassSession((prev) => (prev ? { ...prev, isLive: false } : null));
    setRemainingSeconds(0);
    return;
  }

  const now = Date.now();
  const sessionId = classSession?.id || crypto.randomUUID();
  const startedAt = classSession?.startTime || now;

  const saved = saveSessionHistory({
    id: sessionId,
    studentMobile: student.mobile,
    subjectId: currentSubject?.id ?? null,
    chapterId: currentChapter?.id ?? null,
    topicId: currentTopic?.id ?? null,
    subject,
    chapter,
    topic,
    language,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    transcript: compactTranscriptForSave(transcriptText),
  });

  if (!saved.ok) {
    alert(saved.error);
    return;
  }

  const historyResult = loadSessionHistory();
  setSavedSessions(
    historyResult.sessions.filter(
      (session) => session.studentMobile === student.mobile
    )
  );
  setHistoryError(historyResult.error);
  setSelectedSessionId(sessionId);

  setClassSession(null);
  setRemainingSeconds(0);
  resetSessionTranscript();

  alert("Class ended and saved successfully.");
};

  // syllabus
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
const [weeklyRows, setWeeklyRows] = useState<WeeklyProgressRow[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
// Daily progress (Today)
const [daily, setDaily] = useState<{
  date: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
} | null>(null);

const [dailyLoading, setDailyLoading] = useState(false);
const [dailyError, setDailyError] = useState<string | null>(null);
const [dailyMission, setDailyMission] = useState<DailyMission | null>(null);
const [dailyMissionTasks, setDailyMissionTasks] = useState<DailyMissionTask[]>([]);
const [dailyMissionLoading, setDailyMissionLoading] = useState(false);
const [dailyMissionError, setDailyMissionError] = useState<string | null>(null);
const dailyMissionDataRef = useRef(false);
const [missionLessonHintToken, setMissionLessonHintToken] = useState(0);
const [missionTopicTestHintToken, setMissionTopicTestHintToken] = useState(0);
const [missionReviewFocusToken, setMissionReviewFocusToken] = useState(0);

  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null
  );
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null
  );
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
const pendingMissionSelectionRef = useRef<{
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
} | null>(null);

// ---------------- Notes Engine: Generate ----------------
const effectiveStudentClassId = student?.classId ? String(student.classId) : "";
const effectiveStudentTrack = String(student?.track || student?.subjectType || "regular").toLowerCase();
const effectiveCompetitiveExam = student?.competitiveExam || student?.board || "Competitive";

const handleGenerateNotes = useCallback(async () => {
  if (!student || !currentSubject || !currentChapter) {
    alert("Please select subject and chapter first.");
    return;
  }

  setNotesLoading(true);
  setNotesError(null);

  try {
    const res = await fetch("/api/notes/generate", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        mobile: student.mobile,
        board: "cbse",
        classId: effectiveStudentClassId,
        courseType: effectiveStudentTrack === "competitive" ? "competitive" : "regular",
        competitiveExam: effectiveCompetitiveExam,
        subjectId: String(currentSubject.id),
        chapterId: String(currentChapter.id),
        topicId: currentTopic?.id ? String(currentTopic.id) : null,
        noteType,
      }),
    });

    const data = await res.json().catch(() => ({} as any));

    if (!res.ok || !data?.ok) {
      const msg =
        data?.error ||
        `Failed to generate notes (HTTP ${res.status}).`;
      setNotesError(msg);
      setNotesMarkdown("");
      return;
    }

    setNotesMarkdown(String(data.content || ""));
  } catch (e: any) {
    setNotesError(e?.message || "Notes request failed.");
    setNotesMarkdown("");
  } finally {
    setNotesLoading(false);
  }
}, [
  student,
  selectedSubjectId,
  selectedChapterId,
  selectedTopicId,
  noteType,
  effectiveStudentClassId,
  effectiveStudentTrack,
  effectiveCompetitiveExam,
]);

const getLangCode = (
  language: "English" | "Hindi" | "Bengali"
): "en" | "hi" | "bn" => {
  if (language === "Hindi") return "hi";
  if (language === "Bengali") return "bn";
  return "en";
};



const getSpeedCode = (
  speed: "Slow" | "Normal" | "Fast"
): "slow" | "normal" | "fast" => {
  if (speed === "Slow") return "slow";
  if (speed === "Fast") return "fast";
  return "normal";
};

const loadEntitlements = useCallback(async () => {
  const mobile = student?.mobile;
  if (!mobile) return null;

  try {
    const res = await fetch(
      `/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
      { headers: studentAuthHeaders() }
    );
    const data = await res.json();

    if (res.ok && data?.ok) {
      setEntitlements(data);
      return data;
    }
    return {
      ok: false,
      authRequired: res.status === 401,
      error: loginAgainMessage(res.status, data?.error),
    };
  } catch (err) {
    console.error("loadEntitlements error:", err);
    return {
      ok: false,
      authRequired: err instanceof ClientAuthError,
      error: err instanceof ClientAuthError ? err.message : "Unable to verify your plan right now.",
    };
  }
}, [student]);

const loadPlans = useCallback(async () => {
  setPlansLoading(true);
  setPlansError(null);

  try {
    const res = await fetch("/api/plans");
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      setPlansError(data?.error || "Failed to load plans.");
      setPlans([]);
      return;
    }

    const activePlans = Array.isArray(data.plans)
      ? data.plans.filter((p: any) => p?.is_active)
      : [];

    setPlans(activePlans);
  } catch (err: any) {
    console.error("loadPlans error:", err);
    setPlansError(err?.message || "Failed to load plans.");
    setPlans([]);
  } finally {
    setPlansLoading(false);
  }
}, []);


  // conversation + audio
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [question, setQuestion] = useState("");
const [isStartingLesson, setIsStartingLesson] = useState(false);
const [isAsking, setIsAsking] = useState(false);
const [audioUrl, setAudioUrl] = useState<string | null>(null);
const lessonAudioRef = useRef<HTMLAudioElement | null>(null);
const audioUrlRef = useRef<string | null>(null);
const audioRequestVersionRef = useRef(0);

const pauseLessonAudio = useCallback(() => {
  pauseAudio(lessonAudioRef.current);
}, []);

const stopLessonAudio = useCallback(() => {
  audioRequestVersionRef.current += 1;
  pauseAndResetAudio(lessonAudioRef.current);

  setAudioUrl((oldUrl) => {
    if (oldUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(oldUrl);
    }
    return null;
  });
  audioUrlRef.current = null;
}, []);

const [audioError, setAudioError] = useState<string | null>(null);
const [qaError, setQaError] = useState<string | null>(null);
const [entitlements, setEntitlements] = useState<any>(null);

const [plans, setPlans] = useState<
  Array<{
    id: number;
    code: string;
    name: string;
    track: string;
    price: number;
    validity_days: number;
    is_active: boolean;
    sort_order?: number;
  }>
>([]);
const [plansLoading, setPlansLoading] = useState(false);
const [plansError, setPlansError] = useState<string | null>(null);
const [parentLinkOpen, setParentLinkOpen] = useState(false);
const [parentLinkName, setParentLinkName] = useState("");
const [parentLinkMobile, setParentLinkMobile] = useState("");
const [parentLinkStatus, setParentLinkStatus] = useState<string | null>(null);
const [parentLinkLoading, setParentLinkLoading] = useState(false);

const [language, setLanguage] = useState<"English" | "Hindi" | "Bengali">(
  "English"
);
const [speed, setSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");

const messagesEndRef = useRef<HTMLDivElement | null>(null);
const messageIdRef = useRef(1);
const lessonRequestInFlightRef = useRef(false);


useEffect(() => {
  audioUrlRef.current = audioUrl;
  if (!audioUrl) return;

  const audio = lessonAudioRef.current;
  if (!audio) return;

  try {
    audio.load();
  } catch {}

  audio.play().catch(() => {
    // ignore autoplay error; user can press play manually
  });

  return () => {
    pauseAndResetAudio(audio);
  };
}, [audioUrl]);

useEffect(() => {
  return () => {
    audioRequestVersionRef.current += 1;
    pauseAndResetAudio(lessonAudioRef.current);

    const activeUrl = audioUrlRef.current;
    if (activeUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(activeUrl);
    }
    audioUrlRef.current = null;
  };
}, []);

useEffect(() => {
  loadEntitlements();
}, [loadEntitlements]);

useEffect(() => {
  loadPlans();
}, [loadPlans]);


useEffect(() => {
  if (typeof window === "undefined") return;

  const existing = document.getElementById("razorpay-checkout-js");
  if (existing) return;

  const script = document.createElement("script");
  script.id = "razorpay-checkout-js";
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.async = true;
  document.body.appendChild(script);
}, []);

const handleBuyPlan = async (planCode: string) => {
  try {
    const studentMobile = student?.mobile;

    if (!studentMobile) {
      alert("Student mobile not found. Please login again.");
      return;
    }

    setPayingPlanCode(planCode);

    const createRes = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentMobile,
        planCode,
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok || !createData?.ok) {
      throw new Error(createData?.error || "Failed to create payment order.");
    }

    const { keyId, order, plan } = createData;

    if (!window.Razorpay) {
      throw new Error("Razorpay SDK not loaded.");
    }

    const rz = new window.Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      name: "NeoLearn",
      description: plan?.name || "NeoLearn Subscription",
      order_id: order.id,
      handler: async function (response: any) {
        try {
          const verifyRes = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              studentMobile,
              planCode,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData?.ok) {
            throw new Error(verifyData?.error || "Payment verification failed.");
          }

          await loadEntitlements();
          alert("Payment successful. Subscription activated.");
        } catch (err: any) {
          console.error("verify payment error:", err);
          alert(err?.message || "Payment verification failed.");
        } finally {
          setPayingPlanCode(null);
        }
      },
      prefill: {
        contact: studentMobile,
      },
      theme: {
        color: "#0f172a",
      },
      modal: {
        ondismiss: function () {
          setPayingPlanCode(null);
        },
      },
    });

    rz.open();
  } catch (err: any) {
    console.error("handleBuyPlan error:", err);
    alert(err?.message || "Payment failed.");
    setPayingPlanCode(null);
  }
};

const handleLinkParent = async (e: React.FormEvent) => {
  e.preventDefault();
  setParentLinkStatus(null);

  if (!student?.mobile) {
    setParentLinkStatus("Student mobile not found. Please login again.");
    return;
  }

  if (!/^\d{10}$/.test(parentLinkMobile.trim())) {
    setParentLinkStatus("Enter valid parent/guardian mobile (10 digits).");
    return;
  }

  setParentLinkLoading(true);
  try {
    const res = await fetch("/api/student/link-parent", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        studentMobile: student.mobile,
        parentName: parentLinkName.trim(),
        parentMobile: parentLinkMobile.trim(),
      }),
    });

    const { data, errorText } = await readJsonResponse<any>(res);

    if (!res.ok || !data?.ok) {
      throw new Error(
        loginAgainMessage(
          res.status,
          data?.error || errorText || "Failed to link parent/guardian."
        )
      );
    }

    setParentLinkStatus(
      "Parent/guardian linked. Parent dashboard access works after parent login verification."
    );
    setParentLinkOpen(false);
    setParentLinkName("");
    setParentLinkMobile("");
  } catch (err: any) {
    setParentLinkStatus(err?.message || "Failed to link parent/guardian.");
  } finally {
    setParentLinkLoading(false);
  }
};

  // Load student from localStorage, then sync latest class/profile from server.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    let localInfo: StudentInfo | null = null;

    try {
      localInfo = JSON.parse(raw) as StudentInfo;
      setStudent(localInfo);
    } catch {
      router.replace("/");
      return;
    } finally {
      setLoadingStudent(false);
    }

    async function syncLatestStudentProfile() {
      if (!localInfo?.mobile) return;

      try {
        const res = await fetch(
          `/api/student/profile?mobile=${encodeURIComponent(localInfo.mobile)}`,
          { cache: "no-store", headers: studentAuthHeaders() }
        );

        const data = await res.json();

        if (!res.ok || !data?.ok || !data?.student) return;
        if (cancelled) return;

        const latestClassId = String(data.student.classId || localInfo.classId || "6");

        const nextInfo: StudentInfo = {
          ...localInfo,
          name: data.student.name || localInfo.name,
          mobile: data.student.mobile || localInfo.mobile,
          classId: latestClassId as ClassId,
          board: data.student.board || localInfo.board || "CBSE",
          track: data.student.track || data.student.subjectType || localInfo.track || "regular",
          subjectType: data.student.subjectType || data.student.track || localInfo.subjectType || "regular",
          competitiveExam: data.student.competitiveExam ?? localInfo.competitiveExam ?? null,
        };

        const changed =
          nextInfo.classId !== localInfo.classId ||
          nextInfo.name !== localInfo.name ||
          nextInfo.mobile !== localInfo.mobile ||
          nextInfo.board !== localInfo.board ||
          nextInfo.track !== localInfo.track ||
          nextInfo.subjectType !== localInfo.subjectType ||
          nextInfo.competitiveExam !== localInfo.competitiveExam;

        if (changed) {
          setStudent(nextInfo);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextInfo));
        }
      } catch (err) {
        console.warn("student profile sync skipped:", err);
      }
    }

    syncLatestStudentProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load routine per-student
  useEffect(() => {
    if (!student?.mobile) return;

    const key = `neolearnRoutine:${student.mobile}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as WeeklyRoutine;
        setRoutine(parsed);
      } else {
        setRoutine(defaultRoutine());
      }
    } catch {
      setRoutine(defaultRoutine());
    } finally {
      setRoutineLoaded(true);
    }
  }, [student?.mobile]);

  // Save routine per-student
  useEffect(() => {
    if (!student?.mobile) return;
    if (!routineLoaded) return;

    const key = `neolearnRoutine:${student.mobile}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(routine));
    } catch {
      // ignore
    }
  }, [routine, routineLoaded, student?.mobile]);


  // Fetch syllabus from Supabase
  useEffect(() => {
    if (!student) return;

    const currentStudent = student;
    const classId = currentStudent.classId;
    const studentTrack = String(currentStudent.track || currentStudent.subjectType || "").toLowerCase();
    const isCompetitiveStudent = studentTrack === "competitive";
    const competitiveExamForStudent =
      currentStudent.competitiveExam || currentStudent.board || "Foundation";

    async function load() {
      setSyllabusLoading(true);
      setSyllabusError(null);
      try {
        if (isCompetitiveStudent) {
          const competitive = getCompetitiveSyllabus(competitiveExamForStudent);
          setSubjects(competitive.subjects);
          setChapters(competitive.chapters);
          setTopics(competitive.topics);
          setSelectedSubjectId(null);
          setSelectedChapterId(null);
          setSelectedTopicId(null);
          setSyllabusError(null);
          return;
        }

        const params = new URLSearchParams({
  class: currentStudent.classId ?? "6",
  board: "CBSE", // later we can store board per student
});

        const res = await fetch(`/api/syllabus?${params.toString()}`);
        const data = (await res.json()) as SyllabusResponse;

        if (!data.ok || !data.data) {
          const fallback = getFallbackSyllabus(classId);
          setSubjects(fallback.subjects);
          setChapters(fallback.chapters);
          setTopics(fallback.topics);
          setSelectedSubjectId(null);
          setSelectedChapterId(null);
          setSelectedTopicId(null);
          setSyllabusError(null);
          return;
        }

        setSubjects(data.data.subjects || []);
        setChapters(data.data.chapters || []);
        setTopics(data.data.topics || []);

        setSelectedSubjectId(null);
        setSelectedChapterId(null);
        setSelectedTopicId(null);
      } catch (err: any) {
        const fallback = getFallbackSyllabus(classId);
        setSubjects(fallback.subjects);
        setChapters(fallback.chapters);
        setTopics(fallback.topics);
        setSelectedSubjectId(null);
        setSelectedChapterId(null);
        setSelectedTopicId(null);
        setSyllabusError(null);
      } finally {
        setSyllabusLoading(false);
      }
    }

    load();
  }, [student]);

  // Fetch weekly progress
useEffect(() => {
  if (!student) return;

  const mobile = student.mobile; // TS-safe snapshot

  async function loadWeekly() {
    setWeeklyLoading(true);
    setWeeklyError(null);
    try {
      const res = await fetch(
        `/api/progress/weekly-get?mobile=${encodeURIComponent(mobile)}`
        , { headers: studentAuthHeaders() }
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setWeeklyError(loginAgainMessage(res.status, data?.error || `Failed with HTTP ${res.status}`));
        setWeeklyRows([]);
        return;
      }

      setWeeklyRows(data.weeks || []);
    } catch (err: any) {
      console.error("weekly-get error:", err);
      setWeeklyError(err?.message || "Failed to load weekly progress");
      setWeeklyRows([]);
    } finally {
      setWeeklyLoading(false);
    }
  }

  loadWeekly();
}, [student]);


// Fetch DAILY progress (Today – IST)
useEffect(() => {
  if (!student) return;

  const mobile = student.mobile; // TS-safe snapshot

  async function loadDaily() {
    setDailyLoading(true);
    setDailyError(null);

    try {
      const res = await fetch(
        `/api/progress/daily-get?mobile=${encodeURIComponent(mobile)}`
        , { headers: studentAuthHeaders() }
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setDailyError(loginAgainMessage(res.status, data?.error || "Failed to load daily progress"));
        setDaily(null);
        return;
      }

      setDaily({
        date: data.date,
        topicsCompleted: data.topicsCompleted,
        testsTaken: data.testsTaken,
        avgScore: data.avgScore,
      });
    } catch (err: any) {
      console.error("daily-get error:", err);
      setDailyError(err?.message || "Failed to load daily progress");
      setDaily(null);
    } finally {
      setDailyLoading(false);
    }
  }

  loadDaily();
}, [student]);




  // Derive chapters & topics based on selection
  const filteredChapters = useMemo(() => {
    if (!selectedSubjectId) return [];
    return chapters.filter((c) => c.subject_id === selectedSubjectId);
  }, [chapters, selectedSubjectId]);

  const filteredTopics = useMemo(() => {
    if (!selectedChapterId) return [];
    return topics.filter((t) => t.chapter_id === selectedChapterId);
  }, [topics, selectedChapterId]);

  // Reset dependent selections when parent changes
  useEffect(() => {
    const pending = pendingMissionSelectionRef.current;
    if (pending && pending.subjectId === selectedSubjectId) {
      setSelectedChapterId(pending.chapterId);
      return;
    }

    setSelectedChapterId(null);
    setSelectedTopicId(null);
  }, [selectedSubjectId]);

  useEffect(() => {
    const pending = pendingMissionSelectionRef.current;
    if (pending && pending.chapterId === selectedChapterId) {
      setSelectedTopicId(pending.topicId);
      pendingMissionSelectionRef.current = null;
      return;
    }

    setSelectedTopicId(null);
  }, [selectedChapterId]);

  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );

  const currentChapter = useMemo(
    () => filteredChapters.find((c) => c.id === selectedChapterId) || null,
    [filteredChapters, selectedChapterId]
  );

  const currentTopic = useMemo(
    () => filteredTopics.find((t) => t.id === selectedTopicId) || null,
    [filteredTopics, selectedTopicId]
  );

const loadDailyMission = useCallback(async () => {
  if (!student?.mobile) return;

  setDailyMissionLoading(true);
  setDailyMissionError(null);

  try {
    const params = new URLSearchParams({
      mobile: student.mobile,
      board: effectiveStudentTrack === "competitive" ? effectiveCompetitiveExam : student.board || "CBSE",
      classNumber: String(Number(student.classId || 6)),
      track: effectiveStudentTrack,
    });

    if (currentSubject) {
      params.set("subjectId", String(currentSubject.id));
      params.set("subjectName", currentSubject.subject_name);
    }
    if (currentChapter) {
      params.set("chapterId", String(currentChapter.id));
      params.set("chapterName", currentChapter.chapter_name);
    }
    if (currentTopic) {
      params.set("topicId", String(currentTopic.id));
      params.set("topicName", currentTopic.topic_name);
    }

    const res = await fetch(`/api/student/daily-mission?${params.toString()}`, {
      headers: studentAuthHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      if (!dailyMissionDataRef.current) {
        setDailyMissionError(loginAgainMessage(res.status, data?.error || "Failed to load today's mission."));
        setDailyMission(null);
        setDailyMissionTasks([]);
      }
      return;
    }

    setDailyMission(data.mission || null);
    setDailyMissionTasks(Array.isArray(data.tasks) ? data.tasks : []);
    dailyMissionDataRef.current = Boolean(data.mission || (Array.isArray(data.tasks) && data.tasks.length > 0));
    setDailyMissionError(null);
  } catch (err: any) {
    console.error("daily mission load error:", err);
    if (!dailyMissionDataRef.current) {
      setDailyMissionError(err?.message || "Failed to load today's mission.");
      setDailyMission(null);
      setDailyMissionTasks([]);
    }
  } finally {
    setDailyMissionLoading(false);
  }
}, [
  student?.mobile,
  student?.board,
  student?.classId,
  effectiveStudentTrack,
  effectiveCompetitiveExam,
  currentSubject,
  currentChapter,
  currentTopic,
]);

const completeDailyMissionTask = useCallback(async (
  taskType: DailyMissionTaskType,
  extra: Record<string, unknown> = {}
) => {
  if (!student?.mobile) return;

  try {
    const res = await fetch("/api/student/daily-mission/task-complete", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        studentMobile: student.mobile,
        taskType,
        subjectId: currentSubject?.id,
        chapterId: currentChapter?.id,
        topicId: currentTopic?.id,
        subjectName: currentSubject?.subject_name,
        chapterName: currentChapter?.chapter_name,
        topicName: currentTopic?.topic_name,
        ...extra,
      }),
    });
    const data = await res.json();

    if (res.ok && data?.ok) {
      setDailyMission(data.mission || null);
      setDailyMissionTasks(Array.isArray(data.tasks) ? data.tasks : []);
      dailyMissionDataRef.current = Boolean(data.mission || (Array.isArray(data.tasks) && data.tasks.length > 0));
      setDailyMissionError(null);
    }
  } catch (err) {
    console.error("daily mission task update skipped:", err);
  }
}, [student?.mobile, currentSubject, currentChapter, currentTopic]);

const handleMissionContinue = useCallback(() => {
  const completedCount = dailyMissionTasks.filter((task) => task.status === "completed").length;

  pendingMissionSelectionRef.current = {
    subjectId: dailyMission?.subject_id ?? null,
    chapterId: dailyMission?.chapter_id ?? null,
    topicId: dailyMission?.topic_id ?? null,
  };

  if (dailyMission?.subject_id) {
    setSelectedSubjectId(dailyMission.subject_id);
  }
  if (dailyMission?.chapter_id) {
    setSelectedChapterId(dailyMission.chapter_id);
  }
  if (dailyMission?.topic_id) {
    setSelectedTopicId(dailyMission.topic_id);
  }
  setActiveTab("classroom");

  if (completedCount <= 0) {
    window.setTimeout(() => setMissionLessonHintToken((token) => token + 1), 150);
  } else if (completedCount === 1) {
    window.setTimeout(() => setMissionTopicTestHintToken((token) => token + 1), 150);
  } else if (completedCount === 2) {
    window.setTimeout(() => setMissionReviewFocusToken((token) => token + 1), 150);
  }
}, [dailyMission, dailyMissionTasks]);

const handleMissionPracticeMore = useCallback(() => {
  setActiveTab("classroom");
  window.setTimeout(() => setMissionTopicTestHintToken((token) => token + 1), 150);
}, []);

const handleMissionReviewDone = useCallback(() => {
  void completeDailyMissionTask("review_weak_area", {
    eventType: "weak_area_reviewed",
    weakArea: dailyMission?.weak_area || null,
  });
}, [completeDailyMissionTask, dailyMission?.weak_area]);

useEffect(() => {
  if (!student?.mobile) return;
  loadDailyMission();
}, [student?.mobile, loadDailyMission]);

// Change teacher avatar when subject changes
  useEffect(() => {
    if (!currentSubject) {
      // default avatar if nothing selected yet
      setTeacherAvatar("/avatars/niya-math.png");
      return;
    }

    // use helper to decide which avatar file to show
    const avatarPath = getAvatarForSubject(currentSubject.subject_name);
    setTeacherAvatar(avatarPath);
  }, [currentSubject]);

  // Initial welcome message (once we have syllabus)
  useEffect(() => {
    if (!student) return;

    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: messageIdRef.current++,
          author: "Teacher",
          text:
            `Hi! I am your NeoLearn ${cleanSubjectName(currentSubject?.subject_name)} teacher. ` +
            'Select your subject, chapter, and topic, then click "Start Lesson" to hear a short explanation. ' +
            'You can also ask me questions anytime.',
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ];
    });
  }, [student]);

  // Scroll chat to bottom
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const pushMessage = useCallback(
    (author: MessageAuthor, text: string, isError = false) => {
      setMessages((prev) => [
        ...prev,
        {
          id: messageIdRef.current++,
          author,
          text,
          isError,
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    },
    []
  );

  const removeLessonLoadingMessage = useCallback(() => {
    setMessages((prev) =>
      prev.filter((message) => message.text !== LESSON_LOADING_MESSAGE)
    );
  }, []);

// Countdown timer for live class
useEffect(() => {
  if (!classSession?.isLive) return;

  const interval = setInterval(() => {
    const now = Date.now();
    const remaining = Math.floor(
      (classSession.endTime - now) / 1000
    );

    if (remaining <= 0) {
      setRemainingSeconds(0);
      setClassSession((prev) =>
        prev ? { ...prev, isLive: false } : null
      );
      clearInterval(interval);
    } else {
      setRemainingSeconds(remaining);
    }
  }, 1000);

  return () => clearInterval(interval);
}, [classSession]);

useEffect(() => {
  if (typeof window === "undefined") return;
  if (!student?.mobile || activeTab !== "gallery") return;
  if (loadedHistoryStudentRef.current === student.mobile) return;

  setHistoryLoading(true);
  setHistoryError(null);

  const timer = window.setTimeout(() => {
    const result = loadSessionHistory();
    const mine = result.sessions.filter(
      (session) => session.studentMobile === student.mobile
    );

    setSavedSessions(mine);
    setHistoryError(result.error);
    setSelectedSessionId((current) => {
      if (current && mine.some((session) => session.id === current)) {
        return current;
      }
      return mine[0]?.id || null;
    });
    loadedHistoryStudentRef.current = student.mobile;
    setHistoryLoading(false);
  }, 0);

  return () => window.clearTimeout(timer);
}, [student?.mobile, activeTab]);


  // Start Lesson -> /api/generate-lesson + /api/lesson-audio
const handleStartLesson = useCallback(async () => {
  if (isStartingLesson || lessonRequestInFlightRef.current) return;
  stopLessonAudio();
  const lessonAudioRequestVersion = audioRequestVersionRef.current;

  if (!currentSubject || !currentChapter || !currentTopic) {
    pushMessage(
      "Teacher",
      "Please select subject, chapter and topic first, then start the lesson.",
      true
    );
    return;
  }

  lessonRequestInFlightRef.current = true;
  setIsStartingLesson(true);
  setAudioError(null);
  setQaError(null);

  const mobile = student?.mobile;
  if (!mobile) {
    setAudioError("Student session is missing. Please login again.");
    lessonRequestInFlightRef.current = false;
    setIsStartingLesson(false);
    return;
  }

  const ent = await loadEntitlements();

  if (!ent?.ok) {
    setAudioError(
      ent?.authRequired
        ? "Session expired. Please login again."
        : ent?.error || "Unable to verify your plan right now. Please try again."
    );
    lessonRequestInFlightRef.current = false;
    setIsStartingLesson(false);
    return;
  }

  setMessages([]);

  if (!ent.features?.lessonGeneration) {
    setTrialLimitNotice({
      topicId: currentTopic.id,
      message: "Free lesson limit reached. Subscribe to continue this topic.",
    });
    lessonRequestInFlightRef.current = false;
    setIsStartingLesson(false);
    return;
  }

  setTrialLimitNotice(null);
  const now = Date.now();
  resetSessionTranscript();
  setClassSession({
    id: crypto.randomUUID(),
    startTime: now,
    endTime: now + 40 * 60 * 1000,
    isLive: true,
    subjects: [currentSubject.subject_name],
  });
  setRemainingSeconds(40 * 60);

  pushMessage("Teacher", LESSON_LOADING_MESSAGE);

  try {
    const langCode = getLangCode(language);
    const speedCode = getSpeedCode(speed);

    let scriptText = "";

    try {
      const lessonRes = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: studentAuthHeaders(true),
        body: JSON.stringify({
          mobile: student?.mobile,
          board: effectiveStudentTrack === "competitive" ? effectiveCompetitiveExam : "CBSE",
          classLevel: `Class ${student?.classId}`,
          track: effectiveStudentTrack,
          subjectType: effectiveStudentTrack,
          competitiveExam: effectiveCompetitiveExam,
          subject: currentSubject.subject_name,
          chapter: currentChapter.chapter_name,
          topic: currentTopic.topic_name,
          language: langCode,
        }),
      });

      if (!lessonRes.ok) {
        if (lessonRes.status === 401) {
          removeLessonLoadingMessage();
          setAudioError(loginAgainMessage(lessonRes.status));
          return;
        }
        console.error(
          "generate-lesson failed:",
          lessonRes.status,
          await lessonRes.text()
        );
      } else {
        const data = await lessonRes.json();
        scriptText = (data.script || data.text || "").trim();
      }
    } catch (err) {
      console.error("generate-lesson network error:", err);
    }

    if (!scriptText) {
      const langLabel = language;
      scriptText = (
        `Hi ${student?.name || "Student"}, I am your NeoLearn ${cleanSubjectName(currentSubject.subject_name)} teacher.\n\n` +
        `Today we will learn the topic "${currentTopic.topic_name}" from the chapter "${currentChapter.chapter_name}" for Class ${student?.classId || "6"}.\n` +
        `I will explain it step by step in very simple ${langLabel} so you can understand easily.`
      ).trim();
    }

    removeLessonLoadingMessage();
    pushMessage("Teacher", scriptText);

    try {
      await fetch("/api/progress/topic", {
        method: "POST",
        headers: studentAuthHeaders(true),
        body: JSON.stringify({
          studentMobile: student?.mobile,
          studentName: student?.name,
          board: "CBSE",
          classNumber: Number(student?.classId),
          subjectId: currentSubject.id,
          chapterId: currentChapter.id,
          topicId: currentTopic.id,
          status: "in_progress",
          score: null,
        }),
      });
    } catch (err) {
      console.error("Failed to save topic progress:", err);
    }

    void completeDailyMissionTask("learn_topic", {
      eventType: "lesson_started",
    });

    try {
      const audioRes = await fetch("/api/lesson-audio", {
        method: "POST",
        headers: studentAuthHeaders(true),
        body: JSON.stringify({
          mobile: student?.mobile,
          text: scriptText,
          language: langCode,
          speed: speedCode,
        }),
      });

      if (!audioRes.ok) {
        console.error(
          "lesson-audio failed:",
          audioRes.status,
          await audioRes.text()
        );
        setAudioError("Failed to generate lesson audio.");
        return;
      }

      const blob = await audioRes.blob();
      const url = URL.createObjectURL(blob);
      if (lessonAudioRequestVersion === audioRequestVersionRef.current) {
        setAudioUrl(url);
      } else {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("lesson-audio network error:", err);
      setAudioError("Failed to generate lesson audio (network error).");
    }
  } catch (err) {
    console.error("handleStartLesson error:", err);
    removeLessonLoadingMessage();
    setAudioError("Unexpected error while generating the lesson.");
  } finally {
    lessonRequestInFlightRef.current = false;
    setIsStartingLesson(false);
    loadEntitlements();
  }
}, [
  isStartingLesson,
  currentSubject,
  currentChapter,
  currentTopic,
  stopLessonAudio,
  student?.classId,
  student?.name,
  student?.mobile,
  effectiveStudentTrack,
  effectiveCompetitiveExam,
  language,
  speed,
  pushMessage,
  removeLessonLoadingMessage,
  loadEntitlements,
  completeDailyMissionTask,
]);

const openStartLearningFlow = useCallback((resetSelection = true) => {
  if (resetSelection) {
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    setSelectedTopicId(null);
  }
  setGuidedStartStatus(null);
  setStartFlowOpen(true);
}, []);

const handleGuidedTopicSelect = useCallback((topicId: number) => {
  setSelectedTopicId(topicId);
  setGuidedStartPendingTopicId(topicId);
  setGuidedStartStatus("Starting your AI class...");
  setTrialLimitNotice(null);
  setStartFlowOpen(false);
  setActiveTab("classroom");
}, []);

useEffect(() => {
  if (!guidedStartPendingTopicId || !currentTopic) return;
  if (currentTopic.id !== guidedStartPendingTopicId) return;
  if (isStartingLesson || lessonRequestInFlightRef.current) return;

  const timeout = window.setTimeout(() => {
    void handleStartLesson().finally(() => {
      setGuidedStartPendingTopicId(null);
      setGuidedStartStatus(null);
    });
  }, 120);

  return () => window.clearTimeout(timeout);
}, [guidedStartPendingTopicId, currentTopic, isStartingLesson, handleStartLesson]);

  // Student asks a doubt -> /api/teacher-math (or your Q&A route)
    // Student asks a doubt -> text + audio answer
  const handleAskQuestion = useCallback(async () => {
  const trimmed = question.trim();
  if (!trimmed) return;

  pushMessage("You", trimmed);
  setQuestion("");

  if (!currentSubject || !currentChapter || !currentTopic) {
    pushMessage(
      "Teacher",
      "Please select subject, chapter and topic first. Then ask your doubt again.",
      true
    );
    return;
  }

  const ent = await loadEntitlements();

  if (!ent?.ok) {
    setAudioError(
      ent?.authRequired
        ? "Session expired. Please login again."
        : ent?.error || "Unable to verify your plan right now. Please try again."
    );
    return;
  }

  if (!ent.features?.teacherQa && !ent.features?.teacherQaPreview) {
    pushMessage(
      "Teacher",
      "Teacher Q&A is available after subscription.",
      true
    );
    return;
  }

  if (ent.features?.teacherQaPreview && !ent.features?.teacherQa) {
    pushMessage(
      "Teacher",
      "Preview: full teacher doubt-solving is available after subscription.",
      true
    );
    return;
  }

  setIsAsking(true);

  try {
    const res = await fetch("/api/teacher-math", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        question: trimmed,

        // full selected context - prevents fallback to maths/fractions
        board: effectiveStudentTrack === "competitive" ? effectiveCompetitiveExam : "cbse",
        classId: String(student?.classId || "6"),
        classLevel: `Class ${student?.classId || "6"}`,
        track: effectiveStudentTrack,
        subjectType: effectiveStudentTrack,
        competitiveExam: effectiveCompetitiveExam,
        lang: getLangCode(language),
        language: getLangCode(language),

        subject: currentSubject.subject_name,
        chapter: currentChapter.chapter_name,
        topic: currentTopic.topic_name,

        subjectId: String(currentSubject.id),
        chapterId: String(currentChapter.id),
        topicId: String(currentTopic.id),

        subjectDbId: String(currentSubject.id),
        chapterDbId: String(currentChapter.id),
        topicDbId: String(currentTopic.id),

        selectedSubject: currentSubject.subject_name,
        selectedChapter: currentChapter.chapter_name,
        selectedTopic: currentTopic.topic_name,

        studentMobile: student?.mobile,
        studentId: (student as any)?.student_id || (student as any)?.id || "",
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const answer: string =
      data?.answer || data?.text || "I have noted your question.";

    pushMessage("Teacher", answer);

    const langCode = getLangCode(language);
    stopLessonAudio();
    const answerAudioRequestVersion = audioRequestVersionRef.current;

    const ttsRes = await fetch("/api/lesson-audio", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        mobile: student?.mobile,
        text: answer,
        language: langCode,
      }),
    });

    if (!ttsRes.ok) {
      console.error("TTS error for Q&A:", ttsRes.status);
      return;
    }

    const ttsContentType = ttsRes.headers.get("content-type") || "";

    if (ttsContentType.startsWith("audio/")) {
      const blob = await ttsRes.blob();
      const url = URL.createObjectURL(blob);
      if (answerAudioRequestVersion === audioRequestVersionRef.current) {
        setAudioUrl(url);
      } else {
        URL.revokeObjectURL(url);
      }
    } else {
      const ttsData = await ttsRes.json();

      let urlFromJson: string | null = null;
      if (typeof ttsData?.audioUrl === "string") {
        urlFromJson = ttsData.audioUrl;
      } else if (typeof ttsData?.audio_url === "string") {
        urlFromJson = ttsData.audio_url;
      } else if (typeof ttsData?.url === "string") {
        urlFromJson = ttsData.url;
      } else if (typeof ttsData?.audio === "string") {
        urlFromJson = `data:audio/mpeg;base64,${ttsData.audio}`;
      }

      if (
        urlFromJson &&
        answerAudioRequestVersion === audioRequestVersionRef.current
      ) {
        setAudioUrl(urlFromJson);
      }
    }
  } catch (err) {
    console.error("teacher-math or TTS error:", err);
    pushMessage(
      "Teacher",
      "Sorry, I could not answer this right now. Please try again in a moment.",
      true
    );
  } finally {
    setIsAsking(false);
  }
}, [
  question,
  currentSubject,
  currentChapter,
  currentTopic,
  stopLessonAudio,
  student?.classId,
  student?.mobile,
  student?.studentId,
  effectiveStudentTrack,
  effectiveCompetitiveExam,
  language,
  pushMessage,
  loadEntitlements,
]);
 
  // ----------------- RENDER -----------------

  if (loadingStudent) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading your classroom...
      </div>
    );
  }

  if (!student) return null;

  const studentInitials = (student.name || "Learner")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "N";
  const studentPhoto =
    (student as any).photoUrl ||
    (student as any).avatarUrl ||
    (student as any).profilePhotoUrl ||
    "";

  return (
  <div className={`neo-student-shell fixed inset-0 flex flex-col bg-slate-100 ${
    activeTab === "classroom" ? "is-live-class-active" : ""
  } ${focusFullscreenActive ? "is-focus-fullscreen" : ""}`}>
    {/* Top bar */}
    <header className="neo-student-header shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="neo-top-logo flex items-center justify-center">
            <img
              src="/logo.svg"
              alt="NeoLearn logo"
              className="neo-top-logo-image"
            />
            <span className="neo-top-logo-word">NeoLearn</span>
          </div>
        </div>

        <div
          ref={studentHeaderActionsRef}
          className="neo-student-header-actions relative flex items-center gap-3 text-xs text-gray-600"
        >
          <button
            type="button"
            className="neo-student-profile-capsule"
            onClick={() => {
              setStudentProfileOpen((open) => !open);
              setStudentMenuOpen(false);
              setSettingsNoticeOpen(false);
            }}
            aria-expanded={studentProfileOpen}
            aria-label="Open student profile"
          >
            <span className="neo-student-avatar">
              {studentPhoto ? (
                <img src={studentPhoto} alt={student.name || "Student"} />
              ) : (
                studentInitials
              )}
            </span>
            <span className="neo-student-profile-copy">
              <span>{student.name || "Learner"}</span>
              <small>
                {String(student.track || student.subjectType || "regular").toLowerCase() === "competitive"
                  ? `${student.competitiveExam || student.board || "Competitive"}`
                  : `Class ${student.classId}`}
              </small>
            </span>
          </button>

          <button
            type="button"
            className="neo-student-menu-button"
            onClick={() => {
              setStudentMenuOpen((open) => !open);
              setStudentProfileOpen(false);
              setSettingsNoticeOpen(false);
            }}
            aria-expanded={studentMenuOpen}
            aria-label="Open app menu"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {studentProfileOpen && (
            <div className="neo-student-menu neo-student-profile-popover">
              <div className="neo-student-profile-popover-head">
                <span className="neo-student-avatar">
                  {studentPhoto ? (
                    <img src={studentPhoto} alt={student.name || "Student"} />
                  ) : (
                    studentInitials
                  )}
                </span>
                <div>
                  <strong>{student.name || "Learner"}</strong>
                  <small>
                    {String(student.track || student.subjectType || "regular").toLowerCase() === "competitive"
                      ? `${student.competitiveExam || student.board || "Competitive"}`
                      : `Class ${student.classId}`}
                  </small>
                </div>
              </div>
              <p>{student.mobile}</p>
            </div>
          )}

          {studentMenuOpen && (
            <div className="neo-student-menu">
              <a
                href={HELPDESK_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setStudentMenuOpen(false)}
              >
                Help / HelpDesk
              </a>
              <button
                type="button"
                onClick={() => {
                  setStudentMenuOpen(false);
                  setParentLinkOpen((open) => !open);
                  setParentLinkStatus(null);
                }}
              >
                Link Parent
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudentMenuOpen(false);
                  setSettingsNoticeOpen(true);
                }}
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudentMenuOpen(false);
                  handleLogout();
                }}
              >
                Logout
              </button>
            </div>
          )}

          {settingsNoticeOpen && (
            <div className="neo-student-menu neo-settings-notice">
              <strong>Settings</strong>
              <p>Settings coming soon.</p>
              <button type="button" onClick={() => setSettingsNoticeOpen(false)}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
      {parentLinkOpen && (
        <form
          onSubmit={handleLinkParent}
          className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-[1fr_1fr_auto]"
        >
          <input
            className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Parent/guardian name"
            value={parentLinkName}
            onChange={(e) => setParentLinkName(e.target.value)}
          />
          <input
            inputMode="numeric"
            maxLength={10}
            className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Parent/guardian mobile"
            value={parentLinkMobile}
            onChange={(e) => setParentLinkMobile(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="submit"
            disabled={parentLinkLoading}
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {parentLinkLoading ? "Linking..." : "Link"}
          </button>
          <p className="sm:col-span-3 text-[11px] text-slate-500">
            Parent/guardian can be linked later. Parent progress access starts only after parent login verification.
          </p>
        </form>
      )}
      {parentLinkStatus && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          {parentLinkStatus}
        </div>
      )}
    </header>

    {/* Fullscreen app shell */}
    <div className="neo-student-app-body min-h-0 flex-1 px-2 py-2 md:px-3 md:py-3">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section
          className={`neo-mobile-welcome-card relative hidden shrink-0 overflow-hidden md:hidden ${
            activeTab === "classroom" ? "is-classroom" : ""
          }`}
        >
          <div className="neo-mobile-welcome-topline">
            <div className="flex items-center gap-2">
              <div className="neo-mobile-brand-mark">N</div>
              <span className="text-xs font-bold tracking-wide text-white/90">
                NEOLEARN
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={HELPDESK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="neo-mobile-hero-action"
              >
                Help
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="neo-mobile-hero-action"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="neo-mobile-welcome-body">
            <div className="min-w-0">
              <div className="neo-mobile-welcome-eyebrow">
                Your learning adventure
              </div>
              <h1>
                Hi {student.name?.trim().split(/\s+/)[0] || "Learner"} 👋
              </h1>
              <p>Ready to learn something new?</p>
              <div className="neo-mobile-student-chip">
                {String(
                  student.track || student.subjectType || "regular"
                ).toLowerCase() === "competitive"
                  ? `${student.competitiveExam || student.board || "Competitive"}`
                  : `Class ${student.classId}`}
              </div>
            </div>

            <div className="neo-mobile-robot" aria-hidden="true">
              <svg
                viewBox="0 0 88 96"
                role="presentation"
                focusable="false"
              >
                <defs>
                  <linearGradient id="neoRoboBody" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="1" stopColor="#bfdbfe" />
                  </linearGradient>
                  <linearGradient id="neoRoboBlue" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#38bdf8" />
                    <stop offset="1" stopColor="#4f46e5" />
                  </linearGradient>
                </defs>
                <g className="neo-robo-float">
                  <path d="M44 13V7" stroke="#e0e7ff" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="44" cy="5" r="3.5" fill="#fde68a" />
                  <rect x="21" y="13" width="46" height="35" rx="15" fill="url(#neoRoboBody)" stroke="#c7d2fe" strokeWidth="2" />
                  <rect x="27" y="20" width="34" height="20" rx="9" fill="#312e81" />
                  <g className="neo-robo-eyes" fill="#a7f3d0">
                    <ellipse cx="37" cy="29" rx="3" ry="4" />
                    <ellipse cx="51" cy="29" rx="3" ry="4" />
                  </g>
                  <path d="M39 35c3 3 7 3 10 0" fill="none" stroke="#fef3c7" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M30 50h28l5 27c-10 8-28 8-38 0z" fill="url(#neoRoboBody)" stroke="#c7d2fe" strokeWidth="2" />
                  <rect x="34" y="55" width="20" height="14" rx="6" fill="url(#neoRoboBlue)" />
                  <path d="M39 62l4 4 7-8" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M27 55L15 67" fill="none" stroke="#dbeafe" strokeWidth="7" strokeLinecap="round" />
                  <circle cx="13" cy="69" r="4.5" fill="#ffffff" stroke="#c7d2fe" strokeWidth="2" />
                  <g className="neo-robo-wave">
                    <path d="M60 55l11-13" fill="none" stroke="#dbeafe" strokeWidth="7" strokeLinecap="round" />
                    <circle cx="73" cy="39" r="4.5" fill="#ffffff" stroke="#c7d2fe" strokeWidth="2" />
                  </g>
                  <path d="M34 80l-2 9" stroke="#dbeafe" strokeWidth="7" strokeLinecap="round" />
                  <path d="M54 80l2 9" stroke="#dbeafe" strokeWidth="7" strokeLinecap="round" />
                  <path d="M25 91h10M53 91h10" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
                  <circle cx="44" cy="75" r="2" fill="#22c55e" />
                </g>
              </svg>
              <span>NeO Robo</span>
            </div>
          </div>
        </section>

        {/* Top horizontal navigation */}
        <div className="neo-student-tabs shrink-0 overflow-x-auto rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
          <nav className="flex min-w-max gap-2 text-sm">
            <TabButton
              active={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </TabButton>

            <TabButton
              active={activeTab === "classroom"}
              onClick={() => setActiveTab("classroom")}
            >
              Classroom
            </TabButton>

            <TabButton
              active={activeTab === "subjects"}
              onClick={() => setActiveTab("subjects")}
            >
              Subjects
            </TabButton>

            <TabButton
              active={activeTab === "chapters"}
              onClick={() => setActiveTab("chapters")}
            >
              Chapters
            </TabButton>

            <TabButton
              active={activeTab === "topics"}
              onClick={() => setActiveTab("topics")}
            >
              Topics
            </TabButton>

            <TabButton
              active={activeTab === "progress"}
              onClick={() => setActiveTab("progress")}
            >
              Progress
            </TabButton>

            <TabButton
              active={activeTab === "payments"}
              onClick={() => setActiveTab("payments")}
            >
              Payments
            </TabButton>

            <TabButton
              active={activeTab === "gallery"}
              onClick={() => setActiveTab("gallery")}
            >
              Gallery
            </TabButton>

            <TabButton
              active={activeTab === "routine"}
              onClick={() => setActiveTab("routine")}
            >
              Routine
            </TabButton>
          </nav>
        </div>

        {/* Main content fills remaining screen */}
        <main className="min-h-0 flex-1 overflow-hidden rounded-[28px] bg-transparent p-0 shadow-none">
          {activeTab === "dashboard" && (
            <StudentDashboardView
              student={student}
              currentSubject={currentSubject}
              currentChapter={currentChapter}
              currentTopic={currentTopic}
              daily={daily}
              dailyLoading={dailyLoading}
              dailyMission={dailyMission}
              dailyMissionTasks={dailyMissionTasks}
              dailyMissionLoading={dailyMissionLoading}
              dailyMissionError={dailyMissionError}
              savedSessionsCount={savedSessions.length}
              notesLoading={notesLoading}
              guidedStartStatus={guidedStartStatus}
              onStartLearning={openStartLearningFlow}
              onContinueMission={handleMissionContinue}
              onOpenClassroom={() => setActiveTab("classroom")}
              onOpenTopicTest={() => {
                setActiveTab("classroom");
                window.setTimeout(() => setMissionTopicTestHintToken((token) => token + 1), 150);
              }}
              onOpenNotes={() => setActiveTab("gallery")}
              onOpenGallery={() => setActiveTab("gallery")}
              onOpenHelp={() => {
                window.open(HELPDESK_URL, "_blank", "noopener,noreferrer");
              }}
            />
          )}

          {activeTab === "classroom" && (
            <ClassroomView
              onOpenPayments={() => setActiveTab("payments")}
              onOpenStartFlow={() => openStartLearningFlow(false)}
              onOpenParentLink={() => {
                setParentLinkOpen(true);
                setParentLinkStatus(null);
              }}
              syllabusLoading={syllabusLoading}
              syllabusError={syllabusError}
              currentSubject={currentSubject}
              currentChapter={currentChapter}
              currentTopic={currentTopic}
              language={language}
              setLanguage={setLanguage}
              speed={speed}
              setSpeed={setSpeed}
              messages={messages}
              question={question}
              setQuestion={setQuestion}
              onStartLesson={handleStartLesson}
              onAskQuestion={handleAskQuestion}
              isStartingLesson={isStartingLesson}
              trialLimitNotice={trialLimitNotice}
              isAsking={isAsking}
              audioUrl={audioUrl}
              lessonAudioRef={lessonAudioRef}
              onPauseLessonAudio={pauseLessonAudio}
              onStopLessonAudio={stopLessonAudio}
              audioError={audioError}
              messagesEndRef={messagesEndRef}
              teacherAvatar={teacherAvatar}
              studentName={student.name}
              studentMobile={student.mobile}
              studentTrack={String(student.track || student.subjectType || "regular")}
              competitiveExam={student.competitiveExam || student.board || null}
              isClassLive={!!classSession?.isLive}
              remainingSeconds={remainingSeconds}
              onEnsureClassLive={startClassSession}
              onAppendTranscript={appendSessionTranscript}
              onEndClass={endClassSession}
              autoStartToken={autoStartToken}
              autoStartPayload={autoStartPayload}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onMissionRefresh={loadDailyMission}
              missionLessonHintToken={missionLessonHintToken}
              missionTopicTestHintToken={missionTopicTestHintToken}
              onFocusFullscreenChange={setFocusFullscreenActive}
            />
          )}

          {activeTab === "subjects" && (
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <SubjectsView
                subjects={subjects}
                selectedSubjectId={selectedSubjectId}
                setSelectedSubjectId={setSelectedSubjectId}
                loading={syllabusLoading}
                error={syllabusError}
              />
            </div>
          )}

          {activeTab === "chapters" && (
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <ChaptersView
                chapters={filteredChapters}
                currentSubject={currentSubject}
                selectedChapterId={selectedChapterId}
                setSelectedChapterId={setSelectedChapterId}
                loading={syllabusLoading}
                error={syllabusError}
              />
            </div>
          )}

          {activeTab === "topics" && (
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <TopicsView
                topics={filteredTopics}
                currentSubject={currentSubject}
                currentChapter={currentChapter}
                selectedTopicId={selectedTopicId}
                setSelectedTopicId={setSelectedTopicId}
                loading={syllabusLoading}
                error={syllabusError}
              />
            </div>
          )}

          {activeTab === "progress" && (
            <div className="neo-student-tab-panel h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <WeeklyProgressView
                loading={weeklyLoading}
                error={weeklyError}
                rows={weeklyRows}
                daily={daily}
                dailyLoading={dailyLoading}
                dailyError={dailyError}
              />
            </div>
          )}

          {activeTab === "payments" && (
  <div className="neo-student-tab-panel h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
    <PaymentsView
      entitlements={entitlements}
      plans={plans}
      loading={plansLoading}
      error={plansError}
      onBuyPlan={handleBuyPlan}
      payingPlanCode={payingPlanCode}
    />
  </div>
)}

          {activeTab === "gallery" && (
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <GalleryView
                sessions={savedSessions}
                loading={historyLoading}
                error={historyError}
                selectedId={selectedSessionId}
                setSelectedId={setSelectedSessionId}
                noteType={noteType}
                setNoteType={setNoteType}
                notesMarkdown={notesMarkdown}
                notesLoading={notesLoading}
                notesError={notesError}
                onGenerateNotes={handleGenerateNotes}
              />
            </div>
          )}

          {activeTab === "routine" && (
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <RoutineView
                subjects={subjects}
                routine={routine}
                setRoutine={setRoutine}
                onStartToday={() => startTodayClass()}
              />
            </div>
          )}
        </main>

        {!focusFullscreenActive && (
          <MobileStudentNav
            activeTab={activeTab}
            onHome={() => setActiveTab("dashboard")}
            onClass={() => setActiveTab("classroom")}
            onTest={() => {
              setActiveTab("classroom");
              window.setTimeout(() => setMissionTopicTestHintToken((token) => token + 1), 150);
            }}
            onNotes={() => setActiveTab("gallery")}
            onProfile={() => setActiveTab("payments")}
          />
        )}
      </div>
    </div>

    <StartLearningModal
      open={startFlowOpen}
      loading={syllabusLoading}
      error={syllabusError}
      subjects={subjects}
      chapters={filteredChapters}
      topics={filteredTopics}
      currentSubject={currentSubject}
      currentChapter={currentChapter}
      selectedSubjectId={selectedSubjectId}
      selectedChapterId={selectedChapterId}
      selectedTopicId={selectedTopicId}
      isStartingLesson={isStartingLesson || !!guidedStartPendingTopicId}
      onClose={() => setStartFlowOpen(false)}
      onSelectSubject={(id) => setSelectedSubjectId(id)}
      onSelectChapter={(id) => setSelectedChapterId(id)}
      onSelectTopic={handleGuidedTopicSelect}
    />
  </div>
);
}
               
/* ---------- Small components ---------- */

function MobileStudentNav({
  activeTab,
  onHome,
  onClass,
  onTest,
  onNotes,
  onProfile,
}: {
  activeTab: ActiveTab;
  onHome: () => void;
  onClass: () => void;
  onTest: () => void;
  onNotes: () => void;
  onProfile: () => void;
}) {
  const items = [
    { key: "dashboard", label: "Home", icon: BookOpen, action: onHome, active: activeTab === "dashboard" },
    { key: "gallery", label: "Library", icon: Images, action: onNotes, active: activeTab === "gallery" },
    { key: "classroom", label: "Classroom", icon: Play, action: onClass, active: activeTab === "classroom" },
    { key: "test", label: "Test", icon: ClipboardCheck, action: onTest, active: false },
    { key: "profile", label: "Plan", icon: Target, action: onProfile, active: activeTab === "payments" },
  ];

  return (
    <nav className="neo-mobile-bottom-nav hidden" aria-label="Student mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.action}
            className={item.active ? "is-active" : ""}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function StudentDashboardView({
  student,
  currentSubject,
  currentChapter,
  currentTopic,
  daily,
  dailyLoading,
  dailyMission,
  dailyMissionTasks,
  dailyMissionLoading,
  dailyMissionError,
  savedSessionsCount,
  notesLoading,
  guidedStartStatus,
  onStartLearning,
  onContinueMission,
  onOpenClassroom,
  onOpenTopicTest,
  onOpenNotes,
  onOpenGallery,
  onOpenHelp,
}: {
  student: StudentInfo;
  currentSubject: SubjectRow | null;
  currentChapter: ChapterRow | null;
  currentTopic: TopicRow | null;
  daily: { topicsCompleted: number; testsTaken: number; avgScore: number | null } | null;
  dailyLoading: boolean;
  dailyMission: DailyMission | null;
  dailyMissionTasks: DailyMissionTask[];
  dailyMissionLoading: boolean;
  dailyMissionError: string | null;
  savedSessionsCount: number;
  notesLoading: boolean;
  guidedStartStatus: string | null;
  onStartLearning: () => void;
  onContinueMission: () => void;
  onOpenClassroom: () => void;
  onOpenTopicTest: () => void;
  onOpenNotes: () => void;
  onOpenGallery: () => void;
  onOpenHelp: () => void;
}) {
  const firstName = student.name?.trim().split(/\s+/)[0] || "Learner";
  const classLabel =
    String(student.track || student.subjectType || "regular").toLowerCase() === "competitive"
      ? `${student.competitiveExam || student.board || "Competitive"}`
      : `Class ${student.classId}`;
  const missionCompleted = dailyMissionTasks.filter((task) => task.status === "completed").length;
  const currentPath = [currentSubject?.subject_name, currentChapter?.chapter_name, currentTopic?.topic_name]
    .filter(Boolean)
    .join(" > ");

  const cards = [
    {
      title: "Daily Mission",
      body: dailyMissionLoading
        ? "Loading today's mission..."
        : dailyMissionError
        ? "Mission is unavailable right now."
        : `${missionCompleted}/3 tasks completed`,
      icon: Target,
      action: onContinueMission,
      actionText: "Continue",
    },
    {
      title: "Continue Last Class",
      body: currentPath || "Pick a topic and begin your AI class.",
      icon: BookOpen,
      action: currentTopic ? onOpenClassroom : onStartLearning,
      actionText: currentTopic ? "Open" : "Choose",
    },
    {
      title: "Topic Test",
      body: currentTopic ? `Practice ${currentTopic.topic_name}` : "Select a topic first.",
      icon: ClipboardCheck,
      action: currentTopic ? onOpenTopicTest : onStartLearning,
      actionText: "Practice",
    },
    {
      title: "Generate Notes",
      body: notesLoading ? "Generating notes..." : "Create printable chapter notes.",
      icon: FileText,
      action: onOpenNotes,
      actionText: "Notes",
    },
    {
      title: "Class History",
      body: savedSessionsCount ? `${savedSessionsCount} saved classes` : "Saved classes appear here.",
      icon: History,
      action: onOpenGallery,
      actionText: "View",
    },
    {
      title: "Gallery",
      body: "Review transcripts, print notes, and export PDFs.",
      icon: Images,
      action: onOpenGallery,
      actionText: "Open",
    },
    {
      title: "Help",
      body: "Get account, privacy, and learning support.",
      icon: HelpCircle,
      action: onOpenHelp,
      actionText: "Help",
    },
  ];

  return (
    <div className="neo-dashboard h-full overflow-auto rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm md:p-6">
      <section className="neo-dashboard-hero rounded-[26px] border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-cyan-50 p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="neo-mobile-hero-brand hidden">NeoLearn</div>
            <div className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">
              {classLabel}
            </div>
            <h1 className="text-2xl font-bold tracking-normal text-slate-950 md:text-4xl">
              Hi {firstName}, start a focused AI class.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Choose a subject, chapter, and topic. NeoLearn will open the classroom and start teaching.
            </p>
            {currentPath && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                {currentSubject?.subject_name}
                <ChevronRight className="h-4 w-4 text-blue-500" />
                {currentChapter?.chapter_name}
                <ChevronRight className="h-4 w-4 text-blue-500" />
                <span className="text-blue-700">{currentTopic?.topic_name}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onStartLearning}
            className="neo-primary-start-button inline-flex min-h-[64px] w-full items-center justify-center gap-3 rounded-[20px] bg-blue-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 md:w-auto md:min-w-[260px]"
          >
            <Play className="h-6 w-6 fill-white" />
            Start Learning
          </button>
        </div>

        <div className="neo-mobile-teacher-stage hidden">
          <div className="neo-mobile-teacher-orb">
            <img src="/avatars/niya-math.png" alt="NeoLearn AI teacher" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">Neo Riddhika is ready</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">
              Pick a topic and start a focused class.
            </div>
          </div>
        </div>

        {guidedStartStatus && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            {guidedStartStatus}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Today</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {dailyLoading ? "..." : daily?.topicsCompleted ?? 0}
            </div>
            <div className="text-xs text-slate-500">topics completed</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Practice</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {dailyLoading ? "..." : daily?.testsTaken ?? 0}
            </div>
            <div className="text-xs text-slate-500">tests taken</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Average</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {dailyLoading ? "..." : daily?.avgScore !== null && daily?.avgScore !== undefined ? `${Math.round(daily.avgScore)}%` : "-"}
            </div>
            <div className="text-xs text-slate-500">test score</div>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Today&apos;s Learning</h2>
          <span className="text-xs font-semibold text-slate-500">Recommended</span>
        </div>
        <div className="neo-today-learning-card mb-4 hidden">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Next step</div>
            <div className="mt-1 text-sm font-bold text-slate-950">
              {currentTopic?.topic_name || missionLabel(dailyMission?.topic_name, "Start your next topic")}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Daily Mission: {missionCompleted}/3 completed
            </div>
          </div>
          <button type="button" onClick={currentTopic ? onOpenClassroom : onStartLearning}>
            Continue
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Quick actions</h2>
          <span className="text-xs font-semibold text-slate-500">Tools</span>
        </div>
        <div className="neo-card-rail flex gap-3 overflow-x-auto pb-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                type="button"
                onClick={card.action}
                className="neo-action-card min-h-[150px] min-w-[230px] rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="block text-sm font-bold text-slate-900">{card.title}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{card.body}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                  {card.actionText}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StartLearningModal({
  open,
  loading,
  error,
  subjects,
  chapters,
  topics,
  currentSubject,
  currentChapter,
  selectedSubjectId,
  selectedChapterId,
  selectedTopicId,
  isStartingLesson,
  onClose,
  onSelectSubject,
  onSelectChapter,
  onSelectTopic,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  subjects: SubjectRow[];
  chapters: ChapterRow[];
  topics: TopicRow[];
  currentSubject: SubjectRow | null;
  currentChapter: ChapterRow | null;
  selectedSubjectId: number | null;
  selectedChapterId: number | null;
  selectedTopicId: number | null;
  isStartingLesson: boolean;
  onClose: () => void;
  onSelectSubject: (id: number) => void;
  onSelectChapter: (id: number) => void;
  onSelectTopic: (id: number) => void;
}) {
  if (!open) return null;

  const step = !selectedSubjectId ? "subject" : !selectedChapterId ? "chapter" : "topic";
  const title =
    step === "subject"
      ? "Select Subject"
      : step === "chapter"
      ? "Select Chapter"
      : "Select Topic";
  const options =
    step === "subject"
      ? subjects
      : step === "chapter"
      ? chapters
      : topics;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm">
      <div className="neo-start-modal flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white px-4 py-4 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                Start Learning
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Close start learning popup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            <span className={selectedSubjectId ? "text-blue-700" : "text-slate-900"}>{currentSubject?.subject_name || "Subject"}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className={selectedChapterId ? "text-blue-700" : "text-slate-400"}>{currentChapter?.chapter_name || "Chapter"}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className={selectedTopicId ? "text-blue-700" : "text-slate-400"}>Topic</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-blue-200 bg-blue-50 text-blue-700">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm font-semibold">
                {step === "subject" ? "Loading subjects..." : step === "chapter" ? "Loading chapters..." : "Loading topics..."}
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && options.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div className="text-base font-bold text-slate-800">
                {step === "subject" ? "No subjects available" : step === "chapter" ? "No chapters available" : "No topics available"}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Please try another selection or contact support if this looks wrong.
              </p>
            </div>
          )}

          {!loading && !error && options.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {step === "subject" &&
                subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => onSelectSubject(subject.id)}
                    className="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="block text-base font-bold text-slate-900">{subject.subject_name}</span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {subject.class_number > 0 ? `Class ${subject.class_number}` : "Competitive"}
                    </span>
                  </button>
                ))}

              {step === "chapter" &&
                chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                    className="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="block text-sm font-bold text-blue-700">Chapter {chapter.chapter_number}</span>
                    <span className="mt-1 block text-base font-bold text-slate-900">{chapter.chapter_name}</span>
                  </button>
                ))}

              {step === "topic" &&
                topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => onSelectTopic(topic.id)}
                    className="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="block text-sm font-bold text-cyan-700">Topic {topic.topic_number}</span>
                    <span className="mt-1 block text-base font-bold text-slate-900">{topic.topic_name}</span>
                    <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700">
                      Start AI class
                      <Play className="h-4 w-4 fill-blue-700" />
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {isStartingLesson && (
          <div className="shrink-0 border-t border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 md:px-6">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting your AI class...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-left text-xs whitespace-nowrap ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function TodayMissionCard({
  mission,
  tasks,
  loading,
  error,
  reviewFocusToken,
  onContinue,
  onReviewDone,
  onPracticeMore,
}: {
  mission: DailyMission | null;
  tasks: DailyMissionTask[];
  loading: boolean;
  error: string | null;
  reviewFocusToken: number;
  onContinue: () => void;
  onReviewDone: () => void;
  onPracticeMore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sortedTasks = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
  const completedCount = sortedTasks.filter((task) => task.status === "completed").length;
  const reviewTask = sortedTasks.find((task) => task.task_type === "review_weak_area");
  const reviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const topicLabel = missionLabel(mission?.topic_name, "current topic");
  const visibleError = error && !mission && sortedTasks.length === 0 ? error : null;

  const fallbackTasks: DailyMissionTask[] = [
    {
      id: "fallback-learn",
      task_type: "learn_topic",
      title: missionTaskTitle("learn_topic", topicLabel),
      status: "pending",
      sort_order: 1,
    },
    {
      id: "fallback-test",
      task_type: "topic_test",
      title: missionTaskTitle("topic_test", topicLabel),
      status: "pending",
      sort_order: 2,
    },
    {
      id: "fallback-review",
      task_type: "review_weak_area",
      title: missionTaskTitle("review_weak_area", topicLabel),
      status: "pending",
      sort_order: 3,
    },
  ];

  const displayTasks = (sortedTasks.length > 0 ? sortedTasks : fallbackTasks).map((task) => ({
    ...task,
    title: missionTaskTitle(task.task_type, topicLabel),
  }));
  const displayCompleted = sortedTasks.length > 0 ? completedCount : 0;
  const isCompleted = displayCompleted >= 3 || mission?.status === "completed";
  const statusText =
    loading ? "Loading..." : isCompleted ? "Completed" : displayCompleted > 0 ? "Nice progress" : "Start today's mission";
  const practicePending = displayTasks.some(
    (task) => task.task_type === "topic_test" && task.status !== "completed"
  );
  const weakArea = missionWeakAreaLabel(mission?.weak_area, topicLabel);

  useEffect(() => {
    if (!reviewFocusToken) return;
    setExpanded(true);
    window.setTimeout(() => {
      reviewButtonRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      reviewButtonRef.current?.focus({ preventScroll: true });
    }, 80);
  }, [reviewFocusToken]);

  return (
    <section className="relative z-20 shrink-0">
      <div className={`flex min-h-[56px] items-center justify-between gap-2 rounded-[18px] border px-3 py-2 shadow-sm ${
        isCompleted
          ? "border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-amber-50"
          : "border-blue-100 bg-gradient-to-r from-white via-blue-50 to-amber-50"
      }`}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            isCompleted ? "bg-emerald-600" : "bg-blue-600"
          }`}>
            {isCompleted ? "✓" : displayCompleted}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">
              Today&apos;s Mission • {isCompleted ? "Completed" : `${displayCompleted}/3 completed`}
            </span>
            <span className="block truncate text-xs font-semibold text-slate-600">
              {isCompleted
                ? "✅ Great! Today's mission completed."
                : visibleError || (practicePending ? "Practice when ready" : statusText)}
            </span>
          </span>
        </button>

        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {displayTasks.map((task) => (
            <span
              key={task.id}
              title={task.title}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                task.status === "completed"
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : task.task_type === "topic_test"
                  ? "border-blue-200 bg-blue-100 text-blue-700"
                  : "border-amber-200 bg-white/80 text-amber-700"
              }`}
            >
              {task.status === "completed" ? "✓" : task.sort_order}
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white"
            aria-expanded={expanded}
          >
            {isCompleted ? "View Summary" : "View"}
          </button>
          {isCompleted ? (
            <button
              type="button"
              onClick={onPracticeMore}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
            >
              Practice More
            </button>
          ) : (
            <button
              type="button"
              onClick={onContinue}
              disabled={!mission && !displayTasks.length}
              className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[18px] border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-900">{statusText}</span>
            <span className="truncate text-slate-500">{topicLabel}</span>
            {mission?.latest_score !== null && mission?.latest_score !== undefined && (
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">
                Score {mission.latest_score}%
              </span>
            )}
            {mission?.weak_area && (
              <span className="max-w-full truncate rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-800">
                {weakArea}
              </span>
            )}
          </div>
          {isCompleted && (
            <div className="mb-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              ✅ Great! Today&apos;s mission completed.
            </div>
          )}
          <div className="grid gap-1.5 md:grid-cols-3">
            {displayTasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-full border px-2.5 py-1.5 text-xs ${
                  task.status === "completed"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : task.task_type === "topic_test"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold">
                    {task.status === "completed" ? "✓" : task.sort_order}
                  </span>
                  <span className="min-w-0 truncate">{task.title}</span>
                </div>
              </div>
            ))}
          </div>
          {reviewTask?.status !== "completed" && (
            <button
              ref={reviewButtonRef}
              type="button"
              onClick={onReviewDone}
              disabled={!mission}
              className="mt-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:opacity-50"
            >
              Mark review done
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PlaceholderView({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 text-sm">
      <h1 className="text-lg font-semibold mb-1">{title}</h1>
      <p className="text-gray-600 text-xs">{children}</p>
      <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-xs text-gray-500">
        This is a placeholder. We will later replace this with real data and
        components.
      </div>
    </div>
  );
}

function PaymentsView({
  entitlements,
  plans,
  loading,
  error,
  onBuyPlan,
  payingPlanCode,
}: {
  entitlements: any;
  plans: Array<{
    id: number;
    code: string;
    name: string;
    track: string;
    price: number;
    validity_days: number;
    is_active: boolean;
    sort_order?: number;
  }>;
  loading: boolean;
  error: string | null;
  onBuyPlan: (planCode: string) => void | Promise<void>;
  payingPlanCode: string | null;
}) {
  const used = entitlements?.usage?.used ?? 0;
  const limit = entitlements?.usage?.effectiveLimit ?? 0;
  const freeExhausted = !!entitlements?.state?.freeExhausted;
  const subscriptionActive = !!entitlements?.subscription?.active;
  const activePlanCode = subscriptionActive ? entitlements?.subscription?.planCode || null : null;

  const sortedPlans = [...plans].sort(
    (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
  );

  return (
    <div className="neo-payments-view space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Plans & Subscription</h1>
        <p className="mt-1 text-xs text-slate-500">
          Upgrade to continue full NeoLearn access, live voice classroom, lesson audio, and more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="neo-plan-summary-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Access status
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {subscriptionActive
              ? "Premium active"
              : freeExhausted
              ? "Free access exhausted"
              : "Free access active"}
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Used <span className="font-semibold">{used}</span> /{" "}
            <span className="font-semibold">{limit}</span>
          </div>
        </div>

        <div className="neo-plan-summary-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Current plan
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {activePlanCode || "Free access"}
          </div>
          <div className="mt-2 text-xs text-slate-600">
            {subscriptionActive
              ? "Your premium plan is active."
              : "Upgrade to unlock premium features."}
          </div>
        </div>

        <div className="neo-plan-summary-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Premium unlocks
          </div>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li>Realtime live teacher voice</li>
            <li>Full lesson audio</li>
            <li>Extended AI classroom support</li>
            <li>Continuous premium access</li>
          </ul>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Loading plans...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && sortedPlans.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No active plans found right now.
        </div>
      )}

      {!loading && !error && sortedPlans.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {sortedPlans.map((plan, index) => {
            const isBestValue =
              String(plan.code).toUpperCase() === "REGULAR_QUARTERLY";
            const isRecommended = index === 0 && !isBestValue;
            const isCurrent = activePlanCode === plan.code;

            return (
              <div
                key={plan.id}
                className={`neo-plan-card relative rounded-[26px] border p-5 shadow-sm ${
                  isCurrent
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="neo-plan-heading mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {plan.name}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {plan.track}
                    </div>
                  </div>

                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : isBestValue ? (
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-semibold text-violet-700">
                      Best Value
                    </span>
                  ) : isRecommended ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-semibold text-blue-700">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <div className="neo-plan-price mb-4">
                  <div className="text-3xl font-bold text-slate-900">
                    ₹{plan.price}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {plan.validity_days} days access
                  </div>
                </div>

                <ul className="mb-5 space-y-2 text-sm text-slate-600">
                  <li>Full NeoLearn classroom access</li>
                  <li>AI lesson support and doubt solving</li>
                  <li>Lesson audio and premium experience</li>
                  <li>Premium feature eligibility</li>
                </ul>

                <button
                  type="button"
                  className={`neo-plan-button w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                    isCurrent
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                  disabled={isCurrent || payingPlanCode === plan.code}
                  onClick={() => onBuyPlan(plan.code)}
                >
                  {isCurrent
  ? "Current Plan"
  : payingPlanCode === plan.code
  ? "Processing..."
  : "Buy / Upgrade"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        Secure Razorpay checkout is connected. After successful payment, the student subscription is activated automatically.
      </div>
    </div>
  );
}

/* ---------- Subjects / Chapters / Topics views ---------- */

function SubjectsView({
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
    <div className="neo-progress-view space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Subjects</h1>
      {loading && (
        <p className="text-xs text-gray-500">Loading subjects from server...</p>
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
            <option value="">Choose subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.class_number > 0 ? `${s.subject_name} (Class ${s.class_number.toString()})` : s.subject_name}
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

function ChaptersView({
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
        <p className="text-xs text-gray-500">Loading chapters...</p>
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
            <option value="">Choose chapter</option>
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

function TopicsView({
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
        <p className="text-xs text-gray-500">Loading topics...</p>
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
            <option value="">Choose topic</option>
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

function WeeklyProgressView({
  loading,
  error,
  rows,
  daily,
  dailyLoading,
  dailyError,
}: {
  loading: boolean;
  error: string | null;
  rows: WeeklyProgressRow[];
  daily: {
    date: string;
    topicsCompleted: number;
    testsTaken: number;
    avgScore: number | null;
  } | null;
  dailyLoading: boolean;
  dailyError: string | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Weekly Progress</h1>

{/* Today's Progress */}
<div className="neo-progress-hero mb-4 rounded-2xl border border-slate-200 bg-white p-3">
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">Today's Progress</div>
    {daily?.date && (
      <div className="text-[11px] text-gray-500">{daily.date}</div>
    )}
  </div>

  {dailyLoading && (
    <p className="text-xs text-gray-500 mt-1">Loading today...</p>
  )}

  {dailyError && (
    <p className="text-xs text-red-500 mt-1">{dailyError}</p>
  )}

  {!dailyLoading && !dailyError && daily && (
    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
      <div className="neo-progress-metric rounded-xl bg-slate-50 border border-slate-200 p-2">
        <div className="text-[11px] text-gray-600">Topics</div>
        <div className="text-lg font-semibold">
          {daily.topicsCompleted}
        </div>
      </div>

      <div className="neo-progress-metric rounded-xl bg-slate-50 border border-slate-200 p-2">
        <div className="text-[11px] text-gray-600">Tests</div>
        <div className="text-lg font-semibold">
          {daily.testsTaken}
        </div>
      </div>

      <div className="neo-progress-metric rounded-xl bg-slate-50 border border-slate-200 p-2">
        <div className="text-[11px] text-gray-600">Avg Score</div>
        <div className="text-lg font-semibold">
          {daily.avgScore === null ? "—" : `${daily.avgScore}%`}
        </div>
      </div>
    </div>
  )}
</div>

      <p className="text-xs text-gray-600">
        This shows how many topics you completed and your average test
        score for each week. Later, a summary of this will be sent to
        your parent on WhatsApp.
      </p>

      {loading && (
        <p className="text-xs text-gray-500">Loading weekly data...</p>
      )}

      {error && (
        <p className="text-xs text-red-500">
          Failed to load weekly progress: {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-xs text-gray-500">
          No progress recorded yet. Start your first lesson to begin
          tracking.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          {rows.map((w) => (
            <div
              key={w.weekStart}
              className="neo-progress-week-card rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">
                  Week of {w.weekStart} - {w.weekEnd}
                </div>
                {w.avgScore !== null && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Avg {w.avgScore}%
                  </span>
                )}
              </div>
              <div className="space-y-1 text-[11px] text-gray-700">
                <div>
                  Topics completed:{" "}
                  <span className="font-semibold">
                    {w.topicsCompleted}
                  </span>
                </div>
                <div>
                  Tests taken:{" "}
                  <span className="font-semibold">
                    {w.testsTaken}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryView({
  sessions,
  loading,
  error,
  selectedId,
  setSelectedId,
  noteType,
  setNoteType,
  notesMarkdown,
  notesLoading,
  notesError,
  onGenerateNotes,
}: {
  sessions: StoredSession[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  noteType: NoteType;
  setNoteType: (t: NoteType) => void;
  notesMarkdown: string;
  notesLoading: boolean;
  notesError: string | null;
  onGenerateNotes: () => Promise<void> | void;
}) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_INITIAL_VISIBLE);
  const [transcriptDisplayLength, setTranscriptDisplayLength] = useState(
    TRANSCRIPT_DETAIL_CHUNK
  );
  const orderedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const aTime = safeHistoryDate(a.endedAt)?.getTime() || 0;
        const bTime = safeHistoryDate(b.endedAt)?.getTime() || 0;
        return bTime - aTime;
      }),
    [sessions]
  );
  const selected = useMemo(
    () => orderedSessions.find((s) => s.id === selectedId) || null,
    [orderedSessions, selectedId]
  );
  const visibleSessions = orderedSessions.slice(0, visibleCount);
  const selectedTranscript = safeHistoryText(selected?.transcript);
  const displayedTranscript = selectedTranscript.slice(
    0,
    transcriptDisplayLength
  );
  const transcriptIsTruncated =
    displayedTranscript.length < selectedTranscript.length;

  useEffect(() => {
    setTranscriptDisplayLength(TRANSCRIPT_DETAIL_CHUNK);
  }, [selectedId]);

  const printNotes = () => {
    if (typeof window === "undefined") return;
    const text = (notesMarkdown || "").trim();
    if (!text) return;

    const escaped = text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    win.document.open();
    win.document.write(`
<!doctype html>
<html>
<head>
  <title>NeoLearn Notes</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 32px;
      color: #111827;
      line-height: 1.65;
      white-space: pre-wrap;
    }
    h1 {
      font-size: 22px;
      margin-bottom: 18px;
    }
    .content {
      font-size: 14px;
    }
  </style>
</head>
<body>
  <h1>NeoLearn Notes</h1>
  <div class="content">${escaped}</div>
</body>
</html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const downloadNotesText = () => {
    const text = (notesMarkdown || "").trim();
    if (!text) return;

    const doc = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("NeoLearn Notes", margin, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const lines = doc.splitTextToSize(text, maxWidth);

    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 16;
    }

    doc.save("NeoLearn_Notes.pdf");
  };


  const openUnicodePrintPdf = (session: StoredSession) => {
    const esc = (v: string) =>
      String(v || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return;

    const transcript = esc(session.transcript || "No transcript saved.");
    win.document.open();
    win.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>NeoLearn Class Recording</title>
  <style>
    body {
      font-family: "Noto Sans Devanagari", "Noto Sans Bengali", "Nirmala UI", "Mangal", "Vrinda", Arial, sans-serif;
      padding: 32px;
      color: #111827;
      line-height: 1.65;
    }
    h1 { font-size: 22px; margin-bottom: 16px; }
    .meta { font-size: 13px; margin-bottom: 18px; }
    .meta div { margin: 3px 0; }
    .transcript {
      white-space: pre-wrap;
      font-size: 13px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 18px;
      background: #f8fafc;
    }
    .footer { margin-top: 20px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <h1>NeoLearn – Class Recording</h1>
  <div class="meta">
    <div><b>Subject:</b> ${esc(session.subject)}</div>
    <div><b>Chapter:</b> ${esc(session.chapter)}</div>
    <div><b>Topic:</b> ${esc(session.topic)}</div>
    <div><b>Language:</b> ${esc(session.language)}</div>
    <div><b>Start:</b> ${esc(formatHistoryDate(session.startedAt))}</div>
    <div><b>End:</b> ${esc(formatHistoryDate(session.endedAt))}</div>
  </div>
  <div class="transcript">${transcript}</div>
  <div class="footer">Generated by NeoLearn AI Assisted Learning</div>
  <script>
    setTimeout(() => window.print(), 500);
  </script>
</body>
</html>`);
    win.document.close();
    win.focus();
  };

  const downloadPdf = () => {
    if (!selected) return;
    openUnicodePrintPdf(selected);
  };


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Gallery / Class History</h1>
        <div className="text-[11px] text-gray-500">
          {loading
            ? "Loading saved classes..."
            : `${orderedSessions.length} saved ${
                orderedSessions.length === 1 ? "class" : "classes"
              }`}
        </div>
      </div>

      {/* ---------------- Notes Engine (v1) ---------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">Exam Notes Generator</div>
            <div className="text-[11px] text-slate-500">
              Generate chapter-wise notes (MCQ, 2-mark, 5-mark, case-based) in printable format.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as NoteType)}
            >
              <option value="full_exam_notes">Full Exam Notes</option>
              <option value="quick_revision">Quick Revision</option>
              <option value="important_qna">Important Q&amp;A</option>
              <option value="mcq_only">MCQ Only</option>
            </select>

            <button
              type="button"
              onClick={onGenerateNotes}
              disabled={notesLoading}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {notesLoading ? "Generating..." : "Generate Notes"}
            </button>

            {notesMarkdown?.trim() && (
  <>
    <button
      type="button"
      onClick={printNotes}
      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
    >
      Print Notes
    </button>
    <button
      type="button"
      onClick={downloadNotesText}
      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
    >
      Download Notes
    </button>
  </>
)}
          </div>
        </div>

        {!notesMarkdown?.trim() && !notesLoading && (
  <div className="mt-2 text-xs text-slate-600">
    Select a note type and click <b>Generate Notes</b>.
  </div>
)}

{notesError && (
  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
    {notesError}
  </div>
)}

{notesMarkdown?.trim() && (
  <div className="mt-3 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
    {notesMarkdown}
  </div>
)}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          Loading class history...
        </div>
      ) : orderedSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-600">
          No saved classes yet. Start a live class, use realtime voice, then click{" "}
          <b>End Class &amp; Save</b>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Left list */}
          <div className="md:col-span-1 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <div className="mb-2 text-[11px] font-semibold text-gray-600 uppercase">
              Recordings
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {visibleSessions.map((s, index) => {
                const transcriptPreview = safeHistoryText(s.transcript)
                  .replace(/\s+/g, " ")
                  .slice(0, TRANSCRIPT_PREVIEW_LENGTH);

                return (
                <button
                  key={`${s.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                    selectedId === s.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold text-slate-800 truncate">
                    {safeHistoryText(s.subject, "Unknown Subject")} ·{" "}
                    {safeHistoryText(s.topic, "Unknown Topic")}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    {safeHistoryText(s.chapter, "Unknown Chapter")}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
                    {transcriptPreview || "No transcript preview available."}
                    {safeHistoryText(s.transcript).length >
                    TRANSCRIPT_PREVIEW_LENGTH
                      ? "…"
                      : ""}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {formatHistoryDate(s.endedAt)}
                  </div>
                </button>
                );
              })}

              {visibleCount < orderedSessions.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((count) =>
                      Math.min(
                        count + HISTORY_INITIAL_VISIBLE,
                        orderedSessions.length
                      )
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Show more recordings
                </button>
              )}
            </div>
          </div>

          {/* Right viewer */}
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-3">
            {!selected ? (
              <div className="text-xs text-slate-600">
                Select any recording from the left.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {safeHistoryText(
                        selected.subject,
                        "Unknown Subject"
                      )}{" "}
                      · {safeHistoryText(selected.topic, "Unknown Topic")}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Chapter:{" "}
                      {safeHistoryText(selected.chapter, "Unknown Chapter")}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {formatHistoryDate(selected.startedAt)} →{" "}
                      {formatHistoryDate(selected.endedAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
  type="button"
  onClick={() => selected && openUnicodePrintPdf(selected)}
  className="rounded-xl border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
>
  Print
</button>

                    <button
                      type="button"
                      onClick={() => downloadPdf()}
                      className="rounded-xl border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Save PDF
                    </button>
                  </div>
                </div>

                <div className="mt-3 max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-800">
                  {displayedTranscript ||
                    "No transcript saved for this session."}
                </div>

                {selectedTranscript.length > TRANSCRIPT_DETAIL_CHUNK && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {transcriptIsTruncated &&
                      transcriptDisplayLength < TRANSCRIPT_DETAIL_MAX && (
                        <button
                          type="button"
                          onClick={() =>
                            setTranscriptDisplayLength((length) =>
                              Math.min(
                                length + TRANSCRIPT_DETAIL_CHUNK,
                                TRANSCRIPT_DETAIL_MAX
                              )
                            )
                          }
                          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                        >
                          Show more transcript
                        </button>
                      )}
                    {transcriptDisplayLength > TRANSCRIPT_DETAIL_CHUNK && (
                      <button
                        type="button"
                        onClick={() =>
                          setTranscriptDisplayLength(TRANSCRIPT_DETAIL_CHUNK)
                        }
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Show less
                      </button>
                    )}
                    {selectedTranscript.length > TRANSCRIPT_DETAIL_MAX &&
                      transcriptDisplayLength >= TRANSCRIPT_DETAIL_MAX && (
                        <span className="text-[11px] text-slate-500">
                          Preview limited for performance. Print or Save PDF
                          includes the complete transcript.
                        </span>
                      )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



interface TopicTestQuestion {
  id: number;
  difficulty?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

type CompetitivePracticeQuestion = {
  id: number;
  difficulty: "Easy" | "Moderate" | "Hard";
  question: string;
  answer: string;
  explanation: string;
};

type WeakAreaDiagnosis = {
  weakAreas: string[];
  trigger: string;
  advice: string;
  practice: CompetitivePracticeQuestion[];
};

const COMPETITIVE_WEAK_PRACTICE_FOCUS = [
  "concept definition",
  "formula or rule selection",
  "calculation setup",
  "trap option elimination",
  "exam-speed verification",
];

function compactQuestionSignature(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 14)
    .join(" ");
}

function buildWeakConceptLabel(
  question: TopicTestQuestion | null,
  topicLabel: string,
  fallbackFocus: string,
  index: number
) {
  if (!question) {
    return `${topicLabel}: ${fallbackFocus}`;
  }

  const text = `${question.question} ${question.explanation}`.replace(/\s+/g, " ").trim();
  const phrase =
    text
      .split(/[.?!:;]/)
      .map((part) => part.trim())
      .find((part) => part.length >= 18 && part.length <= 90) ||
    text.slice(0, 90).trim();

  return `${topicLabel}: ${phrase || `${fallbackFocus} ${index + 1}`}`;
}

function RoutineView({
  subjects,
  routine,
  setRoutine,
  onStartToday,
}: {
  subjects: SubjectRow[];
  routine: WeeklyRoutine;
  setRoutine: (r: WeeklyRoutine) => void;
  onStartToday: () => void;
}) {
  const updateDay = (day: Weekday, patch: Partial<RoutineDayPlan>) => {
    setRoutine({
      ...routine,
      [day]: {
        ...routine[day],
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Weekly Routine</h1>

        <button
          type="button"
          onClick={onStartToday}
          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Start Today Class
        </button>
      </div>

      <div className="text-xs text-gray-600">
        Set <b>2 subjects per day</b> + class time. Each day runs two blocks (Phase 1 & Phase 2).
        Recommended: <b>30–45 minutes</b> per subject.
      </div>

      <div className="grid grid-cols-1 gap-3">
        {WEEKDAYS.map((day) => {
          const plan = routine[day];
          return (
            <div
              key={day}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{day}</div>
                <div className="text-[11px] text-slate-500">
                  Time:{" "}
                  <input
                    type="time"
                    value={plan.time}
                    onChange={(e) => updateDay(day, { time: e.target.value })}
                    className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-600 mb-1">
                    Subject 1
                  </div>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                    value={plan.subject1Id ?? ""}
                    onChange={(e) =>
                      updateDay(day, {
                        subject1Id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Select subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-600 mb-1">
                    Subject 2
                  </div>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                    value={plan.subject2Id ?? ""}
                    onChange={(e) =>
                      updateDay(day, {
                        subject2Id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Select subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-600 mb-1">
                    Minutes / Subject
                  </div>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                    value={plan.minutesPerSubject}
                    onChange={(e) =>
                      updateDay(day, { minutesPerSubject: Number(e.target.value) })
                    }
                  >
                    <option value={30}>30 min</option>
                    <option value={35}>35 min</option>
                    <option value={40}>40 min</option>
                    <option value={45}>45 min</option>
                  </select>

                  <div className="mt-1 text-[11px] text-slate-500">
                    Total/day ≈ {plan.minutesPerSubject * 2} minutes
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ---------- Classroom view (center circle + right chat) ---------- */


function ClassroomView(props: {
  onOpenPayments: () => void;
  onOpenStartFlow: () => void;
  onOpenParentLink: () => void;
  syllabusLoading: boolean;
  syllabusError: string | null;
  currentSubject: SubjectRow | null;
  currentChapter: ChapterRow | null;
  currentTopic: TopicRow | null;
  language: "English" | "Hindi" | "Bengali";
  setLanguage: (lang: "English" | "Hindi" | "Bengali") => void;
  speed: "Slow" | "Normal" | "Fast";
  setSpeed: (s: "Slow" | "Normal" | "Fast") => void;
  messages: ChatMessage[];
  question: string;
  setQuestion: (s: string) => void;
  onStartLesson: () => Promise<void> | void;
  onAskQuestion: () => Promise<void> | void;
  isStartingLesson: boolean;
  trialLimitNotice: { topicId: number | null; message: string } | null;
  isAsking: boolean;
  audioUrl: string | null;
  lessonAudioRef: React.RefObject<HTMLAudioElement | null>;
  onPauseLessonAudio: () => void;
  onStopLessonAudio: () => void;
  audioError: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  teacherAvatar: string;
  studentName: string;
  studentMobile: string;
  studentTrack: string;
  competitiveExam: string | null;
  isClassLive: boolean;
  remainingSeconds: number;
  onEnsureClassLive?: () => void;
  onAppendTranscript: (delta: string) => void;
  onEndClass: () => void;
  autoStartToken: number;
  autoStartPayload: {
    subject1Id: number;
    subject2Id: number;
    minutesPerSubject: number;
  } | null;
  onNavigateTab: (tab: ActiveTab) => void;
  onMissionRefresh: () => void | Promise<void>;
  missionLessonHintToken: number;
  missionTopicTestHintToken: number;
  onFocusFullscreenChange?: (active: boolean) => void;
}) {
  const {
    onOpenPayments,
    onOpenStartFlow,
    onOpenParentLink,
    syllabusLoading,
    syllabusError,
    currentSubject,
    currentChapter,
    currentTopic,
    language,
    setLanguage,
    speed,
    setSpeed,
    messages,
    question,
    setQuestion,
    onStartLesson,
    onAskQuestion,
    isStartingLesson,
    trialLimitNotice,
    isAsking,
    audioUrl,
    lessonAudioRef,
    onPauseLessonAudio,
    onStopLessonAudio,
    audioError,
    messagesEndRef,
    teacherAvatar,
    studentName,
    studentMobile,
    studentTrack,
    competitiveExam,
    isClassLive,
    remainingSeconds,
    onEnsureClassLive,
    onAppendTranscript,
    onEndClass,
    onNavigateTab,
    onMissionRefresh,
    missionLessonHintToken,
    missionTopicTestHintToken,
    onFocusFullscreenChange,
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardMode, setBoardMode] = useState<"ready" | "visual" | "steps" | "summary">("ready");
  const [classroomFullscreen, setClassroomFullscreen] = useState(false);
  const [boardFullscreen, setBoardFullscreen] = useState(false);
  const [liveActionDrawerOpen, setLiveActionDrawerOpen] = useState(false);
  const [liveToolsPosition, setLiveToolsPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);

  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeTeacherClient | null>(null);
  const [isRealtimeOn, setIsRealtimeOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("Ready");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const lastRealtimeTranscriptRef = useRef("");
  const lastChatScrollTopRef = useRef(0);
  const liveToolsDragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });
  const suppressLiveToolsClickRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;

    const closeComposerMenu = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (composerMenuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeComposerMenu);
    return () => document.removeEventListener("pointerdown", closeComposerMenu);
  }, [menuOpen]);

  const [topicTest, setTopicTest] = useState<TopicTestQuestion[] | null>(null);
  const [topicTestAnswers, setTopicTestAnswers] = useState<
    Record<number, number | null>
  >({});
  const [topicTestResult, setTopicTestResult] = useState<{
    correct: number;
    total: number;
    percent: number;
    weakDiagnosis?: WeakAreaDiagnosis | null;
  } | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [isTopicTestOpen, setIsTopicTestOpen] = useState(false);
  const topicTestButtonRef = useRef<HTMLButtonElement | null>(null);
  const startLessonButtonRef = useRef<HTMLButtonElement | null>(null);
  const [highlightTopicTestButton, setHighlightTopicTestButton] = useState(false);
  const [highlightStartLessonButton, setHighlightStartLessonButton] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const goTab = (tab: ActiveTab) => {
    onNavigateTab(tab);
    setMobileDrawerOpen(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, realtimeTranscript, messagesEndRef]);

  useEffect(() => {
    return () => {
      onStopLessonAudio();
    };
  }, [onStopLessonAudio]);

  useEffect(() => {
    return () => {
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      } catch {}
      try {
        realtimeClient?.disconnect();
      } catch {}
    };
  }, [realtimeClient]);

  useEffect(() => {
    onFocusFullscreenChange?.(classroomFullscreen || boardFullscreen);
    return () => onFocusFullscreenChange?.(false);
  }, [classroomFullscreen, boardFullscreen, onFocusFullscreenChange]);

useEffect(() => {
  if (!realtimeClient) return;

  try {
    realtimeClient.disconnect();
  } catch {}

  setRealtimeClient(null);
  setIsRealtimeOn(false);
  setIsListening(false);
  setRealtimeTranscript("");
  setRealtimeStatus("Language changed. Reconnect realtime voice.");
}, [language]);

  const stopCamera = () => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
      videoRef.current.srcObject = null;
    }
  };

  const openCamera = async () => {
    setCameraError(null);
    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      setIsCameraOpen(true);

      window.setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
      }, 60);
    } catch (err: any) {
      console.error("camera error:", err);
      setCameraError(
        err?.message || "Camera access blocked. Please allow permission."
      );
      setIsCameraOpen(false);
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.92));
    stopCamera();
    setIsCameraOpen(false);
  };

  const buildRealtimeQuestion = (raw: string) => {
  const trimmed = raw.trim();
  const isCompetitiveRealtime = String(studentTrack).toLowerCase() === "competitive";

  return [
    `Selected language: ${language}. Respond only in this language.`,
    currentSubject
      ? `Selected subject: ${currentSubject.subject_name}.`
      : "",
    currentChapter
      ? `Selected chapter: ${currentChapter.chapter_name}.`
      : "",
    currentTopic
      ? `Selected topic: ${currentTopic.topic_name}.`
      : "",
    "Important rule: Answer only if the student's question is about the selected topic.",
    "If the question is outside the selected topic, politely refuse and ask the student to stay with the current lesson topic.",
    isCompetitiveRealtime
      ? `Competitive Deep Mode for ${competitiveExam || "Competitive Exam"}: answer with exam relevance, deep concept explanation, key formulas/facts/rules, solved example, shortcut/trick, common mistakes/traps, exam-style MCQs, answer explanations, quick revision points, and next practice task.`
      : "",
    `Student question: ${trimmed}`,
  ]
    .filter(Boolean)
    .join(" ");
};

 function getRealtimeLocale(language: string): string {
  if (language === "Hindi") return "hi-IN";
  if (language === "Bengali") return "bn-IN";
  return "en-IN";
}

const ensureRealtimeConnected = async (silent = false) => {
  let client = realtimeClient;
  if (client && isRealtimeOn) return client;

  client =
    client ??
    new RealtimeTeacherClient(studentMobile, {
      onStatus: (s) => setRealtimeStatus(s),
      onError: (msg) => setRealtimeStatus(`Realtime error: ${msg}`),
      onRemoteAudioStart: () => {
        onPauseLessonAudio();
      },
      onTranscript: (text) => {
        onPauseLessonAudio();
        const safeText = String(text || "");

        setRealtimeTranscript(
          safeText.length > 4000 ? `…${safeText.slice(-4000)}` : safeText
        );

        const previous = lastRealtimeTranscriptRef.current || "";
        const delta = extractTranscriptDelta(previous, safeText);
        if (delta.trim()) onAppendTranscript(delta);

        lastRealtimeTranscriptRef.current = safeText;
      },
    });

  if (!realtimeClient) {
    setRealtimeClient(client);
  }

  const realtimeLocale =
    getRealtimeLocale(language) as Parameters<RealtimeTeacherClient["connect"]>[0];

  const strictTopicGuard = currentTopic?.topic_name
    ? `You are teaching only this exact topic: "${currentTopic.topic_name}".`
    : "You must stay within the currently selected topic.";

  const strictChapterGuard = currentChapter?.chapter_name
    ? `Current chapter: "${currentChapter.chapter_name}".`
    : "";

  const strictSubjectGuard = currentSubject?.subject_name
    ? `Current subject: "${currentSubject.subject_name}".`
    : "";

  const strictLanguageGuard =
    language === "Hindi"
      ? 'Reply only in simple Hindi used in India. Never reply in English, Kannada, Spanish, or any other language. If the student asks you to switch language, politely refuse and continue only in Hindi.'
      : language === "Bengali"
      ? 'Reply only in simple Bengali used in India. Never reply in English, Kannada, Spanish, or any other language. If the student asks you to switch language, politely refuse and continue only in Bengali.'
      : 'Reply only in simple Indian English. Never reply in Hindi, Bengali, Kannada, Spanish, or any other language. If the student asks you to switch language, politely refuse and continue only in English.';

  const offTopicGuard =
    'If the student asks anything outside the selected subject/chapter/topic, do not answer that off-topic question. Politely say that you are the NeoLearn classroom teacher for the current lesson and ask the student to stay on the selected topic.';

  const classroomRules =
    String(studentTrack).toLowerCase() === "competitive"
      ? `Use Competitive Deep Mode for ${competitiveExam || "Competitive Exam"}: make responses exam-focused and structured with exam relevance, deep concept explanation, key formulas/facts/rules, step-by-step solved example, shortcut/trick, common mistakes/traps, exam-style MCQs, answer explanations, quick revision points, and next practice task. Do not drift into unrelated topics.`
      : 'Keep answers short, teacher-like, classroom-safe, and easy for a school student to understand. Do not drift into unrelated topics.';

  const voiceStyle =
    language === "Hindi"
      ? "Speak with a clear, feminine Indian teacher voice in natural classroom Hindi. Be warm, crisp, friendly, and confident; never robotic, dull, foreign-accented, too slow, or overly dramatic."
      : language === "Bengali"
      ? "Speak with a clear, feminine Indian teacher voice in natural classroom Bengali. Be warm, crisp, friendly, and confident; never robotic, dull, foreign-accented, too slow, or overly dramatic."
      : "Speak with a clear, feminine Indian teacher voice using natural Indian English pronunciation and classroom cadence. Be warm, crisp, friendly, and confident; never robotic, dull, foreign-accented, too slow, or overly dramatic.";

  onPauseLessonAudio();
  await client.connect(
    realtimeLocale,
    [
      "You are NeoLearn's professional Indian school teacher.",
      `Current student: ${studentName}.`,
      strictSubjectGuard,
      strictChapterGuard,
      strictTopicGuard,
      strictLanguageGuard,
      offTopicGuard,
      classroomRules,
      voiceStyle,
    ]
      .filter(Boolean)
      .join(" ")
  );

  setRealtimeClient(client);
  setIsRealtimeOn(true);
  setRealtimeStatus(
    silent
      ? `Realtime ready (${realtimeLocale}).`
      : `Realtime connected (${realtimeLocale}).`
  );

  return client;
};

const loadEntitlementsLocal = useCallback(async () => {
  if (!studentMobile) return null;

  try {
    const res = await fetch(
      `/api/student/entitlements?mobile=${encodeURIComponent(studentMobile)}`,
      { headers: studentAuthHeaders() }
    );
    const data = await res.json();
    return res.ok && data?.ok
      ? data
      : {
          ok: false,
          authRequired: res.status === 401,
          error: loginAgainMessage(res.status, data?.error),
        };
  } catch (error) {
    return {
      ok: false,
      authRequired: error instanceof ClientAuthError,
      error: error instanceof ClientAuthError ? error.message : "Unable to verify access.",
    };
  }
}, [studentMobile]);

const handleToggleRealtime = async () => {
  if (isRealtimeOn && realtimeClient) {
    try {
      realtimeClient.disconnect();
    } catch {}
    setRealtimeClient(null);
    setIsRealtimeOn(false);
    setIsListening(false);
    setRealtimeTranscript("");
    setRealtimeStatus("Realtime voice off");
    return;
  }

  onPauseLessonAudio();
  const ent = await loadEntitlementsLocal();
  if (ent?.authRequired) {
    setRealtimeStatus("Please login again.");
    return;
  }
  if (!ent?.features?.realtimeVoice) {
    setRealtimeStatus(
      "Realtime voice is available only after subscription. You can continue text Q&A here, or open Payments manually."
    );
    onOpenPayments();
    return;
  }

  try {
    await ensureRealtimeConnected(false);
  } catch (err: any) {
    console.error("realtime connect error:", err);
    setRealtimeClient(null);
    setIsRealtimeOn(false);
    setIsListening(false);
    setRealtimeStatus(
      `Realtime error: ${
        err?.message || err?.toString?.() || "Failed to connect realtime voice."
      }`
    );
  }
};

const handleAskRealtime = async () => {
  const trimmed = question.trim();
  if (!trimmed) return;

  if (isRealtimeOn || realtimeClient) {
    try {
      onPauseLessonAudio();
      const client = await ensureRealtimeConnected(true);
      setRealtimeTranscript("");
      client.sendText(buildRealtimeQuestion(trimmed));
      setQuestion("");
      return;
    } catch (err) {
      console.error(err);
    }
  }

  if (!isAsking) {
    onAskQuestion();
  }
};

const handleMicToggle = async () => {
  onPauseLessonAudio();
  const ent = await loadEntitlementsLocal();
  if (ent?.authRequired) {
    setRealtimeStatus("Please login again.");
    return;
  }
  if (!ent?.features?.realtimeVoice) {
    setRealtimeStatus(
      "Realtime voice is available only after subscription. You can continue text Q&A here, or open Payments manually."
    );
    onOpenPayments();
    return;
  }

  try {
    if (!realtimeClient) {
      await ensureRealtimeConnected(false);
      return;
    }

    if (isListening) {
      realtimeClient.stopMicAndSend();
      setIsListening(false);
      setRealtimeStatus("Stopped listening. Teacher is answering...");
    } else {
      await realtimeClient.startMic();
      setIsListening(true);
      setRealtimeStatus("Listening... speak now.");
    }
  } catch (err: any) {
    console.error("mic toggle error:", err);
    setRealtimeStatus(
      `Realtime error: ${
        err?.message || err?.toString?.() || "Mic toggle failed."
      }`
    );
  }
};

const disconnectRealtimeForLessonAudio = (status: string) => {
  if (!realtimeClient && !isRealtimeOn) return;

  try {
    realtimeClient?.disconnect();
  } catch {}

  setRealtimeClient(null);
  setIsRealtimeOn(false);
  setIsListening(false);
  setRealtimeTranscript("");
  lastRealtimeTranscriptRef.current = "";
  setRealtimeStatus(status);
};

const handleStartLessonClick = async () => {
  disconnectRealtimeForLessonAudio(
    "Realtime voice stopped while lesson audio is active."
  );
  await onStartLesson();
};

const handleLessonAudioPlay = () => {
  disconnectRealtimeForLessonAudio(
    "Realtime voice disconnected to play lesson audio."
  );
};
  
const handleStartTopicTest = async () => {
  if (isLoadingTest) return;

  if (!currentSubject || !currentChapter || !currentTopic) {
    setRealtimeStatus(
      "Please select subject, chapter and topic before starting the test."
    );
    return;
  }

  const ent = await loadEntitlementsLocal();
  if (ent?.authRequired) {
    setRealtimeStatus("Please login again.");
    return;
  }
  if (!ent?.features?.topicTest) {
    setRealtimeStatus(
      "Topic tests are not available in the current access state."
    );
    return;
  }

  setIsLoadingTest(true);
  setTopicTest(null);
  setTopicTestAnswers({});
  setTopicTestResult(null);

  try {
    const langCode =
      language === "Hindi" ? "hi" : language === "Bengali" ? "bn" : "en";

    const res = await fetch("/api/topic-test", {
      method: "POST",
      headers: studentAuthHeaders(true),
      body: JSON.stringify({
        mobile: studentMobile,
        board: String(studentTrack).toLowerCase() === "competitive" ? competitiveExam || "Competitive" : "CBSE",
        classLevel: `Class ${currentSubject.class_number || 6}`,
        track: studentTrack,
        subjectType: studentTrack,
        competitiveExam,
        subject: currentSubject.subject_name,
        chapter: currentChapter.chapter_name,
        topic: currentTopic.topic_name,
        language: langCode,
        numQuestions: 5,
      }),
    });

    const { data, errorText } = await readJsonResponse<any>(res);
    if (!res.ok) {
      throw new Error(
        loginAgainMessage(
          res.status,
          data?.error || errorText || "Failed to create topic test."
        )
      );
    }

    if (!data?.ok || !Array.isArray(data.questions)) {
      throw new Error(
        data?.error || errorText || "AI response was not valid test data."
      );
    }

    const expectedQuestionCount = 5;
    const isCompetitiveTest = String(studentTrack).toLowerCase() === "competitive";
    const questions: TopicTestQuestion[] = data.questions
      .slice(0, expectedQuestionCount)
      .map((q: TopicTestQuestion, index: number) => ({
        ...q,
        id: index + 1,
      }));

    if (isCompetitiveTest && questions.length !== expectedQuestionCount) {
      throw new Error(
        `Competitive topic test must contain exactly ${expectedQuestionCount} valid questions. Please try again.`
      );
    }

    const initialAnswers: Record<number, number | null> = {};

    questions.forEach((q) => {
      initialAnswers[q.id] = null;
    });

    setTopicTest(questions);
    setTopicTestAnswers(initialAnswers);
    setIsTopicTestOpen(true);
    setRealtimeStatus("Topic test ready.");
  } catch (err: any) {
    console.error(err);
    setRealtimeStatus(err?.message || "Error while generating topic test.");
  } finally {
    setIsLoadingTest(false);
  }
};

useEffect(() => {
  if (!missionLessonHintToken) return;
  setHighlightStartLessonButton(true);
  setRealtimeStatus("Learn step is ready. Tap Start Lesson when you are ready.");
  if (window.innerWidth >= 1024) {
    setDrawerOpen(true);
  } else {
    setMobileDrawerOpen(true);
  }
  window.setTimeout(() => {
    const button =
      startLessonButtonRef.current ||
      document.querySelector<HTMLButtonElement>('[data-mission-action="start-lesson"]:not(:disabled)');
    button?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    button?.focus({ preventScroll: true });
  }, 80);
  const timeout = window.setTimeout(() => setHighlightStartLessonButton(false), 2200);
  return () => window.clearTimeout(timeout);
}, [missionLessonHintToken]);

useEffect(() => {
  if (!missionTopicTestHintToken) return;
  setHighlightTopicTestButton(true);
  setRealtimeStatus("Practice pending. Tap Start Topic Test when you are ready.");
  if (window.innerWidth >= 1024) {
    setDrawerOpen(true);
  } else {
    setMobileDrawerOpen(true);
  }
  window.setTimeout(() => {
    const button =
      topicTestButtonRef.current ||
      document.querySelector<HTMLButtonElement>('[data-mission-action="topic-test"]:not(:disabled)');
    button?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    button?.focus({ preventScroll: true });
  }, 80);
  const timeout = window.setTimeout(() => setHighlightTopicTestButton(false), 2200);
  return () => window.clearTimeout(timeout);
}, [missionTopicTestHintToken]);

useEffect(() => {
  setBoardMode("ready");
  setBoardFullscreen(false);
}, [currentTopic?.id]);

  const buildCompetitiveWeakDiagnosis = (
    questions: TopicTestQuestion[],
    answers: Record<number, number | null>,
    percent: number
  ): WeakAreaDiagnosis | null => {
    if (String(studentTrack).toLowerCase() !== "competitive" || questions.length === 0) {
      return null;
    }

    const wrong = questions.filter((q) => answers[q.id] !== q.correctIndex);
    const sourceQuestions = wrong.length > 0 ? wrong : questions.slice(0, Math.min(3, questions.length));
    const topicLabel = currentTopic?.topic_name || "this topic";

    const weakAreas =
      wrong.length > 0
        ? sourceQuestions.slice(0, 3).map((q, index) => {
            const compactQuestion = q.question.replace(/\s+/g, " ").trim();
            return `${index + 1}. ${compactQuestion.slice(0, 88)}${compactQuestion.length > 88 ? "..." : ""}`;
          })
        : sourceQuestions.slice(0, 3).map((q, index) => {
            const compactQuestion = q.question.replace(/\s+/g, " ").trim();
            return `${index + 1}. Recheck displayed question: ${compactQuestion.slice(0, 76)}${compactQuestion.length > 76 ? "..." : ""}`;
          });

    const trigger =
      wrong.length > 0
        ? `${wrong.length} incorrect answer${wrong.length === 1 ? "" : "s"} found in this test.`
        : percent < 80
        ? `Score is ${percent}%, so revision is still needed.`
        : `Score is ${percent}%, so focus on speed and avoiding traps.`;

    const advice =
      percent < 50
        ? `Revise ${topicLabel} from basics, then solve these without a timer. Mark the step where you get stuck.`
        : percent < 80
        ? `Rework the wrong patterns, then solve these in 8-10 minutes with option elimination.`
        : `Maintain accuracy. Solve these in 6-8 minutes and check for hidden traps before marking answers.`;

    const uniquePool: TopicTestQuestion[] = [];
    const seenQuestionSignatures = new Set<string>();
    for (const q of [...sourceQuestions, ...questions]) {
      const signature = compactQuestionSignature(q.question);
      if (!signature || seenQuestionSignatures.has(signature)) continue;
      seenQuestionSignatures.add(signature);
      uniquePool.push(q);
    }

    const usedPracticeQuestions = new Set<string>();
    const usedConcepts = new Set<string>();
    const practice: CompetitivePracticeQuestion[] = [];
    if (uniquePool.length === 0) {
      return { weakAreas, trigger, advice, practice };
    }

    for (let index = 0; index < COMPETITIVE_WEAK_PRACTICE_FOCUS.length; index += 1) {
      const focus = COMPETITIVE_WEAK_PRACTICE_FOCUS[index];
      const base = uniquePool.find((q) => {
        const signature = compactQuestionSignature(q.question);
        return signature && !usedPracticeQuestions.has(signature);
      }) || uniquePool[index % uniquePool.length];
      const baseSignature = base ? compactQuestionSignature(base.question) : "";
      if (baseSignature) usedPracticeQuestions.add(baseSignature);

      let concept = buildWeakConceptLabel(base, topicLabel, focus, index);
      const conceptKey = compactQuestionSignature(concept) || `${focus}-${index}`;
      if (usedConcepts.has(conceptKey)) {
        concept = `${topicLabel}: ${focus}`;
      }
      usedConcepts.add(compactQuestionSignature(concept) || `${focus}-${index}`);

      const correctOption = base?.options?.[base.correctIndex] || "";
      const prompt =
        `Re-solve this topic-specific ${focus} practice item from ${topicLabel}: ${base.question}`;

      practice.push({
        id: index + 1,
        difficulty:
          base?.difficulty === "Easy" || base?.difficulty === "Moderate" || base?.difficulty === "Hard"
            ? base.difficulty
            : index < 2
              ? "Easy"
              : index < 4
                ? "Moderate"
                : "Hard",
        question: prompt,
        answer:
          `Correct answer: ${String.fromCharCode(65 + base.correctIndex)}) ${correctOption}`,
        explanation:
          `Focus on ${focus}. ${base.explanation}`,
      });
    }

    return { weakAreas, trigger, advice, practice };
  };

  const handleSubmitTopicTest = async () => {
    try {
      if (!topicTest || topicTest.length === 0) return;

      let correct = 0;
      const displayedQuestions = topicTest.filter(
        (q) =>
          q.question &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.options.length
      );
      if (displayedQuestions.length === 0) return;

      setTopicTest(displayedQuestions);

      displayedQuestions.forEach((q) => {
        if (topicTestAnswers[q.id] === q.correctIndex) correct += 1;
      });

      const total = displayedQuestions.length;
      const percent = Math.round((correct / total) * 100);
      const weakDiagnosis = buildCompetitiveWeakDiagnosis(
        displayedQuestions,
        topicTestAnswers,
        percent
      );
      const weakAreaText = weakDiagnosis?.weakAreas?.length
        ? weakDiagnosis.weakAreas.join("; ")
        : percent < 80
        ? `Review mistakes in ${currentTopic?.topic_name || "this topic"}`
        : null;

      setTopicTestResult({ correct, total, percent, weakDiagnosis });

      if (!currentTopic?.id) return;

      const saveRes = await fetch("/api/topic-test/submit", {
        method: "POST",
        headers: studentAuthHeaders(true),
        body: JSON.stringify({
          studentMobile,
          studentName: "",
          board: "cbse",
          classNumber: Number(currentSubject?.class_number || 6),
          subjectId: currentSubject?.id,
          chapterId: currentChapter?.id,
          topicId: currentTopic.id,
          subjectName: currentSubject?.subject_name,
          chapterName: currentChapter?.chapter_name,
          topicName: currentTopic.topic_name,
          score: percent,
          weakArea: weakAreaText,
        }),
      });

      const { data: saveData, errorText } =
        await readJsonResponse<any>(saveRes);
      if (!saveRes.ok || !saveData?.ok) {
        throw new Error(
          loginAgainMessage(
            saveRes.status,
            saveData?.error ||
              errorText ||
              "Test score could not be saved."
          )
        );
      }

      setRealtimeStatus(`Test saved: ${correct}/${total} (${percent}%).`);
      onMissionRefresh();
    } catch (err: any) {
      console.error(err);
      setRealtimeStatus(err?.message || "Submit crashed.");
    }
  };

  const handleEndClassClick = () => {
    onStopLessonAudio();

    try {
      realtimeClient?.disconnect();
    } catch {}

    setRealtimeClient(null);
    setIsRealtimeOn(false);
    setIsListening(false);
    setRealtimeStatus("Class ended and saved.");
    setRealtimeTranscript("");
    lastRealtimeTranscriptRef.current = "";

    onEndClass();
  };

  const renderBoardVisual = () => {
    const boardTopic = (currentTopic?.topic_name || "").toLowerCase();
    const boardSubject = (currentSubject?.subject_name || "").toLowerCase();
    const topicName = currentTopic?.topic_name || "this topic";
    const chapterName = currentChapter?.chapter_name || "current chapter";
    const isMath =
      boardSubject.includes("math") ||
      boardTopic.includes("fraction") ||
      boardTopic.includes("decimal") ||
      boardTopic.includes("angle") ||
      boardTopic.includes("triangle");
    const isScience =
      boardSubject.includes("science") ||
      boardTopic.includes("sieving") ||
      boardTopic.includes("winnowing");

    if (!currentTopic) {
      return (
        <div className="neo-smart-board-canvas flex h-full items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-blue-50 text-center">
          <div>
            <div className="text-xl font-bold text-slate-800">Teacher Smart Board</div>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Select a topic to visualize formulas, diagrams, and step-by-step ideas here.
            </p>
          </div>
        </div>
      );
    }

    if (boardMode === "ready") {
      return (
        <div className="neo-smart-board-canvas flex h-full items-center justify-center rounded-3xl bg-gradient-to-br from-white via-blue-50 to-cyan-50 p-5 text-center">
          <div className="max-w-md">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-200">
              AI
            </div>
            <div className="text-2xl font-bold text-slate-900">{topicName}</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Smart Board is ready. Tap Explain on Board to visualize this topic.
            </p>
          </div>
        </div>
      );
    }

    if (boardMode === "steps") {
      return (
        <div className="neo-smart-board-canvas neo-smart-board-steps h-full overflow-y-auto rounded-3xl bg-slate-950 p-5 text-white">
          <div className="neo-smart-board-steps-title mb-4 text-sm font-bold uppercase tracking-wide text-cyan-200">
            Step-by-step
          </div>
          <div className="space-y-3">
            {[
              `Identify the key idea in ${topicName}.`,
              `Connect it with ${chapterName}.`,
              isMath ? "Write the formula or rule before solving." : "Observe the process or cause-and-effect clearly.",
              "Solve one example slowly and check each step.",
              "Try a similar question on your own.",
            ].map((step, index) => (
              <div key={step} className="neo-smart-board-step-row flex gap-3 rounded-2xl bg-white/10 p-3">
                <span className="neo-smart-board-step-index flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-sm font-black text-slate-950">
                  {index + 1}
                </span>
                <span className="neo-smart-board-step-text text-sm leading-6 text-white/90">{step}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (boardMode === "summary") {
      return (
        <div className="neo-smart-board-canvas h-full overflow-y-auto rounded-3xl bg-white p-5">
          <div className="mb-4 rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 p-4 text-white">
            <div className="text-xs font-bold uppercase tracking-wide text-white/75">
              Topic summary
            </div>
            <div className="mt-1 text-xl font-bold">{topicName}</div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-bold text-blue-900">Main idea</div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Understand the core concept first, then connect it to examples and practice.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
              <div className="text-sm font-bold text-cyan-900">Remember</div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Keep definitions, formulas, diagrams, and common mistakes together while revising.
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-sm font-bold text-violet-900">Practice next</div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Solve a topic test and review weak areas immediately after the lesson.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (boardTopic.includes("fraction") || boardTopic.includes("decimal")) {
      return (
        <div className="neo-smart-board-canvas flex h-full flex-col justify-center rounded-3xl bg-white p-5">
          <div className="mb-4 rounded-2xl bg-slate-950 px-4 py-3 text-3xl font-bold text-white">
            1/2 + 1/4 = 3/4
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="h-12 rounded-xl bg-blue-500" />
              <div className="h-12 rounded-xl bg-blue-500" />
              <div className="h-12 rounded-xl bg-slate-200" />
              <div className="h-12 rounded-xl bg-slate-200" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="h-12 rounded-xl bg-violet-500" />
              <div className="h-12 rounded-xl bg-slate-200" />
              <div className="h-12 rounded-xl bg-slate-200" />
              <div className="h-12 rounded-xl bg-slate-200" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="h-12 rounded-xl bg-emerald-500" />
              <div className="h-12 rounded-xl bg-emerald-500" />
              <div className="h-12 rounded-xl bg-emerald-500" />
              <div className="h-12 rounded-xl bg-slate-200" />
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-600">
            Fractions become easy when each bar has the same number of equal parts.
          </p>
        </div>
      );
    }

    if (
      boardTopic.includes("triangle") ||
      boardTopic.includes("angle") ||
      boardTopic.includes("symmetry")
    ) {
      return (
        <div className="neo-smart-board-canvas flex h-full items-center justify-center rounded-3xl bg-white p-5">
          <svg viewBox="0 0 700 360" className="h-full w-full max-w-3xl">
            <line x1="150" y1="280" x2="550" y2="280" stroke="#16a34a" strokeWidth="6" />
            <line x1="150" y1="280" x2="350" y2="80" stroke="#2563eb" strokeWidth="6" />
            <line x1="350" y1="80" x2="550" y2="280" stroke="#ef4444" strokeWidth="6" />
            <line x1="350" y1="80" x2="350" y2="280" stroke="#ec4899" strokeDasharray="10 10" strokeWidth="4" />
            <circle cx="150" cy="280" r="8" fill="#0f172a" />
            <circle cx="350" cy="80" r="8" fill="#0f172a" />
            <circle cx="550" cy="280" r="8" fill="#0f172a" />
            <text x="138" y="305" fontSize="20" fill="#0f172a">A</text>
            <text x="345" y="65" fontSize="20" fill="#0f172a">B</text>
            <text x="555" y="305" fontSize="20" fill="#0f172a">C</text>
            <text x="366" y="188" fontSize="18" fill="#be123c">Line of symmetry</text>
          </svg>
        </div>
      );
    }

    if (
      boardTopic.includes("sieving") ||
      boardTopic.includes("winnowing") ||
      boardSubject.includes("science")
    ) {
      return (
        <div className="neo-smart-board-canvas grid h-full grid-cols-1 gap-4 overflow-y-auto rounded-3xl bg-white p-5 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">
              Separation flow
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 p-3">
                Mixture of grain + husk
              </div>
              <div className="text-center text-xl">→</div>
              <div className="rounded-xl border border-slate-200 p-3">
                Use wind or hand movement
              </div>
              <div className="text-center text-xl">→</div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                Heavy grain falls down, lighter husk moves away
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">
              Teacher focus
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li> Show which particles are heavier and lighter.</li>
              <li> Explain why wind helps in winnowing.</li>
              <li> Compare sieve holes with particle size.</li>
              <li> Use one daily-life example from home or market.</li>
            </ul>
          </div>
        </div>
      );
    }

    return (
      <div className="neo-smart-board-canvas flex h-full items-center justify-center rounded-3xl bg-gradient-to-br from-white via-blue-50 to-violet-50 p-5">
        <div className="max-w-xl rounded-3xl border border-blue-100 bg-white/90 p-6 text-center shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
            Explain on Board
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{topicName}</div>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Visualize the important idea, then switch to Step-by-step or Summary for revision.
          </p>
        </div>
      </div>
    );
  };

  const boardActionBar = (
    <div className="neo-smart-board-actions">
      <button type="button" title="Explain" aria-label="Explain" onClick={() => setBoardMode("visual")}>
        <Lightbulb className="h-4 w-4" />
      </button>
      <button type="button" title="Draw" aria-label="Draw" onClick={() => setBoardMode("visual")}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" title="Steps" aria-label="Steps" onClick={() => setBoardMode("steps")}>
        <ListChecks className="h-4 w-4" />
      </button>
      <button type="button" title="Reset" aria-label="Reset" onClick={() => setBoardMode("ready")}>
        <RotateCcw className="h-4 w-4" />
      </button>
      <button type="button" title={boardFullscreen ? "Exit Fullscreen" : "Fullscreen"} aria-label={boardFullscreen ? "Exit Fullscreen" : "Fullscreen"} onClick={() => setBoardFullscreen((value) => !value)}>
        {boardFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        title="Close"
        aria-label="Close"
        onClick={() => {
          setBoardFullscreen(false);
          setBoardOpen(false);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const handleChatScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextTop = event.currentTarget.scrollTop;
    const previousTop = lastChatScrollTopRef.current;
    if (Math.abs(nextTop - previousTop) > 12) {
      lastChatScrollTopRef.current = nextTop;
    }
  };

  const clampLiveToolsPosition = useCallback((position: { x: number; y: number }) => {
    if (typeof window === "undefined") return position;
    const size = 48;
    const margin = 10;
    const topLimit = margin;
    const bottomLimit = Math.max(topLimit, window.innerHeight - size - margin);
    const rightLimit = Math.max(margin, window.innerWidth - size - margin);
    return {
      x: Math.min(Math.max(position.x, margin), rightLimit),
      y: Math.min(Math.max(position.y, topLimit), bottomLimit),
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("neolearnLiveToolsPosition");
    let parsed: { x: number; y: number } | null = null;
    try {
      parsed = saved ? JSON.parse(saved) : null;
    } catch {}
    const initial =
      parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)
        ? parsed
        : { x: window.innerWidth - 58, y: window.innerHeight * 0.58 };
    setLiveToolsPosition(clampLiveToolsPosition(initial));
  }, [clampLiveToolsPosition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setLiveToolsPosition((value) => {
        const next = clampLiveToolsPosition(
          value ?? { x: window.innerWidth - 58, y: window.innerHeight * 0.58 }
        );
        window.localStorage.setItem("neolearnLiveToolsPosition", JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampLiveToolsPosition]);

  const handleLiveToolsPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = liveToolsPosition ?? { x: rect.left, y: rect.top };
    liveToolsDragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.x,
      startTop: position.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleLiveToolsPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = liveToolsDragRef.current;
    if (!drag.active) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5) {
      drag.moved = true;
    }
    setLiveToolsPosition(
      clampLiveToolsPosition({
        x: drag.startLeft + deltaX,
        y: drag.startTop + deltaY,
      })
    );
  };

  const handleLiveToolsPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = liveToolsDragRef.current;
    liveToolsDragRef.current = { ...drag, active: false };
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag.moved) {
      suppressLiveToolsClickRef.current = true;
      const next = clampLiveToolsPosition({
        x: drag.startLeft + event.clientX - drag.startX,
        y: drag.startTop + event.clientY - drag.startY,
      });
      setLiveToolsPosition(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("neolearnLiveToolsPosition", JSON.stringify(next));
        window.setTimeout(() => {
          suppressLiveToolsClickRef.current = false;
        }, 180);
      }
    }
  };

  const livePaletteStyle = (() => {
    if (!liveToolsPosition || typeof window === "undefined") return undefined;
    const paletteWidth = 190;
    const paletteHeight = 190;
    const margin = 10;
    const left = liveToolsPosition.x > window.innerWidth / 2
      ? liveToolsPosition.x - paletteWidth - 12
      : liveToolsPosition.x + 60;
    return {
      left: Math.min(Math.max(left, margin), window.innerWidth - paletteWidth - margin),
      top: Math.min(
        Math.max(liveToolsPosition.y - paletteHeight / 2 + 24, margin),
        window.innerHeight - paletteHeight - margin
      ),
    };
  })();

  const livePaletteSide =
    liveToolsPosition && typeof window !== "undefined" && liveToolsPosition.x > window.innerWidth / 2
      ? "is-left-of-trigger"
      : "is-right-of-trigger";

  const liveActionDrawer = (
    <>
      {liveActionDrawerOpen && (
        <button
          type="button"
          aria-label="Close class actions"
          className="neo-live-action-backdrop hidden lg:hidden"
          onClick={() => setLiveActionDrawerOpen(false)}
        />
      )}

      <button
        type="button"
        aria-label={liveActionDrawerOpen ? "Close class actions" : "Open class actions"}
        className={`neo-live-action-trigger hidden lg:hidden ${liveActionDrawerOpen ? "is-open" : ""}`}
        style={
          liveToolsPosition
            ? { left: liveToolsPosition.x, top: liveToolsPosition.y, right: "auto", bottom: "auto" }
            : undefined
        }
        onPointerDown={handleLiveToolsPointerDown}
        onPointerMove={handleLiveToolsPointerMove}
        onPointerUp={handleLiveToolsPointerUp}
        onPointerCancel={handleLiveToolsPointerUp}
        onClick={() => {
          if (suppressLiveToolsClickRef.current) return;
          setLiveActionDrawerOpen((value) => !value);
        }}
      >
        {liveActionDrawerOpen ? <X className="h-5 w-5" /> : <SlidersHorizontal className="h-5 w-5" />}
      </button>

      <aside
        className={`neo-live-icon-palette hidden lg:hidden ${livePaletteSide} ${liveActionDrawerOpen ? "is-open" : ""}`}
        style={livePaletteStyle}
        aria-label="Live class tools"
      >
        <button ref={startLessonButtonRef} type="button" title="Start" aria-label="Start" data-mission-action="start-lesson" onClick={() => { setLiveActionDrawerOpen(false); if (!isStartingLesson) void handleStartLessonClick(); }} disabled={isStartingLesson} className={highlightStartLessonButton ? "is-highlighted" : ""}>
          <Play className="h-4 w-4" />
        </button>
        <button ref={topicTestButtonRef} type="button" title="Test" aria-label="Test" data-mission-action="topic-test" onClick={() => { setLiveActionDrawerOpen(false); handleStartTopicTest(); }} disabled={isLoadingTest || !currentTopic} className={highlightTopicTestButton ? "is-highlighted" : ""}>
          <ClipboardCheck className="h-4 w-4" />
        </button>
        <button type="button" title="Save" aria-label="Save" onClick={() => { setLiveActionDrawerOpen(false); handleEndClassClick(); }}>
          <Save className="h-4 w-4" />
        </button>
        <button type="button" title="Topic" aria-label="Topic" onClick={() => { setLiveActionDrawerOpen(false); onOpenStartFlow(); }}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" title="Notes" aria-label="Notes" onClick={() => { setLiveActionDrawerOpen(false); goTab("gallery"); }}>
          <FileText className="h-4 w-4" />
        </button>
        <button type="button" title="Upload" aria-label="Upload" onClick={() => { setLiveActionDrawerOpen(false); uploadInputRef.current?.click(); }}>
          <Upload className="h-4 w-4" />
        </button>
        <button type="button" title="Camera" aria-label="Camera" onClick={() => { setLiveActionDrawerOpen(false); void openCamera(); }}>
          <Camera className="h-4 w-4" />
        </button>
        <button type="button" title="Board" aria-label="Board" onClick={() => { setLiveActionDrawerOpen(false); setBoardFullscreen(false); setBoardOpen(true); }}>
          <Monitor className="h-4 w-4" />
        </button>
        <button type="button" title="Progress" aria-label="Progress" onClick={() => { setLiveActionDrawerOpen(false); goTab("progress"); }}>
          <Target className="h-4 w-4" />
        </button>
        <button type="button" title="Gallery" aria-label="Gallery" onClick={() => { setLiveActionDrawerOpen(false); goTab("gallery"); }}>
          <History className="h-4 w-4" />
        </button>
        <button type="button" title="Link Parent" aria-label="Link Parent" onClick={() => { setLiveActionDrawerOpen(false); onOpenParentLink(); }}>
          <UserPlus className="h-4 w-4" />
        </button>
        <button type="button" title="Fullscreen Chat" aria-label="Fullscreen Chat" onClick={() => setClassroomFullscreen((value) => !value)}>
          {classroomFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button type="button" title="Fullscreen Board" aria-label="Fullscreen Board" onClick={() => { setBoardOpen(true); setBoardFullscreen(true); }}>
          <Monitor className="h-4 w-4" />
        </button>
      </aside>
    </>
  );

  const drawerPanel = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.innerWidth < 1024) {
            setMobileDrawerOpen(false);
          } else {
            setDrawerOpen(false);
          }
        }}
        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Hide panel
      </button>

      <div className="neo-teacher-card rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img
              src={teacherAvatar}
              alt="AI Teacher"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              NeoLearn {cleanSubjectName(currentSubject?.subject_name)} Teacher
            </div>
            <div className="text-xs text-slate-500">
              Student: {studentName}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Classroom info
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          <div>
            <span className="font-semibold">Subject:</span>{" "}
            {currentSubject?.subject_name || "-"}
          </div>
          <div>
            <span className="font-semibold">Chapter:</span>{" "}
            {currentChapter?.chapter_name || "-"}
          </div>
          <div>
            <span className="font-semibold">Topic:</span>{" "}
            {currentTopic?.topic_name || "-"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onOpenStartFlow();
            setMobileDrawerOpen(false);
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
        >
          <RotateCcw className="h-4 w-4" />
          Change Topic
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Quick menu
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => goTab("progress")}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Progress
          </button>
          <button
            type="button"
            onClick={() => goTab("gallery")}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Gallery
          </button>
          <button
            type="button"
            onClick={() => goTab("payments")}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Subscription
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Quick actions
        </div>
        <div className="space-y-2">
          <button
            ref={startLessonButtonRef}
            type="button"
            data-mission-action="start-lesson"
            onClick={() => !isStartingLesson && handleStartLessonClick()}
            disabled={isStartingLesson}
            className={`w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${
              highlightStartLessonButton ? "ring-4 ring-blue-200" : ""
            }`}
          >
            {isStartingLesson ? "Preparing lesson..." : "Start Lesson"}
          </button>

          <button
            ref={topicTestButtonRef}
            type="button"
            data-mission-action="topic-test"
            onClick={handleStartTopicTest}
            disabled={isLoadingTest || !currentTopic}
            className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-indigo-600 disabled:opacity-60 ${
              highlightTopicTestButton
                ? "border-blue-500 ring-4 ring-blue-200"
                : "border-indigo-500"
            }`}
          >
            {isLoadingTest ? "Preparing test..." : "Start Topic Test"}
          </button>

          <button
            type="button"
            onClick={handleEndClassClick}
            className="w-full rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            End Class & Save
          </button>

          <a
            href="/account-deletion"
            className="block w-full rounded-2xl border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700"
          >
            Request account deletion
          </a>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Lesson audio
        </div>

        {audioUrl ? (
          <audio
            ref={lessonAudioRef}
            id="lesson-audio"
            key={audioUrl}
            controls
            onPlay={handleLessonAudioPlay}
            className="w-full"
          >
            <source src={audioUrl} />
          </audio>
        ) : (
          <p className="text-sm text-slate-500">
            Lesson audio will appear here after the lesson starts.
          </p>
        )}

        {audioError && (
          <p className="mt-2 text-xs text-red-500">{audioError}</p>
        )}
      </div>
    </div>
  );

  const railButton = (
    label: string,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );

  const rail = (
    <div className="flex h-full flex-col items-center gap-3 p-2">
      {railButton("⚙", () => setDrawerOpen(true))}
      {railButton("P", () => goTab("progress"))}
      {railButton("G", () => goTab("gallery"))}
      {railButton("S", () => goTab("payments"))}
      {railButton("▶", () => !isStartingLesson && handleStartLessonClick())}
    </div>
  );

  const breadcrumbItems = [
    currentSubject?.subject_name || "Subject",
    currentChapter?.chapter_name || "Chapter",
    currentTopic?.topic_name || "Topic",
  ];

  return (
    <>
      <div className={`neo-classroom relative flex h-full min-h-0 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 ${
        classroomFullscreen ? "is-classroom-fullscreen" : ""
      } ${isClassLive ? "is-live-minimal" : ""}`}>
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {boardOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setBoardOpen(false)}
          />
        )}

        <aside
          className={`hidden border-r border-slate-200 bg-slate-50 transition-[width] duration-300 lg:block ${
            drawerOpen ? "w-[260px]" : "w-[64px]"
          }`}
        >
          {drawerOpen ? drawerPanel : rail}
        </aside>

        <aside
          className={`neo-mobile-class-drawer fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[360px] border-r border-slate-200 bg-slate-50 shadow-xl transition-transform duration-300 lg:hidden ${
            mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {drawerPanel}
        </aside>

        <section className="relative min-w-0 flex-1">
          <div
            className={`neo-classroom-content flex h-full min-h-0 flex-col p-3 transition-all duration-300 ${
              boardOpen ? "lg:pr-[38%]" : ""
            }`}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="neo-mobile-class-card hidden shrink-0 items-center gap-3 md:hidden">
                <div className="neo-mobile-class-teacher">
                  <img
                    src={teacherAvatar}
                    alt="AI Teacher"
                    className="h-full w-full object-contain"
                  />
                  <span>AI</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">
                    Your AI teacher
                  </div>
                  <div className="truncate text-sm font-bold text-slate-900">
                    {cleanSubjectName(currentSubject?.subject_name)} Class
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {currentTopic?.topic_name ||
                      currentChapter?.chapter_name ||
                      "Choose a topic to begin"}
                  </div>
                </div>
                <div
                  className={`neo-mobile-class-status ${
                    isClassLive ? "is-live" : ""
                  }`}
                >
                  {isClassLive ? "Live" : "Ready"}
                </div>
              </div>

              <div className="neo-conversation-header shrink-0 rounded-[28px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="neo-mobile-teacher-avatar flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl md:hidden">
                      <img
                        src={teacherAvatar}
                        alt="AI Teacher"
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setMobileDrawerOpen(true)}
                      aria-label="Open classroom menu"
                      className="neo-classroom-menu-button rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden"
                    >
                      <Menu className="h-4 w-4" />
                    </button>

                    {!drawerOpen && (
                      <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="neo-classroom-menu-button hidden rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 lg:block"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}

                    <div className="neo-conversation-copy">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        AI Classroom
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-700">
                        {breadcrumbItems.map((item, index) => (
                          <span key={`${item}-${index}`} className="inline-flex items-center gap-1">
                            <span className={index === 2 ? "text-blue-700" : ""}>{item}</span>
                            {index < breadcrumbItems.length - 1 && (
                              <ChevronRight className="h-4 w-4 text-slate-300" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="neo-conversation-controls flex flex-wrap items-center gap-2">
  <select
    aria-label="Language"
    className="neo-mobile-required-control neo-language-control rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
    value={language}
    onChange={(e) =>
      setLanguage(e.target.value as "English" | "Hindi" | "Bengali")
    }
  >
    <option value="English">English</option>
    <option value="Hindi">Hindi</option>
    <option value="Bengali">Bengali</option>
  </select>

  <select
    aria-label="Speed"
    className="neo-mobile-required-control neo-speed-control rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
    value={speed}
    onChange={(e) =>
      setSpeed(e.target.value as "Slow" | "Normal" | "Fast")
    }
  >
    <option value="Slow">Slow</option>
    <option value="Normal">Normal</option>
    <option value="Fast">Fast</option>
  </select>

  <button
    type="button"
    onClick={onOpenStartFlow}
    className="neo-mobile-required-control neo-change-topic-control neo-secondary-control-chip inline-flex items-center gap-1 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
  >
    <RotateCcw className="h-3.5 w-3.5" />
    Change Topic
  </button>
  <button
    type="button"
    onClick={() => setBoardOpen((v) => !v)}
    className="neo-mobile-required-control neo-open-board-control neo-secondary-control-chip rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
  >
    <span className="neo-open-board-mobile-label">Open Board</span>
    <span className="neo-open-board-desktop-label">{boardOpen ? "Hide Board" : "Open Board"}</span>
  </button>
</div>
</div>
</div>

              <div className="neo-chat-panel min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div
                  className="h-full overflow-y-auto overscroll-contain px-4 py-4"
                  onScroll={handleChatScroll}
                >
                  <div className="space-y-3">
                    {trialLimitNotice && (
                      <div className="rounded-3xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-slate-800 shadow-sm">
                        <div className="font-bold text-blue-800">
                          {trialLimitNotice.message}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">
                          {currentTopic?.topic_name
                            ? `Topic: ${currentTopic.topic_name}`
                            : "Your selected topic is ready."}
                        </div>
                        <button
                          type="button"
                          onClick={onOpenPayments}
                          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                        >
                          Subscribe / Pricing
                        </button>
                      </div>
                    )}

                    {audioError && (
                      <div className="neo-classroom-warning rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm">
                        {audioError}
                      </div>
                    )}

                    {messages.map((m) => {
                      const isTeacher = m.author === "Teacher";
                      return (
                        <div
                          key={m.id}
                          className={`flex ${isTeacher ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`neo-chat-bubble max-w-[94%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                              isTeacher
                                ? "neo-chat-bubble-teacher border border-slate-200 bg-slate-50 text-slate-800"
                                : "neo-chat-bubble-student bg-blue-600 text-white"
                            } ${m.isError ? "border-red-300 bg-red-50 text-red-700" : ""}`}
                          >
                            <div className="whitespace-pre-wrap leading-7">
                              {m.text}
                            </div>
                            <div
                              className={`mt-2 text-[11px] ${
                                isTeacher ? "text-slate-400" : "text-blue-100"
                              }`}
                            >
                              {isTeacher ? "Teacher" : "You"} - {m.ts}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {realtimeTranscript && (
                      <div className="rounded-3xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                        <span className="font-semibold text-blue-700">
                          Teacher (live):{" "}
                        </span>
                        {realtimeTranscript}
                      </div>
                    )}

                    {capturedImage && (
                      <div className="rounded-3xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 text-xs font-semibold text-slate-500">
                          Captured image
                        </div>
                        <img
                          src={capturedImage}
                          alt="Captured"
                          className="max-h-72 w-auto rounded-2xl border border-slate-200"
                        />
                      </div>
                    )}

                    {uploadedFiles.length > 0 && (
                      <div className="rounded-3xl border border-slate-200 bg-white p-3">
                        <div className="mb-1 text-xs font-semibold text-slate-500">
                          Uploaded files
                        </div>
                        <ul className="list-disc pl-5 text-xs text-slate-700">
                          {uploadedFiles.map((f, idx) => (
                            <li key={`${f.name}-${idx}`}>{f.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>
              </div>

              {liveActionDrawer}

              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  setUploadedFiles(Array.from(e.target.files || []));
                  setMenuOpen(false);
                }}
              />

              <div className="neo-composer shrink-0 rounded-[28px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="neo-composer-row relative flex items-center gap-2">
                  <div ref={composerMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      className="neo-composer-action flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-2xl text-slate-700 hover:bg-slate-50"
                    >
                      +
                    </button>

                    {menuOpen && (
                      <div className="neo-composer-plus-menu absolute bottom-14 left-0 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        <label className="flex cursor-pointer items-center rounded-xl px-3 py-3 text-sm text-slate-700 hover:bg-slate-100">
                          <Upload className="h-4 w-4" />
                          Upload notes / photo
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              setUploadedFiles(Array.from(e.target.files || []));
                              setMenuOpen(false);
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            openCamera();
                          }}
                          className="flex w-full items-center rounded-xl px-3 py-3 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <Camera className="h-4 w-4" />
                          Open camera
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className="neo-composer-input h-12 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={
                      isRealtimeOn
                        ? "Type a doubt or use mic for realtime teacher..."
                        : "Ask about this topic..."
                    }
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!isAsking) handleAskRealtime();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleMicToggle}
                    aria-label={isListening ? "Stop listening" : "Use microphone"}
                    className={`neo-composer-mic h-12 w-12 rounded-full border text-sm font-semibold ${
                      isListening
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleAskRealtime}
                    disabled={isAsking}
                    className="neo-composer-send flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white disabled:opacity-50"
                  >
                   →
                  </button>
                </div>

                <div className="neo-realtime-status mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleToggleRealtime}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      isRealtimeOn
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {isRealtimeOn ? "Realtime Voice On" : "Realtime Voice Off"}
                  </button>

                  <span className="text-slate-500">
                    {isListening ? "Listening... speak now." : realtimeStatus || "Ready"}
                  </span>

                  {syllabusLoading && (
                    <span className="text-slate-400">Loading syllabus...</span>
                  )}
                  {syllabusError && (
                    <span className="text-red-500">{syllabusError}</span>
                  )}
                  {cameraError && (
                    <span className="text-red-500">{cameraError}</span>
                  )}
                  {topicTestResult && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                      Score {topicTestResult.percent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {boardOpen && (
            <aside className={`neo-smart-board-panel hidden lg:block absolute inset-y-0 right-0 w-[38%] min-w-[380px] border-l border-blue-100 bg-white p-3 ${
              boardFullscreen ? "is-board-fullscreen" : ""
            }`}>
              <div className="flex h-full flex-col rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Teacher Smart Board
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {currentTopic?.topic_name || "Visual board"}
                    </div>
                    <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {currentSubject?.subject_name || "Board"}
                    </div>
                  </div>
                </div>

                {boardActionBar}

                <div className="mt-3 min-h-0 flex-1">{renderBoardVisual()}</div>
              </div>
            </aside>
          )}
        </section>
      </div>

      {boardOpen && (
  <div className={`neo-smart-board-mobile fixed z-[90] bg-white p-4 shadow-2xl lg:hidden ${
    boardFullscreen ? "is-board-fullscreen" : ""
  }`}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Teacher Smart Board
        </div>
        <div className="mt-1 text-xl font-semibold text-slate-900">
          {currentTopic?.topic_name || "Visual board"}
        </div>
      </div>
    </div>

    {boardActionBar}

    <div className="mt-3 h-[calc(100%-130px)] min-h-0">
      {renderBoardVisual()}
    </div>
  </div>
)}

      {isTopicTestOpen && topicTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Topic Test
                </h3>
                <p className="text-sm text-slate-500">
                  {topicTestResult
                    ? "Review your answers and correct any mistakes."
                    : "Answer all questions, then submit to save your score."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsTopicTestOpen(false)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              {topicTest.map((q, index) => (
                <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-800">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span>Q{index + 1}.</span>
                      {q.difficulty && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {q.difficulty}
                        </span>
                      )}
                    </div>
                    <div>{q.question}</div>
                  </div>

                  <div className="space-y-2">
                    {q.options.map((option, optionIndex) => {
                      const selected = topicTestAnswers[q.id] === optionIndex;
                      const isCorrectAnswer =
                        q.correctIndex === optionIndex;
                      const isWrongSelection =
                        !!topicTestResult && selected && !isCorrectAnswer;
                      const showCorrectAnswer =
                        !!topicTestResult && isCorrectAnswer;

                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          disabled={!!topicTestResult}
                          onClick={() =>
                            setTopicTestAnswers((prev) => ({
                              ...prev,
                              [q.id]: optionIndex,
                            }))
                          }
                          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                            showCorrectAnswer
                              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                              : isWrongSelection
                              ? "border-red-500 bg-red-50 text-red-800"
                              : selected
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } ${topicTestResult ? "cursor-default" : ""}`}
                        >
                          <span className="block">{option}</span>

                          {topicTestResult &&
                            (selected || isCorrectAnswer) && (
                              <span className="mt-2 flex flex-wrap gap-2">
                                {selected && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      isCorrectAnswer
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    Your answer
                                  </span>
                                )}

                                {isCorrectAnswer && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    Correct answer
                                  </span>
                                )}
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {topicTestResult && q.explanation && (
                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Explanation:
                      </span>{" "}
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {topicTestResult && (
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Result: {topicTestResult.correct}/{topicTestResult.total} (
                {topicTestResult.percent}%)
              </div>
            )}

            {topicTestResult?.weakDiagnosis && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">
                <div className="text-sm font-bold text-amber-900">
                  Weak Area Diagnosis
                </div>
                <div className="mt-1 text-xs font-semibold text-amber-800">
                  {topicTestResult.weakDiagnosis.trigger}
                </div>

                <div className="mt-3">
                  <div className="text-xs font-bold uppercase text-slate-600">
                    Focus areas
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                    {topicTestResult.weakDiagnosis.weakAreas.map((area) => (
                      <li key={area}>{area}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-bold uppercase text-slate-600">
                    Targeted practice
                  </div>
                  <div className="mt-2 space-y-2">
                    {topicTestResult.weakDiagnosis.practice.map((practice) => (
                      <div
                        key={practice.id}
                        className="rounded-2xl bg-white px-3 py-2 text-xs leading-5 shadow-sm"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-bold">Q{practice.id}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                            {practice.difficulty}
                          </span>
                        </div>
                        <div>{practice.question}</div>
                        <div className="mt-1 font-semibold text-emerald-700">
                          Answer: {practice.answer}
                        </div>
                        <div className="mt-1 text-slate-600">
                          {practice.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-700">
                  Improvement advice: {topicTestResult.weakDiagnosis.advice}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTopicTestOpen(false)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                {topicTestResult ? "Close" : "Cancel"}
              </button>

              <button
                type="button"
                onClick={handleSubmitTopicTest}
                disabled={!!topicTestResult}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {topicTestResult ? "Submitted" : "Submit Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Capture question image</h3>

              <button
                type="button"
                className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                onClick={() => {
                  stopCamera();
                  setIsCameraOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[66vh] w-full rounded-2xl border border-slate-200 bg-black object-contain"
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                onClick={() => {
                  stopCamera();
                  setIsCameraOpen(false);
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                onClick={captureFromCamera}
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

