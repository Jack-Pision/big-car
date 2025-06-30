import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, User, Copy, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

const ICON_PATH = '/favicon.svg';

// Add smart buffering function from main chat
function smartBufferStreamingContent(content: string): string {
  if (!content) return '';

  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1];

  // Check if the last line contains an incomplete markdown link.
  // An incomplete link is one that has an opening bracket '[' but not a closing parenthesis ')'.
  const incompleteLinkRegex = /\[[^\]]*\([^)]*$/;

  if (incompleteLinkRegex.test(lastLine)) {
    // If an incomplete link is found, withhold the last line from rendering
    // until the link is complete.
    return lines.slice(0, -1).join('\n');
  }

  // Also check for incomplete markdown list items or blockquotes
  if (isIncompleteMarkdown(lastLine)) {
    return lines.slice(0, -1).join('\n');
  }
  
  return content;
}

function isIncompleteMarkdown(line: string): boolean {
  const patterns = [
    /^#{1,6}\s*$/,        // Incomplete headers
    /^\*{1,2}$/,          // Incomplete bold/italic
    /^`{1,3}$/,           // Incomplete code blocks
    /^\|.*\|?\s*$/,       // Incomplete table rows
    /^-{1,2}\s*$/,        // Incomplete lists
    /^\d+\.\s*$/          // Incomplete numbered lists
  ];
  
  const trimmedLine = line.trim();
  return patterns.some(pattern => pattern.test(trimmedLine));
}

// Add content processing functions from main chat
function cleanAIResponse(text: string): { content: string } {
  if (!text) return { content: '' };
  
  let cleaned = text
    .replace(/\*{3,}/g, '**')
    .replace(/_{3,}/g, '__')
    .replace(/`{4,}/g, '```')
    .replace(/#{7,}/g, '######')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  
  return { content: cleaned };
}

const stripEmojis = (text: string) => {
  // This regex removes most common emojis.
  return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
};

// Citation processing is no longer needed since we use direct Markdown links
// The ReactMarkdown component will automatically render markdown links as clickable links

interface WebContext {
  hasSearchResults: boolean;
  sourcesCount: number;
  query: string;
  sources: WebSource[];
  enhancedData?: any;
  modelConfig?: {
    temperature: number;
    top_p: number;
  };
}

interface WebSource {
  id?: string;
  url?: string;
  link?: string;
  title?: string;
  text?: string;
  timestamp?: number;
}

interface EmbeddedAIChatProps {
  webContext?: WebContext;
  onSendMessage?: (message: string) => void;
  chatMessages?: any[];
  isChatLoading?: boolean;
}

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isProcessed?: boolean;
  webSources?: any[];
  timestamp?: number;
}

// Add getContextualSystemPrompt function
const getContextualSystemPrompt = (webContext: WebContext | undefined) => {
  const basePrompt = `You are Tehom AI, a sharp, articulate AI assistant that specializes in analyzing and summarizing web content for users in a natural, helpful, and human-sounding way. Your job is to:

- Read and synthesize information from all available web sources provided in the user's message.
- Cross-reference sources to identify agreement, uncertainty, or conflicts.
- Summarize key insights clearly and accurately.
- Use clean, readable markdown (headers, bold, bullets) but keep formatting minimal and purposeful.
- Write like a smart human: confident, conversational, and clear — not robotic.
- Be direct, helpful, and friendly.

**Critical Rule for Citations:** The user has provided web sources, each identified by a number. When you use information from a source, you MUST cite it using only its number in brackets, for example: \`[1]\`. Do not use the source name or the full URL.

${webContext?.hasSearchResults
  ? `Current context: Analyzing "${webContext.query}" using ${webContext.sourcesCount} web sources. The sources are provided in the user message. Base your answer on them and follow the citation rule.`
  : 'No web sources available – provide general assistance while maintaining a web-aware mindset.'}

Key rule: Write like you're explaining the internet to a smart friend — not drafting a formal report. Prioritize insight, tone, and usability.`;

  return basePrompt;
};

const EmbeddedAIChat: React.FC<EmbeddedAIChatProps> = ({ webContext, onSendMessage, chatMessages, isChatLoading }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use external chat messages if provided, otherwise use local state
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const messages = chatMessages || localMessages;
  const isLoading = isChatLoading !== undefined ? isChatLoading : false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const TypingIndicator = () => (
    <motion.div
      key="typing-indicator"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center space-x-2"
      style={{ minHeight: '2.5rem' }}
    >
      <Bot size={20} className="text-white" />
      <div className="flex items-center space-x-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
      </div>
    </motion.div>
  );

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleRetry = (originalQuery: string) => {
    setInput(originalQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input.trim();
    setInput('');

    // If we have an onSendMessage callback (from BrowserPage), use it
    if (onSendMessage) {
      onSendMessage(currentInput);
      return;
    }

    // Fallback: handle locally if no callback provided (for standalone usage)
    const userMessage: LocalMessage = {
      id: Date.now().toString() + '-user',
      role: 'user',
      content: currentInput,
      timestamp: Date.now()
    };

    setLocalMessages(prev => [...prev, userMessage]);
  };

  const renderMessage = (msg: LocalMessage, i: number) => {
    if (msg.role === 'user') {
      return (
        <motion.div
          key={msg.id + '-user-' + i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full text-right flex flex-col items-end mb-4"
        >
          <div className="max-w-[80%] bg-blue-600 text-white px-4 py-2 rounded-2xl">
            {msg.content}
          </div>
        </motion.div>
      );
    }

    // Assistant message processing
    const { content: rawContent } = cleanAIResponse(msg.content);

    // 1. Strip emojis
    const emojiFreeContent = stripEmojis(rawContent);
    
    // 2. Process for custom citation components, now handled differently
    const cleanContent = emojiFreeContent
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '')
      .trim();

    const finalContent = msg.isStreaming 
      ? smartBufferStreamingContent(cleanContent)
      : cleanContent;

    const showTypingIndicator = msg.role === 'assistant' && finalContent.trim().length === 0 && !msg.isProcessed;

    return (
      <motion.div
        key={msg.id + '-assistant-' + i}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
        style={{ color: '#FCFCFC', maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        <div className="w-full max-w-full overflow-hidden" style={{ minHeight: showTypingIndicator ? '2.5rem' : 'auto' }}>
          {showTypingIndicator ? (
            <TypingIndicator />
          ) : (
            finalContent.trim().length > 0 && (
              <div>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeKatex]} 
                  className="research-output"
                  components={{
                    h1: ({ children }) => (<h1 className="text-xl md:text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h1>),
                    h2: ({ children }) => (<h2 className="text-lg md:text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h2>),
                    h3: ({ children }) => (<h3 className="text-base md:text-xl font-semibold mb-3 mt-6" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h3>),
                    p: ({ children }) => (<p className="leading-relaxed mb-4 text-base" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</p>),
                    ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                    li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}><span className="text-cyan-400 mt-1.5 text-xs">●</span><span className="flex-1">{children}</span></li>),
                    ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                    strong: ({ children }) => (<strong className="font-semibold" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</strong>),
                    table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                    thead: ({ children }) => <thead className="">{children}</thead>,
                    th: ({ children }) => (<th className="px-3 md:px-4 py-1 md:py-3 text-left font-semibold border-b-2 border-gray-600 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</th>),
                    td: ({ children }) => (<td className="px-3 md:px-4 py-1 md:py-3 border-b border-gray-700 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</td>),
                    blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-1 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: 'var(--text-primary)' }}>{children}</blockquote>),
                    code: ({ children, className }) => {
                    const isInline = !className;
                      return isInline
                        ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>)
                        : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>);
                    }
                  }}
                >
                  {finalContent}
                </ReactMarkdown>
              </div>
            )
          )}
        </div>

        {/* Action buttons for completed messages */}
        {msg.isProcessed && finalContent.trim().length > 0 && (
          <div className="w-full flex justify-start gap-2 mt-2 relative z-50">
            <button
              onClick={() => handleCopy(finalContent)}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
              aria-label="Copy response"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            
            <button
              onClick={() => {
                const userMsg = messages.find(m => m.role === 'user' && m.timestamp && m.timestamp < (msg.timestamp || Infinity));
                if (userMsg) {
                  handleRetry(userMsg.content);
                }
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
              aria-label="Retry with different response"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1a1c] relative">
      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="max-w-3xl mx-auto">
        {messages.map((message, index) => renderMessage(message, index))}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800 p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about these search results..."
            className="flex-1 bg-[#2C2C2E] text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`px-4 py-2 rounded-lg ${
              !input.trim() || isLoading
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin"></span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedAIChat;
 