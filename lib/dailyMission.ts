import type { SupabaseClient } from "@supabase/supabase-js";

export type MissionTaskType = "learn_topic" | "topic_test" | "review_weak_area";
export type MissionStatus = "pending" | "in_progress" | "completed";

export type MissionContext = {
  studentMobile: string;
  board?: string | null;
  classNumber?: number | null;
  track?: string | null;
  subjectId?: number | null;
  chapterId?: number | null;
  topicId?: number | null;
  subjectName?: string | null;
  chapterName?: string | null;
  topicName?: string | null;
};

export type MissionUpdate = {
  taskType: MissionTaskType;
  score?: number | null;
  weakArea?: string | null;
  subjectId?: number | null;
  chapterId?: number | null;
  topicId?: number | null;
  subjectName?: string | null;
  chapterName?: string | null;
  topicName?: string | null;
  eventType?: string | null;
};

function todayMissionDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function safeText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function idOrNull(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function missionStatusFromTasks(tasks: Array<{ status?: string | null }>): MissionStatus {
  const completed = tasks.filter((task) => task.status === "completed").length;
  if (completed >= 3) return "completed";
  if (completed > 0) return "in_progress";
  return "pending";
}

function buildWeakArea(row: any) {
  const score = numberOrNull(row?.last_score);
  if (typeof score === "number" && score < 80) {
    return `Review mistakes from topic ${row.topic_id}`;
  }
  if (String(row?.status || "") === "needs_revision") {
    return `Revise topic ${row.topic_id}`;
  }
  return null;
}

async function getChildContext(supabase: SupabaseClient, studentMobile: string) {
  const { data } = await supabase
    .from("children")
    .select("child_name, child_mobile, board, class_number, subject_type, track")
    .eq("child_mobile", studentMobile)
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function getLatestProgress(supabase: SupabaseClient, studentMobile: string) {
  const { data } = await supabase
    .from("topic_progress")
    .select(
      "subject_id,chapter_id,topic_id,status,last_score,last_test_at,updated_at,created_at"
    )
    .eq("student_mobile", studentMobile)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  return Array.isArray(data) ? data[0] || null : null;
}

async function getWeakProgress(supabase: SupabaseClient, studentMobile: string) {
  const { data } = await supabase
    .from("topic_progress")
    .select(
      "subject_id,chapter_id,topic_id,status,last_score,last_test_at,updated_at,created_at"
    )
    .eq("student_mobile", studentMobile)
    .or("status.eq.needs_revision,last_score.lt.80")
    .order("last_score", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  return Array.isArray(data) ? data[0] || null : null;
}

async function getTopicLabels(
  supabase: SupabaseClient,
  subjectId: number | null,
  chapterId: number | null,
  topicId: number | null
) {
  const labels = {
    subjectName: null as string | null,
    chapterName: null as string | null,
    topicName: null as string | null,
  };

  if (subjectId) {
    const { data } = await supabase
      .from("subjects")
      .select("subject_name")
      .eq("id", subjectId)
      .maybeSingle();
    labels.subjectName = safeText((data as any)?.subject_name, "") || null;
  }

  if (chapterId) {
    const { data } = await supabase
      .from("chapters")
      .select("chapter_name")
      .eq("id", chapterId)
      .maybeSingle();
    labels.chapterName = safeText((data as any)?.chapter_name, "") || null;
  }

  if (topicId) {
    const { data } = await supabase
      .from("topics")
      .select("topic_name")
      .eq("id", topicId)
      .maybeSingle();
    labels.topicName = safeText((data as any)?.topic_name, "") || null;
  }

  return labels;
}

function missionPayload(context: MissionContext, weakArea: string | null, latestScore: number | null) {
  const topicName = safeText(context.topicName, "Continue current topic");

  return {
    student_mobile: context.studentMobile,
    mission_date: todayMissionDate(),
    status: "pending" as MissionStatus,
    board: context.board || null,
    class_number: context.classNumber ?? null,
    track: safeText(context.track, "regular").toLowerCase(),
    subject_id: idOrNull(context.subjectId),
    chapter_id: idOrNull(context.chapterId),
    topic_id: idOrNull(context.topicId),
    subject_name: context.subjectName || null,
    chapter_name: context.chapterName || null,
    topic_name: topicName,
    weak_area: weakArea || "Review weak area after test",
    latest_score: latestScore,
    metadata: {
      source: context.topicId ? "context_or_history" : "safe_default",
      generatedAt: new Date().toISOString(),
    },
  };
}

function taskPayloads(missionId: string, topicName: string, weakArea: string | null) {
  return [
    {
      mission_id: missionId,
      task_type: "learn_topic",
      title: `Learn ${topicName}`,
      sort_order: 1,
    },
    {
      mission_id: missionId,
      task_type: "topic_test",
      title: "Take 5-question Topic Test",
      sort_order: 2,
    },
    {
      mission_id: missionId,
      task_type: "review_weak_area",
      title: weakArea ? `Review: ${weakArea}` : "Review weak area after test",
      sort_order: 3,
    },
  ];
}

async function readMissionWithTasks(supabase: SupabaseClient, missionId: string) {
  const [{ data: mission, error: missionError }, { data: tasks, error: tasksError }] =
    await Promise.all([
      supabase.from("daily_missions").select("*").eq("id", missionId).single(),
      supabase
        .from("daily_mission_tasks")
        .select("*")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true }),
    ]);

  if (missionError) throw missionError;
  if (tasksError) throw tasksError;

  return { mission, tasks: tasks || [] };
}

export async function getOrCreateDailyMission(
  supabase: SupabaseClient,
  context: MissionContext
) {
  const missionDate = todayMissionDate();
  const { data: existing, error: existingError } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("student_mobile", context.studentMobile)
    .eq("mission_date", missionDate)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return readMissionWithTasks(supabase, existing.id);

  const [child, weakProgress, latestProgress] = await Promise.all([
    getChildContext(supabase, context.studentMobile),
    getWeakProgress(supabase, context.studentMobile),
    getLatestProgress(supabase, context.studentMobile),
  ]);

  const source = weakProgress || latestProgress;
  const subjectId = idOrNull(context.subjectId) ?? numberOrNull(source?.subject_id);
  const chapterId = idOrNull(context.chapterId) ?? numberOrNull(source?.chapter_id);
  const topicId = idOrNull(context.topicId) ?? numberOrNull(source?.topic_id);
  const labels = await getTopicLabels(supabase, subjectId, chapterId, topicId);
  const latestScore = numberOrNull(source?.last_score);
  const weakArea = buildWeakArea(weakProgress);

  const merged: MissionContext = {
    studentMobile: context.studentMobile,
    board: context.board || child?.board || null,
    classNumber: context.classNumber ?? numberOrNull(child?.class_number),
    track: context.track || child?.subject_type || child?.track || "regular",
    subjectId,
    chapterId,
    topicId,
    subjectName: context.subjectName || labels.subjectName,
    chapterName: context.chapterName || labels.chapterName,
    topicName: context.topicName || labels.topicName,
  };

  const { data: mission, error: insertError } = await supabase
    .from("daily_missions")
    .insert(missionPayload(merged, weakArea, latestScore))
    .select("*")
    .single();

  if (insertError) throw insertError;

  const { error: taskError } = await supabase
    .from("daily_mission_tasks")
    .insert(taskPayloads(mission.id, mission.topic_name, mission.weak_area));

  if (taskError) throw taskError;

  return readMissionWithTasks(supabase, mission.id);
}

export async function completeDailyMissionTask(
  supabase: SupabaseClient,
  studentMobile: string,
  update: MissionUpdate
) {
  const { mission, tasks } = await getOrCreateDailyMission(supabase, {
    studentMobile,
    subjectId: idOrNull(update.subjectId),
    chapterId: idOrNull(update.chapterId),
    topicId: idOrNull(update.topicId),
    subjectName: update.subjectName ?? null,
    chapterName: update.chapterName ?? null,
    topicName: update.topicName ?? null,
  });

  const nowIso = new Date().toISOString();
  const task = tasks.find((item: any) => item.task_type === update.taskType);

  if (task) {
    const { error: taskError } = await supabase
      .from("daily_mission_tasks")
      .update({
        status: "completed",
        completed_at: task.completed_at || nowIso,
        updated_at: nowIso,
      })
      .eq("id", task.id);

    if (taskError) throw taskError;
  }

  const refreshedTasks = tasks.map((item: any) =>
    item.task_type === update.taskType
      ? { ...item, status: "completed", completed_at: item.completed_at || nowIso }
      : item
  );
  const nextStatus = missionStatusFromTasks(refreshedTasks);

  const missionPatch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: nowIso,
    completed_at: nextStatus === "completed" ? mission.completed_at || nowIso : null,
  };

  if (typeof update.score === "number") missionPatch.latest_score = update.score;
  if (update.weakArea) missionPatch.weak_area = update.weakArea;
  if (idOrNull(update.subjectId)) missionPatch.subject_id = idOrNull(update.subjectId);
  if (idOrNull(update.chapterId)) missionPatch.chapter_id = idOrNull(update.chapterId);
  if (idOrNull(update.topicId)) missionPatch.topic_id = idOrNull(update.topicId);
  if (update.subjectName) missionPatch.subject_name = update.subjectName;
  if (update.chapterName) missionPatch.chapter_name = update.chapterName;
  if (update.topicName) missionPatch.topic_name = update.topicName;

  const { error: missionError } = await supabase
    .from("daily_missions")
    .update(missionPatch)
    .eq("id", mission.id);

  if (missionError) throw missionError;

  await supabase.from("daily_mission_events").insert({
    mission_id: mission.id,
    student_mobile: studentMobile,
    event_type: update.eventType || `${update.taskType}_completed`,
    event_payload: update,
  });

  return readMissionWithTasks(supabase, mission.id);
}
