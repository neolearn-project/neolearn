'use client';

import React from "react";
import type { SubjectRow, WeeklyRoutine } from "../types";

export default function RoutineView({
  subjects,
  routine,
  setRoutine,
  onStartToday,
}: {
  subjects: SubjectRow[];
  routine: WeeklyRoutine;
  setRoutine: (r: WeeklyRoutine) => void;
  onStartToday: () => void;
}) {
  // TODO: Move actual RoutineView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Routine</h1>
      <div className="text-xs text-gray-500">Stub: paste RoutineView implementation here.</div>
      <button
        type="button"
        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
        onClick={onStartToday}
      >
        Start Today&apos;s Class
      </button>
    </div>
  );
}
