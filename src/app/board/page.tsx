"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Split from 'react-split';
import Sidebar from '../components/Sidebar';
import { useRouter } from 'next/navigation';

const BOARD_BG = "#FFFFFF";
const TEXT_COLOR = "#1A1A1A";
const BORDER_COLOR = "#E5E5E5";
const SHADOW = "0 4px 24px 0 rgba(0,0,0,0.08)";

interface ChatMessage {
  id: number;
  role: string;
  content: string;
}

export default function BoardPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [boardTitle, setBoardTitle] = useState("Untitled Document");
  const [editingTitle, setEditingTitle] = useState(false);
  const [boardContent, setBoardContent] = useState("");
  const [showToolbar, setShowToolbar] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: input.trim() }]);
    setInput("");
  }

  // Simple rich text formatting (bold, italic, underline, lists)
  function format(command: string, value?: string) {
    document.execCommand(command, false, value);
  }

  // Auto-save board content to localStorage
  useEffect(() => {
    localStorage.setItem("boardContent", boardContent);
    localStorage.setItem("boardTitle", boardTitle);
  }, [boardContent, boardTitle]);
  useEffect(() => {
    setBoardContent(localStorage.getItem("boardContent") || "");
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
      {/* Sidebar on the far left */}
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
      <div className="flex flex-1 h-0">
        <Split
          className="flex flex-1 h-full custom-split-gutter"
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
              className="w-full flex items-center gap-2 px-3 py-3 border-t bg-white"
              style={{ borderColor: BORDER_COLOR }}
              onSubmit={handleSend}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
                maxLength={200}
                aria-label="Chat input"
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">{input.length}/200</span>
              <button
                type="submit"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
                aria-label="Send"
                disabled={!input.trim()}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
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
              <div
                className="flex-1 px-6 py-6 outline-none min-h-0 text-base focus:outline-none w-full h-full"
                contentEditable
                suppressContentEditableWarning
                style={{ background: BOARD_BG, color: TEXT_COLOR, minHeight: 0, height: '100%' }}
                onInput={e => setBoardContent((e.target as HTMLDivElement).innerHTML)}
                dangerouslySetInnerHTML={{ __html: boardContent }}
                aria-label="Board content editor"
              />
            </div>
          </div>
        </Split>
      </div>
    </motion.div>
  );
} 