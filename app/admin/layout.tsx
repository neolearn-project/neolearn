// app/admin/layout.tsx
import React from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between py-3">
          <div className="font-semibold">NeoLearn Admin Console</div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/leads" className="hover:underline">
              Leads
            </Link>

            <Link href="/admin/batches" className="hover:underline">
              Batches
            </Link>

            {/* 🔹 New: AI Auto Syllabus page */}
            <Link href="/admin/syllabus" className="hover:underline">
              AI Syllabus
            </Link>

            <Link href="/admin/dashboard" className="hover:underline">
              Dashboard
            </Link>

            {/* simple “logout”: just go back to site root for now */}
            <Link
              href="/"
              className="bg-black text-white px-3 py-1 rounded-md"
            >
              Logout
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
