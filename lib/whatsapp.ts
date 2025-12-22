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

// --- Weekly Summary helper (ADD BELOW sendWhatsAppText) ---

export function buildWeeklySummaryMessage(opts: {
  parentName?: string | null;
  childName?: string | null;
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
  needsRevisionCount?: number;
}) {
  const parent = opts.parentName?.trim() ? opts.parentName.trim() : "Parent";
  const child = opts.childName?.trim() ? opts.childName.trim() : "your child";

  const scorePart =
    opts.avgScore === null ? "No test score recorded" : `Avg score: ${opts.avgScore}%`;

  const weakCount = opts.needsRevisionCount ?? 0;
  const weakPart =
    weakCount > 0 ? `Needs revision in ${weakCount} topic(s).` : `No weak topics flagged.`;

  return (
    `📘 NeoLearn Weekly Report\n` +
    `Hello ${parent} 👋\n\n` +
    `👦 Student: ${child}\n` +
    `📅 Week: ${opts.weekStart} to ${opts.weekEnd}\n\n` +
    `✅ Topics completed: ${opts.topicsCompleted}\n` +
    `📝 Tests taken: ${opts.testsTaken}\n` +
    `📊 ${scorePart}\n` +
    `⚠️ ${weakPart}\n\n` +
    `— NeoLearn`
  );
}

/**
 * Convenience sender for weekly summary.
 */
export async function sendWeeklySummaryWhatsApp(to: string, message: string) {
  return sendWhatsAppText(to, message);
}

