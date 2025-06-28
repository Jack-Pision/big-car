'use client';

import React, { useState, useRef, useEffect } from "react";
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { saveMessageInstantly } from '@/lib/optimized-supabase-service';
import { Bot, User, Send, Search as SearchIcon, ExternalLink, AlertTriangle } from 'lucide-react';
import { EnhancedMarkdownRenderer } from './EnhancedMarkdownRenderer';

// Types
interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  image?: string;
  timestamp?: string;
}

interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  timestamp?: number;
  webSources?: SearchResult[];
  imageUrls?: string[];
  isStreaming?: boolean;
  isProcessed?: boolean;
  parentId?: string;
}

interface SearchChatProps {
  sessionId: string;
  onClose: () => void;
  userId: string;
}

// Build contextual system prompt for search mode
const buildContextualSystemPrompt = (webContext: any) => {
  return `You are Tehom AI, an exceptionally intelligent and articulate AI assistant that transforms complex web information into clear, actionable insights. Your specialty is synthesizing multiple sources into comprehensive, naturally-flowing responses that feel like getting expert advice from a knowledgeable friend.

Your mission is to analyze, synthesize, and present web content in a way that's both deeply informative and refreshingly human. You're not just summarizing—you're connecting dots, revealing patterns, and providing the kind of nuanced understanding that comes from truly comprehending the material.

Core Methodology:
1. Think like an analyst, write like a storyteller: Dive deep into the sources, identify key themes and contradictions, then weave them into a coherent narrative.
2. Lead with insight: Start with the most important findings, then build your case with supporting details.
3. Connect the dots: Highlight relationships between different sources, emerging patterns, and implications the user might not have considered.
4. Address nuance: When sources disagree or information is uncertain, explore why that might be and what it means for the user.

Execution Rules:
- Start strong: Jump straight into your key finding or most important insight. Do not use introductory filler like "Based on the sources provided." Start with impact.
- Organize by insight, not by source: Group related information thematically. Use conversational transitions like "What's particularly interesting is..." "This aligns with..." "However, there's a twist..."
- Provide evidence: Include specific details like numbers, quotes, and examples that bring your points to life.
- Acknowledge complexity: Use phrases like "It's not that simple though..." or "The reality is more nuanced..."
- Handle conflicting information: Always identify contradictions and explain possible reasons. Highlight gaps in available information.
- Explain the 'so what': Connect findings to broader implications. Offer perspective on what this means for the user's specific question.

Citation Format:
- Use ONLY the exact URLs provided in the source data above. Do not make up, modify, or create new URLs.
- Place citations at the end of sentences or paragraphs, separated by a space, NOT inline.
- Use the platform/domain name as clickable links, like [TechCrunch](https://techcrunch.com/article) or [MIT News](https://news.mit.edu/study).
- Extract the platform name from the domain (e.g., "techcrunch.com" → "TechCrunch", "nytimes.com" → "New York Times", "forbes.com" → "Forbes").
- Write your content naturally, then add the source attribution at the end of the relevant sentence or paragraph.
- **CRITICAL**: The URL in your link must match exactly one of the URLs listed in the source data above.

Tone and Style:
- Human, not robotic: Use contractions, varied sentence lengths, and natural phrasing.
- Confident but not arrogant: You know your stuff, but you're honest about limitations.
- Conversational but substantive: Maintain a natural flow without sacrificing depth.
- Engaging but focused: Keep it interesting while staying on-target.
- No emojis or unnecessary characters.

${webContext?.hasSearchResults 
  ? `Current Task: You're analyzing the query "${webContext.query}" using ${webContext.sourcesCount} web sources. Each source contains optimized content up to 6,000 characters. The user wants a comprehensive answer that goes beyond surface-level summary—they want understanding, context, and insight.`
  : 'No web sources available. Provide general assistance while maintaining your analytical, insight-driven approach.'}

Remember: The user's question is your north star. Everything should serve that purpose. Quality over quantity. Uncertainty handled well builds trust. Your goal isn't just to inform, but to genuinely help the user understand and make better decisions.

Transform information into understanding. Make the complex clear. Turn data into wisdom.
Do NOT use emojis or any other unnecessary characters.`;
};

export const SearchChat: React.FC<SearchChatProps> = ({ sessionId, onClose, userId }) => {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [webContextData, setWebContextData] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll during AI response
  useEffect(() => {
    if (scrollRef.current && isAiResponding) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isAiResponding]);

  // Handle search and AI response
  const handleSearchAndAI = async (searchQuery: string, userMessageId: string) => {
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setWebContextData(null);
    
    try {
      // Step 1: Search with Exa API
      const response = await fetch('/api/exa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, enhanced: true }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch search results');
      
      const data = await response.json();
      const sources = data.sources || [];
      setSearchResults(sources);
      
      // Create web context data for AI
      const contextData = {
        hasSearchResults: true,
        query: searchQuery,
        sourcesCount: sources.length,
        hasEnhancedContent: !!data.enhanced,
        enhancedData: data.enhanced,
        sources: sources,
        mode: 'browser_chat',
        modelConfig: {
          temperature: 0.8,
          top_p: 0.95,
          max_tokens: 8000,
          repetition_penalty: 1.2,
          presence_penalty: 0.4,
          frequency_penalty: 0.3
        }
      };
      setWebContextData(contextData);
      
      // Step 2: Get AI response
      await getFinalAnswer(searchQuery, contextData, userMessageId);
      
    } catch (error: any) {
      setSearchError(error.message || 'An error occurred while searching.');
    } finally {
      setIsSearching(false);
    }
  };

  // Get final AI answer
  const getFinalAnswer = async (userQuestion: string, webContext: any, userMessageId: string) => {
    setIsAiResponding(true);
    
    try {
      // Prepare user message with web sources
      let userMessageContent = userQuestion;
      
      if (webContext && webContext.hasSearchResults && webContext.sources) {
        let sourceTexts = '';
        
        if (webContext.enhancedData && webContext.enhancedData.full_content) {
          sourceTexts = Object.entries(webContext.enhancedData.full_content).map(([sourceId, data]: [string, any], index: number) => {
            const sourceInfo = webContext.sources.find((s: any) => s.id === sourceId) || webContext.sources[index];
            return `Source [${index + 1}]: ${sourceInfo?.url || 'Unknown URL'}
Title: ${sourceInfo?.title || 'Unknown Title'}
Content: ${data.text || 'No content available'}`;
          }).join('\n\n---\n\n');
        } else {
          sourceTexts = webContext.sources.map((source: any, index: number) => (
            `Source [${index + 1}]: ${source.url}
Title: ${source.title}
Content: ${source.text || source.snippet || 'No content available'}`
          )).join('\n\n---\n\n');
        }
        
        const urlMapping = webContext.sources.map((source: any, index: number) => 
          `Source ${index + 1}: ${source.url}`
        ).join('\n');
        
        sourceTexts += `\n\nAVAILABLE SOURCE URLs:\n${urlMapping}\n\nIMPORTANT: When creating links, use ONLY the exact URLs listed above. Do not make up or modify URLs.`;
        
        userMessageContent = `Please answer the following question based on the provided web sources. Focus your response on the user's specific question and use the web content to provide accurate, relevant information.

---

${sourceTexts}

---

User Question: ${userQuestion}

Please provide a comprehensive answer that directly addresses this question using the information from the sources above.`;
      }
      
      const messages = [
        { role: 'system', content: buildContextualSystemPrompt(webContext) },
        { role: 'user', content: userMessageContent }
      ];
      
      const modelParameters = webContext?.modelConfig || {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 64000,
        repetition_penalty: 1.2,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      };
      
      // Create AI message placeholder
      const aiMessageId = uuidv4();
      const aiMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: '',
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: true,
        isProcessed: false,
        webSources: webContext.sources,
        imageUrls: (webContext.sources || []).filter((src: any) => src.image).map((src: any) => src.image),
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          mode: 'browser_chat',
          stream: true,
          ...modelParameters
        })
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get reader');
      
      let accumulatedContent = '';
      let buffer = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content || '';
              
              if (content) {
                accumulatedContent += content;
                
                setMessages(prev => prev.map(m => 
                  m.id === aiMessageId 
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m
                ));
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', line);
            }
          }
        }
      }
      
      // Mark as complete
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { ...m, content: accumulatedContent, isStreaming: false, isProcessed: true }
          : m
      ));
      
      // Save AI message
      const finalMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: accumulatedContent,
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: false,
        isProcessed: true,
        webSources: webContext.sources,
        imageUrls: (webContext.sources || []).filter((src: any) => src.image).map((src: any) => src.image),
      };
      
      try {
        await saveMessageInstantly(sessionId, finalMessage);
        console.log('[Search Mode] AI message saved instantly');
      } catch (error) {
        console.error('[Search Mode] Failed to save AI message:', error);
      }
      
    } catch (error) {
      console.error('Error in getFinalAnswer:', error);
      
      const errorMessage: LocalMessage = {
        role: 'assistant',
        id: uuidv4(),
        content: 'Error: Could not fetch response.',
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: false,
        isProcessed: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSearching || isAiResponding) return;

    const userMessageId = uuidv4();
    const userMessage: LocalMessage = {
      role: 'user',
      content: input.trim(),
      id: userMessageId,
      timestamp: Date.now(),
      isProcessed: true
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Save user message
    try {
      await saveMessageInstantly(sessionId, userMessage);
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    const query = input.trim();
    setInput('');
    
    // Start search and AI process
    await handleSearchAndAI(query, userMessageId);
  };

  // Render sources panel
  const renderSourcesPanel = () => {
    if (searchResults.length === 0) return null;

    return (
      <div className="w-80 bg-[#1a1a1a] border-l border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200">Sources ({searchResults.length})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {searchResults.map((source, index) => (
            <div key={source.id} className="bg-[#2a2a2a] rounded-lg p-3 hover:bg-[#3a3a3a] transition-colors">
              <div className="flex items-start gap-3">
                {source.favicon && (
                  <img src={source.favicon} alt="" className="w-4 h-4 mt-1 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-200 line-clamp-2 mb-1">
                    {source.title}
                  </h4>
                  <p className="text-xs text-gray-400 line-clamp-3 mb-2">
                    {source.snippet}
                  </p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View source
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#161618] flex">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <SearchIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-200">Search Mode</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
            title="Close Search Mode"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <SearchIcon className="w-16 h-16 text-gray-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Search the Web</h3>
              <p className="text-gray-400 max-w-md">
                Ask any question and I'll search the web for the latest information to provide you with comprehensive, well-sourced answers.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <motion.div
              key={message.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div className={`max-w-[80%] ${message.role === 'user' ? 'order-2' : ''}`}>
                <div className={`rounded-lg p-3 ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-[#2a2a2a] text-gray-200'
                }`}>
                  {message.role === 'assistant' ? (
                    <EnhancedMarkdownRenderer 
                      content={message.content}
                      className="text-sm"
                    />
                  ) : (
                    <p className="text-sm">{message.content}</p>
                  )}
                  
                  {message.isStreaming && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  )}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 order-3">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </motion.div>
          ))}

          {/* Search status */}
          {isSearching && (
            <div className="flex items-center gap-2 text-blue-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
              <span className="text-sm">Searching the web...</span>
            </div>
          )}

          {searchError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{searchError}</span>
            </div>
          )}
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about the web..."
              className="flex-1 bg-[#2a2a2a] text-gray-200 placeholder-gray-400 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32"
              rows={1}
              disabled={isSearching || isAiResponding}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isSearching || isAiResponding}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Sources panel */}
      {renderSourcesPanel()}
    </div>
  );
}; 