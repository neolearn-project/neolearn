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

type ClassId = "5" | "6" | "7" | "8" | "9";

type NoteType = "full_exam_notes" | "quick_revision" | "important_qna" | "mcq_only";

interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;

  // Supabase Auth user id (needed for Persona Engine)
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
  completed: "Completed",
  in_progress: "In Progress",
  needs_revision: "Needs Revision",
  not_started: "Not Started",
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
const [upgradeOpen, setUpgradeOpen] = useState(false);
const [upgradeReason, setUpgradeReason] = useState<
  "realtime_voice" | "topic_test" | "lesson_generation" | "qa" | null
>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("classroom");

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


const [classSession, setClassSession] = useState<ClassSession | null>(null);
const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
// Store the full realtime transcript for this class session
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

// End class session + save transcript chapter-wise
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
// Daily progress (Today)
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

// ---------------- Notes Engine: Generate ----------------
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile: student.mobile,
        board: "cbse",
        classId: String(student.classId),
        courseType: "regular",
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
}, [student, selectedSubjectId, selectedChapterId, selectedTopicId, noteType]);

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
      `/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`
    );
    const data = await res.json();

    if (res.ok && data?.ok) {
      setEntitlements(data);
      return data;
    }
  } catch (err) {
    console.error("loadEntitlements error:", err);
  }

  return null;
}, [student]);

const loadPlans = useCallback(async () => {
  setPlansLoading(true);
  setPlansError(null);

  try {
    const res = await fetch("/api/admin/plans");
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

  try {
    audio.load();
  } catch {}

  audio.play().catch(() => {
    // ignore autoplay error; user can press play manually
  });
}, [audioUrl]);

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

  // Reset dependent selections when parent changes
  useEffect(() => {
    setSelectedChapterId(null);
    setSelectedTopicId(null);
  }, [selectedSubjectId]);

  useEffect(() => {
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
            'Hi! I am your NeoLearn Maths teacher. ' +
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

  const ent = await loadEntitlements();

  if (!ent?.ok) {
    pushMessage(
      "Teacher",
      "Unable to verify your plan right now. Please try again.",
      true
    );
    setIsStartingLesson(false);
    return;
  }

  if (!ent.features?.lessonGeneration) {
    pushMessage(
      "Teacher",
      `Free access exhausted (${ent.usage?.used}/${ent.usage?.effectiveLimit}). Please subscribe to continue full lessons.`,
      true
    );
    setIsStartingLesson(false);
    return;
  }

  setAudioUrl((old) => {
    if (old && old.startsWith("blob:")) {
      URL.revokeObjectURL(old);
    }
    return null;
  });

  pushMessage("Teacher", "Generating your lesson. Please wait a moment...");

  try {
    const langCode = getLangCode(language);
    const speedCode = getSpeedCode(speed);

    let scriptText = "";

    try {
      const lessonRes = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: student?.mobile,
          board: "CBSE",
          classLevel: `Class ${student?.classId}`,
          subject: currentSubject.subject_name,
          topic: currentTopic.topic_name,
          language: langCode,
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

    if (!scriptText) {
      const langLabel = language;
      scriptText = (
        `Hi ${student?.name || "Student"}, I am your NeoLearn ${currentSubject.subject_name} teacher.\n\n` +
        `Today we will learn the topic "${currentTopic.topic_name}" from the chapter "${currentChapter.chapter_name}" for Class ${student?.classId || "6"}.\n` +
        `I will explain it step by step in very simple ${langLabel} so you can understand easily.`
      ).trim();
    }

    pushMessage("Teacher", scriptText);

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

    try {
      const audioRes = await fetch("/api/lesson-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    loadEntitlements();
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
  loadEntitlements,
]);

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
    pushMessage(
      "Teacher",
      "Unable to verify your plan right now. Please try again.",
      true
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: trimmed,
        studentId: student?.studentId || "",
        subjectDbId: String(currentSubject?.id ?? ""),
        chapterDbId: String(currentChapter?.id ?? ""),
        topicDbId: String(currentTopic?.id ?? ""),
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

    pushMessage("Teacher", answer);

    const langCode = getLangCode(language);

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
      setAudioUrl(url);
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
  student?.mobile,
  student?.studentId,
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

  return (
  <div className="fixed inset-0 flex flex-col bg-slate-100">
    {/* Top bar */}
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blue-600">
            <img
              src="/logo/neolearn-logo.png"
              alt="NeoLearn logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="text-lg font-semibold">NeoLearn</div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>
            {student.name}  Class {student.classId} {student.mobile}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </div>
    </header>

    {/* Fullscreen app shell */}
    <div className="min-h-0 flex-1 px-2 py-2 md:px-3 md:py-3">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Top horizontal navigation */}
        <div className="shrink-0 overflow-x-auto rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
          <nav className="flex min-w-max gap-2 text-sm">
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
              onEnsureClassLive={startClassSession}
              onAppendTranscript={(delta) =>
                setSessionTranscript((p) => p + delta)
              }
              onEndClass={endClassSession}
              autoStartToken={autoStartToken}
              autoStartPayload={autoStartPayload}
              onNavigateTab={(tab) => setActiveTab(tab)}
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
            <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
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
  <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
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
                selectedId={selectedSessionId}
                setSelectedId={setSelectedSessionId}
                noteType={noteType}
                setNoteType={setNoteType}
                notesMarkdown={notesMarkdown}
                notesLoading={notesLoading}
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
          <UpgradePopup
            open={upgradeOpen}
            reason={upgradeReason}
            onClose={() => {
              setUpgradeOpen(false);
              setUpgradeReason(null);
            }}
            onBuyMonthly={() => handleBuyPlan("REGULAR_MONTHLY")}
          />
        </main>
      </div>
    </div>
  </div>
);
}
               
function UpgradePopup({
  open,
  reason,
  onClose,
  onBuyMonthly,
}: {
  open: boolean;
  reason: "realtime_voice" | "topic_test" | "lesson_generation" | "qa" | null;
  onClose: () => void;
  onBuyMonthly: () => void;
}) {
  if (!open) return null;

  const reasonText =
    reason === "realtime_voice"
      ? "Realtime live teacher voice is a premium feature."
      : reason === "topic_test"
      ? "Topic tests are available in premium access."
      : reason === "lesson_generation"
      ? "Your free access is exhausted. Upgrade to continue full lessons."
      : reason === "qa"
      ? "This AI feature is available in premium."
      : "Upgrade to continue.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">
          Upgrade NeoLearn
        </h2>
        <p className="mt-2 text-sm text-slate-600">{reasonText}</p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-base font-semibold text-slate-900">
            Regular Monthly
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">₹599</div>
          <div className="mt-1 text-sm text-slate-500">30 days access</div>

          <button
            type="button"
            onClick={onBuyMonthly}
            className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Buy / Upgrade
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
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
  const activePlanCode = entitlements?.subscription?.planCode || null;

  const sortedPlans = [...plans].sort(
    (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Plans & Subscription</h1>
        <p className="mt-1 text-xs text-slate-500">
          Upgrade to continue full NeoLearn access, live voice classroom, lesson audio, and more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                className={`relative rounded-[26px] border p-5 shadow-sm ${
                  isCurrent
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
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

                <div className="mb-4">
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
                  className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
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
        Next step: connect these plan cards to Razorpay checkout and activate student subscription automatically after successful payment.
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
<div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
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
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
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
  selectedId,
  setSelectedId,
  noteType,
  setNoteType,
  notesMarkdown,
  notesLoading,
  onGenerateNotes,
}: {
  sessions: StoredSession[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  noteType: NoteType;
  setNoteType: (t: NoteType) => void;
  notesMarkdown: string;
  notesLoading: boolean;
  onGenerateNotes: () => Promise<void> | void;
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
  addLine("Generated by NeoLearn AI Assisted Learning", 9, false);

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
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Print Notes
              </button>
            )}
          </div>
        </div>

        {!notesMarkdown?.trim() && !notesLoading && (
          <div className="mt-2 text-xs text-slate-600">
            Select a note type and click <b>Generate Notes</b>.
          </div>
        )}

        {notesMarkdown?.trim() && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 whitespace-pre-wrap">
            {notesMarkdown}
          </div>
        )}
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
                    {s.subject} {s.topic}
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
                      {selected.subject}  {selected.topic}
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
    onEnsureClassLive,
    onAppendTranscript,
    onEndClass,
    onNavigateTab,
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeTeacherClient | null>(null);
  const [isRealtimeOn, setIsRealtimeOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("Ready");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");

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

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    if (!audioUrl) return;
    const audio = document.getElementById(
      "lesson-audio"
    ) as HTMLAudioElement | null;
    if (!audio) return;

    audio.load();
    audio.play().catch(() => {});
  }, [audioUrl]);

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
      onTranscript: (text) => {
        setRealtimeTranscript(text);
        onAppendTranscript(text);
      },
    });

  if (!realtimeClient) {
    setRealtimeClient(client);
  }

  const realtimeLocale = getRealtimeLocale(language);

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
    'Keep answers short, teacher-like, classroom-safe, and easy for a school student to understand. Do not drift into unrelated topics.';

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
      `/api/student/entitlements?mobile=${encodeURIComponent(studentMobile)}`
    );
    const data = await res.json();
    return res.ok && data?.ok ? data : null;
  } catch {
    return null;
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

  const ent = await loadEntitlementsLocal();
  if (!ent?.features?.realtimeVoice) {
    setRealtimeStatus(
      "Realtime voice is available only for paid or override access."
    );
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
  const ent = await loadEntitlementsLocal();
  if (!ent?.features?.realtimeVoice) {
    setRealtimeStatus(
      "Realtime voice is available only for paid or override access."
    );
    return;
  }

  try {
    const client = await ensureRealtimeConnected(true);

    if (!isListening) {
      setRealtimeTranscript("");
      await client.startMic();
      setIsListening(true);
      setRealtimeStatus("Listening... speak now.");
    } else {
      client.stopMicAndSend();
      setIsListening(false);
      setRealtimeStatus("Voice sent.");
    }
  } catch (err: any) {
    console.error("mic error:", err);
    setIsListening(false);
    setRealtimeStatus(
      `Mic error: ${
        err?.message || err?.toString?.() || "Unknown microphone error"
      }`
    );
  }
};
  
const handleStartTopicTest = async () => {
  if (!currentSubject || !currentChapter || !currentTopic) {
    setRealtimeStatus(
      "Please select subject, chapter and topic before starting the test."
    );
    return;
  }

  const ent = await loadEntitlementsLocal();
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile: studentMobile,
        board: "CBSE",
        classLevel: "Class 6",
        subject: currentSubject.subject_name,
        chapter: currentChapter.chapter_name,
        topic: currentTopic.topic_name,
        language: langCode,
        numQuestions: 5,
      }),
    });

    if (!res.ok) throw new Error("Failed to create topic test.");

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.questions)) {
      throw new Error("AI response was not valid test data.");
    }

    const questions: TopicTestQuestion[] = data.questions;
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

  const handleSubmitTopicTest = async () => {
    try {
      if (!topicTest || topicTest.length === 0) return;

      let correct = 0;
      topicTest.forEach((q) => {
        if (topicTestAnswers[q.id] === q.correctIndex) correct += 1;
      });

      const total = topicTest.length;
      const percent = Math.round((correct / total) * 100);

      setTopicTestResult({ correct, total, percent });

      if (!currentTopic?.id) return;

      const saveRes = await fetch("/api/topic-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentMobile,
          topicId: currentTopic.id,
          score: percent,
        }),
      });

      if (!saveRes.ok) throw new Error("Test score could not be saved.");

      const saveData = await saveRes.json();
      if (!saveData?.ok) throw new Error("Database save failed.");

      setRealtimeStatus(`Test saved: ${correct}/${total} (${percent}%).`);
    } catch (err: any) {
      console.error(err);
      setRealtimeStatus(err?.message || "Submit crashed.");
    }
  };

  const renderBoardVisual = () => {
    const boardTopic = (currentTopic?.topic_name || "").toLowerCase();
    const boardSubject = (currentSubject?.subject_name || "").toLowerCase();

    if (!currentTopic) {
      return (
        <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
          <div>
            <div className="text-xl font-semibold text-slate-700">
              Teacher Smart Board
            </div>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Open the board only when the topic needs a diagram, animation, or visual explanation.
            </p>
          </div>
        </div>
      );
    }

    if (boardTopic.includes("fraction") || boardTopic.includes("decimal")) {
      return (
        <div className="flex h-full flex-col justify-center rounded-3xl bg-slate-50 p-5">
          <div className="mb-4 text-3xl font-bold text-slate-800">
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
        </div>
      );
    }

    if (
      boardTopic.includes("triangle") ||
      boardTopic.includes("angle") ||
      boardTopic.includes("symmetry")
    ) {
      return (
        <div className="flex h-full items-center justify-center rounded-3xl bg-slate-50 p-5">
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
        <div className="grid h-full grid-cols-1 gap-4 rounded-3xl bg-slate-50 p-5 md:grid-cols-2">
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
      <div className="flex h-full items-center justify-center rounded-3xl bg-slate-50 p-5">
        <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-2xl font-semibold text-slate-800">
            {currentTopic.topic_name}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            This teacher board displays diagrams, examples, highlighted steps,
            and explanations for the current topic. The student watches the board
            while the AI teacher explains the lesson smoothly.
          </p>
        </div>
      </div>
    );
  };

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

      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
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
              NeoLearn {currentSubject?.subject_name || "AI"} Teacher
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
            type="button"
            onClick={() => !isStartingLesson && onStartLesson()}
            disabled={isStartingLesson}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isStartingLesson ? "Preparing lesson..." : "Start Lesson"}
          </button>

          <button
            type="button"
            onClick={handleStartTopicTest}
            disabled={isLoadingTest || !currentTopic}
            className="w-full rounded-2xl border border-indigo-500 bg-white px-4 py-3 text-sm font-semibold text-indigo-600 disabled:opacity-60"
          >
            {isLoadingTest ? "Preparing test..." : "Start Topic Test"}
          </button>

          <button
            type="button"
            onClick={onEndClass}
            className="w-full rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            End Class & Save
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Lesson audio
        </div>

        {audioUrl ? (
          <audio id="lesson-audio" key={audioUrl} controls className="w-full">
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
      {railButton("▶", () => !isStartingLesson && onStartLesson())}
    </div>
  );

  return (
    <>
      <div className="relative flex h-full min-h-0 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
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
            drawerOpen ? "w-[280px]" : "w-[64px]"
          }`}
        >
          {drawerOpen ? drawerPanel : rail}
        </aside>

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-slate-50 shadow-xl transition-transform duration-300 lg:hidden ${
            mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {drawerPanel}
        </aside>

        <section className="relative min-w-0 flex-1">
          <div
            className={`flex h-full min-h-0 flex-col p-3 transition-all duration-300 ${
              boardOpen ? "lg:pr-[30%]" : ""
            }`}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="shrink-0 rounded-[28px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMobileDrawerOpen(true)}
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden"
                    >
                      |||
                    </button>

                    {!drawerOpen && (
                      <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="hidden rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 lg:block"
                      >
                        |||
                      </button>
                    )}

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Conversation
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        Lesson flow, doubts, AI replies, and live captions.
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
  <select
    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
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
    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
    value={speed}
    onChange={(e) =>
      setSpeed(e.target.value as "Slow" | "Normal" | "Fast")
    }
  >
    <option value="Slow">Slow</option>
    <option value="Normal">Normal</option>
    <option value="Fast">Fast</option>
  </select>

  <div
    className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
      isClassLive
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    {isClassLive
      ? `Live {Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`
      : "Not started"}
  </div>

  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
    {messages.length} messages
  </div>

  <button
    type="button"
    onClick={() => setBoardOpen((v) => !v)}
    className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
  >
    {boardOpen ? "Hide board" : "Open board"}
  </button>
</div>
</div>
</div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="h-full overflow-y-auto overscroll-contain px-4 py-4">
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isTeacher = m.author === "Teacher";
                      return (
                        <div
                          key={m.id}
                          className={`flex ${isTeacher ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[94%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                              isTeacher
                                ? "border border-slate-200 bg-slate-50 text-slate-800"
                                : "bg-blue-600 text-white"
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

              <div className="shrink-0 rounded-[28px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="relative flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-2xl text-slate-700 hover:bg-slate-50"
                    >
                      +
                    </button>

                    {menuOpen && (
                      <div className="absolute bottom-14 left-0 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        <label className="flex cursor-pointer items-center rounded-xl px-3 py-3 text-sm text-slate-700 hover:bg-slate-100">
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
                          Open camera
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className="h-12 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                    className={`h-12 min-w-[68px] rounded-full border px-4 text-sm font-semibold ${
                      isListening
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {isListening ? "Stop" : "Mic"}
                  </button>

                  <button
                    type="button"
                    onClick={handleAskRealtime}
                    disabled={isAsking}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white disabled:opacity-50"
                  >
                   →
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
            <aside className="hidden lg:block absolute inset-y-0 right-0 w-[30%] min-w-[320px] border-l border-slate-200 bg-white p-3">
              <div className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Teacher smart board
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {currentTopic?.topic_name || "Visual board"}
                    </div>
                    <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {currentSubject?.subject_name || "Board"}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBoardOpen(false)}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                

                <div className="min-h-0 flex-1">{renderBoardVisual()}</div>
              </div>
            </aside>
          )}
        </section>
      </div>

      {boardOpen && (
  <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-slate-200 bg-white p-4 shadow-2xl lg:hidden">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Teacher smart board
        </div>
        <div className="mt-1 text-xl font-semibold text-slate-900">
          {currentTopic?.topic_name || "Visual board"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setBoardOpen(false)}
        className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
      >
        Close
      </button>
    </div>

    <div className="h-[calc(100%-72px)]">
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
                  Answer all questions, then submit to save your score.
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
                    Q{index + 1}. {q.question}
                  </div>

                  <div className="space-y-2">
                    {q.options.map((option, optionIndex) => {
                      const selected = topicTestAnswers[q.id] === optionIndex;
                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          onClick={() =>
                            setTopicTestAnswers((prev) => ({
                              ...prev,
                              [q.id]: optionIndex,
                            }))
                          }
                          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                            selected
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {topicTestResult && (
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Result: {topicTestResult.correct}/{topicTestResult.total} (
                {topicTestResult.percent}%)
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTopicTestOpen(false)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitTopicTest}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
              >
                Submit Test
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

















