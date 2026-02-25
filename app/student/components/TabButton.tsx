'use client';

import React from "react";

export default function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-left text-xs whitespace-nowrap ${
        active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
