export type SafeJsonResponse<T> = {
  data: T | null;
  errorText: string;
};

function safeText(value: string, status: number) {
  const title = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const source = title || value;
  const line = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (!line) return `Empty server response (HTTP ${status}).`;
  return line.slice(0, 240);
}

export async function readJsonResponse<T = any>(
  response: Response
): Promise<SafeJsonResponse<T>> {
  const text = await response.text();
  const trimmed = text.trim();
  const contentType = response.headers.get("content-type") || "";
  const looksJson =
    contentType.toLowerCase().includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (looksJson && trimmed) {
    try {
      return { data: JSON.parse(trimmed) as T, errorText: "" };
    } catch {
      return {
        data: null,
        errorText: `Server returned invalid JSON (HTTP ${response.status}).`,
      };
    }
  }

  return {
    data: null,
    errorText: safeText(text, response.status),
  };
}
