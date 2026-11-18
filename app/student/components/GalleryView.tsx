"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteType, StoredSession } from "../studentHistoryTypes";
import { HISTORY_INITIAL_VISIBLE, TRANSCRIPT_PREVIEW_LENGTH, TRANSCRIPT_DETAIL_CHUNK, TRANSCRIPT_DETAIL_MAX, safeHistoryText, safeHistoryDate, formatHistoryDate } from "@/app/lib/studentHistoryFormat";
import { exportNotesPdf } from "@/app/lib/studentNotesPdf.mjs";

export type GalleryViewProps = {
  onOpenSession: (record: StoredSession, resume?: boolean) => void;
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
};

export default function GalleryView({
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
  onOpenSession,
}: GalleryViewProps) {
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

  const pdfMounted = useRef(true);
  useEffect(() => { pdfMounted.current = true; return () => { pdfMounted.current = false; }; }, []);
  const pdfInFlight = useRef(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const downloadNotesText = async () => {
    if (pdfInFlight.current || !notesMarkdown?.trim()) return;
    pdfInFlight.current = true;
    setPdfBusy(true);
    setPdfError(null);
    try { await exportNotesPdf(notesMarkdown, undefined, () => !pdfMounted.current); }
    catch { if (pdfMounted.current) setPdfError("PDF export is unavailable. Check your connection and try again."); }
    finally { pdfInFlight.current = false; if (pdfMounted.current) setPdfBusy(false); }
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

      <p className="text-xs text-slate-500">New text classes save to your account. Older recordings stay in this browser. Continue restores text only; audio and attached images are not stored.</p>
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
      onClick={() => void downloadNotesText()}
      disabled={pdfBusy}
      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
    >
      {pdfBusy ? "Preparing PDF…" : "Download Notes"}
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

{pdfError && <div role="alert" className="mt-2 text-xs text-red-700">{pdfError}</div>}
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

                  <div className="flex flex-wrap items-center gap-2">
                    {selected.cloudSummary ? <button type="button" onClick={() => onOpenSession(selected)} className="rounded border px-3 py-1 text-xs">Open full recording</button> : <button type="button" onClick={() => onOpenSession(selected, true)} className="rounded border px-3 py-1 text-xs">Continue saved class</button>}
                    <button
  disabled={selected.cloudSummary}
  type="button"
  onClick={() => selected && openUnicodePrintPdf(selected)}
  className="rounded-xl border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
>
  Print
</button>

                    <button
                      type="button"
                      disabled={selected.cloudSummary}
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
