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
} 