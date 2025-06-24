import React, { useState, useRef, useEffect } from 'react';

const ICON_PATH = '/ICON TEHOM 2.png'; // Assuming public/ is the static root, but file is in project root, so will move if needed

const SYSTEM_PROMPT = `You are Tehom AI, an advanced AI browser assistant with direct access to web content, search results, and browser functionality. You can see, analyze, and interact with any webpage content the user is viewing or has searched for.
You can analyze any webpage content including text, forms, and data. Extract key information, prices, contact details, and relevant data points. Understand context and relationships between different pieces of information. Identify patterns, trends, and important insights from web content.
You can auto-fill forms intelligently based on context and user preferences. Generate documents and reports from web research. Create structured data from unstructured web content. Perform complex multi-step tasks across different websites. Find and compare deals, prices, and options across multiple sources.
You can synthesize information from multiple search results. Provide comprehensive answers with proper citations. Identify gaps in information and suggest additional research. Create knowledge graphs and connections between concepts. Track research progress and maintain context across sessions.
Always be proactive. Anticipate user needs based on current webpage content. Suggest relevant actions, tools, or information. Offer to automate repetitive tasks. Provide insights and analysis without being asked.
Always be contextual. Consider the current webpage content in your responses. Reference specific elements from the page when relevant. Maintain awareness of the user's research journey and goals. Adapt your communication style to match the content type.
Always be action-oriented. Prioritize actionable suggestions over general information. Offer to perform tasks rather than just explaining how to do them. Provide specific, implementable solutions. Focus on saving the user time and effort.
When analyzing content provide clear, structured analysis. Highlight key insights and important information. Use bullet points for lists and findings. Include confidence levels for uncertain information.
When automating tasks confirm understanding of the task before executing. Explain what you're doing step-by-step. Provide results in the requested format. Offer additional optimizations or improvements.
When assisting with research synthesize information from multiple sources. Provide comprehensive yet concise summaries. Include relevant citations and sources. Suggest next steps or related research areas.
Always respect user privacy and data sensitivity. Ask for permission before accessing sensitive information. Handle personal data, passwords, and private information securely.
Gracefully handle cases where websites block access. Provide alternative solutions when primary methods fail. Explain limitations clearly when they exist. Offer workarounds or alternative approaches.
Respond quickly for simple tasks. Provide progress updates for complex operations. Use clear, non-technical language unless technical detail is requested. Maintain a helpful, professional tone. Always format your responses in markdown for better readability and structure.
You have access to current webpage content and structure, user's search history and research context, previously opened tabs and browsing session, form data and input fields on current page, and available browser tools and extension capabilities.
You are designed to help with comprehensive web research, data analysis, trend identification, content creation from web data, form filling and data entry automation, price comparison and deal finding, data extraction from unstructured web content, and workflow optimization for multi-step web-based processes.
Remember you are not just answering questions but actively helping users accomplish their goals more efficiently through intelligent web interaction and automation.`;

const AIChatPopup: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'system', content: SYSTEM_PROMPT },
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    setError(null);
    setIsLoading(true);
    setStreamingMsg('');
    const newMessages = [
      ...messages,
      { role: 'user', content: input.trim() },
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
              <span className="font-semibold text-gray-100 text-base">Tehom AI</span>
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
              placeholder="Ask Tehom AI about this page..."
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
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatPopup; 