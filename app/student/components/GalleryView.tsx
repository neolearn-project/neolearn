'use client';

import React from "react";
import type { StoredSession } from "../types";

export default function GalleryView({
  sessions,
  selectedId,
  setSelectedId,
}: {
  sessions: StoredSession[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  // TODO: Move actual GalleryView UI from page.tsx here
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold mb-1">Gallery</h1>
      <div className="text-xs text-gray-500">Stub: paste GalleryView implementation here.</div>
    </div>
  );
}


