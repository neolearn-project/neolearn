"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Download } from "lucide-react";

export default function AdminLeads() {
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "NeoLearn2025";

  const handleLoad = async () => {
    if (adminPassword !== ADMIN_PASSWORD) {
      setError("Unauthorized");
      setIsAuthorized(false);
      return;
    }
    setError("");
    setIsAuthorized(true);

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError("Failed to fetch leads.");
    } else {
      setLeads(data || []);
    }
  };

  const exportCSV = () => {
    if (!isAuthorized) return alert("Unauthorized");
    const headers = ["Created", "Student", "Class", "Phone", "Source"];
    const rows = leads.map((l) => [
      l.created_at,
      l.student_name,
      l.class,
      l.phone,
      l.source,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neolearn_leads.csv";
    a.click();
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      {/* Navbar */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="mx-auto flex items-center justify-between px-6 py-3 max-w-7xl">
          <div className="flex items-center space-x-3">
            <img src="/logo.svg" alt="NeoLearn" className="h-8" />
            <h1 className="text-xl font-semibold text-gray-800">
              NeoLearn Admin Console
            </h1>
          </div>
          <nav className="flex items-center space-x-6 text-sm font-medium text-gray-600">
            <a href="#" className="hover:text-blue-600">
              Leads
            </a>
            <a href="#" className="hover:text-blue-600">
              Dashboard
            </a>
            <a href="#" className="text-gray-400 cursor-not-allowed">
              Logout
            </a>
          </nav>
        </div>
      </header>

      {/* Page Container */}
      <section className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <h2 className="text-2xl font-semibold mb-2">
            NeoLearn Admin — Leads
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Search, filter, and export student demo requests.
          </p>

          {/* Admin Auth */}
          <div className="flex flex-wrap gap-4 mb-4">
            <input
              type="password"
              placeholder="Admin password"
              className="flex-1 px-4 py-2 border rounded-lg"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <button
              onClick={handleLoad}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
            >
              Load
            </button>
            <button
              onClick={exportCSV}
              className="bg-gray-100 border px-5 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-200"
            >
              <Download size={16} /> Export CSV
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
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3">{l.created_at?.slice(0, 10)}</td>
                      <td className="p-3">{l.student_name}</td>
                      <td className="p-3">{l.class}</td>
                      <td className="p-3">{l.phone}</td>
                      <td className="p-3">{l.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
