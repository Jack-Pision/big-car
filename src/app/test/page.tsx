"use client";
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import AuthProvider, { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { supabase, createSupabaseClient } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import TextReveal from '@/components/TextReveal';
import { WebSource } from '@/utils/source-utils/index';
import { v4 as uuidv4 } from 'uuid';
import EmptyBox from '@/components/EmptyBox';
import WebSourcesCarousel from '../../components/WebSourcesCarousel';
import { formatMessagesForApi, enhanceSystemPrompt, buildConversationContext } from '@/utils/conversation-context';
import { Session } from '@/lib/types';
import {
  optimizedSupabaseService,
  getSessions as getSessionsFromService,
  getSessionMessages,
  saveSessionMessages,
  createNewSession,
  deleteSession,
  saveActiveSessionId,
  getActiveSessionId
} from '@/lib/optimized-supabase-service';
import { aiResponseCache, cachedAIRequest } from '@/lib/ai-response-cache';
import { SCHEMAS } from '@/lib/output-schemas';
import DynamicResponseRenderer from '@/components/DynamicResponseRenderer';
import TutorialDisplay, { TutorialData } from '@/components/TutorialDisplay';
import ComparisonDisplay, { ComparisonData } from '@/components/ComparisonDisplay';
import InformationalSummaryDisplay, { InformationalSummaryData } from '@/components/InformationalSummaryDisplay';
import ConversationDisplay from '@/components/ConversationDisplay';
import PerformanceMonitor from '@/components/PerformanceMonitor';
import { Bot, User, Paperclip, Send, XCircle, Search as SearchIcon, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Image from 'next/image';
import rehypeRaw from 'rehype-raw';
import { Message as BaseMessage } from '@/utils/conversation-context';
import Search from '@/components/Search';
import { Message as ConversationMessage } from "@/utils/conversation-context";
import { filterAIThinking } from '../../utils/content-filter';
import ThinkingButton from '@/components/ThinkingButton';
import { ArtifactViewer } from '@/components/ArtifactViewer';
import { shouldTriggerArtifact, getArtifactPrompt, artifactSchema, validateArtifactData, createFallbackArtifact, createArtifactFromRawContent, extractTitleFromContent, type ArtifactData } from '@/utils/artifact-utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  timestamp: Date;
  sources?: WebSource[];
  thinking?: string;
  artifactData?: ArtifactData;
  artifacts?: ArtifactData[];
  isThinkingVisible?: boolean;
}

interface SourceCitations {
  id: string;
  url: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
  position?: number;
}

interface RenderedSource {
  id: string;
  url: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
  position?: number;
}

interface PerformanceMetrics {
  timing: {
    scraping?: number;
    ai_thinking?: number;
    ai_response?: number;
    total?: number;
  };
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  sources_found?: number;
  cache_hit?: boolean;
}

function TestChatComponent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'chat' | 'search' | 'reasoning'>('chat');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [sources, setSources] = useState<WebSource[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastPerformanceMetrics, setLastPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactData[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [isArtifactPaneOpen, setIsArtifactPaneOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadSessions();
    loadActiveSession();
  }, [isAuthenticated]);

  const loadSessions = async () => {
    if (!isAuthenticated) return;
    try {
      const sessionList = await getSessionsFromService();
      setSessions(sessionList || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const loadActiveSession = async () => {
    if (!isAuthenticated) return;
    try {
      const activeId = await getActiveSessionId();
      if (activeId) {
        setActiveSessionId(activeId);
        await loadSessionMessages(activeId);
      }
    } catch (error) {
      console.error('Error loading active session:', error);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const sessionMessages = await getSessionMessages(sessionId);
      if (sessionMessages) {
        const convertedMessages: Message[] = sessionMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          sources: msg.sources || [],
          thinking: msg.thinking || undefined,
          artifactData: msg.artifactData || undefined,
          artifacts: msg.artifacts || [],
          isThinkingVisible: msg.isThinkingVisible || false
        }));
        setMessages(convertedMessages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading session messages:', error);
      setMessages([]);
    }
  };

  const saveCurrentSession = async () => {
    if (!isAuthenticated || !activeSessionId || messages.length === 0) return;
    
    try {
      await saveSessionMessages(activeSessionId, messages);
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const createSession = async () => {
    if (!isAuthenticated) return null;
    
    try {
      const newSession = await createNewSession('New Chat');
      if (newSession) {
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        await saveActiveSessionId(newSession.id);
        setMessages([]);
        return newSession.id;
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
    return null;
  };

  const switchSession = async (sessionId: string) => {
    if (activeSessionId && messages.length > 0) {
      await saveCurrentSession();
    }
    
    setActiveSessionId(sessionId);
    await saveActiveSessionId(sessionId);
    await loadSessionMessages(sessionId);
    setIsSidebarOpen(false);
  };

  const deleteSessionById = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (activeSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          await switchSession(remainingSessions[0].id);
        } else {
          const newSessionId = await createSession();
          if (newSessionId) {
            setActiveSessionId(newSessionId);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!input.trim() && uploadedFiles.length === 0) return;
    
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = await createSession();
      if (!currentSessionId) return;
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      sources: [],
      thinking: undefined,
      artifactData: undefined,
      artifacts: [],
      isThinkingVisible: false
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setUploadedFiles([]);
    setIsLoading(true);

    try {
      let response;
      const conversationHistory = [...messages, userMessage];
      
      if (mode === 'search') {
        response = await handleSearchRequest(input, conversationHistory);
      } else if (mode === 'reasoning') {
        response = await handleReasoningRequest(input, conversationHistory);
      } else {
        response = await handleChatRequest(input, conversationHistory);
      }

      if (response) {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: response.content || '',
          timestamp: new Date(),
          sources: response.sources || [],
          thinking: response.thinking || undefined,
          artifactData: response.artifactData || undefined,
          artifacts: response.artifacts || [],
          isThinkingVisible: false
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        if (response.sources && response.sources.length > 0) {
          setSources(response.sources);
        }
        
        if (response.performanceMetrics) {
          setLastPerformanceMetrics(response.performanceMetrics);
        }

        if (response.artifactData) {
          setArtifacts(prev => [...prev, response.artifactData]);
          setActiveArtifactId(response.artifactData.id);
          setIsArtifactPaneOpen(true);
        }

        await saveSessionMessages(currentSessionId, [...conversationHistory, assistantMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date(),
        sources: [],
        thinking: undefined,
        artifactData: undefined,
        artifacts: [],
        isThinkingVisible: false
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatRequest = async (message: string, conversationHistory: Message[]) => {
    try {
      const context = buildConversationContext(conversationHistory.slice(0, -1));
      const systemPrompt = enhanceSystemPrompt(context);
      const formattedMessages = formatMessagesForApi(conversationHistory, systemPrompt);

      const response = await fetch('/api/openrouter-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedMessages,
          model: 'anthropic/claude-3.5-sonnet',
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      let artifactData: ArtifactData | undefined;
      if (shouldTriggerArtifact(message, data.choices[0]?.message?.content || '')) {
        try {
          const artifactPrompt = getArtifactPrompt(message, data.choices[0]?.message?.content || '');
          const artifactResponse = await fetch('/api/openrouter-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: artifactPrompt }],
              model: 'anthropic/claude-3.5-sonnet',
              response_format: { type: 'json_object' },
              temperature: 0.3,
              max_tokens: 2000,
            }),
          });

          if (artifactResponse.ok) {
            const artifactData_response = await artifactResponse.json();
            const artifactContent = artifactData_response.choices[0]?.message?.content || '';
            
            try {
              const parsedArtifact = JSON.parse(artifactContent);
              if (validateArtifactData(parsedArtifact)) {
                artifactData = {
                  ...parsedArtifact,
                  id: uuidv4(),
                  createdAt: new Date().toISOString(),
                };
              }
            } catch (parseError) {
              console.warn('Failed to parse artifact JSON, creating fallback artifact');
              artifactData = createArtifactFromRawContent(artifactContent, message);
            }
          }
        } catch (artifactError) {
          console.warn('Failed to generate artifact, continuing without it:', artifactError);
        }
      }

      return {
        content: data.choices[0]?.message?.content || '',
        sources: [],
        thinking: undefined,
        artifactData,
        artifacts: artifactData ? [artifactData] : [],
        performanceMetrics: data.usage ? {
          tokens: {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens
          },
          timing: {},
          cache_hit: false
        } : undefined
      };
    } catch (error) {
      console.error('Chat request error:', error);
      throw error;
    }
  };

  const handleSearchRequest = async (query: string, conversationHistory: Message[]) => {
    try {
      const response = await fetch('/api/serper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query,
          conversationHistory: conversationHistory.slice(0, -1)
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        content: data.content || '',
        sources: data.sources || [],
        thinking: data.thinking || undefined,
        performanceMetrics: data.performanceMetrics || undefined
      };
    } catch (error) {
      console.error('Search request error:', error);
      throw error;
    }
  };

  const handleReasoningRequest = async (query: string, conversationHistory: Message[]) => {
    try {
      const context = buildConversationContext(conversationHistory.slice(0, -1));
      const systemPrompt = `You are Tehom AI, a sophisticated reasoning assistant. Your task is to provide detailed, step-by-step reasoning for complex problems.

${context}

When responding:
1. Break down the problem into clear steps
2. Show your reasoning process explicitly
3. Consider multiple perspectives or approaches
4. Explain your conclusions thoroughly
5. Use clear, structured thinking

Focus on providing deep, analytical responses that demonstrate sophisticated reasoning.`;

      const formattedMessages = formatMessagesForApi(conversationHistory, systemPrompt);

      const response = await fetch('/api/openrouter-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedMessages,
          model: 'anthropic/claude-3.5-sonnet',
          temperature: 0.3,
          max_tokens: 6000,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || '',
        sources: [],
        thinking: undefined,
        performanceMetrics: data.usage ? {
          tokens: {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens
          },
          timing: {},
          cache_hit: false
        } : undefined
      };
    } catch (error) {
      console.error('Reasoning request error:', error);
      throw error;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderMessage = (message: Message) => {
    if (message.role === 'user') {
      return (
        <div className="flex justify-end mb-4">
          <div className="flex items-end space-x-2 max-w-[70%]">
            <div className="bg-cyan-600 text-white p-3 rounded-2xl rounded-br-sm">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                className="prose prose-invert prose-sm max-w-none"
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center mb-1">
              <User size={16} className="text-white" />
            </div>
          </div>
        </div>
      );
    }

    const displayContent = message.thinking && message.isThinkingVisible 
      ? message.thinking + '\n\n' + message.content
      : filterAIThinking(message.content);

    return (
      <div className="flex justify-start mb-4">
        <div className="flex items-start space-x-2 max-w-[85%]">
          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center mt-1">
            <Bot size={16} className="text-white" />
          </div>
          <div className="bg-gray-700 text-white p-4 rounded-2xl rounded-bl-sm">
            <DynamicResponseRenderer content={displayContent} />
            
            {message.thinking && (
              <div className="mt-3 pt-3 border-t border-gray-600">
                <ThinkingButton
                  hasThinking={true}
                  isVisible={message.isThinkingVisible || false}
                  onToggle={() => {
                    setMessages(prev => prev.map(msg => 
                      msg.id === message.id 
                        ? { ...msg, isThinkingVisible: !msg.isThinkingVisible }
                        : msg
                    ));
                  }}
                />
              </div>
            )}

            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-600">
                <WebSourcesCarousel sources={message.sources} />
              </div>
            )}

            {message.artifactData && (
              <div className="mt-3 pt-3 border-t border-gray-600">
                <button
                  onClick={() => {
                    setActiveArtifactId(message.artifactData!.id);
                    setIsArtifactPaneOpen(true);
                  }}
                  className="inline-flex items-center px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <ExternalLink size={16} className="mr-2" />
                  View {message.artifactData.type}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={switchSession}
        onSessionDelete={deleteSessionById}
        onNewSession={createSession}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center space-x-4">
            <HamburgerMenu
              isOpen={isHamburgerOpen}
              onToggle={() => setIsHamburgerOpen(!isHamburgerOpen)}
              onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            />
            <div className="flex items-center space-x-2">
              <Image
                src="/Logo.svg"
                alt="Tehom AI"
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Tehom AI
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {lastPerformanceMetrics && (
              <PerformanceMonitor metrics={lastPerformanceMetrics} />
            )}
            <button
              onClick={() => router.push('/settings')}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyBox 
              mode={mode}
              onModeChange={setMode}
              onExampleClick={(example) => {
                setInput(example);
                textareaRef.current?.focus();
              }}
            />
          ) : (
            messages.map((message) => (
              <div key={message.id}>
                {renderMessage(message)}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="flex items-start space-x-2">
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-gray-700 text-white p-4 rounded-2xl rounded-bl-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-gray-400">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-700 bg-gray-800 p-4">
          {/* Mode Selection */}
          <div className="flex justify-center mb-4">
            <div className="flex bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setMode('chat')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'chat' 
                    ? 'bg-cyan-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setMode('search')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'search' 
                    ? 'bg-cyan-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <SearchIcon size={16} className="inline mr-1" />
                Search
              </button>
              <button
                onClick={() => setMode('reasoning')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'reasoning' 
                    ? 'bg-cyan-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <Zap size={16} className="inline mr-1" />
                Reasoning
              </button>
            </div>
          </div>

          {/* File Upload Preview */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center bg-gray-700 rounded-lg p-2">
                    <Paperclip size={16} className="text-gray-400 mr-2" />
                    <span className="text-sm text-gray-300 truncate max-w-32">
                      {file.name}
                    </span>
                    <button
                      onClick={() => removeFile(index)}
                      className="ml-2 text-gray-400 hover:text-red-400"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex items-end space-x-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Type your ${mode} message...`}
                className="w-full bg-gray-700 text-white rounded-lg p-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 min-h-[50px] max-h-32"
                disabled={isLoading}
                rows={1}
                style={{ 
                  height: 'auto',
                  minHeight: '50px'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors"
                disabled={isLoading}
              >
                <Paperclip size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors flex items-center justify-center"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Artifact Viewer */}
      <AnimatePresence>
        {isArtifactPaneOpen && activeArtifactId && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-1/2 border-l border-gray-700 bg-gray-800 flex flex-col"
          >
            <ArtifactViewer
              artifacts={artifacts}
              activeArtifactId={activeArtifactId}
              onArtifactChange={setActiveArtifactId}
              onClose={() => setIsArtifactPaneOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TestChat() {
  return (
    <AuthProvider>
      <TestChatComponent />
    </AuthProvider>
  );
} 