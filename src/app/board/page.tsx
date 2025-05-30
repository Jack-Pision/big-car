"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Split from 'react-split';
import Sidebar from '../../components/Sidebar';
import { useRouter } from 'next/navigation';
import HamburgerMenu from '../../components/HamburgerMenu';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import React, { forwardRef } from "react";

const BOARD_BG = "#FFFFFF";
const TEXT_COLOR = "#1A1A1A";
const BORDER_COLOR = "#E5E5E5";
const SHADOW = "0 4px 24px 0 rgba(0,0,0,0.08)";

const PARAGRAPH_PROMPT = `You are a writing assistant for an academic board tool. Respond ONLY in HTML. Do not include explanations or markdown.

- By default, when the user asks for a paragraph or does not specify, output only:
  - A single <h1> title
  - One <p> paragraph (10–18 sentences, one clear idea, plain formatting)
- Do not use lists, extra headings, or bold/italic. Use only <h1> and <p>.
- Do NOT use italics, <i>, or <em> tags in your response unless the user specifically requests italic formatting.
- Maintain academic and professional tone.`;

const ARTICLE_PROMPT = `You are a writing assistant for an academic board tool. Respond ONLY in HTML. Do not include explanations or markdown. Strictly follow these rules:

1. Article Structure:
   - Use <h1> for the main title
   - Use <h2> for section headings
   - Use <ul><li> for bullet points where appropriate
   - Use <b> for emphasis on key points
   - Do NOT use italics, <i>, or <em> tags in your response unless the user specifically requests italic formatting.

2. Required Sections:
   - Always include an introduction section
   - Organize main points into clear sections
   - End with a conclusion section

3. Formatting Rules:
   - Keep paragraphs concise and readable
   - Use proper spacing between sections (use <p>, <h2>, <ul>, <ol>, or <br> as needed)
   - Maintain academic and professional tone
   - Ensure logical flow between sections
   - Use bullet points for listing key ideas or examples
   - Do NOT include empty or extra bullet points at the end of lists. Never output <li></li>, <li> </li>, <li><br></li>, <ul></ul>, or <ol></ol>.
   - After a list, do NOT add an empty <li> for spacing. Instead, use <br> or start a new paragraph (<p>) for visual separation after </ul> or </ol>.
   - Never use empty <li> for spacing. If you need space after a list, use <br> or <p> only.
   - Always start a new section with a heading or paragraph, not with a list.
   - Do NOT use italics, <i>, or <em> tags in your response unless the user specifically requests italic formatting.

4. Response Format Example:
   <h1>[Title]</h1>
   <h2>Introduction</h2>
   [Introduction content]
   <h2>[Main Section 1]</h2>
   [Content with <b>key points</b>]
   <h2>[Main Section 2]</h2>
   <ul><li>Key point 1</li><li>Key point 2</li></ul>
   <br>
   <h2>Conclusion</h2>
   [Concluding thoughts]

Output should look like a polished, editable document. Do not use markdown.`;

interface ChatMessage {
  id: number;
  role: string;
  content: string;
}

const ReactQuill = dynamic(
  async () => {
    const { default: RQ } = await import('react-quill');
    return forwardRef((props: any, ref: any) => <RQ {...props} ref={ref} />);
  },
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-gray-50 animate-pulse rounded-lg">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    )
  }
);

// Add Quill modules configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, false] }],
    ['bold', 'italic'],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    ['link', 'clean'],
    ['code-block']
  ],
  clipboard: {
    matchVisual: false,
    pastePlainText: true
  },
  history: {
    delay: 2000,
    maxStack: 500,
    userOnly: true
  }
};

const quillFormats = [
  'header',
  'bold', 'italic',
  'list', 'bullet',
  'link',
  'code-block'
];

// Error Boundary Component
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    // You can log error here
    console.error("ErrorBoundary caught an error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{color: 'red', padding: 32}}>Something went wrong in the Board editor. Please refresh or contact support.</div>;
    }
    return this.props.children;
  }
}

// Enhanced post-processing utility (ChatGPT-style)
function cleanAIHtml(html: string, userInput?: string): string {
  let cleaned = html;
  // Remove empty <li>, <li> with only whitespace or <br>
  cleaned = cleaned.replace(/<li>(\s|<br\s*\/?>)*<\/li>/gi, '');
  // Remove empty <ul></ul> and <ol></ol> (with or without whitespace or <br> inside)
  cleaned = cleaned.replace(/<ul>(\s|<br\s*\/?>)*<\/ul>/gi, '');
  cleaned = cleaned.replace(/<ol>(\s|<br\s*\/?>)*<\/ol>/gi, '');
  // Remove <ul> or <ol> that only contain empty <li>
  cleaned = cleaned.replace(/<ul>(\s*<li>(\s|<br\s*\/?>)*<\/li>\s*)+<\/ul>/gi, '');
  cleaned = cleaned.replace(/<ol>(\s*<li>(\s|<br\s*\/?>)*<\/li>\s*)+<\/ol>/gi, '');
  // Remove italics unless user requested it
  if (!userInput || !/\bitalics?\b/i.test(userInput)) {
    cleaned = cleaned.replace(/<i>(.*?)<\/i>/gi, '$1');
    cleaned = cleaned.replace(/<em>(.*?)<\/em>/gi, '$1');
  }
  // Normalize multiple consecutive <br> or <p> tags
  cleaned = cleaned.replace(/(<br>\s*){2,}/gi, '<br>');
  cleaned = cleaned.replace(/(<p>\s*<\/p>\s*){2,}/gi, '<p></p>');
  // Remove <br> at the start or end of content
  cleaned = cleaned.replace(/^(<br>\s*)+/, '');
  cleaned = cleaned.replace(/(<br>\s*)+$/, '');
  return cleaned;
}

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
  const quillComponentRef = useRef<any>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleBoardSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: userMsg
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Detect if the user wants an article
    const isArticle = /\b(article|essay|write an article|write an essay|sections|introduction|conclusion)\b/i.test(userMsg);
    const systemPrompt = isArticle ? ARTICLE_PROMPT : PARAGRAPH_PROMPT;

    try {
      const payload = {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg }
        ],
        stream: false,
      };
      const res = await fetch("/api/nvidia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      let aiContent = data.choices?.[0]?.message?.content || "";
      // Clean up AI HTML output
      aiContent = cleanAIHtml(aiContent, userMsg);
      // Collapse all whitespace between tags to prevent Quill from creating empty list items
      aiContent = aiContent.replace(/>\s+</g, '><');
      if (typeof window !== 'undefined') {
        console.log('Cleaned & collapsed AI HTML:', aiContent);
      }
      // Use Quill clipboard API to convert HTML to Delta and filter out empty list items
      setTimeout(() => {
        const quill = quillComponentRef.current?.getEditor?.();
        if (quill && aiContent) {
          let delta = quill.clipboard.convert(aiContent);
          // Filter out empty list items from delta.ops
          if (Array.isArray(delta.ops)) {
            delta.ops = delta.ops.filter((op: any) => {
              if (op.insert && typeof op.insert === 'string') {
                // Remove ops that are just newlines in a list context
                if (op.attributes && (op.attributes.list === 'bullet' || op.attributes.list === 'ordered')) {
                  return op.insert.trim() !== '' && op.insert.trim() !== '\n';
                }
              }
              return true;
            });
          }
          quill.setContents(delta);
        }
      }, 0);
      
      // Add AI response to chat
      const aiMessage: ChatMessage = {
        id: Date.now(),
        role: 'assistant',
        content: aiContent
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // Update the editor content
      setSections(prev => prev.map((sec, i) => 
        i === activeSection ? aiContent : sec
      ));
    } catch (err) {
      const errorMsg = "[Error: Failed to get response from AI]";
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: errorMsg
      }]);
      setSections(prev => prev.map((sec, i) => 
        i === activeSection ? errorMsg : sec
      ));
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
    <ErrorBoundary>
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
          activeSessionId={null}
          onClose={() => setSidebarOpen(false)}
          onNewChat={() => {}}
          onSelectSession={() => {}}
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
                <div className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-auto flex items-center px-4 py-2 gap-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10 relative">
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
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30 flex-shrink-0 absolute bottom-2 right-2"
                    disabled={!input.trim()}
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </form>
            </div>
            {/* Right: Board Canvas */}
            <div className="h-full w-full flex flex-col relative bg-white" style={{ border: 'none' }}>
              <div className="flex-1 flex flex-col justify-center items-center px-16 py-12">
                <ReactQuill
                  ref={quillComponentRef}
                  theme="snow"
                  value={typeof sections[activeSection] === 'string' ? sections[activeSection] : ''}
                  onChange={(content: string) => {
                    setSections(prev => prev.map((sec, i) => 
                      i === activeSection ? content : sec
                    ));
                  }}
                  modules={{ toolbar: false }}
                  formats={quillFormats}
                  className="flex-1 w-full min-h-[400px] max-w-3xl mx-auto bg-white border-none shadow-none outline-none text-lg no-editor-border"
                  placeholder="Write something..."
                  preserveWhitespace={true}
                />
              </div>
            </div>
          </Split>
        </div>
      </motion.div>
    </ErrorBoundary>
  );
} 