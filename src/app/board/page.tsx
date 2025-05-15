"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Split from 'react-split';
import Sidebar from '../../components/Sidebar';
import { useRouter } from 'next/navigation';
import HamburgerMenu from '../../components/HamburgerMenu';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const BOARD_BG = "#FFFFFF";
const TEXT_COLOR = "#1A1A1A";
const BORDER_COLOR = "#E5E5E5";
const SHADOW = "0 4px 24px 0 rgba(0,0,0,0.08)";
const BOARD_OPENROUTER_API_KEY = "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";
const BOARD_OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const BOARD_SYSTEM_PROMPT = `You are a writing assistant for an academic board tool. Respond ONLY in HTML. Do not include explanations or markdown. Strictly follow these rules:
- Use <h1> for the main title (big text, bold).
- Use <h2> for all subtitles/headings (medium text, bold).
- Use <ul><li> for bullet points and <ol><li> for numbered/step-by-step instructions.
- Use <b> for emphasis only within paragraphs.
- Never use plain text for headings or lists—always use the correct HTML tags.
- Maintain clean spacing between sections and paragraphs (use <br> or newlines).
- Break up long content into sections with proper headings.
- Avoid dense blocks of text; keep paragraphs short and readable.
- The tone must be academic, clear, and helpful—ideal for essays, research summaries, and structured paragraphs.
- Output should look like a polished, editable document.
`;

interface ChatMessage {
  id: number;
  role: string;
  content: string;
}

const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-50 animate-pulse rounded-lg">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
    </div>
  )
});

// Add Quill modules configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, false] }],
    ['bold', 'italic', 'underline'],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    ['link'],
    ['clean']
  ],
  clipboard: {
    matchVisual: false
  },
  history: {
    delay: 2000,
    maxStack: 500,
    userOnly: true
  }
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline',
  'list', 'bullet',
  'link'
];

export default function BoardPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [boardTitle, setBoardTitle] = useState("Untitled Document");
  const [editingTitle, setEditingTitle] = useState(false);
  const [sections, setSections] = useState<string[]>([""]);
  const [activeSection, setActiveSection] = useState(0);
  const [showToolbar, setShowToolbar] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleBoardSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    try {
      const payload = {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: BOARD_SYSTEM_PROMPT },
          { role: "user", content: userMsg }
        ],
        stream: false,
      };
      const res = await fetch(BOARD_OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${BOARD_OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const aiContent = data.choices?.[0]?.message?.content || "";
      setSections(prev => prev.map((sec, i) => i === activeSection ? aiContent : sec));
    } catch (err) {
      setSections(prev => prev.map((sec, i) => i === activeSection ? "[Error: Failed to get response from AI]" : sec));
    }
  }

  // Simple rich text formatting (bold, italic, underline, lists)
  function format(command: string, value?: string) {
    document.execCommand(command, false, value);
  }

  // Auto-save board content to localStorage
  useEffect(() => {
    localStorage.setItem("boardContent", sections.join("\n"));
    localStorage.setItem("boardTitle", boardTitle);
  }, [sections, boardTitle]);
  useEffect(() => {
    setSections(localStorage.getItem("boardContent")?.split("\n") || [""]);
    setBoardTitle(localStorage.getItem("boardTitle") || "Untitled Document");
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-row bg-white text-[#1A1A1A] h-screen"
      style={{ background: BOARD_BG, color: TEXT_COLOR }}
    >
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-4 left-4 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        chats={[]}
        activeChatId={null}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onEditChat={() => {}}
        onDeleteChat={() => {}}
        onClearAll={() => {}}
        onOpenSearch={() => {}}
        onNavigateBoard={() => router.push('/board')}
      />
      {/* Main content: Split pane (chat + editor) */}
      <div className="flex-1 h-screen flex flex-col">
        <Split
          className="flex-1 h-full custom-split-gutter"
          sizes={[30, 70]}
          minSize={[220, 320]}
          expandToMin={false}
          gutterSize={8}
          gutterAlign="center"
          snapOffset={0}
          dragInterval={1}
          direction="horizontal"
          cursor="col-resize"
          style={{ display: 'flex', flex: 1, height: '100%' }}
        >
          {/* Left: Compact Chat */}
          <div className="flex flex-col h-full min-w-[220px] max-w-[500px] bg-white border-r" style={{ borderColor: BORDER_COLOR }}>
            <div className="flex-1 overflow-y-auto px-3 pt-6 pb-2" ref={chatRef}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2`}>
                  <div
                    className={`rounded-xl px-3 py-2 text-sm shadow ${msg.role === "user" ? "bg-blue-100 text-[#1A1A1A]" : "bg-gray-100 text-[#1A1A1A]"}`}
                    style={{ maxWidth: "80%" }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            {/* Input Area at Bottom of Chat Panel */}
            <form
              className="w-full flex justify-center mt-auto mb-6 z-10"
              autoComplete="off"
              onSubmit={handleBoardSend}
              aria-label="Chat input form"
            >
              <div className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-auto flex items-center px-4 py-2 gap-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
                {/* Responsive input and send button only */}
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent outline-none border-none text-base text-neutral-900 placeholder-gray-400 px-2 py-2 focus:ring-0 min-w-0"
                  aria-label="Type a message"
                  maxLength={200}
                />
                <button
                  type="submit"
                  aria-label="Send"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30 flex-shrink-0"
                  disabled={!input.trim()}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </form>
          </div>
          {/* Right: Board Canvas */}
          <div className="flex-1 h-full w-full bg-[#F9F9F9] overflow-auto">
            <div
              className="h-full w-full bg-white rounded-2xl shadow-xl flex flex-col relative"
              style={{ boxShadow: SHADOW }}
            >
              {/* Title */}
              <div className="flex items-center border-b px-6 py-4 sticky top-0 bg-white z-10" style={{ borderColor: BORDER_COLOR }}>
                {editingTitle ? (
                  <input
                    className="text-2xl font-semibold flex-1 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black/10"
                    value={boardTitle}
                    onChange={e => setBoardTitle(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }}
                    autoFocus
                    aria-label="Board title"
                  />
                ) : (
                  <h1
                    className="text-2xl font-semibold flex-1 cursor-pointer truncate"
                    onClick={() => setEditingTitle(true)}
                    title="Click to edit title"
                  >
                    {boardTitle}
                  </h1>
                )}
              </div>
              {/* Toolbar */}
              <div className="flex gap-2 px-6 py-2 sticky top-16 bg-white z-10 border-b" style={{ borderColor: BORDER_COLOR }}>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Heading" onClick={() => format('formatBlock', 'H2')}><b>H2</b></button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Bold" onClick={() => format('bold')}><b>B</b></button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Italic" onClick={() => format('italic')}><i>I</i></button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Underline" onClick={() => format('underline')}><u>U</u></button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Bulleted List" onClick={() => format('insertUnorderedList')}>• List</button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Numbered List" onClick={() => format('insertOrderedList')}>1. List</button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Undo" onClick={() => format('undo')}>↺</button>
                <button className="px-2 py-1 rounded hover:bg-[#F5F5F5]" title="Redo" onClick={() => format('redo')}>↻</button>
              </div>
              {/* Board Content */}
              <div className="flex-1 px-6 py-6 min-h-0 w-full h-full flex flex-col">
                <ReactQuill
                  theme="snow"
                  value={sections[activeSection]}
                  onChange={(content) => {
                    setSections(prev => prev.map((sec, i) => 
                      i === activeSection ? content : sec
                    ));
                  }}
                  modules={quillModules}
                  formats={quillFormats}
                  className="flex-1 h-full"
                  placeholder="Start writing or type / for commands..."
                  preserveWhitespace={true}
                />
              </div>
            </div>
          </div>
        </Split>
      </div>
    </motion.div>
  );
} 