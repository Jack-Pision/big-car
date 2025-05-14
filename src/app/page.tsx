'use client'

import { useState, useRef } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="flex-1 flex flex-col w-full items-center justify-center">
        <h1 className="text-3xl md:text-4xl font-medium text-neutral-900 text-center mb-8 mt-12 md:mt-24 select-none">
          What can I help with?
        </h1>
      </div>
      <form
        className="w-full flex justify-center fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)] z-10"
        autoComplete="off"
        onSubmit={e => { e.preventDefault(); }}
        aria-label="Chat input form"
      >
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-[600px] mx-auto flex items-center px-4 py-2 gap-2 sm:gap-3 mb-6 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
          {/* Action buttons */}
          <button type="button" aria-label="Search" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            {/* Dummy search icon */}
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button type="button" aria-label="Reason" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            {/* Dummy reason icon */}
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/></svg>
          </button>
          <button type="button" aria-label="Deep research" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            {/* Dummy deep research icon */}
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </button>
          <button type="button" aria-label="Create image" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            {/* Dummy create image icon */}
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </button>
          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything"
            className="flex-1 bg-transparent outline-none border-none text-base text-neutral-900 placeholder-gray-400 px-2 py-2 focus:ring-0"
            aria-label="Ask anything"
          />
          {/* Send button */}
          <button
            type="submit"
            aria-label="Send"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </form>
    </div>
  );
} 