import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | NeoLearn",
  description:
    "Privacy Policy for NeoLearn, operated by THE NEOMIND INNOVATIONS LLP.",
  alternates: {
    canonical: "/privacy-policy",
  },
};

const sectionClass =
  "border-t border-slate-200 pt-7 first:border-0 first:pt-0";
const headingClass = "text-xl font-semibold text-slate-900";
const paragraphClass = "mt-3 leading-7 text-slate-700";
const listClass = "mt-3 list-disc space-y-2 pl-5 leading-7 text-slate-700";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-slate-200 pb-7">
          <Link
            href="/"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Back to NeoLearn
          </Link>
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-blue-700">
            THE NEOMIND INNOVATIONS LLP
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            NeoLearn Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Last updated: July 2026
          </p>
          <p className="mt-5 leading-7 text-slate-700">
            This Privacy Policy explains how THE NEOMIND INNOVATIONS LLP
            (&quot;NeoLearn,&quot; &quot;we,&quot; &quot;our,&quot; or
            &quot;us&quot;) collects, uses, shares, protects, and retains
            information when students, parents, and guardians use the NeoLearn
            application, website, and related learning services.
          </p>
        </header>

        <div className="mt-8 space-y-8">
          <section className={sectionClass}>
            <h2 className={headingClass}>1. Information We Collect</h2>
            <p className={paragraphClass}>
              The information collected depends on the account and features
              used. It may include:
            </p>
            <ul className={listClass}>
              <li>Student name and parent or guardian name, where applicable.</li>
              <li>
                Registered mobile number and other account or support contact
                details.
              </li>
              <li>
                Academic preferences and profile details, including class,
                board, subject, and preferred language.
              </li>
              <li>
                Learning progress, topic activity, test scores, and assessment
                results.
              </li>
              <li>
                Lesson, chat, and doubt-support activity generated while using
                NeoLearn.
              </li>
              <li>
                Subscription and payment status. Payment card, UPI, and banking
                credentials are processed by the payment provider and are not
                stored in full by NeoLearn.
              </li>
              <li>
                Account deletion request details, including the submitted name,
                user type, mobile number, optional email, reason, request
                status, and timestamps.
              </li>
              <li>
                Microphone audio when a user chooses to use realtime voice or
                voice-learning features.
              </li>
              <li>
                Images and files only when a user chooses to upload them for a
                learning or support feature.
              </li>
              <li>
                Basic technical and service information needed to operate,
                troubleshoot, secure, and improve the platform.
              </li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>2. How We Use Information</h2>
            <p className={paragraphClass}>We use information to:</p>
            <ul className={listClass}>
              <li>
                Provide AI-assisted lessons, voice learning, assessments, and
                doubt support.
              </li>
              <li>
                Create and manage student and parent accounts and show relevant
                learning progress.
              </li>
              <li>
                Process subscriptions and payments and maintain payment status.
              </li>
              <li>
                Send learning, payment, account, and progress updates through
                WhatsApp where applicable.
              </li>
              <li>
                Improve platform quality, reliability, learning experience, and
                safety.
              </li>
              <li>
                Respond to customer support, privacy, and account deletion
                requests.
              </li>
              <li>
                Prevent misuse, investigate technical issues, enforce applicable
                terms, and comply with legal obligations.
              </li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>
              3. Service Providers and Data Sharing
            </h2>
            <p className={paragraphClass}>
              NeoLearn may provide relevant information to service providers
              that process data to operate requested features. These providers
              include:
            </p>
            <ul className={listClass}>
              <li>
                <strong>Supabase</strong> for authentication, databases, and
                storage.
              </li>
              <li>
                <strong>Razorpay</strong> for payment and subscription
                processing.
              </li>
              <li>
                <strong>OpenAI or other AI service providers</strong> for AI
                learning, voice, doubt support, and lesson generation.
              </li>
              <li>
                <strong>WhatsApp/Meta</strong> for WhatsApp notifications and
                related communications.
              </li>
              <li>
                <strong>Vercel or another hosting provider</strong> for
                application hosting, delivery, and operational infrastructure.
              </li>
            </ul>
            <p className={paragraphClass}>
              Providers receive only information reasonably necessary for their
              service and process it under their terms and privacy practices.
              Information may also be disclosed when required by law, to
              protect users or the platform, or as part of a lawful business
              transaction with appropriate safeguards.
            </p>
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 font-semibold text-blue-900">
              NeoLearn does not sell personal data.
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>
              4. Microphone, Voice, Images, and Files
            </h2>
            <p className={paragraphClass}>
              Microphone access is used only when a user activates a voice or
              realtime learning feature and grants device permission. Uploaded
              images and files are collected only when the user actively
              selects or captures content for upload. This content may be sent
              to relevant AI, storage, or hosting providers to deliver the
              requested feature. Users can choose not to use these optional
              features.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>5. Security</h2>
            <p className={paragraphClass}>
              We use reasonable technical and organizational safeguards
              intended to protect information against unauthorized access,
              alteration, disclosure, or loss. These measures include access
              controls, server-side protections, and encrypted transport where
              supported. No online service or storage system can guarantee
              absolute security, so users should also protect their login
              credentials and devices.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>6. Data Retention</h2>
            <p className={paragraphClass}>
              We retain personal information for as long as reasonably
              necessary to provide NeoLearn, maintain an account, fulfill the
              purposes described in this policy, resolve disputes, prevent
              fraud or misuse, and comply with legal, tax, accounting, and
              regulatory obligations. Retention periods vary by data type and
              applicable requirement. When information is no longer required,
              it is deleted or de-identified where reasonably practicable.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>7. Account and Data Deletion</h2>
            <p className={paragraphClass}>
              Students and parents can request deletion of a NeoLearn account
              and associated data using the{" "}
              <Link
                href="/account-deletion"
                className="font-medium text-blue-700 hover:underline"
              >
                account deletion request page
              </Link>
              . Requests are reviewed, and NeoLearn may verify account ownership
              before processing them. Deletion may permanently remove account
              details, learning history, and related records. Some information
              may be retained when required for legal compliance, financial
              recordkeeping, fraud prevention, security, or dispute resolution.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>8. Children and Students</h2>
            <p className={paragraphClass}>
              NeoLearn is intended for school learning and may be used by
              students with parent or guardian involvement. Parents and
              guardians should help students understand appropriate platform
              use and this Privacy Policy, supervise account activity where
              appropriate, and contact us with questions about a student&apos;s
              information.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>9. User Rights and Choices</h2>
            <p className={paragraphClass}>
              Subject to applicable law and appropriate account verification,
              users or their parents or guardians may:
            </p>
            <ul className={listClass}>
              <li>Request access to relevant personal information.</li>
              <li>Request correction of inaccurate account information.</li>
              <li>Submit an account and data deletion request.</li>
              <li>
                Contact NeoLearn support with privacy questions or concerns.
              </li>
            </ul>
            <p className={paragraphClass}>
              To exercise these rights, use the account deletion page where
              applicable or email{" "}
              <a
                href="mailto:support@neolearn.co.in"
                className="font-medium text-blue-700 hover:underline"
              >
                support@neolearn.co.in
              </a>
              .
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>
              10. Google Play Data Safety Consistency
            </h2>
            <p className={paragraphClass}>
              NeoLearn&apos;s Google Play Data safety disclosures are intended
              to reflect the data practices described in this policy. Data
              collection depends on the features a user chooses to use. Voice
              audio, images, and files are collected only when the user enables
              or uses those features. Information shared with the processors
              listed above is used to provide, secure, support, and improve
              NeoLearn; it is not sold.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>11. Policy Updates</h2>
            <p className={paragraphClass}>
              We may update this Privacy Policy when NeoLearn features, legal
              requirements, or data practices change. The revised policy will
              be posted on this page with an updated date.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>12. Contact Us</h2>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 leading-7 text-slate-700">
              <p className="font-semibold text-slate-900">
                THE NEOMIND INNOVATIONS LLP
              </p>
              <p>NeoLearn Privacy Support</p>
              <p>
                Email:{" "}
                <a
                  href="mailto:support@neolearn.co.in"
                  className="font-medium text-blue-700 hover:underline"
                >
                  support@neolearn.co.in
                </a>
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
