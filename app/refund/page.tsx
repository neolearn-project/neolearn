import { COMPANY } from "@/app/lib/company";

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Refund & Cancellation Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {COMPANY.lastUpdated}</p>

        <p className="mt-6 text-slate-700 leading-7">
          This Refund & Cancellation Policy applies to subscriptions purchased for
          {COMPANY.brand}.
        </p>

        <h2 className="mt-8 text-xl font-semibold">1. Free Trial</h2>
        <p className="mt-3 text-slate-700 leading-7">
          NeoLearn may provide free trial access or limited free usage before a paid
          subscription is required.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Paid Subscription</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Once a subscription is activated, access is provided for the selected plan
          duration.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Refund Request</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Refund requests may be reviewed on a case-by-case basis where payment was
          made by mistake, duplicate payment occurred, or access was not activated due
          to a technical issue.
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Non-Refundable Cases</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Refunds may not be applicable where the user has already used paid services,
          completed learning activity, or where the subscription period has already
          started and service access was successfully provided.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. Cancellation</h2>
        <p className="mt-3 text-slate-700 leading-7">
          Users may choose not to renew their subscription after the active plan
          period ends.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Contact</h2>
        <p className="mt-3 text-slate-700 leading-7">
          For refund or payment-related support, contact {COMPANY.supportEmail}.
        </p>
      </section>
    </main>
  );
}

