export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between py-3">
          <div className="font-semibold">NeoLearn Admin Console</div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/admin/leads" className="hover:underline">Leads</a>
            <a href="/admin/batches" className="hover:underline">Batches</a>
            <a href="/admin/dashboard" className="hover:underline">Dashboard</a>
            {/* simple “logout”: just go back to site root for now */}
            <a href="/" className="bg-black text-white px-3 py-1 rounded-md">Logout</a>
          </nav>
        </div>
      </header>
      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
