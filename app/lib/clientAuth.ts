import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

const STUDENT_STORAGE_KEY = "neolearnStudent";

export class ClientAuthError extends Error {
  constructor() {
    super("Please login again.");
    this.name = "ClientAuthError";
  }
}

export function getStudentAccessToken() {
  if (typeof window === "undefined") throw new ClientAuthError();

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STUDENT_STORAGE_KEY) || "{}"
    );
    const token = String(stored?.access_token || "").trim();
    const expiresAt = Number(stored?.expires_at || 0);

    if (!token || (expiresAt > 0 && expiresAt <= Math.floor(Date.now() / 1000))) {
      throw new ClientAuthError();
    }

    return token;
  } catch (error) {
    if (error instanceof ClientAuthError) throw error;
    throw new ClientAuthError();
  }
}

export function studentAuthHeaders(json = false): Record<string, string> {
  const token = getStudentAccessToken();

  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

export async function parentAuthHeaders(json = false): Promise<Record<string, string>> {
  const { data, error } = await supabaseBrowser.auth.getSession();
  if (error) throw new ClientAuthError();
  const token = data.session?.access_token || "";
  if (!token) throw new ClientAuthError();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

export function loginAgainMessage(status: number, fallback?: string) {
  return status === 401 ? "Please login again." : fallback || "Request failed.";
}
