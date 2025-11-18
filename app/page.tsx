import Image from "next/image";
import LeadForm from "../components/LeadForm";
import ChatWidget from "../components/ChatWidget";
import TeacherBot from "./components/TeacherBot";

const WP = process.env.NEXT_PUBLIC_WHATSAPP || "918000000000";

export default function Page() {
  return (
    <div>
      <section className="container pt-12 pb-10">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-5">
              <Image
                src="/logo.svg"
                width={220}
                height={36}
                alt="NeoLearn logo"
              />
              <span className="text-sm text-gray-600 ml-1">
                The Future of Learning
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
              AI Teachers for Every Child,{" "}
              <span className="text-blue-600">Anytime</span>.
            </h1>

            <p className="text-lg text-gray-600 mb-6">
              NeoLearn gives your child a personal AI teacher — lessons, doubt
              solving, and weekly progress reports.
            </p>

            <div className="flex gap-3">
              <a href="#demo" className="btn btn-primary">
                Book Free Demo
              </a>
              <a
                href={`https://wa.me/${WP}`}
                className="btn btn-ghost"
                target="_blank"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>

          <div className="flex-1">
            <div className="card">
              <h3 className="font-semibold mb-2">Subjects (Pilot)</h3>
              <ul className="list-disc ml-5 text-gray-700">
                <li>Class 6 Mathematics — Fractions, Decimals, Ratios</li>
                <li>Science & English — coming soon</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="container grid md:grid-cols-3 gap-4 pb-6">
        <div className="card">
          <div className="text-xl font-bold mb-1">Learn</div>
          <div className="text-gray-600">
            Short avatar videos explain each concept.
          </div>
        </div>
        <div className="card">
          <div className="text-xl font-bold mb-1">Practice</div>
          <div className="text-gray-600">
            Instant quizzes with hints and answers.
          </div>
        </div>
        <div className="card">
          <div className="text-xl font-bold mb-1">Track</div>
          <div className="text-gray-600">
            Weekly parent report with progress and focus areas.
          </div>
        </div>
      </section>

      <section id="demo" className="container pb-16">
        <div className="card">
          <h3 className="text-2xl font-bold mb-2">Book a Free Demo</h3>
          <p className="text-gray-600 mb-4">
            We’ll confirm on WhatsApp shortly.
          </p>
          <LeadForm />
        </div>
      </section>

{/* NEW: Teacher Bot section */}
      <section className="container pb-16">
        <div className="card">
          <h3 className="text-2xl font-bold mb-2">Try NeoLearn Maths Teacher</h3>
          <p className="text-gray-600 mb-4">
            This is an early preview of our AI Teacher for Class 6 Mathematics.
          </p>
          <TeacherBot />
        </div>
      </section>


      <footer className="bg-white border-t">
        <div className="container py-6 text-sm text-gray-600 flex items-center justify-between">
          <div>© {new Date().getFullYear()} NeoLearn</div>
          <div>
            Made in India •{" "}
            <a className="underline" href="mailto:hello@neolearn.ai">
              hello@neolearn.ai
            </a>
          </div>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}

