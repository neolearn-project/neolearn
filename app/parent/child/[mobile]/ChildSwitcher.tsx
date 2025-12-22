"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const PARENT_STORAGE_KEY = "neolearnParentMobile";

type ChildRow = {
  id: number;
  child_name: string;
  child_mobile: string;
  board: string;
  class_number: number;
};

export default function ChildSwitcher({ currentMobile }: { currentMobile: string }) {
  const router = useRouter();
  const [parentMobile, setParentMobile] = useState<string | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(PARENT_STORAGE_KEY);
    setParentMobile(stored);
  }, []);

  useEffect(() => {
    if (!parentMobile) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/parent/children?parentMobile=${encodeURIComponent(parentMobile)}`);
        const data = await res.json();
        setChildren(data?.children || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [parentMobile]);

  const current = children.find((c) => c.child_mobile === currentMobile);

  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-gray-500">Child</div>

      <select
        disabled={loading || children.length === 0}
        value={currentMobile}
        onChange={(e) => router.push(`/parent/child/${e.target.value}`)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {children.map((c) => (
          <option key={c.id} value={c.child_mobile}>
            {c.child_name} • Class {c.class_number} • {c.board}
          </option>
        ))}
      </select>

      {current && (
        <span className="text-xs text-gray-500">
          Mobile: <span className="font-mono">{current.child_mobile}</span>
        </span>
      )}
    </div>
  );
}
