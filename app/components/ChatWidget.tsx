"use client";

import { useState } from "react";

type Message = {
  from: "bot" | "user";
  text: string;
};

const FIRST_MESSAGE: Message = {
  from: "bot",
  text:
    "Hello! I am Neo, the Reception Bot at NeoLearn. Do you want information about courses, fees, or would you like to book a free demo?",
};

const OPTIONS_TEXT =
  "Please type one of these options: Courses / Fees / Demo";

export default function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([FIRST_MESSAGE]);
  const [input, setInput] = useState("");

  function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function botReply(userText: string) {
    const text = userText.trim().toLowerCase();

    if (text.includes("course")) {
      addMessage({
        from: "bot",
        text:
          "We are starting with Class 6 Mathematics. New subjects (Science and English) will be added soon.",
      });
    } else if (text.includes("fee")) {
      addMessage({
        from: "bot",
        text:
          "NeoLearn pricing will be very simple. For launch we plan a low monthly fee per student, and a free trial. For exact fees, please book a demo and we will share details on WhatsApp.",
      });
    } else if (text.includes("demo")) {
      addMessage({
        from: "bot",
        text:
          "To book a free demo, please fill the form above on this page with your child’s name, class, and your WhatsApp number. You will get a confirmation message on WhatsApp.",
      });
    } else {
      addMessage({
        from: "bot",
        text: OPTIONS_TEXT,
      });
    }
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    // user message
    addMessage({ from: "user", text: trimmed });
    setInput("");

    // bot reply
    botReply(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-80 max-w-full border rounded-xl bg-white shadow-lg flex flex-col"
      style={{ zIndex: 40 }}
    >
      <div className="px-3 py-2 border-b font-semibold text-sm">
        Neo Reception Bot
      </div>

      <div className="flex-1 max-h-72 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.from === "bot"
                ? "bg-gray-100 rounded-lg px-3 py-2 text-gray-800"
                : "bg-blue-600 text-white rounded-lg px-3 py-2 ml-auto max-w-[80%] text-right"
            }
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="flex border-t">
        <input
          className="flex-1 px-3 py-2 text-sm outline-none"
          placeholder="Type: Courses / Fees / Demo"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="px-3 text-sm font-medium text-blue-600"
          type="button"
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
