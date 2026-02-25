'use client';

import React from "react";
import type { WeeklyRow, DailyRow } from "../types";

export default function WeeklyProgressView({
  loading,
  error,
  rows,
  daily,
  dailyLoading,
  dailyError,
}: {
  loading: boolean;
  error: string | null;
  rows: WeeklyRow[];
  daily: DailyRow | null;
  dailyLoading: boolean;
  dailyError: string | null;
}) {
  // TODO: Move actual WeeklyProgressView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Progress</h1>
      {loading && <p className="text-xs text-gray-500">Loading weekly progress...</p>}
      {error && <p className="text-xs text-red-500">Error: {error}</p>}
      <div className="text-xs text-gray-500">Stub: paste WeeklyProgressView implementation here.</div>
    </div>
  );
}

