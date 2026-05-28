import { COMPANY } from "@/app/lib/company";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Contact Us</h1>

        <p className="mt-6 text-slate-700 leading-7">
          For support, payment queries, account-related issues, or general enquiries,
          you may contact the NeoLearn support team.
        </p>

        <div className="mt-8 rounded-2xl bg-slate-100 p-5 space-y-2">
          <p><strong>Company:</strong> {COMPANY.name}</p>
          <p><strong>Brand:</strong> {COMPANY.brand}</p>
          <p><strong>Email:</strong> {COMPANY.supportEmail}</p>
          <p><strong>Website:</strong> {COMPANY.website}</p>
          <p><strong>Location:</strong> {COMPANY.state}, {COMPANY.country}</p>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          We generally try to respond to support requests within a reasonable time.
        </p>
      </section>
    </main>
  );
}
