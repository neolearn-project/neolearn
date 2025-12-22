"use client";

type WeakTopic = {
  topic: string;
  attempts: number;
  score: number | null;
  updatedAt: string | null;
};

function scoreLabel(score: number | null) {
  if (score === null) return "No test yet";
  return `${Math.round(score)}%`;
}

function priority(score: number | null) {
  if (score === null) return "High";
  if (score < 40) return "High";
  if (score < 60) return "Medium";
  return "Low";
}

export default function WeakTopics({ items }: { items: WeakTopic[] }) {
  const list = items || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Weak topics (focus next)</div>
        <span className="text-[11px] text-gray-500">Auto-generated</span>
      </div>

      {list.length === 0 ? (
        <div className="text-sm text-gray-500">
          No weak topics found yet. Once the child takes tests, we’ll identify weak areas automatically.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Topic</th>
                <th className="text-left px-3 py-2">Last score</th>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-right px-3 py-2">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t, idx) => (
                <tr key={`${t.topic}-${idx}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{t.topic}</td>
                  <td className="px-3 py-2">{scoreLabel(t.score)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border px-2 py-0.5 text-[11px]">
                      {priority(t.score)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{t.attempts ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[11px] text-gray-500">
        Tip: If “No test yet”, ask the child to take a topic test to generate accuracy.
      </div>
    </div>
  );
}
