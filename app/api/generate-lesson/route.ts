// app/api/generate-lesson/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { OwnershipError, ownershipErrorResponse, requireStudentMobile } from "@/lib/auth/ownership";
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
  competitiveExamLabel,
  isCompetitiveMode,
} from "@/app/lib/competitivePrompt";
import { qaRepairCompetitiveText } from "@/app/lib/competitiveQa";
import {
  inspectTextEvidence,
  isSourceDependentLiterature,
  sourceRequiredResponse,
  verifySourceProvenance,
} from "@/app/lib/sourceGrounding.mjs";
import { sha256Text } from "@/app/lib/classroomConversation.mjs";

const client = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  let replayReservation: Awaited<ReturnType<typeof beginAiRouteRequest>> | null = null;
  try {
    const body = await req.json();
    const mobile = String(body?.mobile || "").trim();
    const identity = await requireStudentMobile(req, mobile);
    await requireAiAccess(identity.mobile, "lesson_generation");
    const requestId = resolveAiRequestId(req, body, "generate_lesson");

    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subject = (body.subject as string) || "Mathematics";
    const chapter = (body.chapter as string) || "";
    const topic = (body.topic as string) || "Fractions";
    const track = String(body?.track || body?.subjectType || body?.courseType || "regular");
    const competitiveExam = competitiveExamLabel(body?.competitiveExam || board);
    const isCompetitive = isCompetitiveMode(track);
    const submittedSourceContent = String(body?.sourceContent || "").trim();
    const sourceProvenanceVerified = await verifySourceProvenance({
      studentId: identity.user.id, subject, chapter, topic, content: submittedSourceContent,
    }, body?.sourceProvenance);
    const suppliedEvidence = inspectTextEvidence(sourceProvenanceVerified ? submittedSourceContent : "");
    const sourceDependent = !isCompetitive && isSourceDependentLiterature({
      subject,
      chapter,
      topic,
    });

    // ðŸ‘‡ from frontend: "en" | "hi" | "bn"
    const language: "en" | "hi" | "bn" = (body.language as any) || "en";
    replayReservation = await beginAiRouteRequest({
      requestId,
      studentId: identity.user.id,
      studentMobile: mobile,
      feature: "lesson_generation",
      strictOwnership: true,
      requestPayload: {
        board,
        classLevel,
        subject,
        chapter,
        topic,
        track,
        competitiveExam,
        language,
        submittedSourceSha256: submittedSourceContent ? await sha256Text(submittedSourceContent) : null,
        sourceProvenanceVerified,
      },
    });

    if (sourceDependent && !suppliedEvidence.usable) {
      return await completeAiRouteRequest(
        replayReservation,
        NextResponse.json(sourceRequiredResponse({ evidenceKind: suppliedEvidence.kind }), { status: 422 })
      );
    }

    // ðŸ”¹ This block is exactly your old language behaviour
    const languageInstruction =
  language === "bn"
    ? `
Explain everything in very simple Bengali (Bangla) suitable for ${classLevel} students.
Use only Bengali sentences (à¦¬à¦¾à¦‚à¦²à¦¾), do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, Ã—, Ã·, =, %.
Do NOT use any religious greeting or phrase (for example "à¦†à¦¸à¦¸à¦¾à¦²à¦¾à¦®à§ à¦†à¦²à¦¾à¦‡à¦•à§à¦®",
"à¦¨à¦®à¦¸à§à¦•à¦¾à¦°", "à¦œà¦¯à¦¼ â€¦"). Use a neutral school-style greeting like
"à¦¹à§à¦¯à¦¾à¦²à§‹, à¦†à¦œ à¦†à¦®à¦°à¦¾ à¦¶à¦¿à¦–à¦¬â€¦" if you greet at all.
Keep sentences short and friendly, like a private tutor in West Bengal/Tripura.
`.trim()
    : language === "hi"
    ? `
Explain everything in very simple Hindi suitable for ${classLevel} students in India.
Use only Hindi sentences, do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, Ã—, Ã·, =, %.
Do NOT use any religious greeting or phrase (for example "à¤…à¤¸à¥à¤¸à¤²à¤¾à¤®à¥ à¤…à¤²à¥ˆà¤•à¥à¤®",
"à¤¨à¤®à¤¸à¥à¤¤à¥‡", "à¤œà¤¯ â€¦"). Use a neutral school-style greeting like
"à¤¨à¤®à¤¸à¥à¤¤à¥‡" is also religious, so prefer "Hello, à¤†à¤œ à¤¹à¤® à¤¸à¥€à¤–à¥‡à¤‚à¤—à¥‡â€¦" or similar.
Keep sentences short, friendly and easy to understand.
`.trim()
    : `
Explain everything in very simple English suitable for Indian school students in ${classLevel}.
Use short sentences, no difficult words, and examples that feel Indian (rupees, local names, etc.).
Do NOT use any religious greeting or phrase (for example "Assalamu Alaikum",
"Om â€¦", "Praise â€¦"). Use a neutral school-style greeting like
"Hello, today we will learnâ€¦" if you greet at all.
Do not speak like a foreign teacher.
`.trim();

    const competitiveInstruction = isCompetitive
      ? `For ${competitiveExam}, keep the explanation exam-relevant and conceptually precise. Include a useful formula, fact, rule, or trap only when it helps this opening explanation. Do not produce headings, a full exam lesson, MCQs, a practice list, or a compulsory question.`
      : "";

    const systemPrompt = `
${isCompetitive
  ? "You are a serious FEMALE competitive exam mentor in a professional Indian coaching institute called NeoLearn. You teach with precision, exam discipline, and no filler."
  : "You are a very friendly FEMALE teacher in a professional Indian coaching institute called NeoLearn.\nYou always teach slowly, clearly and in a warm, encouraging tone."}

${languageInstruction}

${competitiveInstruction}

You are teaching one child, not a classroom.

Very important style rules:
- Never use religious greetings or phrases (for example: "Assalamu Alaikum",
  "Namaste", "Om ...", "Praise ...", "à¦†à¦¸à¦¸à¦¾à¦²à¦¾à¦®à§ à¦†à¦²à¦¾à¦‡à¦•à§à¦®", "à¦¨à¦®à¦¸à§à¦•à¦¾à¦°", "à¦œà¦¯à¦¼ ...").
- Always use a neutral school-style greeting like "Hello, today we will learn ..."
  (or the equivalent neutral sentence in the requested language).
- Stay respectful and inclusive of students from every background.
- Do NOT write headings like "Introduction", "Summary" etc.
- Instead, speak naturally with simple phrases such as:
  "Now let's see some examples.",
  "Now here is a small test for you.",
  "In the end, remember that...",
  "For homework, you can try these questions."

Teach this as the first turn of a real tutoring conversation, not a complete lesson script.
- Give a short explanation of one central idea in about 2-4 simple sentences, grounded in the selected syllabus and student level.
- Use at most one small example if it makes the idea clearer.
- You may ask one useful, low-pressure question to check what the student wants next; do not ask a quiz question by default.
- Then stop and wait. Do not continue into another section, recap, homework, multiple questions, or an answer to a question the student has not asked.
- Respect the requested language and keep the tone natural, responsive, and non-formulaic.
- If the topic needs more than this opening turn, invite the student to continue rather than compressing the whole chapter into one response.

${competitiveInstruction}
`.trim();


    const userPrompt = `
Board: ${board}
Class: ${classLevel}
Track: ${isCompetitive ? `competitive (${competitiveExam})` : "regular"}
Subject: ${subject}
Chapter: ${chapter || "(chapter name not given)"}
Topic: ${topic}
${suppliedEvidence.usable ? `Server-verified extraction from a student-uploaded page:\n---\n${suppliedEvidence.text}\n---` : ""}

Teach only the selected topic. Keep the opening concise and leave room for the student to guide the next turn. Do not mention "NeoLearn" or "AI" in the script.
${suppliedEvidence.usable ? "Every claim about the text must be supported by the supplied passage. If the passage is partial, say what is missing." : ""}
`.trim();

    const model = "gpt-4.1-mini";
    const response = await recordOpenAIUsage({
      req,
      studentId: identity.user.id,
      studentMobile: mobile,
      feature: "lesson_generation",
      model,
      providerCall: "responses.create",
      requestId,
      retryAttempt: replayReservation.attempt,
      call: () => client.responses.create({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const rawScript = (response.output_text || "").trim();
    const script = isCompetitive
      ? qaRepairCompetitiveText(rawScript, { subject, chapter, topic, exam: competitiveExam })
      : rawScript;

    if (!script) {
      return NextResponse.json(
        { ok: false, error: "OpenAI returned an empty lesson script." },
        { status: 500 }
      );
    }

    // Frontend expects script/text
    return await completeAiRouteRequest(
      replayReservation,
      NextResponse.json({ ok: true, script })
    );
  } catch (err) {
    if (err instanceof ReplayAiRouteResponse) return err.response;
    if (err instanceof AiRouteInProgressError) return aiRouteInProgressResponse(err);
    if (err instanceof AiRouteRequestHashMismatchError) return aiRouteRequestHashMismatchResponse(err);
    if (err instanceof AiRouteOwnershipUnavailableError) return aiRouteOwnershipUnavailableResponse();
    await failAiRouteRequest(replayReservation, err);
    if (err instanceof DuplicateAiRequestError) return duplicateAiRequestResponse(err);
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("generate-lesson error");
    return NextResponse.json(
      { ok: false, error: "Failed to generate lesson script." },
      { status: 500 }
    );
  }
}

