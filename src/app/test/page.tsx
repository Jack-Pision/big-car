"use client";
import { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { useRouter } from 'next/navigation';

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

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1
      className="ai-title text-[2.5rem] font-medium leading-tight mb-2 mt-4"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2
      className="ai-section-title text-[1.7rem] font-medium leading-snug mb-1 mt-3"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p
      className="ai-body-text text-[1.08rem] font-normal leading-relaxed mb-2"
      {...props}
    />
  ),
};

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [showHeading, setShowHeading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputBarHeight, setInputBarHeight] = useState(96); // px, default
  const BASE_HEIGHT = 48; // px (h-12)
  const MAX_HEIGHT = BASE_HEIGHT * 3; // 3x
  const EXTRA_GAP = 32; // px
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState([]); // You can implement chat history if needed
  const [activeChatId, setActiveChatId] = useState(null);
  const router = useRouter();

  // Auto-resize textarea
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT) + 'px';
    }
  }, [input]);

  // Measure input bar height dynamically
  useLayoutEffect(() => {
    if (inputBarRef.current) {
      setInputBarHeight(inputBarRef.current.offsetHeight);
    }
  }, [input]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-6 left-6 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onEditChat={() => {}}
        onDeleteChat={() => {}}
        onClearAll={() => {}}
        onOpenSearch={() => {}}
        onNavigateBoard={() => router.push('/board')}
      />
      {/* Conversation area (scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center relative"
        style={{ paddingBottom: `${inputBarHeight + EXTRA_GAP}px` }}
      >
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
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
          {messages.map((msg, i) => (
            msg.role === "assistant" ? (
              <div
                key={i}
                className="w-full markdown-body text-left"
                style={{ wordBreak: "break-word" }}
              >
                <ReactMarkdown
                  components={markdownComponents}
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                key={i}
                className="px-5 py-3 rounded-2xl shadow bg-black text-white self-end max-w-full text-lg"
                style={{ wordBreak: "break-word" }}
              >
                {msg.content}
              </div>
            )
          ))}
        </div>
      </div>
      {/* Fixed Input Bar at Bottom */}
      <div ref={inputBarRef} className="fixed left-0 right-0 bottom-0 w-full flex justify-center z-50" style={{ pointerEvents: 'auto' }}>
        <form
          className="w-full max-w-5xl flex flex-col gap-2 bg-white rounded-2xl shadow-lg px-6 py-4 mx-4 mb-4 border border-gray-300"
          style={{ boxShadow: "0 4px 32px 0 rgba(0,0,0,0.08)" }}
          onSubmit={handleSend}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full border-none outline-none bg-transparent px-4 text-gray-700 text-lg placeholder-gray-400 resize-none overflow-auto"
            placeholder="Ask anything"
            disabled={loading}
            rows={1}
            style={{height: '48px', maxHeight: '144px'}}
          />
          {/* Bottom row: icons left, send button right */}
          <div className="flex flex-row items-end justify-between w-full mt-2">
            <div className="flex flex-row gap-2">
              <button type="button" className="p-2 rounded-full border border-gray-300 hover:bg-gray-100">
                <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              <button type="button" className="p-2 rounded-full border border-gray-300 hover:bg-gray-100">
                <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <button
              type="submit"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-900 transition"
              disabled={loading || !input.trim()}
            >
              <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 