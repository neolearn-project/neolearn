"use server";

/**
 * Minimal WhatsApp sending helper.
 * Keeps types explicit so Vercel's type-checker is happy.
 */
export interface WaSendResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export async function sendWhatsApp(to: string, text: string): Promise<WaSendResult> {
  try {
    const url = `https://graph.facebook.com/v20.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await res.json().catch(() => undefined);

    if (!res.ok) {
      // log the raw response for debugging but hide token values
      console.error("WA send error status:", res.status, data ?? "(no body)");
      return { ok: false, error: `WA ${res.status}`, data };
    }

    return { ok: true, data };
  } catch (e: any) {
    console.error("WA send exception:", e?.message ?? e);
    return { ok: false, error: e?.message ?? "unknown" };
  }
}
