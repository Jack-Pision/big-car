import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const ICON_PATH = '/favicon.svg';

const getContextualSystemPrompt = (webContext: any = null) => {
  const basePrompt = `You are Tehom AI, an advanced AI browser assistant with direct access to web content, search results, and browser functionality. You can see, analyze, and interact with any webpage content the user is viewing or has searched for.

You can analyze any webpage content including text, forms, and data. Extract key information, prices, contact details, and relevant data points. Understand context and relationships between different pieces of information. Identify patterns, trends, and important insights from web content.

You can synthesize information from multiple search results. Provide comprehensive answers with proper citations. Identify gaps in information and suggest additional research. Create knowledge graphs and connections between concepts. Track research progress and maintain context across sessions.

Always be proactive. Anticipate user needs based on current webpage content. Suggest relevant actions, tools, or information. Offer to automate repetitive tasks. Provide insights and analysis without being asked.

Always be contextual. Consider the current webpage content in your responses. Reference specific elements from the page when relevant. Maintain awareness of the user's research journey and goals. Adapt your communication style to match the content type.

When analyzing content provide clear, structured analysis. Highlight key insights and important information. Use bullet points for lists and findings. Include confidence levels for uncertain information.

When assisting with research synthesize information from multiple sources. Provide comprehensive yet concise summaries. Include relevant citations and sources. Suggest next steps or related research areas.

Always format your responses in markdown for better readability and structure.`;

  if (webContext?.hasSearchResults) {
    return `${basePrompt}

**CURRENT WEB SEARCH CONTEXT:**
You have access to enhanced search results from the user's current browser session:
- Query: "${webContext.query}"
- Sources Available: ${webContext.sourcesCount} web sources
- Enhanced Content: ${webContext.hasEnhancedContent ? 'YES - Full text, highlights, and summaries available' : 'NO - Basic results only'}
${webContext.enhancedData ? `
**ENHANCED CONTENT SUMMARY:**
${Object.keys(webContext.enhancedData.full_content || {}).length} sources have full content available for analysis.

**KEY INSIGHTS FROM SEARCH:**
${webContext.enhancedData.ai_context?.context_summary || 'Rich content data available for detailed analysis.'}
` : ''}

**IMPORTANT:** When the user asks questions related to their search, use the provided search results and enhanced content to give accurate, well-cited answers. Reference specific sources by their titles and URLs when relevant.`;
  }

  return basePrompt;
};

interface EmbeddedAIChatProps {
  webContext?: {
    hasSearchResults: boolean;
    query: string;
    sourcesCount: number;
    hasEnhancedContent: boolean;
    enhancedData: any;
  };
}

const EmbeddedAIChat: React.FC<EmbeddedAIChatProps> = ({ webContext }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; isStreaming?: boolean }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessage = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const systemPrompt = getContextualSystemPrompt(webContext);
    let enhancedContext = '';
    if (webContext?.hasEnhancedContent && webContext.enhancedData) {
      enhancedContext = `\n\n### Web Content & Search Results\nHere is the relevant information from the web page or search results:\n\n${JSON.stringify(webContext.enhancedData, null, 2)}`;
    }

    const conversationHistory = [
      { role: 'system', content: systemPrompt + enhancedContext },
      ...messages,
      userMessage,
    ];

    try {
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nvidia/nvidia-llama3-70b-instruct',
          messages: conversationHistory,
          stream: true,
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') {
              setMessages(prev =>
                prev.map(msg => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
              );
              setIsLoading(false);
              return;
            }
            try {
              const chunk = JSON.parse(jsonStr);
              if (chunk.choices && chunk.choices[0].delta.content) {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.isStreaming) {
                    lastMessage.content += chunk.choices[0].delta.content;
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing streaming JSON:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          lastMessage.content = 'Sorry, something went wrong. Please try again.';
          lastMessage.isStreaming = false;
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setMessages(prev =>
        prev.map(msg => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
      );
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#161618] border-r border-gray-700">
      {/* Header */}
      <div className="h-12 bg-[#1C1C1E] flex items-center justify-center px-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src={ICON_PATH} alt="Tehom AI" className="w-6 h-6" />
          <span className="text-white font-semibold">Tehom AI</span>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400 text-center">
              <div>
                <img src={ICON_PATH} alt="Tehom AI" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Ask me anything about your search results!</p>
                {webContext?.hasSearchResults && (
                  <p className="text-xs mt-2 text-gray-500">
                    I have access to {webContext.sourcesCount} sources from "{webContext.query}"
                  </p>
                )}
              </div>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-[#2E2E30] text-white'
                    : 'bg-[#2A2A2C] text-gray-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="markdown-body text-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-[#1C1C1E] flex-shrink-0">
        <div className="flex items-center bg-[#2A2A2C] rounded-xl p-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything..."
            className="flex-grow bg-transparent text-white placeholder-gray-400 focus:outline-none resize-none"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || input.trim() === ''}
            className={`ml-2 p-2 rounded-full transition-colors ${
              isLoading || input.trim() === ''
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-white hover:bg-gray-200'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={`${isLoading || input.trim() === '' ? 'text-gray-400' : 'text-black'}`}
            >
              <path
                d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedAIChat;
