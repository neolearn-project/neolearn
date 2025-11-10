// lib/whatsapp.ts
export async function sendWhatsAppText(to: string, text: string) {
  if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
    console.warn("WA env missing, skipping WA send");
    return { ok: false, skipped: true };
  }

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
    // if you want this to run on Edge too
    cache: "no-store",
  });

  if (!res.ok) {
    const e = await res.text().catch(() => "");
    console.warn("WA send failed:", res.status, e);
    return { ok: false, status: res.status, error: e };
  }
  return { ok: true, data: await res.json() };
}
