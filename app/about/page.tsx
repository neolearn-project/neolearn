import { COMPANY } from "@/app/lib/company";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">About {COMPANY.brand}</h1>

        <p className="mt-6 text-slate-700 leading-7">
          {COMPANY.brand} is an AI-powered learning platform developed by{" "}
          <strong>{COMPANY.name}</strong>. Our mission is to make quality learning
          accessible, interactive, and personalized for students.
        </p>

        <p className="mt-4 text-slate-700 leading-7">
          NeoLearn provides AI teacher-led explanations, topic-wise learning,
          progress tracking, parent dashboard features, and structured syllabus-based
          learning for school students.
        </p>

        <p className="mt-4 text-slate-700 leading-7">
          The platform is currently focused on CBSE Classes 6 to 12 and supports
          student learning through digital lessons, tests, and parent monitoring.
        </p>

        <div className="mt-8 rounded-2xl bg-slate-100 p-5">
          <p><strong>Company:</strong> {COMPANY.name}</p>
          <p><strong>Brand:</strong> {COMPANY.brand}</p>
          <p><strong>Country:</strong> {COMPANY.country}</p>
          <p><strong>Support:</strong> {COMPANY.supportEmail}</p>
        </div>
      </section>
    </main>
  );
}

