import { NextResponse } from "next/server";
import OpenAI from "openai";
import Twilio from "twilio"; // (not used here, ignore if you don't want)
import { createClient } from "@supabase/supabase-js";
import { OwnershipError, ownershipErrorResponse, requireStudentIdentity } from "@/lib/auth/ownership";
import { requireAiAccess } from "@/lib/access/requireAiAccess";
import {
  DuplicateAiRequestError,
  duplicateAiRequestResponse,
  recordOpenAIUsage,
  resolveAiRequestId,
} from "@/app/lib/aiUsageLedger";
import {
  AiRouteInProgressError,
  AiRouteRequestHashMismatchError,
  AiRouteOwnershipUnavailableError,
  ReplayAiRouteResponse,
  aiRouteInProgressResponse,
  aiRouteRequestHashMismatchResponse,
  aiRouteOwnershipUnavailableResponse,
  beginAiRouteRequest,
  completeAiRouteRequest,
  failAiRouteRequest,
} from "@/app/lib/aiUsageRouteReplay.mjs";

import {
  getTeacherConfig,
  BoardId,
  LangCode,
  ClassId,
  SubjectId,
} from "@/app/lib/teacherConfig";

import {
  decidePersona,
  buildPersonaInstruction,
  type PersonaProfile,
} from "@/app/lib/personaEngine";
import {
  competitiveExamLabel,
  isCompetitiveMode,
} from "@/app/lib/competitivePrompt";
import { qaRepairCompetitiveText } from "@/app/lib/competitiveQa";
import {
  buildClassroomProviderInput,
  callClassroomProvider,
  CLASSROOM_REQUEST_MAX_BYTES,
  readClassroomBodyBounded,
  authenticateAndAuthorizeClassroom,
  sha256Text,
  validateClassroomHistory,
  validateClassroomJpegDataUrl,
  CLASSROOM_GROUNDING_RULES,
} from "@/app/lib/classroomConversation.mjs";
import {
  inspectTextEvidence,
  createSourceProvenance,
  isDirectLanguageExerciseQuestion,
  isSourceDependentLiterature,
  shortReplyContext,
  SOURCE_REQUIRED_CODE,
  SOURCE_REQUIRED_MESSAGE,
  verifySourceProvenance,
} from "@/app/lib/sourceGrounding.mjs";

// ------------------------
// Decide model based on question complexity
// ------------------------
function pickModel(question: string): string {
  const q = question.toLowerCase();
  const length = question.length;

  const heavyKeywords =
    /(prove|proof|derivative|integral|integration|trigonometry|physics|chemistry|why does|explain why)/;

  if (heavyKeywords.test(q) || length > 400) return "gpt-5.1";
  if (length < 120) return "gpt-5-nano";
  return "gpt-5-mini";
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

import { supabaseAdminClient } from "@/app/lib/supabaseServer";

async function embedQuestion(
  client: OpenAI,
  text: string,
  ledger?: {
    req: Request;
    requestId: string;
    studentId?: string | null;
    studentMobile?: string | null;
    retryAttempt?: number;
  }
): Promise<number[]> {
  // 1536 dims (matches your vector(1536))
  const model = "text-embedding-3-small";
  const emb = ledger
    ? await recordOpenAIUsage({
        req: ledger.req,
        studentId: ledger.studentId,
        studentMobile: ledger.studentMobile,
        feature: "memory_embedding",
        model,
        providerCall: "embeddings.create",
        requestId: ledger.requestId,
        retryAttempt: ledger.retryAttempt,
        call: () => client.embeddings.create({
          model,
          input: text,
        }),
      })
    : await client.embeddings.create({
        model,
        input: text,
      });
  return emb.data[0].embedding;
}

export async function POST(req: Request) {
  let replayReservation: Awaited<ReturnType<typeof beginAiRouteRequest>> | null = null;
  try {
   const contentLength = Number(req.headers.get("content-length") || 0);
   if (contentLength > CLASSROOM_REQUEST_MAX_BYTES) {
     return NextResponse.json({ error: "Request is too large. Choose a smaller image." }, { status: 413 });
   }
   const boundedBody = await readClassroomBodyBounded(req, CLASSROOM_REQUEST_MAX_BYTES);
   if (!boundedBody.ok) {
     return NextResponse.json({ error: "Request is too large. Choose a smaller image." }, { status: 413 });
   }
   const raw = boundedBody.text;

if (!raw || !raw.trim()) {
  return NextResponse.json(
    { error: "Empty request body. Send JSON in POST body." },
    { status: 400 }
  );
}

function parseGroundedImageAnswer(raw: string) {
  const cleaned = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(cleaned);
    const evidenceKind = ["passage", "partial_passage", "exercise_only", "unreadable", "unrelated"]
      .includes(value?.evidenceKind) ? value.evidenceKind : "unreadable";
    return {
      evidenceKind,
      answer: typeof value?.answer === "string" ? value.answer.trim() : "",
      missing: typeof value?.missingEvidence === "string" ? value.missingEvidence.trim() : "",
      sourceText: typeof value?.sourceText === "string" ? value.sourceText.trim().slice(0, 12_000) : "",
    };
  } catch {
    return { evidenceKind: "unreadable", answer: "", missing: "", sourceText: "" };
  }
}
let body: any;
try {
  body = JSON.parse(raw);
} catch {
  return NextResponse.json(
    { error: "Invalid JSON in request body." },
    { status: 400 }
  );
}

    // ------------------------
    // Inputs from UI
    // ------------------------
    let question = String(body?.question || "").trim();
    const imageDataUrl = body?.imageDataUrl ?? null;
    if (body?.imageDataUrls !== undefined || body?.attachments !== undefined || Array.isArray(imageDataUrl)) {
      return NextResponse.json({ error: "Please attach one image at a time." }, { status: 400 });
    }
    if (!question && !imageDataUrl) {
      return NextResponse.json({ error: "Add a question or one image." }, { status: 400 });
    }
    if (!question && imageDataUrl) {
      question = "Please explain what is shown in this image in the context of my selected lesson.";
    }
    if (question.length > 2_000) {
      return NextResponse.json({ error: "Please keep your question under 2,000 characters." }, { status: 400 });
    }

    const subjectId = (body?.subjectId || "maths") as SubjectId; // semantic
    const classId = ((body?.classId as string) || "6") as ClassId;
    const board = (body?.board as BoardId) || "cbse";
    const lang = (body?.lang as LangCode) || "en";
    const chapterId = (body?.chapterId as string) || "fractions";

    // DB ids used for memory match/save (text ids in your DB)
    const subjectDbId = String(body?.subjectDbId || "");
    const chapterDbId = String(body?.chapterDbId || "");
    const topicDbId = String(body?.topicDbId || "");
// âœ… Student identity
const studentMobile = String(body?.studentMobile || "").trim();

// Prefer Supabase Auth UID (recommended)
const studentId = String(body?.studentId || "").trim();
const requestId = resolveAiRequestId(req, body, "teacher_math");
const identity = await authenticateAndAuthorizeClassroom({
  authenticate: () => requireStudentIdentity(req),
  authorize: async (authenticatedIdentity: { mobile: string; user: { id: string } }) => {
    if (
      (studentMobile && studentMobile !== authenticatedIdentity.mobile) ||
      (studentId && studentId !== authenticatedIdentity.user.id)
    ) {
      throw new OwnershipError("Student access denied.", 403);
    }
    await requireAiAccess(authenticatedIdentity.mobile, "teacher_math");
  },
});
const verifiedStudentMobile = identity.mobile;
const verifiedStudentId = identity.user.id;

const validatedHistoryResult = validateClassroomHistory(body?.conversation ?? [], question);
if (!validatedHistoryResult.ok) {
  return NextResponse.json({ error: "Conversation is too long or has an invalid message." }, { status: 400 });
}
const conversationHistory = validatedHistoryResult.history;
const validatedImageResult = imageDataUrl === null
  ? null
  : await validateClassroomJpegDataUrl(imageDataUrl);
if (validatedImageResult && validatedImageResult.ok === false) {
  const status = validatedImageResult.error === "unsupported_image" ? 415
    : validatedImageResult.error === "image_too_large" || validatedImageResult.error === "image_dimensions_too_large" ? 413
      : 422;
  const message = validatedImageResult.error === "unsupported_image"
    ? "This image format is not supported. Use JPEG, PNG, or WebP. PDFs are not supported."
    : validatedImageResult.error === "image_too_large"
      ? "This image is too large. Choose a smaller image."
      : validatedImageResult.error === "image_dimensions_too_large"
        ? "This image has too many pixels. Choose a smaller image."
        : "This image could not be read. Retake it or upload a clearer image.";
  return NextResponse.json({ error: message, code: validatedImageResult.error }, { status });
}
const validatedImage: { dataUrl: string; sha256: string; bytes: Uint8Array; width: number; height: number } | null =
  validatedImageResult?.ok === true ? validatedImageResult as { dataUrl: string; sha256: string; bytes: Uint8Array; width: number; height: number } : null;

// legacy fallback (old UI may send topicId)
const topicId = String(body?.topicId || "").trim();


    const teacher = getTeacherConfig(subjectId, classId);
    const chapter =
      teacher.chapters.find((c) => c.id === chapterId) || teacher.chapters[0];

    const selectedSubjectName = String(
      body?.selectedSubject || body?.subject || teacher.displayName
    ).trim();

    const selectedChapterName = String(
      body?.selectedChapter || body?.chapter || chapter?.title || ""
    ).trim();

    const selectedTopicName = String(
      body?.selectedTopic || body?.topic || ""
    ).trim();
    const track = String(body?.track || body?.subjectType || body?.courseType || "regular");
    const competitiveExam = competitiveExamLabel(body?.competitiveExam || body?.exam || body?.board || board);
    const isCompetitive = isCompetitiveMode(track);

    const sourceDependent = !isCompetitive && isSourceDependentLiterature({
      subject: selectedSubjectName,
      chapter: selectedChapterName,
      topic: selectedTopicName,
      question,
    });
    const pastedEvidence = inspectTextEvidence(question);
    const submittedSourceContent = String(body?.sourceContent || "").trim();
    const sourceProvenanceVerified = await verifySourceProvenance({
      studentId: verifiedStudentId,
      subject: selectedSubjectName,
      chapter: selectedChapterName,
      topic: selectedTopicName,
      content: submittedSourceContent,
    }, body?.sourceProvenance);
    const retainedEvidence = inspectTextEvidence(sourceProvenanceVerified ? submittedSourceContent : "");
    const continuation = shortReplyContext(question, conversationHistory);

    const isRepeatRequest =
      /\b(repeat|again|explain again|describe again|explain it again|describe this chapter|cant understand|can't understand|cannot understand|i cant understand|i can't understand|didnt get|didn't get|did'nt get|did not get|not understand|did not understand|dont understand|don't understand|i dont understand|i don't understand|confused|ok|okay|samjha nahi|samajh nahi|samajh nehi|samajh me nahi|samajh me nehi|samajh me nahi aaya|samajh me nehi aaya|samajh mein nahi|samajh mein nehi|dobara|fir se|phir se)\b/i.test(question);

    
    const boardLabel =
      board === "icse"
        ? "ICSE (CISCE)"
        : board === "tbse"
        ? "TBSE / Tripura Board"
        : "CBSE (NCERT)";

    // ------------------------
    // Clients
    // ------------------------
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        { error: "Teacher unavailable (missing OpenAI API key)." },
        { status: 500 }
      );
    }
    replayReservation = await beginAiRouteRequest({
      requestId,
      studentId: verifiedStudentId,
      studentMobile: verifiedStudentMobile,
      feature: "teacher_math",
      strictOwnership: true,
      requestPayload: {
        questionSha256: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question)).then((hash) =>
          Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")
        ),
        conversationSha256: await sha256Text(JSON.stringify(conversationHistory)),
        imageSha256: validatedImage?.sha256 || null,
        board,
        classId,
        lang,
        subjectId,
        chapterId,
        topicId,
        subjectDbId,
        chapterDbId,
        topicDbId,
        selectedSubjectName,
        selectedChapterName,
        selectedTopicName,
        track,
        competitiveExam,
        submittedSourceSha256: submittedSourceContent ? await sha256Text(submittedSourceContent) : null,
        sourceProvenanceVerified,
      },
    });

    // Titles and earlier model turns are never promoted to evidence. Complete
    // the owned replay request before returning the deterministic source gate.
    if (!validatedImage && sourceDependent && !pastedEvidence.usable && !retainedEvidence.usable) {
      return await completeAiRouteRequest(replayReservation, NextResponse.json({
        ok: true,
        answer: SOURCE_REQUIRED_MESSAGE,
        code: SOURCE_REQUIRED_CODE,
        sourceRequired: true,
        continuationResolved: Boolean(continuation?.requestsSource),
      }));
    }

    if (sourceDependent && validatedImage) {
      const groundedModel = "gpt-5-mini";
      const groundedInput = buildClassroomProviderInput({
        systemPrompt: `You are a textbook evidence extractor and tutor. Return only JSON with keys evidenceKind, sourceText, answer, and missingEvidence. evidenceKind must be passage, partial_passage, exercise_only, unreadable, or unrelated. sourceText must faithfully transcribe only clearly readable passage or exercise text. A title, illustration, chapter heading, or exercise questions are not evidence of unseen story facts. For passage or partial_passage, answer only from sourceText. For exercise_only, answer only a directly readable vocabulary or grammar question; never infer a story answer. For partial_passage, answer supported parts and name the exact missing page/content. Never use prior knowledge of the work.`,
        history: [],
        userPrompt: `Subject: ${selectedSubjectName}\nChapter: ${selectedChapterName}\nTopic: ${selectedTopicName}\nStudent question: ${question}`,
        imageDataUrl: validatedImage.dataUrl as any,
      });
      const groundedResponse = await recordOpenAIUsage({
        req,
        studentId: verifiedStudentId,
        studentMobile: verifiedStudentMobile,
        feature: "teacher_math",
        model: groundedModel,
        providerCall: "responses.create.grounded_image",
        requestId,
        retryAttempt: replayReservation.attempt,
        call: () => callClassroomProvider(openai, groundedModel, groundedInput),
      });
      const grounded = parseGroundedImageAnswer(String((groundedResponse as any).output_text || ""));
      const directlyAnswerableExercise = grounded.evidenceKind === "exercise_only"
        && isDirectLanguageExerciseQuestion(question)
        && Boolean(grounded.answer);
      if (directlyAnswerableExercise) {
        return await completeAiRouteRequest(replayReservation, NextResponse.json({
          ok: true,
          answer: grounded.answer,
          source: "uploaded_exercise",
          evidenceKind: grounded.evidenceKind,
        }));
      }
      if (!["passage", "partial_passage"].includes(grounded.evidenceKind) || !grounded.answer) {
        return await completeAiRouteRequest(replayReservation, NextResponse.json({
          ok: true,
          answer: SOURCE_REQUIRED_MESSAGE,
          code: SOURCE_REQUIRED_CODE,
          sourceRequired: true,
          evidenceKind: grounded.evidenceKind,
        }));
      }
      const answer = grounded.evidenceKind === "partial_passage" && grounded.missing
        ? `${grounded.answer}\n\nMissing source: ${grounded.missing}`
        : grounded.answer;
      const sourceProvenance = await createSourceProvenance({
        studentId: verifiedStudentId,
        subject: selectedSubjectName,
        chapter: selectedChapterName,
        topic: selectedTopicName,
        content: grounded.sourceText,
      });
      return await completeAiRouteRequest(replayReservation, NextResponse.json({
        ok: true,
        answer,
        source: "student_uploaded_passage",
        evidenceKind: grounded.evidenceKind,
        sourceContent: grounded.sourceText,
        sourceProvenance,
      }));
    }

    // DIRECT TOPIC LOCK FOR REPEAT / CONFUSION QUESTIONS
    // Bypasses memory/persona/weak-topic fallback to avoid wrong old chapters.
    if (selectedTopicName) {
      const directPrompt = `
${isCompetitive ? "You are a serious Indian competitive exam mentor." : "You are a kind Indian school teacher."}

The student is continuing a tutoring conversation guided by the selected subject, chapter, topic, and level.

STRICT CURRENT CONTEXT:
Subject: ${selectedSubjectName}
Chapter: ${selectedChapterName}
Topic: ${selectedTopicName}
Class: ${teacher.classId}
Board: ${boardLabel}

Student message: ${question}
${continuation ? `The latest message is a short reply to this immediately preceding teacher turn: "${continuation.teacherTurn}". Continue that exact request naturally; do not restart or offer the same choice again.` : ""}
${retainedEvidence.usable ? `Server-verified extraction from the student's uploaded page:\n---\n${retainedEvidence.text}\n---\nUse only this extraction for claims about the story or passage.` : ""}

Rules:
- Respond to the student's actual latest message and use the recent conversation to understand "why", "again", corrections, mistakes, interruptions, and requests for simpler or deeper explanations.
- Give a complete answer when asked. Do not force a question, quiz, headings, or practice task after every response. Ask a follow-up only when it genuinely helps.
- Keep the selected syllabus as guidance. If the screenshot or question appears to concern something else, briefly acknowledge what is visible and ask whether the student wants help with that image/topic or wants to return to the selected lesson; do not invent relevance or silently ignore it.
- Preserve topic disambiguation: for example, a "point" in Lines and Angles is a geometric position, not a decimal point. If image evidence conflicts, clarify instead of switching silently.
- For ${competitiveExam}, retain exam-relevant accuracy, formulas, units, and important traps where useful. Do not add MCQs unless requested.
- SANSKRIT ACCURACY GUARD:
  If Subject is Sanskrit, keep Sanskrit examples grammatically correct.
  Do not convert Sanskrit forms into Hindi plural words.
  Explain meaning in simple Hindi or English, but examples must remain Sanskrit.
  For Sanskrit neuter noun examples, use:
  फलम् → फले → फलानि
  पुस्तकम् → पुस्तके → पुस्तकानि
  गृहम् → गृहे → गृहाणि
  पत्रम् → पत्रे → पत्राणि
  Never write doubtful mixed forms like "पुस्तकें?" when the correct Sanskrit form is "पुस्तके".
- Do not switch to a different syllabus topic silently. In particular, keep existing topic disambiguation such as a geometry point versus a decimal point; ask a brief clarification if the image shows another topic.
- Do not use unrelated long-term memory. Use the bounded recent conversation supplied with this request for turn continuity.
${CLASSROOM_GROUNDING_RULES}
- If Subject is English, explain the selected story/literature topic only.
- If Subject is Science, explain the selected science topic only.
- If Subject is Sanskrit or Hindi, explain the selected grammar/literature topic only.
${isCompetitive ? "- Use precise, compact exam-mentor language without turning this chat reply into a full lesson." : "- Use simple child-friendly language. Prefer a direct answer; explain step by step only as much as needed."}
`.trim();

      const directModel = "gpt-5-mini";
      const directInput = buildClassroomProviderInput({
        systemPrompt: `You are a responsive tutor. Stay within the server-provided syllabus context, respond in ${lang === "hi" ? "simple Hindi" : lang === "bn" ? "simple Bengali" : "simple English"}, and answer the latest user turn.`,
        history: conversationHistory,
        userPrompt: directPrompt,
        imageDataUrl: (validatedImage?.dataUrl || null) as any,
      });
      const directResponse = await recordOpenAIUsage({
        req,
        studentId: verifiedStudentId,
        studentMobile: verifiedStudentMobile,
        feature: "teacher_math",
        model: directModel,
        providerCall: "responses.create.direct_topic_lock",
        requestId,
        retryAttempt: replayReservation.attempt,
        call: () => callClassroomProvider(openai, directModel, directInput),
      });

      const rawAnswer = String((directResponse as any).output_text || "").trim();
      const answer = isCompetitive
        ? qaRepairCompetitiveText(rawAnswer, {
            subject: selectedSubjectName,
            chapter: selectedChapterName,
            topic: selectedTopicName,
            exam: competitiveExam,
          })
        : rawAnswer;

      return await completeAiRouteRequest(
        replayReservation,
        NextResponse.json({
          answer:
            answer ||
            `Restating your doubt: You want me to explain ${selectedTopicName} again.\n\nThis topic belongs to ${selectedSubjectName}, chapter ${selectedChapterName}. Let us understand this same topic step by step.`,
          modelUsed: "direct-repeat-topic-lock",
          cached: false,
          source: "direct-topic-lock",
          audio: null,
        }, { status: 200 })
      );
    }
    let supabase: any = null;
try {
  supabase = supabaseAdminClient();
} catch (e: any) {
  console.warn("Supabase admin not configured");
}


    // ===============================
// âœ… PERSONA ENGINE (Phase B)
// ===============================
let profile: PersonaProfile | null = null;

try {
  if (supabase && verifiedStudentId) {
    const { data } = await supabase
      .from("student_profile")
      .select("preferred_language, preferred_speed, explain_style, weak_topic_ids, persona_summary")
      .eq("student_id", verifiedStudentId)
      .maybeSingle();

    profile = (data as any) || null;
  } else if (supabase && verifiedStudentMobile) {
    const { data } = await supabase
      .from("student_profile")
      .select("preferred_language, preferred_speed, explain_style, weak_topic_ids, persona_summary")
      .eq("mobile", verifiedStudentMobile)
      .maybeSingle();

    profile = (data as any) || null;
  }
} catch (e) {
  console.error("persona profile load failed");
}


const decision = decidePersona(profile, {
  question,
  topicId: topicDbId || null,
  chapterId: chapterDbId || null,
  subjectId: subjectDbId || null,
  lang: (lang as any) || undefined,
});

const personaInstruction = buildPersonaInstruction(decision);

// Use persona language for teacher output + TTS
const personaLang = decision.language;

const languageInstruction =
  personaLang === "hi"
    ? "Reply in simple Hindi that a child of this class in India can understand. Keep sentences short."
    : personaLang === "bn"
    ? "Reply in simple Bengali that a child of this class in India can understand. Use easy Bengali sentences."
    : "Reply in simple English that a child of this class can understand.";


    // ------------------------
    // âœ… 1) MEMORY SEARCH FIRST (if RPC exists + ids present)
    // NOTE: Your RPC signature must match your DB function. If your current call works, keep it.
    // If it fails, weâ€™ll adjust separately.
    // ------------------------
    try {
      if (false && !isRepeatRequest && supabase && question && subjectDbId && chapterDbId && topicDbId) {
        // If your match_teacher_memory expects query_embedding instead of query_text,
        // we must change this. Leaving as-is ONLY if it works in your DB.
        const { data, error } = await supabase.rpc("match_teacher_memory", {
          query_text: question,
          filter_subject_id: subjectDbId,
          filter_chapter_id: chapterDbId,
          filter_topic_id: topicDbId,
          match_count: 1,
        });

        if (!error && data && data.length > 0 && data[0]?.answer) {
          return NextResponse.json(
            { answer: data[0].answer, source: "memory" },
            { status: 200 }
          );
        }
      }
    } catch (e) {
      console.error("memory search failed");
    }

    // ------------------------
    // 2) OTHERWISE CALL OPENAI
    // ------------------------
    const systemPrompt = `
${isCompetitive ? "You are a serious Indian competitive exam mentor." : "You are a kind Indian school teacher."}

PERSONA RULES (must follow):
${personaInstruction}

${isCompetitive ? `For ${competitiveExam}, keep explanations accurate and exam-relevant. Use formulas, units, examples, and common traps when useful, but remain conversational; do not force headings, MCQs, practice tasks, or a follow-up question.` : ""}

Subject: ${teacher.displayName}
Board: ${boardLabel}
Class: ${teacher.classId}
Chapter: ${chapter.title}

${languageInstruction}

Your job is to:
- Answer the latest message using the supplied recent conversation to understand references, corrections, mistakes, and requests to explain again, more simply, or in more depth.
- Give a complete answer when the student requests one. Do not force a follow-up question, quiz, or practice task. Ask a question only if useful to clarify or advance the student's learning.
- Be concise by default and expand when requested; keep examples related to the selected topic.
- If an image or question conflicts with the selected syllabus context, acknowledge what it appears to show and clarify instead of inventing relevance or ignoring it.
${CLASSROOM_GROUNDING_RULES}
`.trim();

// âœ… If confusion detected, mark topic as weak (best effort)
// âœ… If confusion detected, mark topic as weak (best effort)
try {
  if (supabase && decision.weakTopicAdd && (verifiedStudentId || verifiedStudentMobile)) {
  const { data: row } = verifiedStudentId
    ? await supabase
        .from("student_profile")
        .select("weak_topic_ids")
        .eq("student_id", verifiedStudentId)
        .maybeSingle()
    : await supabase
        .from("student_profile")
        .select("weak_topic_ids")
        .eq("mobile", verifiedStudentMobile)
        .maybeSingle();

  const current: string[] = Array.isArray((row as any)?.weak_topic_ids)
    ? (row as any).weak_topic_ids
    : [];

  if (!current.includes(decision.weakTopicAdd)) {
    const next = [...current, decision.weakTopicAdd];

    if (verifiedStudentId) {
      await supabase
        .from("student_profile")
        .update({ weak_topic_ids: next })
        .eq("student_id", verifiedStudentId);
    } else {
      await supabase
        .from("student_profile")
        .update({ weak_topic_ids: next })
        .eq("mobile", verifiedStudentMobile);
    }
  }
}

} catch (e) {
  console.error("weak topic update failed");
}


    const userPrompt = `
Internal class: ${teacher.classId}
Board: ${boardLabel}
Track: ${isCompetitive ? `competitive (${competitiveExam})` : "regular"}
Chapter: ${chapter.title}

Student question: ${question}
${continuation ? `The student is replying to the immediately preceding teacher turn: "${continuation.teacherTurn}". Continue that exact request naturally.` : ""}
${retainedEvidence.usable ? `Server-verified extraction from the student's uploaded page:\n---\n${retainedEvidence.text}\n---\nUse only this extraction for claims about the story or passage.` : ""}

Explain according to the syllabus of this class and board, focused on the given chapter.
`.trim();

    const providerInput = buildClassroomProviderInput({
      systemPrompt,
      history: conversationHistory,
      userPrompt,
      imageDataUrl: (validatedImage?.dataUrl || null) as any,
    });

    const model = pickModel(question);

    const rawResponse = await recordOpenAIUsage({
      req,
      studentId: verifiedStudentId,
      studentMobile: verifiedStudentMobile,
      feature: "teacher_math",
      model,
      providerCall: "responses.create",
      requestId,
      retryAttempt: replayReservation.attempt,
      call: () => callClassroomProvider(openai, model, providerInput),
    });

    let answer = "Sorry, I could not answer this question.";
    try {
      const response: any = rawResponse;
      if (response.output_text) {
        answer = response.output_text;
      } else if (response.output?.[0]?.content) {
        answer = response.output[0].content
          .map((c: any) => c.text || c.value || "")
          .join(" ");
      }
    } catch (e) {
      console.error("Answer parsing error");
    }

    if (isCompetitive) {
      answer = qaRepairCompetitiveText(answer, {
        subject: selectedSubjectName || teacher.displayName,
        chapter: selectedChapterName || chapter.title,
        topic: selectedTopicName || selectedChapterName || chapter.title,
        exam: competitiveExam,
      });
    }

    // ------------------------
    // âœ… PHASE B: Persona Engine (UPDATE profile)
    // ------------------------
    if (supabase && (verifiedStudentId || verifiedStudentMobile)) {
  try {
    const existingWeak: string[] = Array.isArray(profile?.weak_topic_ids)
      ? profile!.weak_topic_ids!
      : [];

    const toAdd = decision.weakTopicAdd ? [decision.weakTopicAdd] : [];
    const mergedWeak = Array.from(new Set([...existingWeak, ...toAdd])).slice(0, 50);

    const filter = verifiedStudentId ? { student_id: verifiedStudentId } : { mobile: verifiedStudentMobile };

    await supabase
      .from("student_profile")
      .update({
        preferred_language: decision.language,
        preferred_speed: decision.speed,
        explain_style: decision.style,
        weak_topic_ids: mergedWeak,
        updated_at: new Date().toISOString(),
      })
      .match(filter);
  } catch (e) {
    console.error("student_profile update failed");
  }
}



    // ------------------------
    // 3) SAVE TO MEMORY (Supabase teacher_memory)
    // ------------------------
    if (supabase) {
      try {
        const embedding = await embedQuestion(openai, question, {
          req,
          requestId,
          retryAttempt: replayReservation.attempt,
          studentId: verifiedStudentId,
          studentMobile: verifiedStudentMobile,
        });

        const { error } = await supabase.from("teacher_memory").insert({
          student_mobile: verifiedStudentMobile || null, // ok for now
          board: String(board),
          class_id: String(classId),

          // IMPORTANT:
          // If your teacher_memory.subject_id/chapter_id/topic_id are TEXT (DB ids),
          // use subjectDbId/chapterDbId/topicDbId.
          subject_id: String(subjectDbId || subjectId || "").trim() || null,
          chapter_id: String(chapterDbId || chapterId || "").trim() || null,
          topic_id: String(topicDbId || topicId || "").trim() || null,

          question,
          answer,
          lang: String(lang),
          embedding,
        });

        if (error) console.error("teacher_memory insert error");
      } catch (e) {
        console.error("Memory save failed");
      }
    }

    // ---- Optional legacy TTS. Classroom requests use the coordinated player. ----
    let audioBase64 = "";
    if (body?.includeAudio !== false) try {
      const safeText = answer.length > 1200 ? answer.slice(0, 1200) : answer;

const ttsModel = "gpt-4o-mini-tts";
const tts = await recordOpenAIUsage({
  req,
  studentId: verifiedStudentId,
  studentMobile: verifiedStudentMobile,
  feature: "teacher_math_audio",
  model: ttsModel,
  providerCall: "audio.speech.create",
  requestId,
  retryAttempt: replayReservation.attempt,
  usage: () => ({
    inputTokens: null,
    cachedInputTokens: 0,
    outputTokens: null,
    reasoningTokens: 0,
    totalTokens: null,
    audioInputTokens: 0,
    cachedAudioInputTokens: 0,
    audioOutputTokens: 0,
    ttsCharacters: safeText.length,
  }),
  call: () => openai.audio.speech.create({
    model: ttsModel,
    voice: "alloy",
    input: safeText,
    response_format: "mp3",
  }),
});


      const arrayBuffer = await tts.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      audioBase64 = buffer.toString("base64");
    } catch (e) {
      console.error("TTS error");
    }

    return await completeAiRouteRequest(
      replayReservation,
      NextResponse.json({
    answer,
    modelUsed: model,
    cached: false,
    persona: {
      language: decision.language,
      speed: decision.speed,
      style: decision.style,
      notes: decision.notes,
    },
    audio: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null,
      }, { status: 200 })
    );
  } catch (err: any) {
    if (err instanceof ReplayAiRouteResponse) return err.response;
    if (err instanceof AiRouteInProgressError) return aiRouteInProgressResponse(err);
    if (err instanceof AiRouteRequestHashMismatchError) return aiRouteRequestHashMismatchResponse(err);
    if (err instanceof AiRouteOwnershipUnavailableError) return aiRouteOwnershipUnavailableResponse();
    await failAiRouteRequest(replayReservation, err);
    if (err instanceof DuplicateAiRequestError) return duplicateAiRequestResponse(err);
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("teacher-math error");

    const msg = err?.error?.message || err?.message || "Unknown error";

    if (msg.toLowerCase().includes("insufficient_quota")) {
      return NextResponse.json(
        { error: "Teacher busy: AI quota/credit over. Recharge OpenAI billing." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: msg }, // keep the real error during dev
      { status: 500 }
    );
  }
}


