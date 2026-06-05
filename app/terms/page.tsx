import { COMPANY } from "@/app/lib/company";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {COMPANY.lastUpdated}</p>

        <p className="mt-6 text-slate-700 leading-7">
          These Terms & Conditions govern the use of {COMPANY.legalBrand}. By using
          NeoLearn, users agree to these terms.
        </p>

        <h2 className="mt-8 text-xl font-semibold">1. Service</h2>
        <p className="mt-3 text-slate-700 leading-7">
          NeoLearn provides AI-assisted educational content, lesson explanations,
          topic tests, progress tracking, and parent dashboard features.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Account Responsibility</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Users are responsible for maintaining the confidentiality of login details
          and for activities performed through their account.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Educational Purpose</h2>
        <p className="mt-3 text-slate-700 leading-7">
          NeoLearn is designed to support learning. It should not be treated as a
          replacement for school, teacher guidance, official textbooks, or examination
          authority instructions.
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Subscription</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Some features may require a paid subscription. Access to paid features is
          provided as per the selected plan and payment status.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. Acceptable Use</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Users must not misuse the platform, attempt unauthorized access, copy or
          resell platform content, disrupt services, or use the platform for unlawful
          purposes.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Limitation</h2>
        <p className="mt-3 text-slate-700 leading-7">
          While we aim to provide useful and accurate learning support, AI-generated
          content may occasionally require review. Users should verify important
          academic information with official sources or teachers.
        </p>

        <h2 className="mt-8 text-xl font-semibold">7. Contact</h2>
        <p className="mt-3 text-slate-700 leading-7">
          For any terms-related query, contact us at {COMPANY.supportEmail}.
        </p>
      </section>
    </main>
  );
}

