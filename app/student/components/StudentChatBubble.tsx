export default function StudentChatBubble({
  text, author, timestamp, isError = false,
}: { text: string; author: string; timestamp: string; isError?: boolean }) {
  const teacher = author === "Teacher";
  return (
    <div className={`neo-message-row flex ${teacher ? "justify-start" : "justify-end"}`}>
      <div className={`neo-chat-bubble ${teacher ? "neo-chat-bubble-teacher" : "neo-chat-bubble-student"} ${isError ? "neo-chat-bubble-error" : ""}`}>
        <div className="neo-message-author">{teacher ? "NeO" : "You"}{teacher && <span>AI teacher</span>}</div>
        <div className="neo-message-text whitespace-pre-wrap">{text}</div>
        <div className="neo-message-time">{timestamp}</div>
      </div>
    </div>
  );
}
