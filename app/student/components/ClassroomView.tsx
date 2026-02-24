'use client';

import React from 'react';
import type { SubjectRow, ChapterRow, TopicRow, ChatMessage } from '../types';

export default function ClassroomView(props: {
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
  // âœ… Class Timer (Classroom only)
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
      setRealtimeStatus("âœ… Class block finished. You can move to next subject.");
    }
  }, 1000);

  return () => window.clearInterval(t);
}, [endsAt]);



  // ðŸ”¹ Realtime voice state
  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeTeacherClient | null>(null);
  const [isRealtimeOn, setIsRealtimeOn] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("");

   const [isListening, setIsListening] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState("");

  // âœ… Auto start today class: enable realtime + start timer
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
          `âœ… Started today's class. Phase 1 running (${mins} min). Realtime enabled.`
        );
      } catch {
        setRealtimeStatus("Started timer, but realtime connection failed.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartToken]);

  // ðŸ”¹ Topic mini test state (MCQs)
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

  // ðŸ§  Build a context-rich question for the realtime teacher
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
  onAppendTranscript(delta); // âœ… also store globally for saving
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

  // ðŸ”¹ Start / regenerate topic test
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
    setRealtimeStatus("Preparing topic testâ€¦");

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

    // âœ… Save test score to topic_progress (your submit route updates tests_taken/last_score)
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

    setRealtimeStatus("âœ… Test saved.");
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

{/* Conversation header */}
<div className="mb-2 text-xs font-semibold text-gray-500 uppercase">
  Conversation
</div>

{/* Phase timer bar */}
{classRunning && (
  <div className="mb-2 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
    <div className="font-semibold">
      â±ï¸ Class Running â€¢ Phase {phase}/2 â€¢ Time left: {formatTime(remainingSec)}
    </div>
    <button
      type="button"
      onClick={() => setEndsAt(Date.now())}
      className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-emerald-100"
    >
      End Phase
    </button>
  </div>
)}

{/* Chat area */}
<div className="flex-1 overflow-y-auto px-4 py-4">
  <div className="mx-auto max-w-5xl space-y-3">
    {messages.map((m) => {
      const isTeacher = m.author === "Teacher";
      return (
        <div key={m.id} className={`flex ${isTeacher ? "justify-start" : "justify-end"}`}>
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
              isTeacher
                ? "rounded-tl-md border border-slate-200 bg-white text-slate-800"
                : "rounded-tr-md bg-emerald-500 text-white"
            } ${m.isError ? "border-red-300 bg-red-50 text-red-700" : ""}`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
            <div className={`mt-1 text-[11px] ${isTeacher ? "text-slate-400" : "text-emerald-100"}`}>
              {isTeacher ? "Teacher" : "You"} â€¢ {m.ts}
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

{/* Live class bar */}
<div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px]">
  <div className="font-semibold text-slate-700">
    {isClassLive ? "ðŸŸ¢ Live Class Running" : "âšª Class Not Started"}
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

{/* Audio player */}
{audioUrl && (
  <div className="border-t border-slate-200 px-4 py-2">
    <audio controls className="w-full">
      <source src={audioUrl} />
    </audio>
  </div>
)}

{audioError && (
  <p className="px-4 pb-2 text-xs text-red-500">
    {audioError}
  </p>
)}

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
                {isRealtimeOn ? "ðŸŸ¢ Realtime Voice ON" : "âšª Realtime Voice OFF"}
              </button>
              <button
                type="button"
                onClick={handleMicToggle}
                disabled={!isRealtimeOn}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50 whitespace-nowrap"
              >
                {isListening ? "â¹ Stop & Send" : "ðŸŽ™ Speak"}
              </button>
              <button
                type="button"
                onClick={() => !isStartingLesson && handleStartClass()}
                disabled={isStartingLesson}
                className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 whitespace-nowrap"
              >
                {isStartingLesson ? "Preparing lessonâ€¦" : "Start Lesson"}
              </button>
              <button
                type="button"
                onClick={handleStartTopicTest}
                disabled={isLoadingTest || !currentTopic}
                className="rounded-full border border-indigo-500 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 disabled:opacity-50 whitespace-nowrap"
              >
                {isLoadingTest ? "Preparing testâ€¦" : "Start Topic Test"}
              </button>
            </div>

            <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 text-[11px] text-slate-500">
              <span className="whitespace-nowrap">{isListening ? "Listeningâ€¦ speak now." : realtimeStatus || "Ready"}</span>
              {(currentTopic as any)?.status && (
                <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                  Status: {TOPIC_STATUS_UI[(currentTopic as any).status] || "â€”"}
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
                placeholder={isRealtimeOn ? "Type a doubt or use mic for realtime teacherâ€¦" : "Ask a doubt about this topicâ€¦"}
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
                {isRealtimeOn ? "Send" : isAsking ? "Thinkingâ€¦" : "Ask"}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              <label className="cursor-pointer rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-100">
                ðŸ“Ž Upload notes/photo
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
                ðŸ“· Open camera
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
            {syllabusLoading && <p className="mt-1 text-xs text-slate-500">Loading syllabusâ€¦</p>}
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

      
             

    </>
  );
}


