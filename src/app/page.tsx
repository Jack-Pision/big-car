'use client'

import { useState, useRef, useEffect } from "react";

const OPENROUTER_API_KEY = "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";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamedContent]);

  // Typewriter effect for streamed AI response
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!aiTyping) return;
    if (!streamedContent) return;
    let i = 0;
    setDisplayed("");
    setIsLoading(false);
    const interval = setInterval(() => {
      setDisplayed(streamedContent.slice(0, i + 1));
      i++;
      if (i >= streamedContent.length) {
        clearInterval(interval);
        setAiTyping(false);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], content: streamedContent },
        ]);
        setStreamedContent("");
      }
    }, 12);
    return () => clearInterval(interval);
  }, [streamedContent, aiTyping]);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading || aiTyping) return;
    const userMsg: Message = {
      id: Date.now() + "-user",
      role: 'user',
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    // Add a placeholder for the AI message
    setMessages((prev) => [...prev, { id: Date.now() + "-ai", role: 'assistant', content: "" }]);
    await streamAI([...messages, userMsg]);
  }

  async function streamAI(msgs: Message[]) {
    setAiTyping(true);
    setStreamedContent("");
    setDisplayed("");
    const payload = {
      model: "openai/gpt-3.5-turbo",
      messages: msgs.map(({ role, content }) => ({ role, content })),
      stream: true,
    };
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    let fullText = "";
    let done = false;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunk = value ? new TextDecoder().decode(value) : "";
      // OpenRouter streams as lines of JSON
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            setStreamedContent(fullText);
          }
        } catch {}
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="flex-1 flex flex-col w-full items-center justify-center">
        <h1 className="text-3xl md:text-4xl font-medium text-neutral-900 text-center mb-8 mt-12 md:mt-24 select-none">
          What can I help with?
        </h1>
        {/* Chat area */}
        <div ref={chatRef} className="w-full max-w-[600px] flex-1 overflow-y-auto px-2 pb-4 space-y-4" style={{ minHeight: 200, maxHeight: 400 }}>
          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-blue-100 text-neutral-900 rounded-xl px-4 py-2 max-w-[80%] shadow-md text-base">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex justify-start">
                <div className="text-neutral-900 text-base whitespace-pre-line">
                  {i === messages.length - 1 && aiTyping ? displayed : msg.content}
                </div>
              </div>
            )
          )}
          {/* Streaming AI message (if not yet in messages) */}
          {aiTyping && !messages[messages.length - 1]?.content && (
            <div className="flex justify-start">
              <div className="text-neutral-900 text-base whitespace-pre-line">{displayed}</div>
            </div>
          )}
        </div>
      </div>
      <form
        className="w-full flex justify-center fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)] z-10"
        autoComplete="off"
        onSubmit={handleSend}
        aria-label="Chat input form"
      >
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-[600px] mx-auto flex items-center px-4 py-2 gap-2 sm:gap-3 mb-6 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
          {/* Action buttons */}
          <button type="button" aria-label="Search" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button type="button" aria-label="Reason" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/></svg>
          </button>
          <button type="button" aria-label="Deep research" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </button>
          <button type="button" aria-label="Create image" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
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
            disabled={isLoading || aiTyping}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend();
            }}
          />
          {/* Send button */}
          <button
            type="submit"
            aria-label="Send"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
            disabled={isLoading || aiTyping || !input.trim()}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </form>
    </div>
  );
} 