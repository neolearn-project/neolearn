"use client";

import { FormEvent, useState } from "react";

type UserType = "student" | "parent";

type FormState = {
  userType: UserType;
  mobile: string;
  email: string;
  name: string;
  reason: string;
  confirmed: boolean;
};

const initialForm: FormState = {
  userType: "student",
  mobile: "",
  email: "",
  name: "",
  reason: "",
  confirmed: false,
};

export default function DeletionRequestForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error ||
            "We could not submit your request. Please try again or contact support@neolearn.co.in."
        );
      }

      setSuccess(
        "Your account deletion request has been submitted for review. NeoLearn may contact you using your registered details to verify the request."
      );
      setForm(initialForm);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "We could not submit your request. Please contact support@neolearn.co.in."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Submit a deletion request
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Enter the details used for your NeoLearn account. Required fields are
          marked with an asterisk.
        </p>
      </div>

      <div>
        <label
          htmlFor="userType"
          className="mb-1.5 block text-sm font-medium text-slate-800"
        >
          User type *
        </label>
        <select
          id="userType"
          required
          value={form.userType}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              userType: event.target.value as UserType,
            }))
          }
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="student">Student</option>
          <option value="parent">Parent</option>
        </select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="mobile"
            className="mb-1.5 block text-sm font-medium text-slate-800"
          >
            Registered mobile number *
          </label>
          <input
            id="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={20}
            value={form.mobile}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                mobile: event.target.value,
              }))
            }
            placeholder="Mobile number used for NeoLearn"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-slate-800"
          >
            Registered email, if available
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="name@example.com"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-sm font-medium text-slate-800"
        >
          {form.userType === "student" ? "Student name" : "Parent name"} *
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label
          htmlFor="reason"
          className="mb-1.5 block text-sm font-medium text-slate-800"
        >
          Reason (optional)
        </label>
        <textarea
          id="reason"
          rows={4}
          maxLength={1000}
          value={form.reason}
          onChange={(event) =>
            setForm((current) => ({ ...current, reason: event.target.value }))
          }
          placeholder="You may tell us why you want the account deleted."
          className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <input
          type="checkbox"
          required
          checked={form.confirmed}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              confirmed: event.target.checked,
            }))
          }
          className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
        />
        <span>
          I understand that account deletion may permanently remove my NeoLearn
          account, learning history, subscriptions, and related data as per
          policy.
        </span>
      </label>

      <div aria-live="polite">
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
      >
        {submitting ? "Submitting request..." : "Submit deletion request"}
      </button>
    </form>
  );
}
