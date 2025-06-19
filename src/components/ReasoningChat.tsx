"use client";
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useAuth } from './AuthProvider';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { formatMessagesForApi, enhanceSystemPrompt, buildConversationContext } from '@/utils/conversation-context';
import {
  saveMessageInstantly,
  createNewSessionWithURL,
  saveActiveSessionId,
  getActiveSessionId
} from '@/lib/optimized-supabase-service';
import { Bot, User, Send, XCircle } from 'lucide-react';
import ThinkingButton from './ThinkingButton';
import ReasoningDisplay from './ReasoningDisplay';

// Same BASE_SYSTEM_PROMPT as the main chat
const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful and intelligent assistant. Respond in a natural, conversational tone. Always write in markdown formatting in every output dynamically. 

CRITICAL: Always show your thinking process using <think> tags before providing your final answer. This is required for all responses. Use this format:

<think>
Let me think about this question...
I need to consider...
My reasoning is...
</think>

Then provide your final answer after the thinking process.

IMPORTANT: For general conversation, do NOT format your responses as JSON structures. Always provide plain text or simple markdown responses. Never return JSON objects or arrays in your replies unless specifically requested to do so. For default chat mode, do NOT use structured formats like Summary Tables, Conclusion sections, or heavily formatted outputs with multiple headers.`;

interface ProcessedResponse {
  content: string;
}

function cleanAIResponse(text: string): ProcessedResponse {
  if (typeof text !== 'string') {
    return { content: '' };
  }
  return {
    content: text.trim()
  };
}

const processThinkTags = (content: string) => {
  const thinkBlocks: { content: string; id: string }[] = [];
  let processedContent = content;

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = thinkRegex.exec(content)) !== null) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      const blockId = `think-block-${thinkBlocks.length}`;
      thinkBlocks.push({
        id: blockId,
        content: thinkContent
      });
      
      processedContent = processedContent.replace(
        match[0], 
        `<!-- ${blockId} -->`
      );
    }
  }

  return { processedContent, thinkBlocks };
};

interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  contentType?: string;
  timestamp?: number;
  parentId?: string;
  isStreaming?: boolean;
  isProcessed?: boolean;
}

const extractThinkContentDuringStream = (content: string) => {
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  const thinkContent = thinkMatch ? thinkMatch[1] : '';
  
  const afterThinkMatch = content.match(/<\/think>([\s\S]*)/);
  const mainContent = afterThinkMatch ? afterThinkMatch[1] : 
    (content.includes('<think>') ? '' : content);
  
  return { thinkContent, mainContent };
};

interface ReasoningChatProps {
  className?: string;
}

const ReasoningChat: React.FC<ReasoningChatProps> = ({ className = "" }) => {
  const { user } = useAuth();
  
  // Core state
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Reasoning-specific state
  const [liveReasoning, setLiveReasoning] = useState('');
  const [currentReasoningMessageId, setCurrentReasoningMessageId] = useState<string | null>(null);
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Auto-resize textarea
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 96;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [input]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveReasoning]);

  // Load active session on mount
  useEffect(() => {
    const loadActiveSession = async () => {
      if (!user?.id) return;
      
      try {
        const sessionId = await getActiveSessionId();
        if (sessionId) {
          setActiveSessionId(sessionId);
          sessionIdRef.current = sessionId;
        }
      } catch (error) {
        console.error('Failed to load active session:', error);
      }
    };

    loadActiveSession();
  }, [user?.id]);

  const ensureActiveSession = async (messageContent?: string): Promise<string> => {
    if (activeSessionId) {
      return activeSessionId;
    }

    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      const result = await createNewSessionWithURL(messageContent || 'New Chat');
      setActiveSessionId(result.session.id);
      sessionIdRef.current = result.session.id;
      
      await saveActiveSessionId(result.session.id);
      
      const newUrl = result.url;
      window.history.pushState({}, '', newUrl);
      
      return result.session.id;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const trimmedInput = input.trim();
    setInput('');
    setIsLoading(true);

    setLiveReasoning('');
    setCurrentReasoningMessageId(null);

    try {
      const currentActiveSessionId = await ensureActiveSession(trimmedInput);
      
      const userMessageId = uuidv4();
      const userMsg: LocalMessage = {
        role: "user",
        content: trimmedInput,
        id: userMessageId,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, userMsg]);
      await saveMessageInstantly(currentActiveSessionId, {
        ...userMsg,
        parent_id: userMsg.parentId,
        content_type: userMsg.contentType,
        is_processed: userMsg.isProcessed,
        is_streaming: userMsg.isStreaming
      });

      const aiMessageId = uuidv4();
      const aiMsg: LocalMessage = {
        role: "assistant",
        content: "",
        id: aiMessageId,
        contentType: 'reasoning',
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: true,
      };

      setMessages(prev => [...prev, aiMsg]);
      await saveMessageInstantly(currentActiveSessionId, {
        ...aiMsg,
        parent_id: aiMsg.parentId,
        content_type: aiMsg.contentType,
        is_processed: aiMsg.isProcessed,
        is_streaming: aiMsg.isStreaming
      });

      const conversationHistory = [...messages, userMsg];
      const conversationMessages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const formattedMessages = formatMessagesForApi(BASE_SYSTEM_PROMPT, conversationMessages, trimmedInput, true);
      const context = buildConversationContext(conversationMessages);
      const enhancedPrompt = enhanceSystemPrompt(BASE_SYSTEM_PROMPT, context, trimmedInput);

      const apiPayload = {
        messages: formattedMessages,
        model: "nvidia/llama-3.1-nemotron-70b-instruct",
        temperature: 0.7,
        max_tokens: 4000,
        stream: true
      };

      const newAbortController = new AbortController();
      abortControllerRef.current = newAbortController;

      const res = await fetch('/api/nvidia', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
        signal: newAbortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`API request failed with status ${res.status}: ${errorData}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body available for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      let contentBuffer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (let line of lines) {
            if (line.startsWith('data:')) {
              const data = line.replace('data:', '').trim();
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || 
                           parsed.choices?.[0]?.message?.content || 
                           parsed.choices?.[0]?.text || 
                           parsed.content || '';
                
                if (delta) {
                  contentBuffer += delta;
                  
                  const { thinkContent, mainContent } = extractThinkContentDuringStream(contentBuffer);
                  
                  setMessages(prev => {
                    return prev.map(msg => 
                      msg.id === aiMessageId 
                        ? { ...msg, content: mainContent, isStreaming: true }
                        : msg
                    );
                  });
                  
                  if (thinkContent && thinkContent.trim().length > 0) {
                    setLiveReasoning(thinkContent);
                    setCurrentReasoningMessageId(aiMessageId);
                  }
                }
              } catch (err) {
                console.error('Error parsing streaming response:', err);
                continue;
              }
            }
          }
        }
      }
      
      const { thinkContent: finalThinkContent, mainContent: finalMainContent } = extractThinkContentDuringStream(contentBuffer);
      
      setMessages(prev => {
        return prev.map(msg => 
          msg.id === aiMessageId 
            ? { 
                ...msg, 
                isStreaming: false,
                content: finalThinkContent.trim().length > 0 
                  ? `<think>${finalThinkContent}</think>${finalMainContent}` 
                  : finalMainContent,
                contentType: 'reasoning',
                isProcessed: true,
              }
            : msg
        );
      });

      const finalContent = finalThinkContent.trim().length > 0 
        ? `<think>${finalThinkContent}</think>${finalMainContent}` 
        : finalMainContent;
      
      const completeMessage: LocalMessage = {
        role: "assistant",
        content: finalContent,
        id: aiMessageId,
        timestamp: Date.now(),
        parentId: userMessageId,
        contentType: 'reasoning',
        isProcessed: true,
      };
      
      await saveMessageInstantly(currentActiveSessionId, {
        ...completeMessage,
        parent_id: completeMessage.parentId,
        content_type: completeMessage.contentType,
        is_processed: completeMessage.isProcessed,
        is_streaming: completeMessage.isStreaming
      });
      
      setLiveReasoning('');
      setCurrentReasoningMessageId(null);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
      } else {
        console.error('Error in handleSend:', error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopAIResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setLiveReasoning('');
      setCurrentReasoningMessageId(null);
    }
  };

  const renderReasoningMessage = (msg: LocalMessage, i: number) => {
    const { content: rawContent } = cleanAIResponse(msg.content);
    const cleanContent = rawContent.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');

    const { processedContent, thinkBlocks } = processThinkTags(cleanContent);

    return (
      <React.Fragment key={msg.id + '-reasoning-' + i}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
          style={{ color: '#fff' }}
        >
          {currentReasoningMessageId === msg.id && liveReasoning && (
            <ThinkingButton content={liveReasoning} isLive={true} mode="reasoning" />
          )}

          {thinkBlocks.length > 0 && currentReasoningMessageId !== msg.id && thinkBlocks.map((block, idx) => (
            <ThinkingButton key={`${msg.id}-think-${idx}`} content={block.content} isLive={false} mode="reasoning" />
          ))}

          <ReasoningDisplay data={processedContent.replace(/<!-- think-block-\d+ -->/g, '')} />
        </motion.div>
      </React.Fragment>
    );
  };

  const isEmpty = messages.length === 0;

  return (
    <div className={`min-h-screen flex flex-col bg-[#161618] ${className}`}>
      <header className="flex items-center justify-center p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 32 32" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              fill="#22d3ee" 
              d="M10.799 4.652c-1.485 0.324-2.271 2.045-2.104 4.593 0.051 0.738 0.043 0.666 0.196 1.609 0.064 0.38 0.107 0.7 0.098 0.709-0.008 0.013-0.269 0.077-0.572 0.149-2.019 0.465-3.505 1.165-4.397 2.070-0.602 0.606-0.854 1.17-0.845 1.882 0.004 0.401 0.137 0.841 0.38 1.264 0.209 0.363 0.956 1.101 1.447 1.434 1.029 0.692 1.345 0.79 1.626 0.508 0.12-0.119 0.145-0.179 0.145-0.32 0-0.273-0.094-0.405-0.414-0.581-1.409-0.781-2.147-1.592-2.147-2.369 0-0.282 0.098-0.538 0.333-0.845 0.619-0.824 2.113-1.562 4.115-2.036 0.529-0.124 0.632-0.132 0.632-0.043 0 0.115 0.427 1.481 0.7 2.228l0.273 0.751-0.337 0.645c-0.184 0.354-0.448 0.892-0.585 1.2-1.959 4.316-2.284 7.743-0.867 9.152 0.333 0.333 0.606 0.487 1.054 0.602 1.033 0.265 2.399-0.132 3.931-1.144 0.534-0.354 0.653-0.487 0.653-0.721 0-0.282-0.307-0.555-0.581-0.512-0.077 0.013-0.376 0.179-0.662 0.367-0.632 0.422-1.34 0.773-1.853 0.926-0.525 0.154-1.093 0.162-1.417 0.021-0.995-0.44-1.225-2.215-0.606-4.678 0.29-1.17 0.956-2.928 1.558-4.128l0.239-0.482 0.132 0.299c0.248 0.572 1.212 2.437 1.588 3.073 2.079 3.534 4.422 6.125 6.501 7.184 1.473 0.751 2.689 0.683 3.517-0.201 0.61-0.645 0.909-1.584 0.96-2.992 0.081-2.425-0.709-5.579-2.254-8.96-0.205-0.453-0.41-0.862-0.448-0.905-0.094-0.102-0.333-0.171-0.495-0.137s-0.359 0.231-0.388 0.397c-0.034 0.158 0.004 0.265 0.384 1.088 1.059 2.284 1.801 4.683 2.087 6.744 0.094 0.679 0.111 2.151 0.026 2.604-0.085 0.457-0.252 0.931-0.431 1.204-0.286 0.44-0.615 0.619-1.157 0.615-1.609-0.004-4.145-2.215-6.399-5.571-1.037-1.55-1.993-3.3-2.732-5.011l-0.265-0.61 0.371-0.627c0.478-0.811 0.982-1.579 1.545-2.369l0.448-0.627h0.692c4.747 0 9.459 1.076 11.867 2.702 0.551 0.371 1.080 0.914 1.264 1.289 0.128 0.265 0.145 0.337 0.145 0.64-0.004 0.286-0.021 0.376-0.119 0.563-0.294 0.572-1.042 1.14-2.079 1.592-0.487 0.209-0.64 0.354-0.64 0.602 0 0.23 0.094 0.397 0.273 0.482 0.196 0.094 0.265 0.085 0.581-0.043 1.49-0.602 2.565-1.49 2.903-2.395 0.623-1.665-0.683-3.347-3.564-4.602-2.518-1.101-6.219-1.789-10.070-1.87l-0.423-0.009 0.482-0.555c0.555-0.645 1.78-1.87 2.305-2.309 1.246-1.050 2.361-1.716 3.321-1.989 0.474-0.137 1.059-0.132 1.362 0.004 0.41 0.184 0.696 0.598 0.854 1.238 0.098 0.388 0.098 1.575 0 2.147-0.111 0.632-0.098 0.743 0.073 0.913 0.124 0.124 0.175 0.145 0.354 0.145 0.38 0 0.478-0.141 0.593-0.832 0.060-0.354 0.081-0.692 0.081-1.387 0-0.811-0.013-0.965-0.098-1.302-0.269-1.063-0.926-1.797-1.806-2.006-2.040-0.478-5.161 1.485-8.264 5.208-0.256 0.303-0.495 0.602-0.534 0.653-0.064 0.094-0.107 0.102-0.726 0.141-0.359 0.021-1.016 0.081-1.464 0.132-1.187 0.137-1.093 0.149-1.161-0.158-0.179-0.858-0.239-1.46-0.243-2.39-0.004-1.007 0.030-1.306 0.213-1.865 0.196-0.593 0.529-0.995 0.952-1.135 0.205-0.073 0.709-0.064 1.007 0.013 0.499 0.132 1.204 0.508 1.844 0.99 0.38 0.286 0.512 0.337 0.713 0.269 0.23-0.073 0.367-0.265 0.367-0.504 0-0.179-0.017-0.213-0.205-0.393-0.265-0.256-1.033-0.768-1.498-0.999-0.879-0.44-1.648-0.581-2.339-0.431zM12.4 12.216c-0.004 0.021-0.282 0.44-0.61 0.935s-0.653 0.995-0.721 1.11l-0.124 0.209-0.102-0.277c-0.128-0.337-0.525-1.643-0.525-1.725 0-0.077 0.188-0.107 1.579-0.252 0.29-0.030 0.521-0.030 0.504 0zM15.649 14.854c-0.303 0.098-0.598 0.316-0.773 0.576-0.525 0.773-0.269 1.78 0.555 2.185 0.256 0.128 0.32 0.141 0.67 0.141s0.414-0.013 0.67-0.141c1.114-0.546 1.089-2.168-0.043-2.689-0.299-0.137-0.781-0.166-1.080-0.073z"
            />
          </svg>
          <h1 className="text-xl font-semibold text-cyan-400">Reasoning Chat</h1>
        </div>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {isEmpty && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-4">
                Start a reasoning conversation
              </div>
              <div className="text-gray-500 text-sm">
                I'll show my thinking process and provide detailed reasoning for every response.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                {msg.role === 'user' ? (
                  <User size={16} className="text-gray-300" />
                ) : (
                  <Bot size={16} className="text-cyan-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {msg.role === 'user' ? (
                  <div className="prose dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  renderReasoningMessage(msg, i)
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-700 p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    if (!isLoading) handleSend(e);
                  }
                }}
                className="w-full border border-gray-600 rounded-lg px-4 py-3 bg-gray-800 text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="Ask me anything and I'll show my reasoning..."
                disabled={isLoading}
                rows={1}
                style={{ maxHeight: '96px', minHeight: '48px' }}
              />
            </div>
            
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopAIResponse}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
              >
                <XCircle size={16} />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Send
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReasoningChat; 