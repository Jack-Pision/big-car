'use client'

import { useState, useRef, useEffect } from "react";
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { v4 as uuidv4 } from 'uuid';
import SearchPopup from '../../components/SearchPopup';
import { useRouter } from 'next/navigation';
import { EnhancedMarkdownRenderer } from '../../components/EnhancedMarkdownRenderer';
import { QueryContext } from '../../utils/template-utils';

const NVIDIA_API_URL = "/api/nvidia";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userQuery?: string; // Store the user query that triggered this response
}

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="markdown-body-heading markdown-body-h1" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="markdown-body-heading markdown-body-h2" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="markdown-body-heading markdown-body-h3" {...props} />,
  hr: (props: React.ComponentProps<'hr'>) => <hr className="markdown-body-hr my-4 border-t-2 border-gray-200" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="markdown-body-ul ml-6 mb-2 list-disc" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="markdown-body-ol ml-6 mb-2 list-decimal" {...props} />,
  li: (props: React.ComponentProps<'li'>) => <li className="markdown-body-li mb-1" {...props} />,
};

// Helper to remove <think>...</think> blocks
function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export default function TemplatedChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [error, setError] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // New state for templating
  const [currentUserQuery, setCurrentUserQuery] = useState("");
  const [queryContext, setQueryContext] = useState<QueryContext>({
    conversationLength: 0,
    queryKeywords: []
  });
  
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
      // Remove <think>...</think> tags from the displayed content
      const filteredDisplayed = streamedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      setDisplayed(filteredDisplayed.slice(0, i + 1));
      i++;
      if (i >= streamedContent.length) {
        clearInterval(interval);
        setAiTyping(false);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { 
            ...prev[prev.length - 1], 
            content: streamedContent
            // Preserve userQuery from the previous placeholder message
          },
        ]);
        setStreamedContent("");
      }
    }, 12);
    return () => clearInterval(interval);
  }, [streamedContent, aiTyping]);

  // Debounced MathJax instant rendering for streaming output
  const mathJaxDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (mathJaxDebounceRef.current) clearTimeout(mathJaxDebounceRef.current);
    mathJaxDebounceRef.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise();
      }
    }, 200); // 200ms debounce
    return () => {
      if (mathJaxDebounceRef.current) clearTimeout(mathJaxDebounceRef.current);
    };
  }, [displayed]);

  // Chat management functions
  function handleNewChat() {
    router.push('/test'); // Redirect to default page
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
    // If no active session, create one now
    if (!activeChatId) {
      const newId = uuidv4();
      const newChat = {
        id: newId,
        title: input.trim().slice(0, 20) || 'New Chat',
        timestamp: Date.now(),
        snippet: '',
        messages: [],
      };
      setChats([newChat, ...chats]);
      setActiveChatId(newId);
    }
    
    // Extract keywords for template selection
    const keywords = input.trim().toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how', 'this', 'that', 'these', 'those', 'with', 'from', 'about'].includes(word));
    
    // Update query context
    setQueryContext({
      conversationLength: messages.length / 2, // Approximate conversation turns
      queryKeywords: keywords
    });
    
    // Save the current query for template selection
    setCurrentUserQuery(input.trim());
    
    const userMsg: Message = {
      id: Date.now() + "-user",
      role: 'user',
      content: input.trim(),
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    
    // Add a placeholder for the AI message with the userQuery
    setMessages((prev) => [...prev, { 
      id: Date.now() + "-ai", 
      role: 'assistant', 
      content: "",
      userQuery: input.trim()
    }]);
    
    await streamAI([...messages, userMsg]);
  }

  async function streamAI(msgs: Message[]) {
    setAiTyping(true);
    setStreamedContent("");
    setDisplayed("");
    let didRespond = false;
    let fullText = "";
    let timeoutId: NodeJS.Timeout | null = null;
    const systemPrompt = `You are a helpful study tutor specializing in technical subjects like Computer Engineering. Follow these strict guidelines:

RESPONSE STYLE:
1. Be extremely concise, direct, and to the point.
2. Avoid unnecessary introductions, summaries, or conclusions.
3. Deliver information in a clean, efficient manner without fluff.
4. Prefer short, punchy sentences over verbose explanations.
5. Avoid disclaimers, repetition, or restatements of what was already covered.

ANTI-REPETITION RULES:
1. Never summarize previous responses.
2. Do not restate the question in your answer.
3. Do not acknowledge your understanding of the question.
4. Avoid phrases like "As an AI" or "As mentioned earlier".
5. Do not end responses with invitations for more questions.

MARKDOWN FORMATTING GUIDELINES:
1. Structure: Always use proper markdown with clean structure.
2. Lists: 
   - For ordered lists, use the format: "1. **Item Title:** Item description..." (Number, bold title, and text on the same line).
   - For unordered lists, use "- **Item Title:** Item description..." (Dash, bold title, and text on the same line).
   - If there's no specific title for a list item, use "1. Item description..." or "- Item description...".
   - Ensure list items are single-spaced (no blank lines between items within the same list).
   - Add a blank line *before* the start of a list block and *after* the end of a list block, but not within it.
3. Headings: 
   - Use "# ", "## ", "### " etc. for headings, with a space after the #.
   - Add blank lines after all headings.
4. Emphasis:
   - Use **bold** for important terms or section titles.
   - Use *italics* sparingly for emphasis.
   - Do not put spaces inside emphasis markers (e.g., use **bold** not ** bold **).
5. Paragraphs:
   - Separate paragraphs with a single blank line.
   - Don't split paragraphs unnecessarily.
  
Your replies should have excellent markdown formatting that looks good even in plain text. Avoid extra blank lines, especially within list structures.
Example of a good list:
1. **Water Droplets:** Most clouds are made of water droplets, like the ones you see in fog, but way up high.
2. **Ice Crystals:** High up in the sky, where it's really cold, clouds can also be made of ice crystals.`;

    const payload = {
      model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      messages: [
        { role: "system", content: systemPrompt },
        ...msgs.map(({ role, content }) => ({ role, content }))
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 4096,
      presence_penalty: 0.8,  // Added to discourage repetition
      frequency_penalty: 0.5, // Added to reduce phrase repetition
      stream: false,
    };
    try {
      const res = await fetch(NVIDIA_API_URL, {
        method: "POST",
        headers: {
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
              // Remove <think>...</think> tags from the streamed content
              const filteredText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
              setStreamedContent(filteredText);
            }
            if (data.error) {
              setError("Failed to connect to AI. " + (typeof data.error === "object" && data.error && "message" in data.error ? (data.error as any).message : String(data.error)));
            }
          } catch (err: any) {
            // Skip malformed/incomplete JSON lines, but log for debugging
            if (typeof window !== 'undefined') {
              console.warn('Skipping malformed JSON chunk:', dataStr, err);
            }
            continue;
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
    <div className="min-h-screen flex flex-col bg-white px-4 sm:px-4 md:px-8 lg:px-0">
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-4 left-4 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        activeSessionId={activeChatId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectChat}
      />
      {/* Welcoming message with fade-out animation */}
      <div className={`w-full flex justify-center items-center relative h-24 md:h-28 transition-opacity duration-500 ${hasUserMessage ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ minHeight: '4rem' }}>
        <span className="text-2xl md:text-3xl font-semibold text-neutral-700 text-center block select-none">
          Seek and You&apos;ll find
        </span>
      </div>
      {/* Chat area fills all available space, scrollbar at window edge */}
      <div className="flex-1 w-full overflow-y-auto px-4 sm:px-4 md:px-8 lg:px-0" ref={chatRef}>
        <div className="max-w-[850px] mx-auto pb-4 space-y-4">
          {messages.map((message, i) => (
            <div key={message.id} className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}>
              <div className={`message-content px-4 py-3 rounded-xl max-w-full overflow-hidden ${message.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                {message.role === 'user' ? (
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                ) : (
                  <div className="w-full markdown-body text-left flex flex-col items-start ai-response-text">
                    <EnhancedMarkdownRenderer 
                      content={stripThinking(message.content)} 
                      userQuery={message.userQuery || ''} 
                      context={queryContext}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* If AI is currently typing, show the streamed content */}
          {aiTyping && (
            <div className="message ai-message">
              <div className="message-content px-4 py-3 rounded-xl max-w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                <div className="w-full markdown-body text-left flex flex-col items-start ai-response-text">
                  <EnhancedMarkdownRenderer 
                    content={stripThinking(displayed)} 
                    userQuery={currentUserQuery} 
                    context={queryContext}
                  />
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm text-center mt-2">{error}</div>
          )}
        </div>
      </div>
      {/* Input bar fixed at bottom */}
      <form
        className="w-full flex justify-center fixed bottom-0 left-0 right-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2 px-4 sm:px-4 md:px-8 lg:px-0 z-10 bg-gradient-to-t from-white via-white to-transparent"
        style={{ 
          paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right), 1rem)'
        }}
        autoComplete="off"
        onSubmit={handleSend}
        aria-label="Chat input form"
      >
        <div className="bg-white rounded-2xl shadow-lg py-2 w-full px-4 pl-4 sm:px-6 md:px-8 lg:pl-4 lg:pr-0 flex items-center gap-2 sm:gap-3 mb-6 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
          {/* Action buttons */}
          <div className="flex flex-row gap-2 items-center ml-auto pr-4">
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
          </div>
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
          {/* Plus and Send buttons go here, move all right-aligned buttons inside this div */}
          <div className="flex flex-row gap-2 items-center ml-auto pr-4">
            <button
              type="submit"
              aria-label="Send"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
              disabled={isLoading || aiTyping || !input.trim()}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
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