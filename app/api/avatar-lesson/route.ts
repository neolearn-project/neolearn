import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  let reservation: Awaited<ReturnType<typeof beginAiRouteRequest>> | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const identity = await requireStudentIdentity(req);
    const mobiles = [body?.mobile, body?.studentMobile, body?.phone].map((value) => String(value || "").trim()).filter(Boolean);
    for (const mobile of mobiles) await requireStudentMobile(req, mobile);
    const studentId = String(body?.studentId || "").trim();
    if (studentId && studentId !== identity.user.id) {
      throw new OwnershipError("Student access denied.", 403);
    }
    await requireAiAccess(identity.mobile, "lesson_audio");
    const scriptText = String(body?.scriptText || "Hi, I am your NeoLearn maths teacher. Today is a short demo lesson.");
    const requestId = resolveAiRequestId(req, body, "avatar_lesson");
    reservation = await beginAiRouteRequest({
      requestId, studentId: identity.user.id, studentMobile: identity.mobile,
      feature: "avatar_lesson", requestPayload: { scriptText }, strictOwnership: true,
    });
    const apiKey = process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key is missing on the server.");
    const model = "gpt-4o-mini-tts";
    const speech = await recordOpenAIUsage({
      req, studentId: identity.user.id, studentMobile: identity.mobile,
      feature: "avatar_lesson", model, providerCall: "audio.speech.create",
      requestId, retryAttempt: reservation.attempt, authoritativeBilling: false,
      call: () => new OpenAI({ apiKey }).audio.speech.create({ model, voice: "alloy", input: scriptText }),
    });
    const audioBase64 = Buffer.from(await speech.arrayBuffer()).toString("base64");
    return await completeAiRouteRequest(reservation, NextResponse.json({ ok: true, text: scriptText, audioBase64 }));
  } catch (error) {
    if (error instanceof ReplayAiRouteResponse) return error.response;
    if (error instanceof AiRouteInProgressError) return aiRouteInProgressResponse(error);
    if (error instanceof AiRouteRequestHashMismatchError) return aiRouteRequestHashMismatchResponse(error);
    if (error instanceof AiRouteOwnershipUnavailableError) return aiRouteOwnershipUnavailableResponse();
    if (error instanceof AiRouteNotReplayableError) return aiRouteNotReplayableResponse();
    await failAiRouteRequest(reservation, error);
    if (error instanceof OwnershipError) return ownershipErrorResponse(error);
    if (error instanceof DuplicateAiRequestError) return duplicateAiRequestResponse(error);
    console.error("avatar-lesson error");
    return NextResponse.json({ ok: false, error: "Failed to generate lesson audio." }, { status: 500 });
  }
}
