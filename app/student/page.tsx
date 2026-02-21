"use client";

import Image from "next/image";
import { getAvatarForSubject } from "../lib/teacherAvatar";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RealtimeTeacherClient } from "./realtimeTeacherClient";

type ClassId = "5" | "6" | "7" | "8" | "9";

interface StudentInfo {
  name: string;
  mobile: string;
  classId: ClassId;
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
  | "gallery";

type MessageAuthor = "Teacher" | "You";

interface ChatMessage {
  id: number;
  author: MessageAuthor;
  text: string;
  ts: string;
  isError?: boolean;
}

const TOPIC_STATUS_UI: Record<string, string> = {
  completed: "✅ Completed",
  in_progress: "🟡 In Progress",
  needs_revision: "⚠️ Needs Revision",
  not_started: "❌ Not Started",
};

const STORAGE_KEY = "neolearnStudent";

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

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    router.replace("/");
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
          subject: currentSubject.subject_name,
          chapter: currentChapter.chapter_name,
          topic: currentTopic.topic_name,
          classId: student?.classId,
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
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="mb-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <nav className="flex min-w-max gap-2 text-sm">
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
            <PlaceholderView title="Gallery / Notes">
              Here we will store saved examples, screenshots and teacher notes
              for the student.
            </PlaceholderView>
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


interface TopicTestQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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
  } = props;

  // 🔹 Realtime voice state
  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeTeacherClient | null>(null);
  const [isRealtimeOn, setIsRealtimeOn] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("");

  const [isListening, setIsListening] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState("");

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
  const [hasStartedClass, setHasStartedClass] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch {
      setCameraError("Camera access blocked. Please allow camera permission.");
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
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
    setIsCameraOpen(false);
  };

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

  useEffect(() => {
    return () => stopCamera();
  }, []);

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

  const handleStartClass = async () => {
    setHasStartedClass(true);
    await onStartLesson();
  };

  return (
    <>
      <div className="relative min-h-[76vh]">
        <div className="flex min-h-[74vh] flex-col rounded-2xl border border-slate-200 bg-slate-50/70 lg:pr-36">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">NeoLearn AI Classroom</h2>
              <p className="text-xs text-slate-500">Chat with your teacher like a real assistant.</p>
            </div>
            <div className="flex gap-2">
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                value={language}
                onChange={(e) => setLanguage(e.target.value as "English" | "Hindi" | "Bengali")}
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Bengali">Bengali</option>
              </select>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                value={speed}
                onChange={(e) => setSpeed(e.target.value as "Slow" | "Normal" | "Fast")}
              >
                <option value="Slow">Slow</option>
                <option value="Normal">Normal</option>
                <option value="Fast">Fast</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-5xl space-y-3">
              {messages.map((m) => {
                const isTeacher = m.author === "Teacher";
                return (
                  <div
                    key={m.id}
                    className={`flex ${isTeacher ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        isTeacher
                          ? "rounded-tl-md border border-slate-200 bg-white text-slate-800"
                          : "rounded-tr-md bg-emerald-500 text-white"
                      } ${m.isError ? "border-red-300 bg-red-50 text-red-700" : ""}`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                      <div className={`mt-1 text-[11px] ${isTeacher ? "text-slate-400" : "text-emerald-100"}`}>
                        {isTeacher ? "Teacher" : "You"} • {m.ts}
                      </div>
                    </div>
                  </div>
                );
              })}

              {realtimeTranscript && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-blue-700">Teacher (live): </span>
                  {realtimeTranscript}
                </div>
              )}

              {capturedImage && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">Captured image</div>
                  <img src={capturedImage} alt="Captured" className="max-h-56 w-auto rounded-xl border border-slate-200" />
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-1 text-xs font-semibold text-slate-500">Uploaded files</div>
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

          {audioUrl && (
            <div className="border-t border-slate-200 px-4 py-2">
              <audio id="lesson-audio" controls className="w-full">
                <source src={audioUrl} />
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
          {audioError && <p className="px-4 pb-2 text-xs text-red-500">{audioError}</p>}

          <div className="border-t border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={handleToggleRealtime}
                className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                  isRealtimeOn
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {isRealtimeOn ? "🟢 Realtime Voice ON" : "⚪ Realtime Voice OFF"}
              </button>
              <button
                type="button"
                onClick={handleMicToggle}
                disabled={!isRealtimeOn}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50 whitespace-nowrap"
              >
                {isListening ? "⏹ Stop & Send" : "🎙 Speak"}
              </button>
              <button
                type="button"
                onClick={() => !isStartingLesson && handleStartClass()}
                disabled={isStartingLesson}
                className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 whitespace-nowrap"
              >
                {isStartingLesson ? "Preparing lesson…" : "Start Lesson"}
              </button>
              <button
                type="button"
                onClick={handleStartTopicTest}
                disabled={isLoadingTest || !currentTopic}
                className="rounded-full border border-indigo-500 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 disabled:opacity-50 whitespace-nowrap"
              >
                {isLoadingTest ? "Preparing test…" : "Start Topic Test"}
              </button>
            </div>

            <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 text-[11px] text-slate-500">
              <span className="whitespace-nowrap">{isListening ? "Listening… speak now." : realtimeStatus || "Ready"}</span>
              {(currentTopic as any)?.status && (
                <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                  Status: {TOPIC_STATUS_UI[(currentTopic as any).status] || "—"}
                </span>
              )}
              {topicTestResult && (
                <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                  Score: {topicTestResult.correct}/{topicTestResult.total} ({topicTestResult.percent}%)
                </span>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="text"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={isRealtimeOn ? "Type a doubt or use mic for realtime teacher…" : "Ask a doubt about this topic…"}
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
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                disabled={isAsking}
              >
                {isRealtimeOn ? "Send" : isAsking ? "Thinking…" : "Ask"}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              <label className="cursor-pointer rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-100">
                📎 Upload notes/photo
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => setUploadedFiles(Array.from(e.target.files || []))}
                />
              </label>
              <button
                type="button"
                onClick={openCamera}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-100"
              >
                📷 Open camera
              </button>
              {capturedImage && (
                <button
                  type="button"
                  onClick={() => setCapturedImage(null)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-100"
                >
                  Clear image
                </button>
              )}
            </div>
            {cameraError && <p className="mt-1 text-xs text-red-500">{cameraError}</p>}
            {syllabusLoading && <p className="mt-1 text-xs text-slate-500">Loading syllabus…</p>}
            {syllabusError && <p className="mt-1 text-xs text-red-500">Syllabus error: {syllabusError}</p>}
          </div>
        </div>

        <aside
          className={`hidden lg:block absolute right-3 top-3 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-md transition-transform duration-300 ${
            hasStartedClass ? "translate-x-[74%] hover:translate-x-0" : "translate-x-0"
          }`}
        >
          <div className="sticky top-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher</div>
            <div className="mx-auto w-28 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img src={teacherAvatar} alt="AI Teacher" className="h-auto w-full object-contain" />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-slate-700">NeoLearn Maths Teacher</p>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Subject: {currentSubject?.subject_name || "Select subject"}
              <br />
              Topic: {currentTopic?.topic_name || "Select topic"}
            </p>
          </div>
        </aside>
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
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
            <video ref={videoRef} autoPlay playsInline className="max-h-[60vh] w-full rounded-xl border border-slate-200 bg-black" />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                onClick={() => {
                  stopCamera();
                  setIsCameraOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                onClick={captureFromCamera}
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}

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
  
