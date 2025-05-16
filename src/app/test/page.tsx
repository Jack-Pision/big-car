"use client";
import { useState } from "react";

export default function TestChat() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");
    setResponse("");
    setLoading(true);
    try {
      const res = await fetch("/api/nvidia-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [
          { role: "user", content: input.trim() }
        ] })
      });
      const data = await res.json();
      setResponse(data.choices?.[0]?.message?.content || JSON.stringify(data));
    } catch (err: any) {
      setError("Error: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-full max-w-xl p-6 bg-gray-50 rounded-lg shadow-md">
        <form onSubmit={handleSend} className="flex gap-2 mb-4">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
            placeholder="Type your message..."
            disabled={loading}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded"
            disabled={loading || !input.trim()}
          >
            {loading ? "..." : "Send"}
          </button>
        </form>
        {error && <div className="text-red-500 mb-2">{error}</div>}
        {response && <div className="whitespace-pre-line border rounded p-3 bg-white">{response}</div>}
      </div>
    </div>
  );
} 