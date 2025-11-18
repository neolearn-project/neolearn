import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY,
});

// Simple heuristic: choose model by complexity
function pickModel(question: string): string {
  const q = question.toLowerCase();
  const length = question.length;

  const heavyKeywords = /(prove|proof|derivative|integral|integration|trigonometry|physics|chemistry|why does|explain why)/;

  if (heavyKeywords.test(q) || length > 400) {
    // Rare, complex questions → best brain
    return "gpt-5.1";
  }

  if (length < 120) {
    // Short, simple doubts → cheapest
    return "gpt-5-nano";
  }

  // Default: good quality, still cheap
  return "gpt-5-mini";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = (body?.question || "").trim();
    const studentClass = (body?.student_class || "Class 6").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Please type your question." },
        { status: 400 }
      );
    }

    if (!client.apiKey) {
      console.error("Missing OpenAI API key");
      return NextResponse.json(
        {
          error:
            "Teacher is temporarily unavailable (server is missing OpenAI API key).",
        },
        { status: 500 }
      );
    }

    const model = pickModel(question);

    const systemPrompt = `
You are a kind Indian school teacher for ${studentClass} Mathematics.
Explain concepts in very simple English, step-by-step, like you are teaching a child.
Always:
- Restate the doubt in one simple line.
- Explain the idea in small steps.
- Show 1–2 worked examples if helpful.
- End by asking a small follow-up question to check understanding.
Use a friendly tone and short sentences.
    `.trim();

    const userPrompt = `
Student class: ${studentClass}
Student question: ${question}
Explain in a very simple way.
    `.trim();

    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    // Safe answer extraction
let answer = "Sorry, I could not answer this question.";

try {
  if (response.output_text) {
    answer = response.output_text;
  } else if (response.output?.[0]?.content) {
    answer = response.output[0].content
      .map((c: any) => c.text || c.value || "")
      .join(" ");
  }
} catch (e) {
  console.error("Error parsing answer:", e);
}

    return NextResponse.json({ answer, modelUsed: model }, { status: 200 });
  } catch (err: any) {
    console.error("teacher-math error:", err);

    const msg: string =
      err?.error?.message || err?.message || "Unknown error from OpenAI";

    if (msg.toLowerCase().includes("insufficient_quota")) {
      return NextResponse.json(
        {
          error:
            "Teacher is busy because the AI quota/credit is over. Please update OpenAI billing, then try again.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Teacher could not answer just now. Please try again later.",
      },
      { status: 500 }
    );
  }
}
