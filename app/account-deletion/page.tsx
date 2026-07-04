import type { Metadata } from "next";
import Link from "next/link";
import DeletionRequestForm from "./DeletionRequestForm";

export const metadata: Metadata = {
  title: "Account Deletion Request | NeoLearn",
  description:
    "Request deletion of a NeoLearn student or parent account and associated data.",
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Back to NeoLearn
        </Link>

        <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            NeoLearn account support
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Request account and data deletion
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Students and parents can use this page to request deletion of their
            NeoLearn account and associated personal data. Submitting this form
            creates a request for admin review; it does not delete the account
            immediately.
          </p>

          <h2 className="mt-7 text-xl font-semibold">How the process works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-slate-700">
            <li>Submit the form using your registered account details.</li>
            <li>
              NeoLearn may contact you to verify account ownership and protect
              the account from unauthorized deletion.
            </li>
            <li>
              After verification and review, NeoLearn will process the request
              according to its privacy and legal obligations.
            </li>
          </ol>

          <h2 className="mt-7 text-xl font-semibold">
            Data covered by the request
          </h2>
          <p className="mt-3 leading-7 text-slate-700">
            A verified request may remove the account profile, learning history,
            test and progress records, and related account data. Certain records
            may be retained when required for legal compliance, financial
            recordkeeping, fraud prevention, dispute resolution, or security.
            Any retained data will be limited to those purposes.
          </p>

          <p className="mt-5 text-sm leading-6 text-slate-600">
            If you cannot use this form, email{" "}
            <a
              href="mailto:support@neolearn.co.in"
              className="font-medium text-blue-700 hover:underline"
            >
              support@neolearn.co.in
            </a>{" "}
            from your registered email address and include your user type,
            registered mobile number, and name.
          </p>
        </section>

        <DeletionRequestForm />

        <p className="mt-6 text-center text-sm text-slate-600">
          See the NeoLearn{" "}
          <Link href="/privacy" className="text-blue-700 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
