"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    pathname === href ? "text-blue-600 font-semibold" : "text-slate-600";

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem("neolearn_admin_pw");
      sessionStorage.removeItem("neolearn_admin_pw");
      document.cookie =
        "neolearn_admin_pw=; Max-Age=0; path=/; SameSite=Lax; Secure";
    } catch {}
    router.push("/admin");
  }, [router]);

  return (
    <header className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/admin" className="text-lg font-semibold text-slate-800">
          NeoLearn Admin Console
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/admin" className={isActive("/admin")}>
            Leads
          </Link>
          <Link href="/admin/batches" className={isActive("/admin/batches")}>
            Batches
          </Link>
          <Link
            href="/admin/dashboard"
            className={isActive("/admin/dashboard")}
          >
            Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
