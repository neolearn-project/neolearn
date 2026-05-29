"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import ChatWidget from "../components/ChatWidget";
import AuthModal from "./components/AuthModal";

const WP = process.env.NEXT_PUBLIC_WHATSAPP || "918000000000";

export default function Page() {
  const [authOpen, setAuthOpen] = useState<null | "login" | "signup">(null);

  return (
    <div className="flex min-h-screen flex-col bg-[#f0f2f5]">
      <header className="w-full">
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/neolearn-logo.png"
                width={180}
                height={40}
                alt="NeoLearn"
                priority
              />
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href="/parent/login"
                className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Parent Login
              </Link>

              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Pricing
              </Link>

              <a
                href={`https://wa.me/${WP}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex-grow max-w-6xl px-4 pb-10 pt-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <section className="order-2 lg:order-1">
            <h1 className="text-[clamp(28px,5vw,44px)] font-semibold leading-tight text-gray-900">
              AI Teachers for Every Child,{" "}
              <span className="text-blue-600">Anytime</span>.
            </h1>

            <p className="mt-4 max-w-xl text-[15px] leading-6 text-gray-600">
              NeoLearn gives your child a personal AI teacher — lessons, doubt
              solving, and weekly progress reports.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Learn</div>
                <div className="mt-1 text-sm text-gray-600">
                  Short lessons & concepts.
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Practice</div>
                <div className="mt-1 text-sm text-gray-600">
                  Quizzes with hints.
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Track</div>
                <div className="mt-1 text-sm text-gray-600">
                  Weekly progress report.
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 sm:hidden">
              <Link
                href="/parent/login"
                className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Parent Login
              </Link>

              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Pricing
              </Link>

              <a
                href={`https://wa.me/${WP}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Chat on WhatsApp
              </a>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <div className="mx-auto w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">
                  Log in to NeoLearn
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  Continue learning with your AI teacher
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAuthOpen("login")}
                className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-700"
              >
                Student Login
              </button>

              <Link
                href="/parent/login"
                className="mt-3 flex w-full items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                Parent Login
              </Link>

              <div className="mt-4 text-center text-sm text-gray-600">
                Don&apos;t have an account?
              </div>

              <button
                type="button"
                onClick={() => setAuthOpen("signup")}
                className="mt-3 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                Create new account
              </button>

              <div className="mt-4 rounded-xl bg-black/5 p-3 text-xs text-gray-700">
                ✅ <span className="font-semibold">7-Day Free Trial</span> starts
                automatically after signup. No payment required.
              </div>

              <div className="mt-4 flex items-center justify-center gap-3 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => setAuthOpen("login")}
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
                >
                  Student Login
                </button>

                <span>•</span>

                <Link
                  href="/parent/login"
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
                >
                  Parent Login
                </Link>

                <span>•</span>

                <a
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
                  href="mailto:neo.neolearn.ai@gmail.com"
                >
                  Support
                </a>
              </div>
            </div>

            <div className="mx-auto mt-4 max-w-md text-center text-xs text-gray-500">
              By continuing, you agree to our{" "}
              <Link
                href="/terms"
                className="underline underline-offset-2 hover:text-gray-700"
              >
                Terms
              </Link>{" "}
              &{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-gray-700"
              >
                Privacy Policy
              </Link>.
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-gray-600 md:flex-row md:items-center md:justify-between">
          <div>
            © {new Date().getFullYear()} NeoLearn by THE NEOMIND INNOVATIONS LLP
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/about" className="underline underline-offset-2 hover:text-gray-900">
              About
            </Link>
            <Link href="/contact" className="underline underline-offset-2 hover:text-gray-900">
              Contact
            </Link>
            <Link href="/pricing" className="underline underline-offset-2 hover:text-gray-900">
              Pricing
            </Link>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-gray-900">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-2 hover:text-gray-900">
              Terms
            </Link>
            <Link href="/refund" className="underline underline-offset-2 hover:text-gray-900">
              Refund
            </Link>
          </div>

          <div>
            Made in India •{" "}
            <a
              className="underline underline-offset-2 hover:text-gray-900"
              href="mailto:neo.neolearn.ai@gmail.com"
            >
              neo.neolearn.ai@gmail.com
            </a>
          </div>
        </div>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(null)} />
      <ChatWidget />
    </div>
  );
}
