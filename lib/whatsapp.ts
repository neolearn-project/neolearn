// lib/whatsapp.ts

const PAGE_URL = "https://graph.facebook.com/v20.0";

/**
 * Normalize Indian WhatsApp numbers.
 * - Removes non-digits
 * - Ensures it starts with 91 (India)
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91")) return digits;
  return "91" + digits; // default to India country code
}

/**
 * Check if WhatsApp API is configured via env vars.
 */
export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.WA_ACCESS_TOKEN &&
    process.env.WA_PHONE_NUMBER_ID
  );
}

/**
 * Send a simple text WhatsApp message using Cloud API.
 */
export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.warn("WA not configured, skipping send");
    return;
  }

  const phone = normalizePhone(to);
  const token = process.env.WA_ACCESS_TOKEN!;
  const phoneId = process.env.WA_PHONE_NUMBER_ID!;

  const url = `${PAGE_URL}/${phoneId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp send error:", err);
  } else {
    console.log("WhatsApp sent OK to", phone);
  }
}
