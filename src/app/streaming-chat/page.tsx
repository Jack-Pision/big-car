'use client'

import { useState, useRef, useEffect, useCallback } from "react";
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { v4 as uuidv4 } from 'uuid';
import SearchPopup from '../../components/SearchPopup';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { MarkdownRenderer } from '../../utils/markdown-utils';
import { QueryContext } from '../../utils/template-utils';
import IntelligentMarkdown from '../../components/IntelligentMarkdown';
import React from 'react';

const NVIDIA_API_URL = "/api/nvidia";

// Content mode detection for intelligent streaming
enum ContentMode {
  TEXT,
  CODE_BLOCK,
  JSON_BLOCK,
  TABLE
}

// Helper functions for content mode detection
const isCodeBlockStart = (text: string): boolean => /```(?:json|javascript|typescript)?$/m.test(text);
const isCodeBlockEnd = (text: string): boolean => /```$/m.test(text);
const isJsonStart = (text: string): boolean => /^[\s]*[\[{]/m.test(text);
const isJsonEnd = (text: string, start: number): boolean => {
  const openBrackets = (text.slice(start).match(/[{[]/g) || []).length;
  const closeBrackets = (text.slice(start).match(/[}\]]/g) || []).length;
  return openBrackets > 0 && openBrackets === closeBrackets;
};
const isTableStart = (text: string): boolean => /\|[-:]+\|[-:]+\|/m.test(text);
const isTableEnd = (text: string): boolean => text.endsWith('\n') && !text.endsWith('|\n');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userQuery?: string;
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

// Add a simple cache for frequent queries
const responseCache = new Map<string, string>();

const getCachedResponse = (query: string) => {
  return responseCache.get(query);
};

const cacheResponse = (query: string, response: string) => {
  responseCache.set(query, response);
};

// Helper function to check if a string is valid JSON
function isValidJson(str: string) {
  try {
    const obj = JSON.parse(str);
    // Only treat as JSON if it's an object or array
    return typeof obj === 'object' && obj !== null;
  } catch (e) {
    return false;
  }
}

// Fix MessageComponent to add right margin to user messages and left margin to AI messages on mobile
const MessageComponent = React.memo(({ message, queryContext }: { message: Message, queryContext: QueryContext }) => {
  // Detect if the message content is JSON and render as a code block if so
  let contentToRender = message.content;
  if (isValidJson(message.content)) {
    contentToRender = '```json\n' + JSON.stringify(JSON.parse(message.content), null, 2) + '\n```';
  }
  return (
    <div className={`message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} px-0`}>
      <div className={`message-content px-4 py-3 rounded-xl overflow-hidden ${
        message.role === 'user' 
          ? 'ml-auto bg-blue-600 text-white max-w-[80%] sm:max-w-[75%] md:max-w-[70%] mr-4 sm:mr-6 md:mr-8' 
          : 'bg-gray-100 dark:bg-gray-800 max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ml-4 sm:ml-6 md:ml-8'
      }`}>
        {message.role === 'user' ? (
          <div className="whitespace-pre-wrap break-words">{contentToRender}</div>
        ) : (
          <div className="w-full markdown-body text-left flex flex-col items-start ai-response-text">
            <MarkdownRenderer 
              content={contentToRender} 
              userQuery={message.userQuery || ''} 
              context={queryContext}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default function StreamingChat() {
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
  const [currentUserQuery, setCurrentUserQuery] = useState<string>("");
  const [queryContext, setQueryContext] = useState<QueryContext>({
    conversationLength: 0,
    queryKeywords: []
  });
  // Add a new state for fade transition
  const [fadeIn, setFadeIn] = useState(true);
  // Add a buffer for chunks to reduce UI jitter
  const chunkBufferRef = useRef<string[]>([]);
  // Add debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add state for intelligent content handling
  const [currentContentMode, setCurrentContentMode] = useState<'text' | 'code' | 'json' | 'table'>('text');
  const [specialBlocks, setSpecialBlocks] = useState<{
    start: number;
    end: number;
    type: 'code' | 'json' | 'table';
    complete: boolean;
  }[]>([]);

  // Add new state for controlling the Stop button
  const [isStopActive, setIsStopActive] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamedContent]);

  // Improved typewriter effect with smoother animation and intelligent content handling
  const [displayed, setDisplayed] = useState("");
  const [contentBuffers, setContentBuffers] = useState({
    codeBlocks: [] as {start: number, end: number}[],
    jsonBlocks: [] as {start: number, end: number}[],
    tableBlocks: [] as {start: number, end: number}[]
  });
  
  // Process streamed content to identify special blocks
  const processStreamedContent = useCallback((content: string) => {
    if (!content) return;
    
    // Process content in larger chunks for better performance
    const CHUNK_SIZE = 10; // Increased chunk size
    const chunks = content.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')) || [];
    
    let currentChunk = 0;
    const animate = () => {
      if (currentChunk < chunks.length) {
        setDisplayed(prev => {
          const newContent = prev + chunks[currentChunk];
          // Process special blocks in the new content
          const codeBlockMatch = newContent.match(/```[\s\S]*?```/g);
          if (codeBlockMatch) {
            codeBlockMatch.forEach(block => {
              handleStreamingBlock({
                type: 'code',
                content: block
              });
            });
          }
          return newContent;
        });
        currentChunk++;
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [displayed]);
  
  useEffect(() => {
    if (!aiTyping) return;
    if (!streamedContent) return;
    
    // Process the content to identify special blocks
    processStreamedContent(streamedContent);
    
    let i = 0;
    setDisplayed("");
    setIsLoading(false);
    setFadeIn(true);
    
    const interval = setInterval(() => {
      const filteredDisplayed = streamedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      
      // Decide how much content to show based on current position
      const charsPerFrame = Math.max(1, Math.floor(filteredDisplayed.length / 200));
      
      // Calculate new position
      const newPosition = Math.min(i + charsPerFrame, filteredDisplayed.length);
      
      // Check if we're entering a special block
      let shouldSkipToEnd = false;
      let skipToPosition = newPosition;
      
      // Check if we're entering a code block
      for (const block of contentBuffers.codeBlocks) {
        // If the block is incomplete, don't display it at all
        if (block.end === -1) {
          if (newPosition > block.start) {
            skipToPosition = block.start;
            shouldSkipToEnd = true;
            break;
          }
        } 
        // If we're in the middle of a complete block, show the entire block at once
        else if (newPosition > block.start && i <= block.start) {
          skipToPosition = block.end;
          shouldSkipToEnd = true;
          break;
        }
      }
      
      // Check if we're entering a JSON block
      if (!shouldSkipToEnd) {
        for (const block of contentBuffers.jsonBlocks) {
          if (newPosition > block.start && i <= block.start) {
            skipToPosition = block.end;
            shouldSkipToEnd = true;
            break;
          }
        }
      }
      
      // Update position based on block skipping logic
      i = shouldSkipToEnd ? skipToPosition : newPosition;
      
      // Update displayed content
      setDisplayed(filteredDisplayed.slice(0, i));
      
      if (i >= streamedContent.length) {
        clearInterval(interval);
        
        // Use a fade transition when completing the message
        setFadeIn(false);
        
        // Short delay before moving streamed content to the message array
        setTimeout(() => {
          setAiTyping(false);
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { 
              ...prev[prev.length - 1], 
              content: streamedContent,
              userQuery: prev[prev.length - 2]?.userQuery || ''
            },
          ]);
          setStreamedContent("");
          setFadeIn(true);
        }, 150);
      }
    }, 25);
    
    return () => clearInterval(interval);
  }, [streamedContent, aiTyping, contentBuffers, processStreamedContent]);

  // Add debounced content update function to reduce state updates
  const updateStreamedContentDebounced = useCallback((newContent: string) => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set a short delay to batch updates
    debounceTimerRef.current = setTimeout(() => {
      setStreamedContent(newContent);
      debounceTimerRef.current = null;
    }, 50);
  }, []);

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
      userQuery: input.trim() // Store the user query that triggered this response
    }]);
    
    await streamAI([...messages, userMsg]);
  }

  async function streamAI(msgs: Message[]) {
    // Check if this is a follow-up question (not the first message)
    const isFollowUp = msgs.filter(m => m.role === 'user').length > 1;
    
    // Check cache first
    const cacheKey = msgs.map(m => m.content).join('|');
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      setStreamedContent(cachedResponse);
      setDisplayed(cachedResponse);
      setAiTyping(false);
      return;
    }

    setAiTyping(true);
    setStreamedContent("");
    setDisplayed("");
    let didRespond = false;
    let fullText = "";
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setIsStopActive(true);
    
    // Reset chunk buffer
    chunkBufferRef.current = [];
    
    // Optimize system prompt for faster responses
    const systemPrompt = `You are a helpful study tutor. Be concise and direct in your responses. ${isFollowUp ? 'This is a follow-up question. Answer directly without repeating previous information.' : ''}

CONVERSATION GUIDELINES:
1. Keep responses concise and to the point
2. Use bullet points for lists
3. Avoid unnecessary explanations
4. Focus on key information
5. Use markdown formatting efficiently`;

    const payload = {
      model: "deepseek-ai/deepseek-r1",
      messages: [
        { role: "system", content: systemPrompt },
        ...msgs.map(({ role, content }) => ({ role, content }))
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 1024, // Reduced from 2048 for faster responses
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
      stream: true,
      stop: ["\n\n", "Human:", "Assistant:"],
      n: 1,
    };

    try {
      const res = await fetch(NVIDIA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      if (!res.body) throw new Error("No response body from AI");
      const reader = res.body.getReader();
      let done = false;
      
      // Reduced timeout to 15s
      timeoutId = setTimeout(() => {
        if (!didRespond) {
          setError("AI did not respond. Please try again.");
          setIsLoading(false);
          setAiTyping(false);
          setStreamedContent("");
          setDisplayed("");
          setMessages((prev) => prev.slice(0, -1));
        }
      }, 15000);
      
      // Improved streaming with larger chunks
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
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
                chunkBufferRef.current.push(delta);
                
                // Process larger chunks for better performance
                if (chunkBufferRef.current.length >= 5 || done) {
                  const filteredText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                  updateStreamedContentDebounced(filteredText);
                  chunkBufferRef.current = [];
                }
              }
            } catch (err) {
              console.warn('Skipping malformed JSON chunk:', dataStr);
              continue;
            }
          }
        }
      }
      
      // Cache the successful response
      if (didRespond) {
        cacheResponse(cacheKey, fullText);
      }
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "[Response stopped by user]",
            id: uuidv4(),
            timestamp: Date.now()
          }
        ]);
      } else {
        setError("Failed to connect to AI. " + (err.message || String(err)));
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsStopActive(false);
      abortControllerRef.current = null;
      setIsLoading(false);
      setAiTyping(false);
    }
  }

  // Add stop handler function
  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  // Modify the streaming logic to handle blocks progressively
  const handleStreamingBlock = (block: { type: 'code' | 'json' | 'table', content: string }) => {
    if (block.type === 'code' || block.type === 'json') {
      setSpecialBlocks(prev => [...prev, {
        start: displayed.length,
        end: displayed.length + block.content.length,
        type: block.type,
        complete: true
      }]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white px-4 sm:px-4 md:px-8 lg:px-0" 
         style={{ 
           paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
           paddingRight: 'max(env(safe-area-inset-right), 1rem)',
           paddingBottom: 'env(safe-area-inset-bottom)'
         }}>
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
      <div className={`w-full flex justify-center items-center relative h-24 md:h-28 transition-opacity duration-500 px-4 ${hasUserMessage ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ minHeight: '4rem' }}>
        <span className="text-2xl md:text-3xl font-semibold text-neutral-700 text-center block select-none">
          Seek and You&apos;ll find
        </span>
      </div>
      {/* Chat area fills all available space, scrollbar at window edge */}
      <div className="flex-1 w-full overflow-y-auto px-4 sm:px-4 md:px-8 lg:px-0" ref={chatRef}>
        <div className="max-w-[850px] mx-auto pb-4 space-y-4">
          {messages.map((message, i) => (
            <MessageComponent 
              key={message.id} 
              message={message} 
              queryContext={queryContext}
            />
          ))}
          {/* If AI is currently typing, show the streamed content with fade effect */}
          {aiTyping && (
            <div className={`message ai-message flex justify-start px-0 transition-opacity duration-150 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
              <div className="message-content px-4 py-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ml-4 sm:ml-6 md:ml-8">
                <div className="w-full markdown-body text-left flex flex-col items-start ai-response-text">
                  <MarkdownRenderer 
                    content={displayed} 
                    userQuery={currentUserQuery} 
                    context={queryContext}
                  />
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm text-center mt-2 px-4">{error}</div>
          )}
        </div>
      </div>
      {/* Input bar fixed at bottom with responsive padding */}
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
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-[850px] mx-auto flex items-center px-4 py-2 gap-2 sm:gap-3 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
          {/* Action buttons with responsive visibility */}
          <div className="flex space-x-1 sm:space-x-2">
            <button type="button" aria-label="Search" className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
              <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button type="button" aria-label="Reason" className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20">
              <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/></svg>
            </button>
            <button type="button" aria-label="Deep research" className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 hidden sm:flex">
              <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </button>
            <button type="button" aria-label="Create image" className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 hidden md:flex">
              <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
          </div>
          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything"
            className="flex-1 bg-transparent outline-none border-none text-sm sm:text-base text-neutral-900 placeholder-gray-400 px-2 py-2 focus:ring-0"
            aria-label="Ask anything"
            disabled={isLoading || aiTyping}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend();
            }}
          />
          {/* Send/Stop button */}
          <button
            type={isStopActive ? "button" : "submit"}
            aria-label={isStopActive ? "Stop AI response" : "Send"}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
            disabled={!isStopActive && (isLoading || aiTyping || !input.trim())}
            onClick={isStopActive ? handleStop : undefined}
          >
            {isStopActive ? (
              <svg width="14" height="14" className="sm:w-[16px] sm:h-[16px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
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



