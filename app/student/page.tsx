"use client";

import Image from "next/image";
import { getAvatarForSubject } from "../lib/teacherAvatar";
import type { SubjectRow, ChapterRow, TopicRow, ChatMessage, StudentInfo, ActiveTab, Weekday , StoredSession, WeeklyRoutine, RoutineDayPlan } from "./types";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RealtimeTeacherClient } from "./realtimeTeacherClient";
import jsPDF from "jspdf";
import ClassroomView from "./components/ClassroomView";


import TabButton from "./components/TabButton";
import PlaceholderView from "./components/PlaceholderView";
import SubjectsView from "./components/SubjectsView";
import ChaptersView from "./components/ChaptersView";
import TopicsView from "./components/TopicsView";
import WeeklyProgressView from "./components/WeeklyProgressView";
import GalleryView from "./components/GalleryView";
import RoutineView from "./components/RoutineView";
type ClassId = "5" | "6" | "7" | "8" | "9";

interface WeeklyProgressRow {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
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

type MessageAuthor = "Teacher" | "You";

type ClassSession = {
  id: string;
  startTime: number;   // timestamp
  endTime: number;     // timestamp
  isLive: boolean;
  subjects: string[];  // ["Maths", "Science"]
};
const TOPIC_STATUS_UI: Record<string, string> = {
  completed: "âœ… Completed",
  in_progress: "ðŸŸ¡ In Progress",
  needs_revision: "âš ï¸ Needs Revision",
  not_started: "âŒ Not Started",
};

const SESSION_HISTORY_KEY = "neolearnSessionHistory";

const STORAGE_KEY = "neolearnStudent";
const WEEKDAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
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

  const [activeTab, setActiveTab] = useState<ActiveTab>("classroom");

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

const [classSession, setClassSession] = useState<ClassSession | null>(null);
const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
// ðŸ”¹ Store the full realtime transcript for this class session
const [sessionTranscript, setSessionTranscript] = useState<string>("");

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    router.replace("/");
  };

const printSession = () => {
  if (typeof window === "undefined") return;
  window.print();
};

// ðŸ”¹ DEV: Start a live class session (temporary)
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
function loadSessionHistory(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSION_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as StoredSession[]) : [];
  } catch {
    return [];
  }
}

function saveSessionHistory(item: StoredSession) {
  if (typeof window === "undefined") return;
  const prev = loadSessionHistory();
  const next = [item, ...prev].slice(0, 200); // keep last 200 sessions
  window.localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(next));
}

// ðŸ”¹ End class session + save transcript chapter-wise
const endClassSession = () => {
  if (!classSession || !student) return;

  const subject = currentSubject?.subject_name || "Unknown Subject";
  const chapter = currentChapter?.chapter_name || "Unknown Chapter";
  const topic = currentTopic?.topic_name || "Unknown Topic";

  saveSessionHistory({
    id: classSession.id,
    studentMobile: student.mobile,
    subject,
    chapter,
    topic,
    language,
    startedAt: new Date(classSession.startTime).toISOString(),
    endedAt: new Date().toISOString(),
    transcript: sessionTranscript.trim(),
  });

  setClassSession((prev) => (prev ? { ...prev, isLive: false } : null));
  setRemainingSeconds(0);
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
// âœ… Daily progress (Today)
const [daily, setDaily] = useState<{
  date: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
} | null>(null);

const [dailyLoading, setDailyLoading] = useState(false);
const [dailyError, setDailyError] = useState<string | null>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null
  );
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null
  );
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
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
  // conversation + audio
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [question, setQuestion] = useState("");
const [isStartingLesson, setIsStartingLesson] = useState(false);
const [isAsking, setIsAsking] = useState(false);
const [audioUrl, setAudioUrl] = useState<string | null>(null);

const [audioError, setAudioError] = useState<string | null>(null);
const [qaError, setQaError] = useState<string | null>(null);

const [language, setLanguage] = useState<"English" | "Hindi" | "Bengali">(
  "English"
);
const [speed, setSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");

const messagesEndRef = useRef<HTMLDivElement | null>(null);
const messageIdRef = useRef(1);


useEffect(() => {
  if (!audioUrl) return;
  const audio = document.getElementById("lesson-audio") as HTMLAudioElement | null;
  if (!audio) return;

  audio
    .play()
    .catch(() => {
      // ignore autoplay error; user can press play manually
    });
}, [audioUrl]);

  // Load student from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/");
      return;
    }

    try {
      const info = JSON.parse(raw) as StudentInfo;
      setStudent(info);
    } catch {
      router.replace("/");
      return;
    } finally {
      setLoadingStudent(false);
    }
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

    const classId = student.classId;

    async function load() {
      setSyllabusLoading(true);
      setSyllabusError(null);
      try {
        const params = new URLSearchParams({
  class: student?.classId ?? "6",
  board: "CBSE", // later we can store board per student
});

        const res = await fetch(`/api/syllabus?${params.toString()}`);
        const data = (await res.json()) as SyllabusResponse;

        if (!data.ok || !data.data) {
          const fallback = getFallbackSyllabus(classId);
          setSubjects(fallback.subjects);
          setChapters(fallback.chapters);
          setTopics(fallback.topics);
          setSelectedSubjectId(fallback.subjects[0]?.id ?? null);
          setSyllabusError(null);
          return;
        }

        setSubjects(data.data.subjects || []);
        setChapters(data.data.chapters || []);
        setTopics(data.data.topics || []);

        if (data.data.subjects.length > 0) {
          setSelectedSubjectId(data.data.subjects[0].id);
        }
      } catch (err: any) {
        const fallback = getFallbackSyllabus(classId);
        setSubjects(fallback.subjects);
        setChapters(fallback.chapters);
        setTopics(fallback.topics);
        setSelectedSubjectId(fallback.subjects[0]?.id ?? null);
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

  const mobile = student.mobile; // âœ… TS-safe snapshot

  async function loadWeekly() {
    setWeeklyLoading(true);
    setWeeklyError(null);
    try {
      const res = await fetch(
        `/api/progress/weekly-get?mobile=${encodeURIComponent(mobile)}`
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setWeeklyError(data?.error || `Failed with HTTP ${res.status}`);
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


// âœ… Fetch DAILY progress (Today â€“ IST)
useEffect(() => {
  if (!student) return;

  const mobile = student.mobile; // âœ… TS-safe snapshot

  async function loadDaily() {
    setDailyLoading(true);
    setDailyError(null);

    try {
      const res = await fetch(
        `/api/progress/daily-get?mobile=${encodeURIComponent(mobile)}`
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setDailyError(data?.error || "Failed to load daily progress");
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

  // Auto-select first chapter when subject changes
  useEffect(() => {
    if (filteredChapters.length === 0) {
      setSelectedChapterId(null);
      return;
    }
    if (!selectedChapterId) {
      setSelectedChapterId(filteredChapters[0].id);
    }
  }, [filteredChapters, selectedChapterId]);

  // Auto-select first topic when chapter changes
  useEffect(() => {
    if (filteredTopics.length === 0) {
      setSelectedTopicId(null);
      return;
    }
    if (!selectedTopicId) {
      setSelectedTopicId(filteredTopics[0].id);
    }
  }, [filteredTopics, selectedTopicId]);

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
            "Hi! I am your NeoLearn Maths teacher. " +
            "Select your topic, then click â€œStart Lesson (beta)â€ to hear a short explanation. " +
            "You can also ask me questions anytime.",
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

// ðŸ”¹ Countdown timer for live class
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

  // load for this student only
  const all = loadSessionHistory();
  const mine = student ? all.filter((s) => s.studentMobile === student.mobile) : [];
  setSavedSessions(mine);

  // auto-select first
  if (!selectedSessionId && mine.length > 0) {
    setSelectedSessionId(mine[0].id);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [student, activeTab]);


  // Start Lesson -> /api/generate-lesson + /api/lesson-audio
const handleStartLesson = useCallback(async () => {
  if (isStartingLesson) return;

  if (!currentSubject || !currentChapter || !currentTopic) {
    pushMessage(
      "Teacher",
      "Please select subject, chapter and topic first, then start the lesson.",
      true
    );
    return;
  }

  setIsStartingLesson(true);
  setAudioError(null);
  setQaError(null);

const mobile = student?.mobile;
if (!mobile) {
  pushMessage("Teacher", "Student info missing. Please login again.", true);
  setIsStartingLesson(false);
  return;
}

let access: { ok?: boolean; allowed?: boolean; used?: number; limit?: number } | null = null;

try {
  const accessRes = await fetch(
    `/api/access/check?mobile=${encodeURIComponent(mobile)}`
  );

  if (!accessRes.ok) {
    pushMessage(
      "Teacher",
      "Unable to verify your plan right now. Please try again.",
      true
    );
    setIsStartingLesson(false);
    return;
  }

  access = await accessRes.json();
} catch (err) {
  console.error("access-check failed:", err);
  pushMessage(
    "Teacher",
    "Unable to verify your plan right now. Please try again.",
    true
  );
  setIsStartingLesson(false);
  return;
}

if (!access?.ok) {
  pushMessage(
    "Teacher",
    "Unable to verify your plan right now. Please try again.",
    true
  );
  setIsStartingLesson(false);
  return;
}

if (!access.allowed) {
  pushMessage(
    "Teacher",
    `Free limit reached (${access.used}/${access.limit}). Please subscribe to continue.`,
    true
  );
  setIsStartingLesson(false);
  return;
}

  // Clear old audio + revoke old blob URL
  setAudioUrl((old) => {
    if (old && old.startsWith("blob:")) {
      URL.revokeObjectURL(old);
    }
    return null;
  });

  // Status message in chat
  pushMessage("Teacher", "Generating your lesson. Please wait a momentâ€¦");

  try {
    const langCode = getLangCode(language);          // "en" | "hi" | "bn"
    const speedCode = getSpeedCode(speed);           // "slow" | "normal" | "fast"

    // ------------------ 1) Get lesson TEXT ------------------
    let scriptText = "";

    try {
      const lessonRes = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: "CBSE", // or student?.board if you add it later
          classLevel: `Class ${student?.classId}`,
          subject: currentSubject.subject_name,
          topic: currentTopic.topic_name,
          language: langCode, // backend expects "en" | "hi" | "bn"
        }),
      });

      if (!lessonRes.ok) {
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

    // Fallback text if OpenAI text failed
    if (!scriptText) {
      const langLabel = language; // "English" | "Hindi" | "Bengali"
      scriptText = (
        `Hi ${student?.name || "Student"}, I am your NeoLearn ${
          currentSubject.subject_name
        } teacher.\n\n` +
        `Today we will learn the topic â€œ${currentTopic.topic_name}â€ from the chapter â€œ${
          currentChapter.chapter_name
        }â€ for Class ${student?.classId || "6"}.\n` +
        `I will explain it step by step in very simple ${langLabel} so you can understand easily.`
      ).trim();
    }

        // Show explanation in chat
    pushMessage("Teacher", scriptText);

    // ðŸ”¥ NEW: Save topic completion in Supabase
    try {
      await fetch("/api/progress/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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



    // ------------------ 2) Generate AUDIO ------------------
    try {
      const audioRes = await fetch("/api/lesson-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptText,
          language: langCode, // "en" | "hi" | "bn"
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
      setAudioUrl(url);

// ✅ Count this lesson usage (only after successful lesson generation)
try {
  await fetch("/api/access/increment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: student?.mobile }),
  });
} catch (e) {
  console.warn("access increment failed:", e);
}
    } catch (err) {
      console.error("lesson-audio network error:", err);
      setAudioError("Failed to generate lesson audio (network error).");
    }
  } catch (err) {
    console.error("handleStartLesson error:", err);
    setAudioError("Unexpected error while generating the lesson.");
  } finally {
    setIsStartingLesson(false);
  }
}, [
  isStartingLesson,
  currentSubject,
  currentChapter,
  currentTopic,
  student?.classId,
  student?.name,
  student?.mobile,
  language,
  speed,
  pushMessage,
]);

  // Student asks a doubt -> /api/teacher-math (or your Q&A route)
    // Student asks a doubt -> text + audio answer
  const handleAskQuestion = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) return;

    // Show student message in chat
    pushMessage("You", trimmed);
    setQuestion("");

    // Require subject / chapter / topic
    if (!currentSubject || !currentChapter || !currentTopic) {
      pushMessage(
        "Teacher",
        "Please select subject, chapter and topic first. Then ask your doubt again.",
        true
      );
      return;
    }

    setIsAsking(true);

    try {
      // 1) Get text answer from teacher-math
      const res = await fetch("/api/teacher-math", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
  question: trimmed,

// âœ… Persona Engine key
  studentId: student?.studentId || "",

  // ðŸ”¹ DB IDs (TEXT) â€” Supabase memory
  subjectDbId: String(currentSubject?.id ?? ""),
  chapterDbId: String(currentChapter?.id ?? ""),
  topicDbId: String(currentTopic?.id ?? ""),

  // ðŸ”¹ Semantic ID â€” AI logic
  subjectId: currentSubject?.subject_code || "maths6",

  classId: String(student?.classId ?? "6"),
  studentMobile: student?.mobile,

  board: "cbse",
  lang:
    language === "Hindi"
      ? "hi"
      : language === "Bengali"
      ? "bn"
      : "en",

  // optional (debug / analytics)
  subject: currentSubject?.subject_name,
  chapter: currentChapter?.chapter_name,
  topic: currentTopic?.topic_name,
}),
});

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      const answer: string =
        data?.answer || data?.text || "I have noted your question.";

      // Show teacher answer in chat
      pushMessage("Teacher", answer);

            // 2) Ask lesson-audio API to speak this answer
      const langCode = getLangCode(language); // "en" | "hi" | "bn"

      // Clear previous audio and revoke old blob URL
      setAudioUrl((old) => {
        if (old && old.startsWith("blob:")) {
          URL.revokeObjectURL(old);
        }
        return null;
      });

      const ttsRes = await fetch("/api/lesson-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: answer,
          language: langCode,
        }),
      });


      if (!ttsRes.ok) {
        console.error("TTS error for Q&A:", ttsRes.status);
        return; // text is already shown, so we just skip audio
      }

      const ttsContentType = ttsRes.headers.get("content-type") || "";

      if (ttsContentType.startsWith("audio/")) {
        // Raw audio stream
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

// ✅ Count this lesson usage (only after successful lesson generation)
try {
  await fetch("/api/access/increment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: student?.mobile }),
  });
} catch (e) {
  console.warn("access increment failed:", e);
}
      } else {
        // JSON with some audio field (same logic as Start Lesson)
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

        if (urlFromJson) {
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
    student?.classId,
    language,
    pushMessage,
  ]);
 
  // ----------------- RENDER -----------------

  if (loadingStudent) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading your classroomâ€¦
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
  <div className="flex items-center gap-3">
    {/* Logo */}
    <div className="h-9 w-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
      <img
        src="/logo/neolearn-logo.png"
        alt="NeoLearn logo"
        className="h-full w-full object-contain"
      />
    </div>
    <div className="font-semibold text-lg">NeoLearn</div>
  </div>

  <div className="flex items-center gap-3 text-xs text-gray-600">
    <span>
      {student.name} â€¢ Class {student.classId} â€¢ {student.mobile}
    </span>
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold hover:bg-slate-100"
    >
      Logout
    </button>
  </div>
</header>


      {/* Main layout */}
<div className="mx-auto w-full max-w-7xl px-4 py-4">
  {/* Top horizontal navigation */}
  <div className="mb-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
    <nav className="flex min-w-max gap-2 text-sm">
      <TabButton active={activeTab === "classroom"} onClick={() => setActiveTab("classroom")}>
        ðŸŽ“ Classroom
      </TabButton>

      <TabButton active={activeTab === "subjects"} onClick={() => setActiveTab("subjects")}>
        ðŸ“š Subjects
      </TabButton>

      <TabButton active={activeTab === "chapters"} onClick={() => setActiveTab("chapters")}>
        ðŸ“˜ Chapters
      </TabButton>

      <TabButton active={activeTab === "topics"} onClick={() => setActiveTab("topics")}>
        ðŸ§© Topics
      </TabButton>

      <TabButton active={activeTab === "progress"} onClick={() => setActiveTab("progress")}>
        ðŸ“Š Progress
      </TabButton>

      <TabButton active={activeTab === "payments"} onClick={() => setActiveTab("payments")}>
        ðŸ’³ Payments
      </TabButton>

      <TabButton active={activeTab === "gallery"} onClick={() => setActiveTab("gallery")}>
        ðŸ–¼ Gallery
      </TabButton>

      <TabButton active={activeTab === "routine"} onClick={() => setActiveTab("routine")}>
        ðŸ—“ Routine
      </TabButton>
    </nav>
  </div>

  <main className="rounded-2xl bg-white p-4 shadow-sm">
    {activeTab === "classroom" && (
      <ClassroomView
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
        isAsking={isAsking}
        audioUrl={audioUrl}
        audioError={audioError}
        messagesEndRef={messagesEndRef}
        teacherAvatar={teacherAvatar}
        studentName={student.name}
        studentMobile={student.mobile}
        isClassLive={!!classSession?.isLive}
        remainingSeconds={remainingSeconds}
        onAppendTranscript={(delta) =>
          setSessionTranscript((p) => p + delta)
        }
        onEndClass={endClassSession}
        autoStartToken={autoStartToken}
        autoStartPayload={autoStartPayload}
      />
    )}

    {activeTab === "subjects" && (
      <SubjectsView
        subjects={subjects}
        selectedSubjectId={selectedSubjectId}
        setSelectedSubjectId={setSelectedSubjectId}
        loading={syllabusLoading}
        error={syllabusError}
      />
    )}

    {activeTab === "chapters" && (
      <ChaptersView
        chapters={filteredChapters}
        currentSubject={currentSubject}
        selectedChapterId={selectedChapterId}
        setSelectedChapterId={setSelectedChapterId}
        loading={syllabusLoading}
        error={syllabusError}
      />
    )}

    {activeTab === "topics" && (
      <TopicsView
        topics={filteredTopics}
        currentSubject={currentSubject}
        currentChapter={currentChapter}
        selectedTopicId={selectedTopicId}
        setSelectedTopicId={setSelectedTopicId}
        loading={syllabusLoading}
        error={syllabusError}
      />
    )}

    {activeTab === "progress" && (
      <WeeklyProgressView
        loading={weeklyLoading}
        error={weeklyError}
        rows={weeklyRows}
        daily={daily}
        dailyLoading={dailyLoading}
        dailyError={dailyError}
      />
    )}

    {activeTab === "payments" && (
      <PlaceholderView title="Payment History">
        Here we will show subscription plan, invoices and payment history.
      </PlaceholderView>
    )}

    {activeTab === "gallery" && (
      <GalleryView
        sessions={savedSessions}
        selectedId={selectedSessionId}
        setSelectedId={setSelectedSessionId}
      />
    )}

    {activeTab === "routine" && (
      <RoutineView
        subjects={subjects}
        routine={routine}
        setRoutine={setRoutine}
        onStartToday={() => startTodayClass()}
      />
    )}
  </main>
</div>
</div>
  );
}
               
/* ---------- Small components ---------- */



















