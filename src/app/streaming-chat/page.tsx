'use client';

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

const NVIDIA_API_URL = "/api/nvidia";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userQuery?: string;
}

export default function StreamingChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [error, setError] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const [fadeIn, setFadeIn] = useState(true);
  const chunkBufferRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ... rest of the file content ...

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 p-4">
        {/* Hamburger menu */}
        <HamburgerMenu
          open={sidebarOpen}
          onOpen={() => setSidebarOpen(true)}
        />

        {/* Search popup */}
        <SearchPopup
          open={searchPopupOpen}
          onClose={() => setSearchPopupOpen(false)}
        />

        {/* Chat container */}
        <div className="flex flex-col h-full">
          {/* Chat header */}
          <div className="flex-0 p-4 border-b border-gray-200 dark:border-gray-700">
            {/* Chat title */}
            <h1 className="text-2xl font-bold">Chat</h1>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* If AI is currently typing, show the streamed content */}
            {aiTyping && (
              <div className="message ai-message transition-opacity duration-300">
                <div className="message-content px-4 py-3 rounded-xl max-w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
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
          </div>

          {/* Input area */}
          <div className="flex-0 p-4 border-t border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500"
            />
            <button
              onClick={() => {
                // Handle send button click
              }}
              className="ml-2 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 