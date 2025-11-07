"use client";
import { useState } from "react";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16 }}>
      {open ? (
        <div style={{ width: 320, height: 420 }} className="card shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="font-semibold">NeoLearn Assistant</div>
            <button onClick={() => setOpen(false)} className="btn btn-ghost">×</button>
          </div>
          <div className="p-3 text-sm text-gray-600">
            Hi! Ask anything about demo classes or schedules.
          </div>
        </div>
      ) : (
        <button className="btn btn-primary rounded-full" onClick={() => setOpen(true)}>
          Chat
        </button>
      )}
    </div>
  );
}
