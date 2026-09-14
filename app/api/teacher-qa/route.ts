// app/api/teacher-qa/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OwnershipError, ownershipErrorResponse, requireStudentIdentity } from "@/lib/auth/ownership";
import {
  DuplicateAiRequestError,
  duplicateAiRequestResponse,
  recordOpenAIUsage,
  resolveAiRequestId,
} from "@/app/lib/aiUsageLedger";
import {
  AiRouteInProgressError,
  AiRouteRequestHashMismatchError,
  ReplayAiRouteResponse,
  aiRouteInProgressResponse,
  aiRouteRequestHashMismatchResponse,
  beginAiRouteRequest,
  completeAiRouteRequest,
  failAiRouteRequest,
} from "@/app/lib/aiUsageRouteReplay.mjs";
import {
  buildCompetitiveStructureInstruction,
  competitiveExamLabel,
  isCompetitiveMode,
} from "@/app/lib/competitivePrompt";
import { qaRepairCompetitiveText } from "@/app/lib/competitiveQa";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  let replayReservation: Awaited<ReturnType<typeof beginAiRouteRequest>> | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = resolveAiRequestId(req, body, "teacher_qa");
    const identity = await requireStudentIdentity(req);
    const bodyMobile = String(body?.mobile || body?.studentMobile || "").trim();
    const bodyStudentId = String(body?.studentId || "").trim();
    if (
      (bodyMobile && bodyMobile !== identity.mobile) ||
      (bodyStudentId && bodyStudentId !== identity.user.id)
    ) {
      throw new OwnershipError("Student access denied.", 403);
    }

    const classLevel = body.classLevel || "Class 6";
    const subject = body.subject || "Maths";
    const chapter = body.chapter || "Fractions â€“ introduction";
    const language = (body.language as "en" | "hi" | "bn") || "en";
    const question: string | undefined = body.question;
    const previous = (body.previousMessages as string | undefined) || "";
    const track = String(body?.track || body?.subjectType || body?.courseType || "regular");
    const competitiveExam = competitiveExamLabel(body?.competitiveExam || body?.exam || body?.board);
    const isCompetitive = isCompetitiveMode(track);

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }
    replayReservation = await beginAiRouteRequest({
      requestId,
      studentId: identity.user.id,
      studentMobile: identity.mobile,
      feature: "teacher_qa",
      requestPayload: {
        questionSha256: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question)).then((hash) =>
          Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")
        ),
        classLevel,
        subject,
        chapter,
        language,
        track,
        competitiveExam,
      },
    });

    const languageInstruction =
      language === "hi"
        ? "Answer in simple Hindi that a Class 6 student can understand."
        : language === "bn"
        ? "Answer in simple Bengali that a Class 6 student can understand."
        : "Answer in very simple English that a Class 6 student can understand.";

    const prompt = `
${isCompetitive ? `You are NeoLearn's serious ${subject} competitive exam mentor for ${classLevel}.` : `You are NeoLearn's friendly ${subject} teacher for ${classLevel}.`}

Student is studying chapter: "${chapter}".

The student has this doubt or question:

"${question}"

${previous ? `Conversation so far:\n${previous}\n` : ""}

Your job:
${isCompetitive ? buildCompetitiveStructureInstruction(competitiveExam, {
  responseType: "doubt",
  subject,
}) : `- Explain the answer gently.
- Use short, clear sentences.
- Do not give very advanced formulas.
- Encourage the student at the end.
- Keep it within 4â€“8 sentences.`}

${languageInstruction}
    `.trim();

    const model = "gpt-4.1-mini";
    const completion = await recordOpenAIUsage({
      req,
      studentId: identity.user.id,
      studentMobile: identity.mobile,
      feature: "teacher_qa",
      model,
      providerCall: "chat.completions.create",
      requestId,
      retryAttempt: replayReservation.attempt,
      call: () => client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              isCompetitive
                ? "You are an expert Indian competitive exam mentor. Be serious, concise, analytical, and exam-focused. Do not add filler."
                : "You are a kind school teacher. You explain like you are talking to one child, not writing an exam answer.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.6,
      }),
    });

    const rawAnswer =
      completion.choices[0]?.message?.content?.trim() ||
      "I am sorry, I could not generate an answer. Please try again.";
    const answer = isCompetitive
      ? qaRepairCompetitiveText(rawAnswer, { subject, chapter, topic: chapter, exam: competitiveExam })
      : rawAnswer;

    return completeAiRouteRequest(
      replayReservation,
      NextResponse.json({ answer })
    );
  } catch (err) {
    if (err instanceof ReplayAiRouteResponse) return err.response;
    if (err instanceof AiRouteInProgressError) return aiRouteInProgressResponse(err);
    if (err instanceof AiRouteRequestHashMismatchError) return aiRouteRequestHashMismatchResponse(err);
    await failAiRouteRequest(replayReservation, err);
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    if (err instanceof DuplicateAiRequestError) return duplicateAiRequestResponse(err);
    console.error("teacher-qa error:", err);
    return NextResponse.json(
      { error: "Failed to generate teacher answer" },
      { status: 500 }
    );
  }
}

