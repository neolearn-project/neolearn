export function rupeesToPaise(value) {
  const raw = String(value ?? "").trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || "").padEnd(2, "0"));
  const paise = whole * 100n + fraction;
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}
