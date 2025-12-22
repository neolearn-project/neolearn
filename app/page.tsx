"use client";

import { useState } from "react";
import Image from "next/image";

import LeadForm from "../components/LeadForm";
import ChatWidget from "../components/ChatWidget";
import TeacherBot from "./components/TeacherBot";
import AuthModal from "./components/AuthModal";

const WP = process.env.NEXT_PUBLIC_WHATSAPP || "918000000000";

export default function Page() {
  const [authOpen, setAuthOpen] = useState<null | "login" | "signup">(null);

  return (
    <div>
      {/* HERO */}
      <section className="container pt-12 pb-10">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-5">
              <Image
                src="/neolearn-logo.png"
                width={350}
                height={50}
                alt="NeoLearn – The Future of Learning"
              />
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
              <button
                className="btn btn-ghost"
                onClick={() => setAuthOpen("login")}
              >
                Login
              </button>

              <button
                className="btn btn-primary"
                onClick={() => setAuthOpen("signup")}
              >
                Sign up (Free Trial)
              </button>

              <a
                href={`https://wa.me/${WP}`}
                className="btn btn-ghost"
                target="_blank"
                rel="noreferrer"
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

      {/* 3 CARDS */}
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

      {/* DEMO (keep for now) */}
      <section id="demo" className="container pb-16">
        <div className="card">
          <h3 className="text-2xl font-bold mb-2">Book a Free Demo</h3>
          <p className="text-gray-600 mb-4">
            We’ll confirm on WhatsApp shortly.
          </p>
          <LeadForm />
        </div>
      </section>

      {/* TEACHER PREVIEW */}
      <section className="container pb-16">
        <div className="card">
          <h3 className="text-2xl font-bold mb-2">Try NeoLearn Maths Teacher</h3>
          <p className="text-gray-600 mb-4">
            Preview mode. For full classroom, tests, audio lessons and weekly
            parent reports, please sign up.
          </p>

          <button
            className="btn btn-primary mb-4"
            onClick={() => setAuthOpen("signup")}
          >
            Start Free Trial
          </button>

          <TeacherBot />
        </div>
      </section>

      {/* FOOTER */}
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

      {/* AUTH MODAL */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(null)} />

      <ChatWidget />
    </div>
  );
}
