"use client";
import { useState } from "react";

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // No AI logic, just UI
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Centered Heading */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-semibold text-gray-800 text-center">Seek and You'll find</h1>
      </div>
      {/* Floating Input Card */}
      <div className="w-full flex justify-center pb-8">
        <form className="w-full max-w-2xl flex items-center gap-2 bg-white rounded-2xl shadow-lg px-6 py-4 mx-4" style={{ boxShadow: '0 4px 32px 0 rgba(0,0,0,0.08)' }}>
          {/* Icons */}
          <button type="button" className="p-2 rounded-full hover:bg-gray-100"><svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100"><svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100"><svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></button>
          <button type="button" className="p-2 rounded-full hover:bg-gray-100"><svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12.5" r="1.5"/><path d="M21 15l-5-5L5 19"/></svg></button>
          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 border-none outline-none bg-transparent px-4 text-gray-700 text-lg placeholder-gray-400"
            placeholder="Ask anything"
            disabled={loading}
          />
          {/* Send Button */}
          <button
            type="submit"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-900 transition"
            disabled={loading || !input.trim()}
          >
            <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
} 