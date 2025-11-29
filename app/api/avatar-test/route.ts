import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.DID_API_KEY;
    const secretKey = process.env.DID_API_SECRET;

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: "Missing DID_API_KEY or DID_API_SECRET" },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

    const res = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        script: {
          type: "text",
          input: "Hello from NeoLearn test",
        },
        // Just a public test avatar image so we can see if API works
        source_url: "https://i.imgur.com/u1JgRHO.jpeg",
      }),
    });

    const data = await res.json();

    return NextResponse.json(
      {
        httpStatus: res.status,
        data,
      },
      { status: res.status }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
