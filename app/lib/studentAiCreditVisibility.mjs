const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function credit(value) {
  const text = String(value ?? "");
  if (!/^-?(0|[1-9][0-9]{0,29})$/.test(text)) throw new Error("invalid credit value");
  return text;
}

function timestamp(value) {
  const text = String(value ?? "");
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error("invalid timestamp");
  return text;
}

function windowValue(value) {
  if (!value || typeof value !== "object" || typeof value.exceeded !== "boolean") {
    throw new Error("invalid window");
  }
  return {
    grant: credit(value.grant),
    consumed: credit(value.consumed),
    remaining: credit(value.remaining),
    exceeded: value.exceeded,
  };
}
export function studentSafeCreditReport(report, expected) {
  if (!report || report.observational_only !== true
      || report.student_id !== expected.studentId
      || report.entitlement_period_id !== expected.entitlementPeriodId
      || report.plan_code !== expected.planCode
      || timestamp(report.period_end) !== timestamp(expected.periodEnd)) {
    throw new Error("invalid report identity");
  }
  return {
    ok: true,
    available: true,
    observationalOnly: true,
    term: windowValue(report.term),
    rolling5h: windowValue(report.rolling_5h),
    rolling24h: windowValue(report.rolling_24h),
    periodEnd: timestamp(report.period_end),
    evaluatedAt: timestamp(report.evaluated_at),
  };
}

const unavailable = () => json({
  ok: true,
  available: false,
  observationalOnly: true,
  message: "AI credit reporting is not available for this account.",
});

export function createStudentAiCreditHandler({ requireStudentIdentity, now = () => new Date() }) {
  return async function GET(request) {
    try {
      const identity = await requireStudentIdentity(request);
      const studentId = String(identity?.user?.id || "").trim();
      if (!studentId || !identity?.admin) return json({ ok: false, error: "Authentication required." }, 401);

      const evaluatedAt = now().toISOString();
      const entitlementResult = await identity.admin
        .from("ai_credit_entitlement_periods")
        .select("id, plan_code, source_period_end")
        .eq("student_id", studentId)
        .lte("source_period_start", evaluatedAt)
        .gt("expires_at", evaluatedAt)
        .order("source_period_start", { ascending: false })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (entitlementResult.error || !entitlementResult.data) return unavailable();
      const entitlement = entitlementResult.data;
      const rpcResult = await identity.admin.rpc("read_ai_credit_usage_shadow", {
        p_student_id: studentId,
        p_entitlement_period_id: entitlement.id,
        p_at: evaluatedAt,
      });
      if (rpcResult.error || !rpcResult.data) return unavailable();

      return json(studentSafeCreditReport(rpcResult.data, {
        studentId,
        entitlementPeriodId: entitlement.id,
        planCode: entitlement.plan_code,
        periodEnd: entitlement.source_period_end,
      }));
    } catch (error) {
      const status = Number(error?.status) === 401 ? 401 : Number(error?.status) === 403 ? 403 : 503;
      return json({ ok: false, error: status === 401 ? "Authentication required." :
        status === 403 ? "Student access denied." : "AI credit reporting is temporarily unavailable." }, status);
    }
  };
}
