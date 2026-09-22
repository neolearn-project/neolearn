import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OwnershipError, ownershipErrorResponse, requireStudentIdentity, requireStudentMobile } from "@/lib/auth/ownership";
import { requireAiAccess } from "@/lib/access/requireAiAccess";
import { DuplicateAiRequestError, duplicateAiRequestResponse, recordOpenAIUsage, resolveAiRequestId } from "@/app/lib/aiUsageLedger";
import {
  AiRouteInProgressError, AiRouteRequestHashMismatchError, AiRouteOwnershipUnavailableError,
  AiRouteNotReplayableError, ReplayAiRouteResponse,
  aiRouteInProgressResponse, aiRouteRequestHashMismatchResponse,
  aiRouteOwnershipUnavailableResponse, aiRouteNotReplayableResponse,
  beginAiRouteRequest, completeAiRouteRequest, failAiRouteRequest,
} from "@/app/lib/aiUsageRouteReplay.mjs";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  let reservation: Awaited<ReturnType<typeof beginAiRouteRequest>> | null = null;
  try {
    const body = await req.json();
    const identity = await requireStudentIdentity(req);
    const mobiles = [body?.mobile, body?.studentMobile, body?.phone].map((value) => String(value || "").trim()).filter(Boolean);
    for (const mobile of mobiles) await requireStudentMobile(req, mobile);
    const studentId = String(body?.studentId || "").trim();
    if (studentId && studentId !== identity.user.id) {
      throw new OwnershipError("Student access denied.", 403);
    }
    await requireAiAccess(identity.mobile, "topic_test");
    const topicName = String(body?.topicName || "Fractions").trim();
    const classId = String(body?.classId || "6").trim();
    const board = String(body?.board || "cbse").trim();
    const level = String(body?.level || "easy").trim(); // easy|medium|hard
    const lang = String(body?.lang || "en").trim();
    const requestId = resolveAiRequestId(req, body, "teacher_quiz");
    reservation = await beginAiRouteRequest({
      requestId, studentId: identity.user.id, studentMobile: identity.mobile,
      feature: "teacher_quiz", requestPayload: { topicName, classId, board, level, lang }, strictOwnership: true,
    });
    const openai = getOpenAIClient();
    if (!openai) throw new Error("Missing OpenAI API key");

    const system = `
You are an Indian school teacher.
Create a small quiz for Class ${classId} (${board.toUpperCase()}).
Topic: ${topicName}
Difficulty: ${level}
Language: ${lang}

Return STRICT JSON only:
{
  "topic": "...",
  "level": "...",
  "questions": [
    {
      "type": "mcq",
      "q": "...",
      "options": ["A","B","C","D"],
      "answerIndex": 0,
      "explain": "1-2 lines"
    }
  ]
}
Rules:
- Make 3 MCQs.
- Keep questions short.
- Explanation very short.
`.trim();

    const r = await recordOpenAIUsage({
      req, studentId: identity.user.id, studentMobile: identity.mobile,
      feature: "teacher_quiz", model: "gpt-5-mini", providerCall: "responses.create",
      requestId, retryAttempt: reservation.attempt,
      call: () => openai.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: "Generate the quiz now." },
      ],
      }),
    });

    const text = (r as any).output_text || "";
    // In case model includes extra text, try to extract JSON safely:
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const jsonText =
      firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;

    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // fallback: return raw
      return await completeAiRouteRequest(reservation, NextResponse.json({ ok: true, raw: text }, { status: 200 }));
    }

    return await completeAiRouteRequest(reservation, NextResponse.json({ ok: true, quiz: parsed }, { status: 200 }));
  } catch (e) {
    if (e instanceof ReplayAiRouteResponse) return e.response;
    if (e instanceof AiRouteInProgressError) return aiRouteInProgressResponse(e);
    if (e instanceof AiRouteRequestHashMismatchError) return aiRouteRequestHashMismatchResponse(e);
    if (e instanceof AiRouteOwnershipUnavailableError) return aiRouteOwnershipUnavailableResponse();
    if (e instanceof AiRouteNotReplayableError) return aiRouteNotReplayableResponse();
    await failAiRouteRequest(reservation, e);
    if (e instanceof OwnershipError) return ownershipErrorResponse(e);
    if (e instanceof DuplicateAiRequestError) return duplicateAiRequestResponse(e);
    console.error("teacher-quiz error");
    return NextResponse.json(
      { ok: false, error: "Failed to generate quiz." },
      { status: 500 }
    );
  }
}

