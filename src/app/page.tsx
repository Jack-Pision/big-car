'use client'

import { useState, useRef, useEffect } from "react";
import Sidebar from '../components/Sidebar';
import HamburgerMenu from '../components/HamburgerMenu';
import { v4 as uuidv4 } from 'uuid';
import SearchPopup from '../components/SearchPopup';
import { useRouter } from 'next/navigation';

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
  const [error, setError] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Sidebar state and chat history state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<{
    id: string;
    title: string;
    timestamp: number;
    snippet: string;
    messages: Message[];
  }[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);
  const router = useRouter();

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

  // Chat management functions
  function handleNewChat() {
    const newId = uuidv4();
    const newChat = {
      id: newId,
      title: 'New Chat',
      timestamp: Date.now(),
      snippet: '',
      messages: [],
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newId);
    setSidebarOpen(false);
  }
  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setSidebarOpen(false);
  }
  function handleEditChat(id: string, newTitle: string) {
    setChats(chats => chats.map(chat => chat.id === id ? { ...chat, title: newTitle } : chat));
  }
  function handleDeleteChat(id: string) {
    setChats(chats => chats.filter(chat => chat.id !== id));
    if (activeChatId === id) setActiveChatId(chats.length > 1 ? chats[0].id : null);
  }
  function handleClearAll() {
    setChats([]);
    setActiveChatId(null);
  }

  // Determine if user has started a conversation
  const hasUserMessage = messages.some((msg) => msg.role === 'user');

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading || aiTyping) return;
    setError("");
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
    let didRespond = false;
    let fullText = "";
    let timeoutId: NodeJS.Timeout | null = null;
    const payload = {
      model: "openai/gpt-3.5-turbo",
      messages: msgs.map(({ role, content }) => ({ role, content })),
      stream: true,
    };
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.body) throw new Error("No response body from AI");
      const reader = res.body.getReader();
      let done = false;
      // Timeout fallback: 20s
      timeoutId = setTimeout(() => {
        if (!didRespond) {
          setError("AI did not respond. Please try again.");
          setIsLoading(false);
          setAiTyping(false);
          setStreamedContent("");
          setDisplayed("");
          setMessages((prev) => prev.slice(0, -1)); // Remove empty AI message
        }
      }, 20000);
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = value ? new TextDecoder().decode(value) : "";
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.replace(/^data: /, "");
          if (dataStr === "[DONE]") continue;
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              didRespond = true;
              fullText += delta;
              setStreamedContent(fullText);
            }
            if (data.error) {
              setError("Failed to connect to AI. " + (typeof data.error === "object" && data.error && "message" in data.error ? (data.error as any).message : String(data.error)));
            }
          } catch (err: any) {
            setError("Failed to connect to AI. " + (typeof err === "object" && err && "message" in err ? (err as any).message : String(err)));
          }
        }
      }
      if (!didRespond) {
        setError("AI did not respond. Please try again.");
        setIsLoading(false);
        setAiTyping(false);
        setStreamedContent("");
        setDisplayed("");
        setMessages((prev) => prev.slice(0, -1));
      }
    } catch (err: any) {
      setError("Failed to connect to AI. " + (typeof err === "object" && err && "message" in err ? (err as any).message : String(err)));
      setIsLoading(false);
      setAiTyping(false);
      setStreamedContent("");
      setDisplayed("");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-4 left-4 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        chats={chats.map(({ id, title, timestamp, messages }) => ({
          id,
          title,
          timestamp,
          snippet: messages.length > 0 ? messages[messages.length - 1].content.slice(0, 40) : '',
        }))}
        activeChatId={activeChatId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onEditChat={handleEditChat}
        onDeleteChat={handleDeleteChat}
        onClearAll={handleClearAll}
        onOpenSearch={() => setSearchPopupOpen(true)}
        onNavigateBoard={() => router.push('/board')}
      />
      {/* Welcoming message with fade-out animation */}
      <div className={`w-full flex justify-center items-center relative h-24 md:h-28 transition-opacity duration-500 ${hasUserMessage ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ minHeight: '4rem' }}>
        <span className="text-2xl md:text-3xl font-semibold text-neutral-700 text-center block select-none">
          Seek and You&apos;ll find
        </span>
      </div>
      {/* Chat area fills all available space, scrollbar at window edge */}
      <div className="flex-1 w-full overflow-y-auto" ref={chatRef}>
        <div className="max-w-[850px] mx-auto px-2 pb-4 space-y-4">
          {messages.map((msg, i) => {
            // If this is the last message and it's an empty AI message, show the animated streaming message instead
            if (
              i === messages.length - 1 &&
              msg.role === 'assistant' &&
              aiTyping &&
              !msg.content
            ) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="text-neutral-900 text-base whitespace-pre-line">{displayed}</div>
                </div>
              );
            }
            // Otherwise, render as usual
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-blue-100 text-neutral-900 rounded-xl px-4 py-2 max-w-[80%] shadow-md text-base">
                    {msg.content}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="text-neutral-900 text-base whitespace-pre-line">{msg.content}</div>
                </div>
              );
            }
          })}
          {error && (
            <div className="text-red-500 text-sm text-center mt-2">{error}</div>
          )}
        </div>
      </div>
      {/* Input bar fixed at bottom */}
      <form
        className="w-full flex justify-center fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)] z-10"
        autoComplete="off"
        onSubmit={handleSend}
        aria-label="Chat input form"
      >
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-[850px] mx-auto flex items-center px-4 py-2 gap-2 sm:gap-3 mb-6 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
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
      {/* Render SearchPopup here when searchPopupOpen is true */}
      <SearchPopup
        open={searchPopupOpen}
        chats={chats.map(({ id, title, timestamp, messages }) => ({
          id,
          title,
          timestamp,
          snippet: messages.length > 0 ? messages[messages.length - 1].content.slice(0, 40) : '',
        }))}
        onClose={() => setSearchPopupOpen(false)}
        onRename={handleEditChat}
        onDelete={handleDeleteChat}
        onSelectChat={id => {
          handleSelectChat(id);
          setSearchPopupOpen(false);
        }}
      />
    </div>
  );
} 