import { createClient } from "@supabase/supabase-js";
import { computeAccessSummary } from "@/lib/access/checkPolicy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const FEATURE_LIMITS: Record<"lesson" | "tts" | "qa", number> = {
  lesson: 5,
  tts: 5,
  qa: 5,
};

export async function requireAccessOrThrow({
  mobile,
  feature,
}: {
  mobile: string;
  feature: "lesson" | "tts" | "qa";
}) {
  const normalizedMobile = String(mobile || "").trim();
  if (!normalizedMobile) {
    throw new Error("MOBILE_REQUIRED");
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("ACCESS_CHECK_UNAVAILABLE");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("topic_progress")
    .select("topic_id")
    .eq("student_mobile", normalizedMobile);

  if (error) {
    throw new Error("ACCESS_CHECK_UNAVAILABLE");
  }

  const { allowed } = computeAccessSummary(data, FEATURE_LIMITS[feature]);
  if (!allowed) {
    throw new Error("ACCESS_DENIED");
  }
}
