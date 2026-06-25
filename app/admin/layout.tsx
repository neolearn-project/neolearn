"use client";
import React from "react";
import Link from "next/link";

const VOICEDESK_DASHBOARD_URL = "https://neo-voicedesk.vercel.app/dashboard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between py-3">
          <div className="font-semibold">NeoLearn Admin Console</div>

          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/admin/leads" className="hover:underline">
              Leads
            </Link>

            <Link href="/admin/batches" className="hover:underline">
              Batches
            </Link>

            <Link href="/admin/syllabus" className="hover:underline">
              AI Syllabus
            </Link>

            <Link href="/admin/dashboard" className="hover:underline">
              Dashboard
            </Link>

            <Link href="/admin/users" className="hover:underline">
              Users
            </Link>

            <Link href="/admin/content-studio" className="hover:underline">
              Content Studio
            </Link>

            <a
              href={VOICEDESK_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              VoiceDesk Dashboard
            </a>

            <Link href="/" className="bg-black text-white px-3 py-1 rounded-md">
              Logout
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
