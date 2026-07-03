import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

const STUDENT_STORAGE_KEY = "neolearnStudentAuth";

export function studentAuthHeaders(json = false): Record<string, string> {
  let token = "";
  if (typeof window !== "undefined") {
    try {
      token = JSON.parse(
        window.localStorage.getItem(STUDENT_STORAGE_KEY) || "{}"
      )?.access_token || "";
    } catch {}
  }

  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function parentAuthHeaders(json = false): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token || "";
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
