"use client";

import { useEffect, useState } from "react";

type MetricsResponse = {
  totals?: {
    leads?: number;
    students?: number;
    batches?: number;
  };
  last7days?: number;
  error?: string;
};

type AccessCheckResponse = {
  ok: boolean;
  allowed?: boolean;
  used?: number;
  limit?: number;
  globalLimit?: number;
  studentCustomLimit?: number | null;
  effectiveLimit?: number;
  overrideActive?: boolean;
  overrideReason?: string | null;
  overrideExpiresAt?: string | null;
  error?: string;
};

type PlanRow = {
  id?: number;
  code: string;
  name: string;
  track: "regular" | "competitive";
  price: number;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
};

type StudentRow = {
  id: number;
  name: string;
  mobile: string;
  userId: string | null;
  classId: string | number | null;
  board: string | null;
  used: number;
  globalLimit: number;
  studentCustomLimit: number | null;
  effectiveLimit: number;
  overrideActive: boolean;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
};

export default function Dashboard() {
  const [m, setM] = useState<MetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState("");

  const [adminPassword, setAdminPassword] = useState("");
  const [studentMobile, setStudentMobile] = useState("");
  const [globalLimit, setGlobalLimit] = useState("5");
  const [customLimit, setCustomLimit] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [checkResult, setCheckResult] = useState<AccessCheckResponse | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansMessage, setPlansMessage] = useState("");
  const [planForm, setPlanForm] = useState<PlanRow>({
    code: "",
    name: "",
    track: "regular",
    price: 399,
    validity_days: 30,
    is_active: true,
    sort_order: 1,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
const [overrideHistory, setOverrideHistory] = useState<any[]>([]);
const [overrideHistoryLoading, setOverrideHistoryLoading] = useState(false);
const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
const [subscriptionLoading, setSubscriptionLoading] = useState(false);
const [featureFlags, setFeatureFlags] = useState<Array<{ key: string; enabled: boolean }>>([]);
const [featureFlagsLoading, setFeatureFlagsLoading] = useState(false);
const [featureFlagsMessage, setFeatureFlagsMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/api/admin/metrics")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Metrics API failed (${r.status})`);
        return data;
      })
      .then((data) => {
        if (!mounted) return;
        setM(data);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setMetricsError(e?.message || "Failed to load admin metrics.");
        setM(null);
      })
      .finally(() => {
        if (!mounted) return;
        setMetricsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadPlans();
    loadStudents("");
    loadFeatureFlags();
  }, []);

  async function loadPlans() {
    setPlansLoading(true);
    setPlansMessage("");
    try {
      const res = await fetch("/api/admin/plans");
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setPlansMessage(data?.error || "Failed to load plans.");
        return;
      }
      setPlans(data.plans || []);
    } catch (e: any) {
      setPlansMessage(e?.message || "Network error.");
    } finally {
      setPlansLoading(false);
    }
  }

  async function savePlan() {
  setPlansMessage("");
  setPlansLoading(true);

  try {
    const res = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminPassword,
        code: planForm.code,
        name: planForm.name,
        track: planForm.track,
        price: Number(planForm.price),
        validityDays: Number(planForm.validity_days),
        isActive: planForm.is_active,
        sortOrder: Number(planForm.sort_order),
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.ok) {
      setPlansMessage(data?.error || "Failed to save plan.");
      return;
    }

    setPlansMessage(data?.message || "Plan saved.");
    setPlanForm({
      code: "",
      name: "",
      track: "regular",
      price: 399,
      validity_days: 30,
      is_active: true,
      sort_order: 1,
    });
    await loadPlans();
  } catch (e: any) {
    setPlansMessage(e?.message || "Network error.");
  } finally {
    setPlansLoading(false);
  }
}

  async function loadPayments() {
    if (!adminPassword) return;

    setPaymentsLoading(true);
    setPaymentsError("");

    try {
      const res = await fetch(
        `/api/admin/payment-history?adminPassword=${encodeURIComponent(adminPassword)}&limit=12`
      );
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load payment history.");
      }

      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (e: any) {
      setPaymentsError(e?.message || "Failed to load payment history.");
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function loadStudents(q: string) {
    setStudentsLoading(true);
    setStudentsError("");
    try {
      const res = await fetch(`/api/admin/students/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setStudentsError(data?.error || "Failed to search students.");
        return;
      }
      setStudents(data.students || []);
    } catch (e: any) {
      setStudentsError(e?.message || "Network error.");
    } finally {
      setStudentsLoading(false);
    }
  }

  async function runAdminAction(payload: Record<string, unknown>) {
    setActionLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/users/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword,
          ...payload,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setMessage(data?.error || "Action failed.");
        return;
      }

      setMessage(data?.message || "Action completed.");

      if (studentMobile.trim()) {
        await handleCheckAccess();
      }
      await loadStudents(searchQuery);
    } catch (e: any) {
      setMessage(e?.message || "Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckAccess() {
    const mobile = studentMobile.trim();

    if (!/^\d{10}$/.test(mobile)) {
      setMessage("Enter a valid 10-digit student mobile.");
      return;
    }

    setCheckLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/access/check?mobile=${mobile}`);
      const data = await res.json();
      setCheckResult(data);
await loadOverrideHistory(mobile);
await loadSubscriptionStatus(mobile);

      if (!res.ok || !data?.ok) {
        setMessage(data?.error || "Access check failed.");
      }
    } catch (e: any) {
      setMessage(e?.message || "Network error.");
    } finally {
      setCheckLoading(false);
    }
  }
async function loadOverrideHistory(mobile?: string) {
  setOverrideHistoryLoading(true);
  try {
    const q = mobile?.trim() ? `?mobile=${mobile.trim()}` : "";
    const res = await fetch(`/api/admin/override-history${q}`);
    const data = await res.json();
    if (res.ok && data?.ok) {
      setOverrideHistory(data.rows || []);
    }
  } finally {
    setOverrideHistoryLoading(false);
  }
}

async function loadSubscriptionStatus(mobile?: string) {
  if (!mobile?.trim()) {
    setSubscriptionStatus(null);
    return;
  }

  setSubscriptionLoading(true);
  try {
    const res = await fetch(
      `/api/admin/subscription-status?mobile=${mobile.trim()}`
    );
    const data = await res.json();
    if (res.ok && data?.ok) {
      setSubscriptionStatus(data);
    } else {
      setSubscriptionStatus(null);
    }
  } finally {
    setSubscriptionLoading(false);
  }
}

async function loadFeatureFlags() {
  setFeatureFlagsLoading(true);
  setFeatureFlagsMessage("");

  try {
    const res = await fetch("/api/admin/feature-flags");
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      setFeatureFlagsMessage(data?.error || "Failed to load feature flags.");
      return;
    }

    setFeatureFlags(data.flags || []);
  } catch (e: any) {
    setFeatureFlagsMessage(e?.message || "Network error.");
  } finally {
    setFeatureFlagsLoading(false);
  }
}

async function updateFeatureFlag(key: string, enabled: boolean) {
  setFeatureFlagsMessage("");

  try {
    const res = await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminPassword,
        key,
        enabled,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.ok) {
      setFeatureFlagsMessage(data?.error || "Failed to update feature flag.");
      return;
    }

    setFeatureFlagsMessage(data?.message || "Feature flag updated.");
    await loadFeatureFlags();
  } catch (e: any) {
    setFeatureFlagsMessage(e?.message || "Network error.");
  }
}
  const leads = m?.totals?.leads ?? 0;
  const studentsCount = m?.totals?.students ?? 0;
  const batches = m?.totals?.batches ?? 0;
  const last7days = m?.last7days ?? 0;

  return (
    <section className="container mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">
          Monitor business metrics, manage free-access policy, plans, and student access.
        </p>
      </div>

      {metricsError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Metrics unavailable right now: {metricsError}
        </div>
      ) : null}

      <div className="grid md:grid-cols-4 gap-4">
        <Stat title="Leads" value={metricsLoading ? "..." : leads} />
        <Stat title="Students" value={metricsLoading ? "..." : studentsCount} />
        <Stat title="Batches" value={metricsLoading ? "..." : batches} />
        <Stat title="Leads (7d)" value={metricsLoading ? "..." : last7days} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Student Access Control</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage default free limit, student-specific limit, and full override.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Admin Password" type="password" value={adminPassword} onChange={setAdminPassword} placeholder="Enter admin password" />
          <Field label="Student Mobile" value={studentMobile} onChange={setStudentMobile} placeholder="10-digit mobile" />
          <Field label="Global Free Limit" type="number" value={globalLimit} onChange={setGlobalLimit} placeholder="Default free limit" />
          <Field label="Student Custom Limit" type="number" value={customLimit} onChange={setCustomLimit} placeholder="Custom limit for one student" />
          <Field label="Override Reason" value={reason} onChange={setReason} placeholder="Launch support / special case" />
          <Field label="Override Expiry" type="datetime-local" value={expiresAt} onChange={setExpiresAt} placeholder="" />
        </div>

        <div className="flex flex-wrap gap-3">
          <ActionButton disabled={actionLoading} onClick={() => runAdminAction({ action: "set_global_limit", globalLimit: Number(globalLimit) })}>
            Set Global Limit
          </ActionButton>

          <ActionButton disabled={actionLoading} onClick={() => runAdminAction({ action: "set_student_limit", studentMobile: studentMobile.trim(), customLimit: Number(customLimit) })}>
            Set Student Limit
          </ActionButton>

          <ActionButton disabled={actionLoading} onClick={() => runAdminAction({ action: "clear_student_limit", studentMobile: studentMobile.trim() })} variant="secondary">
            Clear Student Limit
          </ActionButton>

          <ActionButton
            disabled={actionLoading}
            onClick={() =>
              runAdminAction({
                action: "grant",
                studentMobile: studentMobile.trim(),
                reason,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
              })
            }
            variant="success"
          >
            Grant Override
          </ActionButton>

          <ActionButton disabled={actionLoading} onClick={() => runAdminAction({ action: "revoke", studentMobile: studentMobile.trim() })} variant="danger">
            Revoke Override
          </ActionButton>

          <ActionButton disabled={checkLoading} onClick={handleCheckAccess} variant="secondary">
            Check Student Access
          </ActionButton>
        </div>

        {message ? (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
            {message}
          </div>
        ) : null}

        {checkResult?.ok ? (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="text-lg font-semibold mb-4">Access Summary</h3>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniStat title="Allowed" value={String(checkResult.allowed)} />
              <MiniStat title="Used" value={checkResult.used ?? "-"} />
              <MiniStat title="Limit" value={checkResult.limit ?? "-"} />
              <MiniStat title="Global Limit" value={checkResult.globalLimit ?? "-"} />
              <MiniStat
                title="Student Custom Limit"
                value={
                  checkResult.studentCustomLimit === null || checkResult.studentCustomLimit === undefined
                    ? "-"
                    : checkResult.studentCustomLimit
                }
              />
              <MiniStat title="Effective Limit" value={checkResult.effectiveLimit ?? "-"} />
              <MiniStat title="Override Active" value={String(checkResult.overrideActive)} />
              <MiniStat title="Override Reason" value={checkResult.overrideReason || "-"} />
            </div>

            {checkResult.overrideExpiresAt ? (
              <p className="text-sm text-gray-600 mt-4">
                Override expires at: {checkResult.overrideExpiresAt}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Package / Fees Panel</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add and update pricing plans that will be shown after free access ends.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Plan Code" value={planForm.code} onChange={(v) => setPlanForm((p) => ({ ...p, code: v }))} placeholder="REGULAR_MONTHLY" />
          <Field label="Plan Name" value={planForm.name} onChange={(v) => setPlanForm((p) => ({ ...p, name: v }))} placeholder="Regular Monthly" />
          <SelectField
            label="Track"
            value={planForm.track}
            onChange={(v) => setPlanForm((p) => ({ ...p, track: v as "regular" | "competitive" }))}
            options={[
              { label: "Regular", value: "regular" },
              { label: "Competitive", value: "competitive" },
            ]}
          />
          <Field label="Price" type="number" value={String(planForm.price)} onChange={(v) => setPlanForm((p) => ({ ...p, price: Number(v || 0) }))} placeholder="399" />
          <Field
            label="Validity Days"
            type="number"
            value={String(planForm.validity_days)}
            onChange={(v) => setPlanForm((p) => ({ ...p, validity_days: Number(v || 0) }))}
            placeholder="30"
          />
          <Field
            label="Sort Order"
            type="number"
            value={String(planForm.sort_order)}
            onChange={(v) => setPlanForm((p) => ({ ...p, sort_order: Number(v || 0) }))}
            placeholder="1"
          />
        </div>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={planForm.is_active}
            onChange={(e) => setPlanForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Plan is active</span>
        </label>

        <div className="flex flex-wrap gap-3">
          <ActionButton disabled={plansLoading} onClick={savePlan}>
            Save Plan
          </ActionButton>

          <ActionButton
            disabled={plansLoading}
            onClick={() =>
              setPlanForm({
                code: "",
                name: "",
                track: "regular",
                price: 399,
                validity_days: 30,
                is_active: true,
                sort_order: 1,
              })
            }
            variant="secondary"
          >
            Clear Form
          </ActionButton>
        </div>

        {plansMessage ? (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
            {plansMessage}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Validity</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Order</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.code} className="border-t border-gray-200 text-sm">
                  <td className="px-4 py-3 font-medium">{plan.code}</td>
                  <td className="px-4 py-3">{plan.name}</td>
                  <td className="px-4 py-3 capitalize">{plan.track}</td>
                  <td className="px-4 py-3">â‚¹{plan.price}</td>
                  <td className="px-4 py-3">{plan.validity_days} days</td>
                  <td className="px-4 py-3">{plan.is_active ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{plan.sort_order}</td>
                </tr>
              ))}
              {!plans.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-gray-500" colSpan={7}>
                    No plans found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Student Search Table</h2>
          <p className="text-sm text-gray-500 mt-1">
            Search students and view access, override, and free-limit summary quickly.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, mobile, or user ID"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <ActionButton disabled={studentsLoading} onClick={() => loadStudents(searchQuery)}>
            Search
          </ActionButton>
        </div>

        {studentsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {studentsError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Board</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Global</th>
                <th className="px-4 py-3">Custom</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3">Override</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-t border-gray-200 text-sm">
                  <td className="px-4 py-3 font-medium">{student.name}</td>
                  <td className="px-4 py-3">{student.mobile}</td>
                  <td className="px-4 py-3">{student.userId || "-"}</td>
                  <td className="px-4 py-3">{student.classId || "-"}</td>
                  <td className="px-4 py-3">{student.board || "-"}</td>
                  <td className="px-4 py-3">{student.used}</td>
                  <td className="px-4 py-3">{student.globalLimit}</td>
                  <td className="px-4 py-3">{student.studentCustomLimit ?? "-"}</td>
                  <td className="px-4 py-3">{student.effectiveLimit}</td>
                  <td className="px-4 py-3">{student.overrideActive ? "Active" : "No"}</td>
                </tr>
              ))}
              {!students.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-gray-500" colSpan={10}>
                    No students found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
  <div>
    <h2 className="text-xl font-semibold">Override History</h2>
    <p className="text-sm text-gray-500 mt-1">
      Recent grant/revoke actions for this student or across the system.
    </p>
  </div>

  {overrideHistoryLoading ? (
    <div className="text-sm text-gray-500">Loading override history...</div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50">
          <tr className="text-left text-sm text-gray-600">
            <th className="px-4 py-3">Student Mobile</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Expiry</th>
            <th className="px-4 py-3">Admin</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {overrideHistory.map((row) => (
            <tr key={row.id} className="border-t border-gray-200 text-sm">
              <td className="px-4 py-3">{row.student_mobile}</td>
              <td className="px-4 py-3 capitalize">{row.action}</td>
              <td className="px-4 py-3">{row.reason || "-"}</td>
              <td className="px-4 py-3">{row.expires_at || "-"}</td>
              <td className="px-4 py-3">{row.admin_actor || "-"}</td>
              <td className="px-4 py-3">{row.created_at || "-"}</td>
            </tr>
          ))}
          {!overrideHistory.length ? (
            <tr>
              <td className="px-4 py-6 text-sm text-gray-500" colSpan={6}>
                No override history found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )}
</div>

<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
  <div>
    <h2 className="text-xl font-semibold">Global Feature Control</h2>
    <p className="text-sm text-gray-500 mt-1">
      Enable or disable important NeoLearn features globally for all students.
    </p>
  </div>

  {featureFlagsMessage ? (
    <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
      {featureFlagsMessage}
    </div>
  ) : null}

  {featureFlagsLoading ? (
    <div className="text-sm text-gray-500">Loading feature flags...</div>
  ) : (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {featureFlags.map((flag) => (
        <div
          key={flag.key}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-sm font-semibold text-gray-800 break-words">
              {flag.key}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {flag.enabled ? "Enabled" : "Disabled"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateFeatureFlag(flag.key, !flag.enabled)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              flag.enabled
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {flag.enabled ? "Turn Off" : "Turn On"}
          </button>
        </div>
      ))}
    </div>
  )}
</div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
  <div>
    <h2 className="text-xl font-semibold">Subscription Status Card</h2>
    <p className="text-sm text-gray-500 mt-1">
      Shows current plan, payment status, expiry date, and days remaining.
    </p>
  </div>

  {subscriptionLoading ? (
    <div className="text-sm text-gray-500">Loading subscription status...</div>
  ) : !subscriptionStatus?.hasSubscription ? (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
      No active subscription found for this student.
    </div>
  ) : (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MiniStat title="Plan Code" value={subscriptionStatus.subscription?.plan_code || "-"} />
      <MiniStat title="Payment Status" value={subscriptionStatus.subscription?.payment_status || "-"} />
      <MiniStat title="Active" value={String(subscriptionStatus.subscription?.is_active ?? false)} />
      <MiniStat title="Days Left" value={subscriptionStatus.subscription?.daysLeft ?? 0} />
      <MiniStat title="Start At" value={subscriptionStatus.subscription?.start_at || "-"} />
      <MiniStat title="End At" value={subscriptionStatus.subscription?.end_at || "-"} />
      <MiniStat title="Expired" value={String(subscriptionStatus.subscription?.expired ?? false)} />
      <MiniStat title="Student Mobile" value={subscriptionStatus.subscription?.student_mobile || "-"} />
    </div>
  )}
</div>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="text-lg font-semibold mt-2 break-words">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "success" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${styles[variant]} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}






