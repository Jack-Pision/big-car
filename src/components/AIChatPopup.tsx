import React, { useState, useEffect, useRef } from 'react';

const ICON_PATH = '/ICON TEHOM 2.png'; // Assuming public/ is the static root, but file is in project root, so will move if needed

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

interface AIChatPopupProps {
  webContext?: {
    hasSearchResults: boolean;
    query: string;
    sourcesCount: number;
    hasEnhancedContent: boolean;
    enhancedData?: any;
    sources: any[];
  } | null;
}

const AIChatPopup: React.FC<AIChatPopupProps> = ({ webContext = null }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'system', content: getContextualSystemPrompt(webContext) },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingMsg, setStreamingMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMsg, open]);

  // Update system prompt when webContext changes
  useEffect(() => {
    setMessages(prev => [
      { role: 'system', content: getContextualSystemPrompt(webContext) },
      ...prev.slice(1)
    ]);
  }, [webContext]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    setError(null);
    setIsLoading(true);
    setStreamingMsg('');
    
    // Enhanced user message with web context if available
    let enhancedUserMessage = input.trim();
    if (webContext?.hasSearchResults && webContext?.enhancedData) {
      enhancedUserMessage = `${input.trim()}

[SEARCH CONTEXT - Current browser search results for: "${webContext.query}"]
Available Sources (${webContext.sourcesCount}):
${webContext.sources.map((source: any, index: number) => 
  `${index + 1}. ${source.title} - ${source.url}`
).join('\n')}

${webContext.hasEnhancedContent ? `
Enhanced Content Available:
${Object.entries(webContext.enhancedData.full_content || {}).map(([id, content]: [string, any]) => 
  `Source ${id}: ${content.summary || content.text?.substring(0, 200) + '...' || 'Content available'}`
).join('\n')}
` : ''}`;
    }
    
    const newMessages = [
      ...messages,
      { role: 'user', content: enhancedUserMessage },
    ];
    setMessages(newMessages);
    setInput('');

    try {
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          mode: 'default',
          stream: true,
        }),
      });
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullText = '';
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE lines
          chunk.split('\n').forEach(line => {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullText += content;
                  setStreamingMsg(fullText);
                }
              } catch {}
            }
          });
        }
      }
      setMessages(msgs => [
        ...msgs,
        { role: 'assistant', content: fullText }
      ]);
      setStreamingMsg('');
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating chat icon button */}
      {!open && (
        <button
          className="fixed bottom-8 right-8 z-50 bg-[#161618] border border-gray-400/60 rounded-full shadow-lg p-3 hover:scale-105 transition-transform"
          style={{ boxShadow: '0 2px 16px 0 rgba(0,0,0,0.18)' }}
          onClick={() => setOpen(true)}
          aria-label="Open AI Chat"
        >
          <img src={ICON_PATH} alt="AI Chat" className="w-8 h-8" />
        </button>
      )}

      {/* Chat popup */}
      {open && (
        <div className="fixed bottom-8 right-8 z-50 w-80 max-w-[90vw] bg-[#161618] border border-gray-300 rounded-2xl shadow-2xl flex flex-col" style={{ minHeight: '400px', maxHeight: '80vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300/60">
            <div className="flex items-center gap-2">
              <img src={ICON_PATH} alt="AI Chat" className="w-6 h-6" />
              <div className="flex flex-col">
                <span className="font-semibold text-gray-100 text-base">Tehom AI</span>
                {webContext?.hasSearchResults && (
                  <span className="text-xs text-cyan-400">
                    🌐 Connected to web search ({webContext.sourcesCount} sources)
                  </span>
                )}
              </div>
            </div>
            <button
              className="text-gray-400 hover:text-gray-200 text-xl px-2"
              onClick={() => setOpen(false)}
              aria-label="Close AI Chat"
            >
              &times;
            </button>
          </div>
          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: 'inherit' }}>
            {messages.slice(1).map((msg, i) => (
              <div key={i} className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-gray-800 text-gray-100 self-end ml-8' : 'bg-gray-700 text-cyan-200 self-start mr-8'}`}>
                {msg.content}
              </div>
            ))}
            {streamingMsg && (
              <div className="bg-gray-700 text-cyan-200 rounded-xl px-3 py-2 text-sm self-start mr-8 animate-pulse">
                {streamingMsg}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Error */}
          {error && <div className="text-red-400 text-xs px-4 pb-2">{error}</div>}
          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-300/60 flex gap-2 items-end bg-[#161618]">
            <textarea
              className="flex-1 resize-none rounded-lg bg-gray-800 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/40 min-h-[36px] max-h-32"
              placeholder={webContext?.hasSearchResults 
                ? `Ask about your search: "${webContext.query}"...` 
                : "Ask Tehom AI about this page..."
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={isLoading}
              rows={1}
              style={{ lineHeight: '1.4' }}
            />
            <button
              className="bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              ) : (
                '→'
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatPopup; 