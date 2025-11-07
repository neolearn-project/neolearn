// app/admin/layout.tsx
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #eee",
          }}
        >
          <strong>NeoLearn Admin Console</strong>
          <nav style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/leads">Leads</Link>
            <Link href="/admin/batches">Batches</Link>
            <Link href="/admin/dashboard">Dashboard</Link>
            <Link href="/admin/logout" style={{ padding: "4px 10px", background: "#111827", color: "#fff", borderRadius: 6 }}>
              Logout
            </Link>
          </nav>
        </header>
        <main style={{ padding: 16 }}>{children}</main>
      </body>
    </html>
  );
}
