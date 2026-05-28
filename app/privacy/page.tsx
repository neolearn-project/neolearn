import { COMPANY } from "@/app/lib/company";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {COMPANY.lastUpdated}</p>

        <p className="mt-6 text-slate-700 leading-7">
          This Privacy Policy explains how {COMPANY.legalBrand} collects, uses, and
          protects user information while using the NeoLearn platform.
        </p>

        <h2 className="mt-8 text-xl font-semibold">1. Information We Collect</h2>
        <p className="mt-3 text-slate-700 leading-7">
          We may collect student name, parent name, mobile number, login details,
          class, board, preferred language, learning activity, test performance,
          subscription/payment status, and support communication details.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. How We Use Information</h2>
        <p className="mt-3 text-slate-700 leading-7">
          We use the information to provide learning services, personalize lessons,
          maintain student progress, enable parent dashboard features, manage accounts,
          process subscriptions, and provide support.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Student Data</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Student learning data is used only for educational progress, analytics,
          improvement of learning experience, and parent visibility within the platform.
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Payment Data</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Payments are processed through authorized third-party payment gateways.
          NeoLearn does not store complete card, UPI, or banking credentials.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. Data Sharing</h2>
        <p className="mt-3 text-slate-700 leading-7">
          We do not sell user data. Information may be shared only with service
          providers required for platform operation, payment processing, hosting,
          analytics, security, or legal compliance.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Contact</h2>
        <p className="mt-3 text-slate-700 leading-7">
          For privacy-related queries, contact us at {COMPANY.supportEmail}.
        </p>
      </section>
    </main>
  );
}
