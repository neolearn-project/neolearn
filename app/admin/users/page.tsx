"use client";

import { useState } from "react";

export default function AdminUsersPage() {
  const [adminPassword, setAdminPassword] = useState("");
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [overrideMobile, setOverrideMobile] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideExpiresAt, setOverrideExpiresAt] = useState("");
  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [resetMode, setResetMode] = useState<"student" | "parent">("student");
  const [resetUserId, setResetUserId] = useState("");
  const [resetMobile, setResetMobile] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSearch() {
    setSearchMsg(null);
    setSearchResult(null);

    if (!adminPassword.trim()) {
      setSearchMsg("Enter admin password.");
      return;
    }

    if (!query.trim()) {
      setSearchMsg("Enter search query.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        pw: adminPassword.trim(),
      });

      const res = await fetch(`/api/admin/users/search?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Search failed.");
      }

      setSearchResult(data.results);
    } catch (e: any) {
      setSearchMsg(e?.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccess(action: "grant" | "revoke") {
    setAccessMsg(null);

    if (!adminPassword.trim()) {
      setAccessMsg("Enter admin password.");
      return;
    }

    if (!/^\d{10}$/.test(overrideMobile.trim())) {
      setAccessMsg("Enter valid 10-digit student mobile.");
      return;
    }

    setAccessLoading(true);
    try {
      const res = await fetch("/api/admin/users/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: adminPassword.trim(),
          studentMobile: overrideMobile.trim(),
          action,
          reason: overrideReason.trim(),
          expiresAt: overrideExpiresAt || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Access update failed.");
      }

      setAccessMsg(data.message || "Access updated.");
    } catch (e: any) {
      setAccessMsg(e?.message || "Access update failed.");
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleResetPassword() {
    setResetMsg(null);

    if (!adminPassword.trim()) {
      setResetMsg("Enter admin password.");
      return;
    }

    if (!resetPassword.trim() || resetPassword.trim().length < 6) {
      setResetMsg("Password must be at least 6 characters.");
      return;
    }

    if (resetMode === "student" && !resetUserId.trim()) {
      setResetMsg("Enter student user ID.");
      return;
    }

    if (resetMode === "parent" && !/^\d{10}$/.test(resetMobile.trim())) {
      setResetMsg("Enter valid parent mobile.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: adminPassword.trim(),
          mode: resetMode,
          userId: resetUserId.trim(),
          mobile: resetMobile.trim(),
          newPassword: resetPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Password reset failed.");
      }

      setResetMsg(data.message || "Password reset successful.");
    } catch (e: any) {
      setResetMsg(e?.message || "Password reset failed.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search users, grant access override, and reset passwords.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <label className="block text-sm font-medium">Admin Password</label>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="Enter admin password"
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Search User Records</h2>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search by parent mobile, student mobile, student user ID, or child name"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {searchMsg && <div className="text-sm text-red-600">{searchMsg}</div>}

        {searchResult && (
          <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs">
            {JSON.stringify(searchResult, null, 2)}
          </pre>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Access Override</h2>

        <input
          value={overrideMobile}
          onChange={(e) => setOverrideMobile(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="Student mobile"
        />

        <input
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="Reason (optional)"
        />

        <input
          type="datetime-local"
          value={overrideExpiresAt}
          onChange={(e) => setOverrideExpiresAt(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleAccess("grant")}
            disabled={accessLoading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Grant Override
          </button>

          <button
            type="button"
            onClick={() => handleAccess("revoke")}
            disabled={accessLoading}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Revoke Override
          </button>
        </div>

        {accessMsg && <div className="text-sm text-slate-700">{accessMsg}</div>}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Admin Password Reset</h2>

        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={resetMode === "student"}
              onChange={() => setResetMode("student")}
            />
            Student
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={resetMode === "parent"}
              onChange={() => setResetMode("parent")}
            />
            Parent
          </label>
        </div>

        {resetMode === "student" ? (
          <input
            value={resetUserId}
            onChange={(e) => setResetUserId(e.target.value.toLowerCase())}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Student User ID"
          />
        ) : (
          <input
            value={resetMobile}
            onChange={(e) => setResetMobile(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Parent mobile"
          />
        )}

        <input
          type="password"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="New password"
        />

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={resetLoading}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          {resetLoading ? "Updating..." : "Reset Password"}
        </button>

        {resetMsg && <div className="text-sm text-slate-700">{resetMsg}</div>}
      </div>
    </section>
  );
}