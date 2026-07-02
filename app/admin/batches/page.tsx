"use client";

import { FormEvent, useState } from "react";

type Batch = {
  id: string;
  title: string;
  subject: string;
  class_label: string;
  capacity: number;
  created_at: string;
};

export default function BatchesPage() {
  const [adminPassword, setAdminPassword] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBatches() {
    if (!adminPassword) {
      setMessage("Enter admin password.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/batches", {
        cache: "no-store",
        headers: { "x-admin-password": adminPassword },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Failed to load batches.");
      setBatches(result.data || []);
    } catch (error: any) {
      setMessage(error?.message || "Failed to load batches.");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminPassword) {
      setMessage("Enter admin password.");
      return;
    }

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          title: form.get("title"),
          subject: form.get("subject"),
          class_label: form.get("class_label"),
          capacity: Number(form.get("capacity") || 30),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Failed to create batch.");
      event.currentTarget.reset();
      await loadBatches();
    } catch (error: any) {
      setMessage(error?.message || "Failed to create batch.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteBatch(id: string) {
    if (!adminPassword) {
      setMessage("Enter admin password.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/batches", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Failed to delete batch.");
      await loadBatches();
    } catch (error: any) {
      setMessage(error?.message || "Failed to delete batch.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Batches</h1>
        <p className="text-slate-500">Create and manage class batches.</p>
      </div>

      <div className="flex gap-3">
        <input
          type="password"
          value={adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
          placeholder="Admin password"
          className="w-full max-w-sm rounded border px-3 py-2"
        />
        <button
          type="button"
          onClick={loadBatches}
          disabled={loading}
          className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <form onSubmit={createBatch} className="grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-4">
        <input name="title" placeholder="Title (e.g., MATH CLASS)" className="rounded border px-3 py-2" />
        <input name="subject" placeholder="Subject (e.g., Math)" className="rounded border px-3 py-2" />
        <input name="class_label" placeholder="Class label (e.g., 6)" className="rounded border px-3 py-2" />
        <input name="capacity" type="number" min={1} defaultValue={30} className="rounded border px-3 py-2" />
        <div className="sm:col-span-4">
          <button disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60">
            Create Batch
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-t">
                <td className="px-4 py-3">{batch.title}</td>
                <td className="px-4 py-3">{batch.subject}</td>
                <td className="px-4 py-3">{batch.class_label}</td>
                <td className="px-4 py-3">{batch.capacity}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => deleteBatch(batch.id)}
                    disabled={loading}
                    className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-60"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Enter the admin password and load batches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
