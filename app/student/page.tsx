"use client";

import Image from "next/image";
import { getAvatarForSubject } from "../lib/teacherAvatar";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RealtimeTeacherClient } from "./realtimeTeacherClient";
import jsPDF from "jspdf";

type ClassId = "5" | "6" | "7" | "8" | "9";

interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;

  // ✅ Supabase Auth user id (needed for Persona Engine)
  studentId?: string;
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

  // ✅ added for UI (even if backend does not send it sometimes)
  status?: "completed" | "in_progress" | "needs_revision" | "not_started" | string;
}

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

type ActiveTab =
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
  subject: string;
  chapter: string;
  topic: string;
  language: string;
  startedAt: string; // ISO
  endedAt: string;   // ISO
  transcript: string; // realtimeTranscript
};

const TOPIC_STATUS_UI: Record<string, string> = {
  completed: "✅ Completed",
  in_progress: "🟡 In Progress",
  needs_revision: "⚠️ Needs Revision",
  not_started: "❌ Not Started",
};

const SESSION_HISTORY_KEY = "neolearnSessionHistory";

const STORAGE_KEY = "neolearnStudent";
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
// 🔹 Store the full realtime transcript for this class session
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

// 🔹 DEV: Start a live class session (temporary)
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

// 🔹 End class session + save transcript chapter-wise
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
// ✅ Daily progress (Today)
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
          setSyllabusError(data.error || "Failed to load syllabus");
          return;
        }

        setSubjects(data.data.subjects || []);
        setChapters(data.data.chapters || []);
        setTopics(data.data.topics || []);

        if (data.data.subjects.length > 0) {
          setSelectedSubjectId(data.data.subjects[0].id);
        }
      } catch (err: any) {
        setSyllabusError(err?.message || "Failed to load syllabus");
      } finally {
        setSyllabusLoading(false);
      }
    }

    load();
  }, [student]);

  // Fetch weekly progress
useEffect(() => {
  if (!student) return;

  const mobile = student.mobile; // ✅ TS-safe snapshot

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


// ✅ Fetch DAILY progress (Today – IST)
useEffect(() => {
  if (!student) return;

  const mobile = student.mobile; // ✅ TS-safe snapshot

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
            "Select your topic, then click “Start Lesson (beta)” to hear a short explanation. " +
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

// 🔹 Countdown timer for live class
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

const accessRes = await fetch(
  `/api/access/check?mobile=${encodeURIComponent(mobile)}`
);
const access = await accessRes.json();

if (accessRes.ok && access.ok && !access.allowed) {
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
  pushMessage("Teacher", "Generating your lesson. Please wait a moment…");

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
        `Today we will learn the topic “${currentTopic.topic_name}” from the chapter “${
          currentChapter.chapter_name
        }” for Class ${student?.classId || "6"}.\n` +
        `I will explain it step by step in very simple ${langLabel} so you can understand easily.`
      ).trim();
    }

        // Show explanation in chat
    pushMessage("Teacher", scriptText);

    // 🔥 NEW: Save topic completion in Supabase
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

// ✅ Persona Engine key
  studentId: student?.studentId || "",

  // 🔹 DB IDs (TEXT) — Supabase memory
  subjectDbId: String(currentSubject?.id ?? ""),
  chapterDbId: String(currentChapter?.id ?? ""),
  topicDbId: String(currentTopic?.id ?? ""),

  // 🔹 Semantic ID — AI logic
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
        Loading your classroom…
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
      {student.name} • Class {student.classId} • {student.mobile}
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
{/* 🔹 DEV ONLY: Start Live Class */}
<div className="mb-3">
  <button
    onClick={startClassSession}
    className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
  >
    ▶ Start Class (DEV)
  </button>
</div>

      <div className="mx-auto flex max-w-6xl gap-4 px-4 py-4">
        {/* Left navigation */}
        <aside className="w-64 rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-gray-500 uppercase">
            Student Area
          </div>
          <nav className="space-y-1 text-sm">
  <TabButton
    active={activeTab === "classroom"}
    onClick={() => setActiveTab("classroom")}
  >
    🎓 Classroom (AI Teacher)
  </TabButton>

  <TabButton
    active={activeTab === "subjects"}
    onClick={() => setActiveTab("subjects")}
  >
    📚 Subjects
  </TabButton>

  <TabButton
    active={activeTab === "chapters"}
    onClick={() => setActiveTab("chapters")}
  >
    📘 Chapters
  </TabButton>

  <TabButton
    active={activeTab === "topics"}
    onClick={() => setActiveTab("topics")}
  >
    🧩 Topics
  </TabButton>

  <TabButton
    active={activeTab === "progress"}
    onClick={() => setActiveTab("progress")}
  >
    📊 Weekly Progress
  </TabButton>

  <TabButton
    active={activeTab === "payments"}
    onClick={() => setActiveTab("payments")}
  >
    💳 Payment History
  </TabButton>

  <TabButton
    active={activeTab === "gallery"}
    onClick={() => setActiveTab("gallery")}
  >
    🖼️ Gallery / Notes
  </TabButton>

  <TabButton
    active={activeTab === "routine"}
    onClick={() => setActiveTab("routine")}
  >
    🗓️ Weekly Routine
  </TabButton>
</nav>
</aside>


        {/* Right content */}
        <main className="flex-1 rounded-2xl bg-white p-4 shadow-sm">
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
              onAppendTranscript={(delta) =>             	      setSessionTranscript((p) => p + delta)}
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
      className={`w-full rounded-xl px-3 py-2 text-left text-xs ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
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
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Subjects</h1>
      {loading && (
        <p className="text-xs text-gray-500">Loading subjects from server…</p>
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
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_name} (Class {s.class_number.toString()})
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
        <p className="text-xs text-gray-500">Loading chapters…</p>
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

{/* ✅ Today's Progress */}
<div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">Today’s Progress</div>
    {daily?.date && (
      <div className="text-[11px] text-gray-500">{daily.date}</div>
    )}
  </div>

  {dailyLoading && (
    <p className="text-xs text-gray-500 mt-1">Loading today…</p>
  )}

  {dailyError && (
    <p className="text-xs text-red-500 mt-1">{dailyError}</p>
  )}

  {!dailyLoading && !dailyError && daily && (
    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
        <div className="text-[11px] text-gray-600">Topics</div>
        <div className="text-lg font-semibold">
          {daily.topicsCompleted}
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
        <div className="text-[11px] text-gray-600">Tests</div>
        <div className="text-lg font-semibold">
          {daily.testsTaken}
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
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
        <p className="text-xs text-gray-500">Loading weekly data…</p>
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
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">
                  Week of {w.weekStart} – {w.weekEnd}
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
  selectedId,
  setSelectedId,
}: {
  sessions: StoredSession[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) || null,
    [sessions, selectedId]
  );

  const downloadPdf = () => {
  if (!selected) return;

  const doc = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 40;
  let y = margin;

  const lineGap = 14;

  const addLine = (text: string, fontSize = 11, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);

    const maxWidth = pageWidth - margin * 2;
    const lines = doc.splitTextToSize(text, maxWidth);

    for (const line of lines) {
      if (y + lineGap > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineGap;
    }
  };

  // Title
  addLine("NeoLearn – Class Recording", 14, true);
  y += 6;

  // Meta
  addLine(`Subject: ${selected.subject}`, 11, true);
  addLine(`Chapter: ${selected.chapter}`, 11, true);
  addLine(`Topic: ${selected.topic}`, 11, true);
  addLine(`Language: ${selected.language}`, 11, false);
  addLine(`Start: ${new Date(selected.startedAt).toLocaleString()}`, 11, false);
  addLine(`End: ${new Date(selected.endedAt).toLocaleString()}`, 11, false);

  y += 10;
  addLine("Transcript:", 12, true);
  y += 4;

  const transcript = (selected.transcript || "").trim() || "No transcript saved.";
  addLine(transcript, 11, false);

  // Footer
  y += 12;
  addLine("Generated by NeoLearn • AI Assisted Learning", 9, false);

  const safeFile =
    `NeoLearn_${selected.subject}_${selected.topic}_${new Date(selected.endedAt)
      .toISOString()
      .slice(0, 10)}`
      .replaceAll(" ", "_")
      .replaceAll("/", "_");

  doc.save(`${safeFile}.pdf`);
};


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Gallery / Class History</h1>
        <div className="text-[11px] text-gray-500">
          Saved realtime classes (chapter-wise)
        </div>
      </div>

      {sessions.length === 0 ? (
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
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                    selectedId === s.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold text-slate-800 truncate">
                    {s.subject} • {s.topic}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    {s.chapter}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {new Date(s.endedAt).toLocaleString()}
                  </div>
                </button>
              ))}
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
                      {selected.subject} • {selected.topic}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Chapter: {selected.chapter}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {new Date(selected.startedAt).toLocaleString()} →{" "}
                      {new Date(selected.endedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
  type="button"
  onClick={() => window.print()}
  className="rounded-xl border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
>
  Print
</button>

                    <button
                      type="button"
                      onClick={() => downloadPdf()}
                      className="rounded-xl border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Download
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 max-h-[420px] overflow-y-auto whitespace-pre-wrap">
                  {selected.transcript?.trim()
                    ? selected.transcript.trim()
                    : "No transcript saved for this session."}
                </div>
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
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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
          ▶️ Start Today Class
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
                    <option value="">Select subject…</option>
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
                    <option value="">Select subject…</option>
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
  isAsking: boolean;
  audioUrl: string | null;
  audioError: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  teacherAvatar: string;
  studentName: string;
  studentMobile: string;
  isClassLive: boolean;
  remainingSeconds: number;
  onAppendTranscript: (delta: string) => void;
  onEndClass: () => void;
  autoStartToken: number;
  autoStartPayload: {
    subject1Id: number;
    subject2Id: number;
    minutesPerSubject: number;
  } | null;

}) {
  const {
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
    isAsking,
    audioUrl,
    audioError,
    messagesEndRef,
    teacherAvatar,
    studentName,
    studentMobile,
    isClassLive,
    remainingSeconds,
    onAppendTranscript,
    onEndClass,
    autoStartToken,
         autoStartPayload,
  } = props;

  // ===============================
  // ✅ Class Timer (Classroom only)
  // ===============================
  const [classRunning, setClassRunning] = useState(false);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

 useEffect(() => {
  if (!endsAt) return;

  const t = window.setInterval(() => {
    const now = Date.now();
    const left = Math.max(0, Math.floor((endsAt - now) / 1000));
    setRemainingSec(left);

    if (left <= 0) {
      window.clearInterval(t);
      setClassRunning(false);
      setRealtimeStatus("✅ Class block finished. You can move to next subject.");
    }
  }, 1000);

  return () => window.clearInterval(t);
}, [endsAt]);



  // 🔹 Realtime voice state
  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeTeacherClient | null>(null);
  const [isRealtimeOn, setIsRealtimeOn] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("");

   const [isListening, setIsListening] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState("");

  // ✅ Auto start today class: enable realtime + start timer
  useEffect(() => {
    if (!autoStartToken) return;
    if (!autoStartPayload) return;

    const mins = Math.max(5, Number(autoStartPayload.minutesPerSubject || 30));
    const seconds = mins * 60;

    setPhase(1);
    setClassRunning(true);
    setEndsAt(Date.now() + seconds * 1000);
    setRemainingSec(seconds);

    // turn realtime ON if off
    (async () => {
      try {
        if (!isRealtimeOn) {
          await handleToggleRealtime();
        }
        setRealtimeStatus(
          `✅ Started today's class. Phase 1 running (${mins} min). Realtime enabled.`
        );
      } catch {
        setRealtimeStatus("Started timer, but realtime connection failed.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartToken]);

  // 🔹 Topic mini test state (MCQs)
  const [topicTest, setTopicTest] = useState<TopicTestQuestion[] | null>(null);
  const [topicTestAnswers, setTopicTestAnswers] = useState<
    Record<number, number | null>
  >({});
  const [topicTestResult, setTopicTestResult] = useState<{
    correct: number;
    total: number;
    percent: number;
  } | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [isTopicTestOpen, setIsTopicTestOpen] = useState(false);

  // 🧠 Build a context-rich question for the realtime teacher
  const buildRealtimeQuestion = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    const parts: string[] = [];

    if (currentSubject) parts.push(`Subject: ${currentSubject.subject_name}`);
    if (currentChapter) parts.push(`Chapter: ${currentChapter.chapter_name}`);
    if (currentTopic) parts.push(`Topic: ${currentTopic.topic_name}`);

    if (!parts.length) return trimmed;

    const syllabusContext = parts.join(" | ");
    return (
      trimmed +
      `\n\n[Context for you, teacher: ${syllabusContext}. ` +
      `Answer in very simple ${language} for an Indian school student.]`
    );
  };

  const handleToggleRealtime = async () => {
if (!isClassLive) {
  setRealtimeStatus("Start the class first to enable Realtime Voice.");
  return;
}
    // Turn OFF if already on
    if (isRealtimeOn && realtimeClient) {
      realtimeClient.disconnect();
      setRealtimeClient(null);
      setIsRealtimeOn(false);
      setRealtimeStatus("Realtime voice off");
      return;
    }

    // Turn ON
    const client = new RealtimeTeacherClient({
      onStatus: (s) => setRealtimeStatus(s),
      onError: (msg) => setRealtimeStatus(msg),
      onTranscript: (delta) => {
  setRealtimeTranscript((prev) => prev + delta);
  onAppendTranscript(delta); // ✅ also store globally for saving
},
    });

      setRealtimeClient(client);

    const baseInstruction =
      language === "Hindi"
        ? "You are a female Indian school teacher. Speak in very simple Hindi, slowly and clearly. Do not use any religious greetings or phrases. Use only neutral classroom language."
        : language === "Bengali"
        ? "You are a female Indian school teacher. Speak in very simple Bengali, slowly and clearly. Do not use any religious greetings or phrases. Use only neutral classroom language."
        : "You are a female Indian school teacher in India. Speak in very simple English, slowly and clearly. Do not use any religious greetings or phrases. Use only neutral classroom language.";

    const contextBits: string[] = [
      "You are teaching in a coaching institute called NeoLearn.",
    ];
    if (currentSubject) contextBits.push(`Subject: ${currentSubject.subject_name}.`);
    if (currentChapter) contextBits.push(`Chapter: ${currentChapter.chapter_name}.`);
    if (currentTopic) contextBits.push(`Current topic: ${currentTopic.topic_name}.`);

    const instructions = `${baseInstruction} ${contextBits.join(" ")}`;
    // (Optional) you can feed `instructions` into RealtimeTeacherClient later.

    await client.connect(language);
    setIsRealtimeOn(true);
    setRealtimeStatus("Realtime voice connected.");
  };

  const handleAskRealtime = () => {
    const trimmed = question.trim();
    if (!trimmed) return;

    if (isRealtimeOn && realtimeClient) {
      setRealtimeTranscript("");
      const contextual = buildRealtimeQuestion(trimmed);
      if (contextual) realtimeClient.sendText(contextual);
      setQuestion("");
      return;
    }

    if (!isAsking) onAskQuestion();
  };

  const handleMicToggle = async () => {
    if (!isRealtimeOn || !realtimeClient) {
      setRealtimeStatus("Turn ON Realtime Voice first.");
      return;
    }

    if (!isListening) {
      setRealtimeTranscript("");
      await realtimeClient.startMic();
      setIsListening(true);
    } else {
      realtimeClient.stopMicAndSend();
      setIsListening(false);
    }
  };

  // 🔹 Start / regenerate topic test
  const handleStartTopicTest = async () => {
    if (!currentSubject || !currentChapter || !currentTopic) {
      setRealtimeStatus(
        "Please select subject, chapter and topic before starting the test."
      );
      return;
    }

    setIsLoadingTest(true);
    setTopicTest(null);
    setTopicTestAnswers({});
    setTopicTestResult(null);
    setRealtimeStatus("Preparing topic test…");

    try {
      const langCode =
        language === "Hindi" ? "hi" : language === "Bengali" ? "bn" : "en";

      const res = await fetch("/api/topic-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: "CBSE",
          classLevel: "Class 6",
          subject: currentSubject.subject_name,
          chapter: currentChapter?.chapter_name ?? "",
          topic: currentTopic.topic_name,
          language: langCode,
          numQuestions: 5,
        }),
      });


      if (!res.ok) {
        console.error("topic-test HTTP error:", res.status, await res.text());
        setRealtimeStatus("Failed to create topic test.");
        return;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.questions)) {
        console.error("topic-test invalid response:", data);
        setRealtimeStatus("AI response was not valid test data.");
        return;
      }

      const questions: TopicTestQuestion[] = data.questions;
      setTopicTest(questions);

      const initialAnswers: Record<number, number | null> = {};
      for (const q of questions) initialAnswers[q.id] = null;
      setTopicTestAnswers(initialAnswers);

      setIsTopicTestOpen(true); // open popup
      setRealtimeStatus("Topic test ready.");
    } catch (err) {
      console.error("topic-test fetch error:", err);
      setRealtimeStatus("Error while generating topic test.");
    } finally {
      setIsLoadingTest(false);
    }
  };

const handleSubmitTopicTest = async () => {
  try {
    if (!topicTest || topicTest.length === 0) return;

    let correct = 0;
    for (const q of topicTest) {
      const chosen = topicTestAnswers[q.id];
      if (chosen === q.correctIndex) correct++;
    }

    const total = topicTest.length;
    const percent = Math.round((correct / total) * 100);

    // show score immediately in UI
    setTopicTestResult({ correct, total, percent });
    setRealtimeStatus(`You scored ${correct}/${total} (${percent}%). Saving...`);

    if (!currentTopic?.id) {
      setRealtimeStatus("Save failed: topic missing.");
      return;
    }

    // ✅ Save test score to topic_progress (your submit route updates tests_taken/last_score)
    const saveRes = await fetch("/api/topic-test/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentMobile,          // from props
        topicId: currentTopic.id, // topic table id
        score: percent,
      }),
    });

    const saveText = await saveRes.text();
    console.log("topic-test submit:", saveRes.status, saveText);

    if (!saveRes.ok) {
      setRealtimeStatus("Save failed (server). Check console.");
      return;
    }

    let saveData: any = null;
    try {
      saveData = JSON.parse(saveText);
    } catch {}

    if (!saveData?.ok) {
      setRealtimeStatus("Save failed (DB). Check console.");
      return;
    }

    setRealtimeStatus("✅ Test saved.");
  } catch (e) {
    console.error("handleSubmitTopicTest error:", e);
    setRealtimeStatus("Submit crashed. Check console.");
  }
};


  return (
    <>
      <div className="flex h-[430px] gap-4">
        {/* Teacher avatar area */}
        <div className="flex-1 rounded-2xl bg-slate-50 p-4 flex flex-col">
          <div className="mb-2 text-xs font-semibold text-gray-500 uppercase">
            AI Teacher
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="mb-3 h-90 w-60 overflow-hidden rounded-3xl bg-white shadow-xl flex items-end">
              <img
                src={teacherAvatar}
                alt="AI Teacher"
                className="w-full h-auto object-contain"
              />
            </div>

            <div className="text-sm font-semibold mt-1 text-center">
              NeoLearn Maths Teacher
            </div>
          </div>

          <div className="text-xs text-gray-600 text-center max-w-md mt-1">
            Select your subject, chapter and topic on the left side, then click{" "}
            <span className="font-semibold">Start Lesson (beta)</span> to get a
            short explanation. Later we will replace this with a talking avatar
            video.
          </div>

          <div className="mt-3 text-[11px] text-gray-500">
            {syllabusLoading && "Loading syllabus…"}
            {syllabusError && (
              <span className="text-red-500">
                {" "}
                (Syllabus error: {syllabusError})
              </span>
            )}
            {!syllabusLoading &&
              !syllabusError &&
              (!currentSubject || !currentChapter || !currentTopic) && (
                <span>
                  Please pick Subject → Chapter → Topic using the left menu.
                </span>
              )}
          </div>
        </div>

        {/* Right: conversation card */}
        <div className="w-[360px] rounded-2xl bg-slate-50 p-3 flex flex-col h-full">
          {/* Language + speed */}
          <div className="mb-2 flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Language
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-blue-500"
                value={language}
                onChange={(e) =>
                  setLanguage(
                    e.target.value as "English" | "Hindi" | "Bengali"
                  )
                }
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Bengali">Bengali</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Speed
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-blue-500"
                value={speed}
                onChange={(e) =>
                  setSpeed(e.target.value as "Slow" | "Normal" | "Fast")
                }
              >
                <option value="Slow">Slow</option>
                <option value="Normal">Normal</option>
                <option value="Fast">Fast</option>
              </select>
            </div>
          </div>

          <div className="mb-2 text-xs font-semibold text-gray-500 uppercase">
            Conversation
          </div>

          {/* ✅ Class timer bar */}
          {classRunning && (
            <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 flex items-center justify-between">
              <div className="font-semibold">
                ⏱️ Class Running • Phase {phase}/2 • Time left: {formatTime(remainingSec)}
              </div>
              <button
                type="button"
                onClick={() => {
                  // end current phase manually
                  setEndsAt((prev) => (prev ? Date.now() : prev)); // triggers finish in interval
                }}
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-emerald-100"
              >
                End Phase
              </button>
            </div>
          )}

          {!classRunning && autoStartPayload && (
            <div className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 flex items-center justify-between">
              <div className="font-semibold">
                Today Plan: 2 subjects selected • Phase {phase}/2
              </div>
              {phase === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const mins = Math.max(
                      5,
                      Number(autoStartPayload.minutesPerSubject || 30)
                    );
                    const seconds = mins * 60;

                    setPhase(2);
                    setClassRunning(true);
                    setEndsAt(Date.now() + seconds * 1000);
                    setRemainingSec(seconds);
                    setRealtimeStatus(`▶️ Phase 2 started (${mins} min).`);
                  }}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Start Phase 2
                </button>
              ) : (
                <span className="text-emerald-700 font-semibold">✅ Done</span>
              )}
            </div>
          )}

          {/* Chat box */}
          <div className="flex-1 rounded-xl bg-white border border-slate-200 p-2 text-xs text-gray-700 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1 space-y-1">
              {messages.map((m) => (
                <div key={m.id} className="leading-snug whitespace-pre-wrap">
                  <span
                    className={`font-semibold ${
                      m.author === "Teacher"
                        ? "text-blue-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {m.author}:
                  </span>{" "}
                  <span
                    className={m.isError ? "text-red-600" : "text-gray-800"}
                  >
                    {m.text}
                  </span>
                  <span className="ml-1 text-[10px] text-gray-400">
                    {m.ts}
                  </span>
                </div>
              ))}

              {/* live captions */}
              {realtimeTranscript && (
                <div className="leading-snug whitespace-pre-wrap bg-blue-50 border border-blue-200 rounded-md px-2 py-1 text-[11px] text-gray-700">
                  <span className="font-semibold text-blue-600">
                    Teacher (live):
                  </span>{" "}
                  {realtimeTranscript}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {audioUrl && (
              <div className="mt-2 border-t pt-1">
                <audio id="lesson-audio" controls className="w-full">
                  <source src={audioUrl} />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {audioError && (
              <p className="mt-1 text-[11px] text-red-500">{audioError}</p>
            )}
          </div>

          {/* Question input + realtime controls */}
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={
                isRealtimeOn
                  ? "Type a doubt or use mic for realtime teacher…"
                  : "Ask a doubt about this topic…"
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
              onClick={() => handleAskRealtime()}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              disabled={isAsking}
            >
              {isRealtimeOn ? "Send (Realtime)" : isAsking ? "Thinking…" : "Ask"}
            </button>
            <button
              type="button"
              onClick={handleMicToggle}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                isListening
                  ? "border-red-500 text-red-600 bg-red-50"
                  : "border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
              } disabled:opacity-50`}
              disabled={!isRealtimeOn}
            >
              {isListening ? "⏹ Stop & Send" : "🎙 Speak"}
            </button>
          </div>

          {/* realtime toggle + status */}
{/* 🔹 Live class bar */}
<div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px]">
  <div className="font-semibold text-slate-700">
    {isClassLive ? "🟢 Live Class Running" : "⚪ Class Not Started"}
  </div>

  <div className="flex items-center gap-2">
    {isClassLive && (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
        Time left: {Math.floor(remainingSeconds / 60)}m {remainingSeconds % 60}s
      </span>
    )}

    {isClassLive && (
      <button
        type="button"
        onClick={onEndClass}
        className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
      >
        End Class & Save
      </button>
    )}
  </div>
</div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
            <button
              type="button"
              onClick={handleToggleRealtime}
              className={`rounded-full px-3 py-1 border text-[11px] ${
                isRealtimeOn
                  ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                  : "border-slate-300 text-slate-700 bg-white"
              }`}
            >
              {isRealtimeOn ? "🟢 Realtime Voice ON" : "⚪ Realtime Voice OFF"}
            </button>
            <span className="truncate max-w-[220px] text-right">
              {isListening
                ? "Listening… speak now."
                : realtimeStatus ||
                  (isRealtimeOn ? "Connected to voice teacher." : "")}
            </span>
          </div>

          {/* Start lesson */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => !isStartingLesson && onStartLesson()}
              disabled={isStartingLesson}
              className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isStartingLesson ? "Preparing lesson…" : "Start Lesson (beta)"}
            </button>
          </div>

          {/* Small launcher row for Topic Test */}
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <div className="text-xs font-semibold text-gray-600">
              Topic Mini Test
            </div>
{(currentTopic as any)?.status && (
  <div className="mt-1 text-[11px] font-semibold">
    Status:{" "}
    <span className="ml-1">
      {TOPIC_STATUS_UI[(currentTopic as any).status] || "—"}
    </span>
  </div>
)}
            <div className="flex items-center gap-2">
              {topicTestResult && (
                <span className="text-emerald-700 font-semibold">
                  Last score: {topicTestResult.correct}/{topicTestResult.total} (
                  {topicTestResult.percent}%)
                </span>
              )}
              <button
                type="button"
                onClick={handleStartTopicTest}
                disabled={isLoadingTest || !currentTopic}
                className="rounded-xl border border-indigo-500 px-3 py-1 text-[11px] font-semibold text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50"
              >
                {isLoadingTest
                  ? "Preparing test…"
                  : topicTest
                  ? "Open / Regenerate Test"
                  : "Start Topic Test"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🔹 Topic Test Modal */}
      {isTopicTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[480px] max-h-[80vh] rounded-2xl bg-white shadow-xl p-4 flex flex-col text-xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">
                  Topic Mini Test –{" "}
                  {currentTopic ? currentTopic.topic_name : "Current topic"}
                </div>
                {currentChapter && (
                  <div className="text-[11px] text-gray-500">
                    Chapter: {currentChapter.chapter_number}.{" "}
                    {currentChapter.chapter_name}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsTopicTestOpen(false)}
                className="rounded-full border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-100"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
              {isLoadingTest && (
                <p className="text-[11px] text-gray-600">
                  Preparing test questions…
                </p>
              )}

              {!isLoadingTest && topicTest && topicTest.length > 0 && (
                <>
                  {topicTest.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white rounded-lg border border-slate-200 p-2 mb-1"
                    >
                      <div className="font-medium mb-1">
                        Q{q.id}. {q.question}
                      </div>
                      <div className="space-y-1">
                        {q.options.map((opt, idx) => (
                          <label
                            key={idx}
                            className="flex items-start gap-1 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              className="mt-[2px]"
                              checked={topicTestAnswers[q.id] === idx}
                              onChange={() =>
                                setTopicTestAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: idx,
                                }))
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>

                      {topicTestResult && (
                        <div className="mt-1 text-[11px] text-gray-600">
                          <div>
                            Correct answer:{" "}
                            <span className="font-semibold">
                              {q.options[q.correctIndex]}
                            </span>
                          </div>
                          <div className="text-gray-500">
                            Explanation: {q.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              {!isLoadingTest && (!topicTest || topicTest.length === 0) && (
                <p className="text-[11px] text-gray-500">
                  No questions yet. Click &quot;Open / Regenerate Test&quot;
                  again to try regenerating.
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={handleSubmitTopicTest}
                className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Submit Test
              </button>
              {topicTestResult && (
                <span className="text-[11px] font-semibold text-emerald-700">
                  Score: {topicTestResult.correct}/{topicTestResult.total} (
                  {topicTestResult.percent}%)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
  

