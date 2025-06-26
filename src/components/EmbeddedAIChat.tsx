import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { Bot } from 'lucide-react';

const ICON_PATH = '/favicon.svg';

// Add smart buffering function from main chat
function smartBufferStreamingContent(content: string): string {
  if (!content) return content;
  
  const lines = content.split('\n');
  let bufferedContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip incomplete markdown structures at the end
    if (i === lines.length - 1 && isIncompleteMarkdown(line)) {
      continue;
    }
    
    bufferedContent += (i > 0 ? '\n' : '') + line;
  }
  
  return bufferedContent;
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
  
  return patterns.some(pattern => pattern.test(line.trim()));
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

const makeCitationsClickable = (content: string, sources: any[] = []) => {
  if (!sources || sources.length === 0) return content;

  let processedContent = content;

  sources.forEach((source, index) => {
    const url = source.url || source.link;
    if (!url) return;

    // Create a regular expression to find the raw URL, handling special characters
    // and optional surrounding parentheses.
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const urlRegex = new RegExp(`\\(?\\s*${escapedUrl}\\s*\\)?`, 'g');

    // The simple numerical link to replace it with, e.g., [1], [2]
    const citationLink = `[${index + 1}](${url})`;

    // Replace all occurrences of the raw URL in the text
    processedContent = processedContent.replace(urlRegex, citationLink);
  });

  return processedContent;
};

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
  const [isWebDataVisible, setIsWebDataVisible] = useState(false);
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
    const cleanContent = rawContent
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '')
      .trim();

    const processedContent = msg.isStreaming 
      ? smartBufferStreamingContent(cleanContent)
      : cleanContent;

    // Only apply citations if we have web sources
    const finalContent = msg.webSources?.length 
      ? makeCitationsClickable(processedContent, msg.webSources)
      : processedContent;

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
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeRaw, rehypeKatex]} 
                className="research-output"
                components={{
                  h1: ({ children }) => (<h1 className="text-xl md:text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: '#FCFCFC' }}>{children}</h1>),
                  h2: ({ children }) => (<h2 className="text-lg md:text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: '#FCFCFC' }}>{children}</h2>),
                  h3: ({ children }) => (<h3 className="text-base md:text-xl font-semibold mb-3 mt-6" style={{ color: '#FCFCFC' }}>{children}</h3>),
                  p: ({ children }) => (<p className="leading-relaxed mb-4 text-sm" style={{ color: '#FCFCFC' }}>{children}</p>),
                  ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                  li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: '#FCFCFC' }}><span className="text-cyan-400 mt-1.5 text-xs">●</span><span className="flex-1">{children}</span></li>),
                  ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                  strong: ({ children }) => (<strong className="font-semibold" style={{ color: '#FCFCFC' }}>{children}</strong>),
                  table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                  thead: ({ children }) => <thead className="">{children}</thead>,
                  th: ({ children }) => (<th className="px-3 md:px-4 py-2 md:py-3 text-left font-semibold border-b-2 border-gray-600 text-xs md:text-sm" style={{ color: '#FCFCFC' }}>{children}</th>),
                  td: ({ children }) => (<td className="px-3 md:px-4 py-2 md:py-3 border-b border-gray-700 text-xs md:text-sm" style={{ color: '#FCFCFC' }}>{children}</td>),
                  blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-2 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: '#FCFCFC' }}>{children}</blockquote>),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline
                      ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'rgba(55, 65, 81, 0.5)', color: '#FCFCFC' }}>{children}</code>)
                      : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'rgba(17, 24, 39, 0.8)', color: '#FCFCFC' }}>{children}</code>);
                  },
                  a: ({ href, children }) => (
                    <a 
                      href={href}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {finalContent}
              </ReactMarkdown>
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

  const WebDataContextViewer = ({ webContext, onClose }: { webContext: WebContext | null | undefined, onClose: () => void }) => {
    if (!webContext) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-[#1C1C1E] rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-xl font-semibold text-white">Web Search Context</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            {webContext.enhancedData && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-cyan-400 mb-2">Enhanced Summary & Data</h4>
                <pre className="bg-[#2C2C2E] p-4 rounded-lg text-xs text-white whitespace-pre-wrap custom-scrollbar">
                  {JSON.stringify(webContext.enhancedData, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <h4 className="text-lg font-semibold text-cyan-400 mb-2">Sources ({webContext.sourcesCount})</h4>
              <ul className="space-y-4">
                {webContext.sources.map((source, index) => (
                  <li key={source.id || index} className="bg-[#2C2C2E] p-4 rounded-lg border border-gray-700">
                    <p className="text-base font-semibold text-white mb-1">{source.title}</p>
                    <a href={source.url || source.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all">
                      {source.url || source.link}
                    </a>
                    {source.text && <p className="text-sm text-gray-300 mt-2 italic">"{source.text}"</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#161618]">
      {isWebDataVisible && (
        <WebDataContextViewer webContext={webContext} onClose={() => setIsWebDataVisible(false)} />
      )}
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-center">
            <div>
              {webContext?.hasSearchResults && (
                <p className="text-xs text-gray-500">
                  I have access to {webContext.sourcesCount} sources from "{webContext.query}"
                </p>
              )}
            </div>
          </div>
        )}
        
        {messages.map((message, index) => renderMessage(message, index))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#1C1C1E] flex-shrink-0 border-t border-gray-700">
        {webContext?.hasSearchResults && (
          <div className="mb-2 text-center">
            <button
              onClick={() => setIsWebDataVisible(true)}
              className="text-xs px-3 py-1 rounded-full bg-gray-700 text-blue-300 hover:bg-gray-600 hover:text-blue-200 transition-colors"
            >
              View Web Context ({webContext.sourcesCount} sources)
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={webContext?.hasSearchResults ? "Ask about the search results..." : "Ask me anything..."}
            className="flex-1 px-4 py-2 bg-[#2C2C2E] text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmbeddedAIChat;
 