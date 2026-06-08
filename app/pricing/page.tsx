import Link from "next/link";
import { COMPANY } from "@/app/lib/company";

const STUDENT_LOGIN_URL = "https://app.neolearn.co.in/?login=student";

const plans = [
  {
    name: "Free Trial",
    price: "₹0",
    duration: "7-day trial",
    label: "Start",
    features: [
      "Limited lesson access",
      "Basic classroom access",
      "No payment required",
    ],
  },
  {
    name: "Regular Monthly",
    price: "₹499",
    duration: "30 days access",
    label: "Popular",
    features: [
      "Full AI classroom access",
      "Lesson audio support",
      "Topic tests",
      "Parent progress tracking",
    ],
  },
  {
    name: "Regular Quarterly",
    price: "₹1299",
    duration: "90 days access",
    label: "Best Value",
    features: [
      "Everything in monthly",
      "Better value for families",
      "Continuous premium access",
      "Parent dashboard included",
    ],
  },
  {
    name: "Competitive Monthly",
    price: "₹999",
    duration: "30 days access",
    label: "Competitive",
    features: [
      "Competitive exam track",
      "AI lesson support",
      "Doubt solving",
      "Premium learning access",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">
              Pricing
            </p>
            <h1 className="mt-3 text-3xl font-bold">NeoLearn Plans</h1>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              Choose a plan for full AI teacher access, lesson audio, topic tests,
              parent progress tracking, and premium learning support.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{plan.name}</h2>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">
                    {plan.label}
                  </span>
                </div>

                <div className="mt-4 text-3xl font-bold">{plan.price}</div>
                <div className="mt-1 text-sm text-slate-500">{plan.duration}</div>

                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Back to Home
            </Link>

            <Link
              href={STUDENT_LOGIN_URL}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Learning
            </Link>
          </div>

          <p className="mt-8 text-center text-xs text-slate-500">
            Payments are processed securely through Razorpay. Plans are offered by{" "}
            {COMPANY.name}.
          </p>
        </div>
      </section>
    </main>
  );
}

