"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  student_name: string;
  student_class: string;
  parent_phone: string;
  source: string;
  created_at: string;
  converted_student_id?: string | null;
};

type Batch = {
  id: string;
  title: string;
  subject: string;
  class_label: string;
  schedule?: string | null;
  capacity?: number | null;
  created_at?: string;
};

export default function AdminLeads() {
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState("");

  // Create-batch modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({ title: "", subject: "", class_label: "", schedule: "", capacity: 30 });

  // Convert-lead modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");

  async function loadLeads(pwd: string) {
    try {
      const res = await fetch(`/api/admin/leads?auth=${encodeURIComponent(pwd)}`);
      if (!res.ok) throw new Error("Unauthorized or server error");
      const js = await res.json();
      setLeads(js.data || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadBatches(pwd: string) {
    const res = await fetch(`/api/admin/batches?auth=${encodeURIComponent(pwd)}`);
    if (res.ok) {
      const js = await res.json();
      setBatches(js.data || []);
    }
  }

  async function handleAuthLoad() {
    setError("");
    if (!adminPassword) return setError("Enter admin password");
    setIsAuthorized(true);
    await Promise.all([loadLeads(adminPassword), loadBatches(adminPassword)]);
  }

  async function createBatch() {
    if (!adminPassword) return setError("Unauthorized");
    const res = await fetch(`/api/admin/batches?auth=${encodeURIComponent(adminPassword)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batchForm),
    });
    const js = await res.json();
    if (!res.ok) return setError(js.error || "Batch create failed");
    setShowBatchModal(false);
    setBatchForm({ title: "", subject: "", class_label: "", schedule: "", capacity: 30 });
    await loadBatches(adminPassword);
  }

  function openConvertModal(lead: Lead) {
    setSelectedLead(lead);
    setSelectedBatchId("");
    setShowConvertModal(true);
  }

  async function convertLead() {
    if (!adminPassword || !selectedLead) return;
    const res = await fetch(`/api/admin/convert-lead?auth=${encodeURIComponent(adminPassword)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: selectedLead.id, batch_id: selectedBatchId || undefined }),
    });
    const js = await res.json();
    if (!res.ok) return setError(js.error || "Convert failed");
    setShowConvertModal(false);
    setSelectedLead(null);
    await loadLeads(adminPassword);
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      {/* Navbar */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="mx-auto flex items-center justify-between px-6 py-3 max-w-7xl">
          <div className="flex items-center space-x-3">
            <img src="/logo.svg" alt="NeoLearn" className="h-8" />
            <h1 className="text-xl font-semibold text-gray-800">NeoLearn Admin Console</h1>
          </div>
          <nav className="flex items-center space-x-6 text-sm font-medium text-gray-600">
            <a className="hover:text-blue-600">Leads</a>
            <a className="hover:text-blue-600">Dashboard</a>
            <a className="text-gray-400 cursor-not-allowed">Logout</a>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <h2 className="text-2xl font-semibold mb-2">NeoLearn Admin — Leads</h2>
          <p className="text-sm text-gray-500 mb-6">Search, convert and enroll demo requests.</p>

          {/* Auth + Actions */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="password"
              placeholder="Admin password"
              className="flex-1 px-4 py-2 border rounded-lg"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <button onClick={handleAuthLoad} className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700">
              Load
            </button>
            <button
              onClick={() => setShowBatchModal(true)}
              className="bg-gray-100 border px-5 py-2 rounded-lg hover:bg-gray-200"
              disabled={!isAuthorized}
            >
              + Create Batch
            </button>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        {/* Leads Table */}
        {isAuthorized && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-3">Created</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => (
                    <tr key={l.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-3">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="p-3">{l.student_name}</td>
                      <td className="p-3">{l.student_class}</td>
                      <td className="p-3">{l.parent_phone}</td>
                      <td className="p-3">{l.source}</td>
                      <td className="p-3">
                        {l.converted_student_id ? (
                          <span className="text-green-700 font-medium">Converted</span>
                        ) : (
                          <button
                            className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => openConvertModal(l)}
                          >
                            Convert → Student
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Create Batch</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded-lg px-3 py-2 col-span-2"
                placeholder="Title (e.g., Math Class 6 – Evening)"
                value={batchForm.title}
                onChange={(e) => setBatchForm({ ...batchForm, title: e.target.value })}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Subject (e.g., Math)"
                value={batchForm.subject}
                onChange={(e) => setBatchForm({ ...batchForm, subject: e.target.value })}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Class label (e.g., Class 6)"
                value={batchForm.class_label}
                onChange={(e) => setBatchForm({ ...batchForm, class_label: e.target.value })}
              />
              <input
                className="border rounded-lg px-3 py-2 col-span-2"
                placeholder="Schedule (e.g., Mon/Wed/Fri 6–7 PM)"
                value={batchForm.schedule}
                onChange={(e) => setBatchForm({ ...batchForm, schedule: e.target.value })}
              />
              <input
                className="border rounded-lg px-3 py-2"
                type="number"
                placeholder="Capacity"
                value={batchForm.capacity}
                onChange={(e) => setBatchForm({ ...batchForm, capacity: Number(e.target.value) })}
              />
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button className="px-4 py-2 rounded border" onClick={() => setShowBatchModal(false)}>
                Cancel
              </button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={createBatch}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Lead Modal */}
      {showConvertModal && selectedLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-3">Convert Lead → Student</h3>
            <p className="text-sm text-gray-600 mb-4">
              {selectedLead.student_name} — {selectedLead.student_class}
            </p>
            <label className="block text-sm font-medium mb-1">Enroll into batch (optional)</label>
            <select
              className="border rounded-lg w-full px-3 py-2 mb-4"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
            >
              <option value="">— Don’t enroll —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.subject}, {b.class_label})
                </option>
              ))}
            </select>

            <div className="mt-2 flex gap-2 justify-end">
              <button className="px-4 py-2 rounded border" onClick={() => setShowConvertModal(false)}>
                Cancel
              </button>
              <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={convertLead}>
                Convert
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
