// app/api/ai-syllabus-subject/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

/**
 * Body format (JSON):
 * {
 *   "board": "CBSE",
 *   "classLevel": "Class 6",
 *   "subjectName": "Mathematics"
 * }
 *
 * Response (JSON, example):
 * {
 *   "ok": true,
 *   "subject": {
 *     "subject_code": "MATH6",
 *     "subject_name": "Mathematics",
 *     "chapters": [
 *       {
 *         "chapter_number": 1,
 *         "chapter_name": "Knowing Our Numbers",
 *         "topics": [
 *           { "topic_number": 1, "topic_name": "Comparing large numbers" },
 *           { "topic_number": 2, "topic_name": "Place value and face value" }
 *         ]
 *       }
 *     ]
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subjectName = (body.subjectName as string) || "Mathematics";

    if (!board || !classLevel || !subjectName) {
      return NextResponse.json(
        { ok: false, error: "Missing board, classLevel or subjectName" },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are an academic planner for an Indian coaching institute called NeoLearn.
Create a structured syllabus for one subject.

Return ONLY valid JSON, nothing else. No explanation text.
Use this exact JSON shape:

{
  "subject_code": string,
  "subject_name": string,
  "chapters": [
    {
      "chapter_number": number,
      "chapter_name": string,
      "topics": [
        {
          "topic_number": number,
          "topic_name": string
        }
      ]
    }
  ]
}

Rules:
- subject_code: a short code like "MATH6" or "SCI6".
- Use 8–15 chapters for a full-year syllabus.
- Each chapter should have 3–8 topics.
- The content must be appropriate for ${classLevel} (${board}) in India.
`.trim();

    const userPrompt = `
Board: ${board}
Class: ${classLevel}
Subject: ${subjectName}

Generate the syllabus JSON now.
Remember: respond with JSON only.
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = (response.output_text || "").trim();
    console.log("AI syllabus raw output (truncated):", raw.slice(0, 400));

    let parsed: any;

    // 1) Try direct JSON.parse first
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 2) If that fails, try to extract the first {...} block
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("No JSON object found in AI response:", raw);
        return NextResponse.json(
          { ok: false, error: "AI response was not valid JSON." },
          { status: 500 }
        );
      }

      const jsonCandidate = match[0];
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch (e) {
        console.error(
          "Failed to parse extracted JSON from AI response:",
          e,
          jsonCandidate
        );
        return NextResponse.json(
          { ok: false, error: "AI response was not valid JSON." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, subject: parsed });
  } catch (err) {
    console.error("ai-syllabus-subject error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate AI syllabus." },
      { status: 500 }
    );
  }
}
