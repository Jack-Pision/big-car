"use client";
import { useState } from "react";

const SYSTEM_PROMPT = `You are a friendly, knowledgeable AI tutor that helps students with their studies. You can answer questions, explain concepts, solve math problems step by step, assist with research, and provide clear, concise, and engaging academic help across all subjects.

Always use a friendly and encouraging tone. Tailor your answers to the student's level of understanding—ask clarifying questions if needed. For math problems, always show detailed steps. For essays or writing help, explain grammar and structure.

If the question is vague, ask for clarification.
If code is involved, explain it clearly with proper formatting and plain language.
Keep your tone warm, helpful, and curious—like a supportive teacher or study partner.

You are optimized to help with:

Math (from basic arithmetic to advanced topics like calculus and linear algebra)

Science (physics, chemistry, biology)

Computer science (coding, algorithms, theory)

Writing (essays, grammar, research papers)

History, literature, philosophy

Study tips and learning strategies

Research assistance, including citations

If a visual or diagram would help, mention that a visual explanation might be useful.
If something can't be answered, admit it honestly and suggest how to find the answer.`;

function cleanAIResponse(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [showHeading, setShowHeading] = useState(true);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    if (showHeading) setShowHeading(false);
    const userMsg = { role: "user" as const, content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    try {
      const res = await fetch("/api/nvidia-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
          userMsg
        ] }),
      });
      const data = await res.json();
      const aiMsg = {
        role: "assistant" as const,
        content: data.choices?.[0]?.message?.content || "No response",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, content: "Error: " + (err?.message || String(err)) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Centered Heading with fade-out */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        <div
          className={`absolute left-0 right-0 flex flex-col items-center transition-opacity duration-700 ${
            showHeading && messages.length === 0 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <h1 className="text-4xl font-semibold text-gray-800 text-center">
            Seek and You'll find
          </h1>
        </div>
        {/* Conversation */}
        <div className="w-full max-w-xl mx-auto flex flex-col gap-4 items-center justify-center z-10">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-5 py-3 rounded-2xl shadow ${
                msg.role === "user"
                  ? "bg-black text-white self-end"
                  : "bg-gray-100 text-gray-900 self-start"
              } max-w-[80%] text-lg`}
              style={{ wordBreak: "break-word" }}
            >
              {msg.role === "assistant" ? cleanAIResponse(msg.content) : msg.content}
            </div>
          ))}
        </div>
      </div>
      {/* Floating Input Card */}
      <div className="w-full flex justify-center pb-8">
        <form
          className="w-full max-w-2xl flex items-center gap-2 bg-white rounded-2xl shadow-lg px-6 py-4 mx-4"
          style={{ boxShadow: "0 4px 32px 0 rgba(0,0,0,0.08)" }}
          onSubmit={handleSend}
        >
          {/* Icons */}
          <button type="button" className="p-2 rounded-full hover:bg-gray-100">
            <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100">
            <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100">
            <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100">
            <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="12.5" r="1.5" />
              <path d="M21 15l-5-5L5 19" />
            </svg>
          </button>
          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-[2] min-w-0 border-none outline-none bg-transparent px-4 text-gray-700 text-lg placeholder-gray-400"
            placeholder="Ask anything"
            disabled={loading}
          />
          {/* Send Button */}
          <button
            type="submit"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-900 transition"
            disabled={loading || !input.trim()}
          >
            <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
} 