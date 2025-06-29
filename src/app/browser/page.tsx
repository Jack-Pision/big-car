'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import ImageCarousel from '@/components/ImageCarousel';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useRouter, useSearchParams } from 'next/navigation';

import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { browserHistoryService } from '@/lib/browser-history-service';
import EmbeddedAIChat from '@/components/EmbeddedAIChat';

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  image?: string;
  timestamp?: string;
}

interface AIResponse {
  sources: SearchResult[];
}

const BrowserPageComponent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, showSettingsModal } = useAuth();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // State for history modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // State for enhanced web context data
  const [webContextData, setWebContextData] = useState<any>(null);

  // Add state for search status
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Add state for chat messages and loading
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Run search automatically if ?q= parameter present on first load
  useEffect(() => {
    const initialQuery = searchParams?.get('q');
    if (initialQuery) {
      setQuery(initialQuery);
      // Check if we have cached results in Supabase first
      loadSearchFromHistory(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load search results from browser history (Supabase cache)
  const loadSearchFromHistory = async (searchQuery: string) => {
    try {
      // Search for exact match in browser history
      const exactMatch = await browserHistoryService.findExactQuery(searchQuery);
      
      if (exactMatch && exactMatch.search_results) {
        console.log('Loading cached search results from Supabase');
        
        // Handle both old and new data structures
        let sources, enhancedData;
        if (Array.isArray(exactMatch.search_results)) {
          // Old format - just an array of sources
          sources = exactMatch.search_results;
          enhancedData = null;
        } else {
          // New format - object with sources and enhanced_data
          sources = exactMatch.search_results.sources || [];
          enhancedData = exactMatch.search_results.enhanced_data || null;
        }
        
        setSearchResults(sources);
        setAiResponse({ sources });
        
        // Create web context data for cached results
        const contextData = {
          hasSearchResults: true,
          query: searchQuery,
          sourcesCount: sources.length,
          hasEnhancedContent: !!enhancedData,
          enhancedData: enhancedData,
          sources: sources
        };
        setWebContextData(contextData);
        
        return true; // Found cached results
      }
      
      // No cached results found, perform new search
      handleSearch(searchQuery);
      return false;
    } catch (error) {
      console.error('Error loading search from history:', error);
      // Fallback to new search if cache loading fails
      handleSearch(searchQuery);
      return false;
    }
  };

  useEffect(() => {
    // Focus search input on page load
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Helper to get the final AI answer (browser_chat mode)
  const getFinalAnswer = async (userQuestion: string, webContext: any) => {
    setIsChatLoading(true);
    setChatMessages([{ role: 'user', content: userQuestion }]);
    try {
      // Prepare user message with web sources if available
      let userMessageContent = userQuestion;
      
      if (webContext && webContext.hasSearchResults && webContext.sources) {
        // Use enhanced data if available, otherwise fall back to basic sources
        let sourceTexts = '';
        
        if (webContext.enhancedData && webContext.enhancedData.full_content) {
          // Use the optimized character-limited content from enhanced data
          sourceTexts = Object.entries(webContext.enhancedData.full_content).map(([sourceId, data]: [string, any], index: number) => {
            const sourceInfo = webContext.sources.find((s: any) => s.id === sourceId) || webContext.sources[index];
            return `Source [${index + 1}]: ${sourceInfo?.url || 'Unknown URL'}
Title: ${sourceInfo?.title || 'Unknown Title'}
Content: ${data.text || 'No content available'}`;
          }).join('\n\n---\n\n');
        } else {
          // Fallback to basic source data
          sourceTexts = webContext.sources.map((source: any, index: number) => (
            `Source [${index + 1}]: ${source.url}
Title: ${source.title}
Content: ${source.text || source.snippet || 'No content available'}`
          )).join('\n\n---\n\n');
        }
        
        // Add explicit URL mapping for the AI
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
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          mode: 'browser_chat',
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
        
        // Add new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              if (jsonStr.trim() === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content || '';
              
              if (content) {
                accumulatedContent += content;
                
                setChatMessages([
                  { role: 'user', content: userQuestion },
                  { role: 'assistant', content: accumulatedContent, isStreaming: true }
                ]);
              }
        } catch (e) {
              // Ignore parsing errors for incomplete chunks
              console.warn('Failed to parse SSE chunk:', line);
            }
          }
        }
      }
      
      setChatMessages([
        { role: 'user', content: userQuestion },
        { role: 'assistant', content: accumulatedContent, isStreaming: false, isProcessed: true }
      ]);
    } catch (error) {
      setChatMessages([
        { role: 'user', content: userQuestion },
        { role: 'assistant', content: 'Error: Could not fetch response.', isStreaming: false, isProcessed: true }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Update handleSearch to send user query directly to Exa
  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setAiResponse(null);
    setWebContextData(null);
    setSelectedSource(null);
    setErrorMessage('');
    setSearchStatus('searching');
    setChatMessages([]);
    setIsChatLoading(true);
    try {
      // Step 1: Search directly with user's original query (no query rewriting)
      const response = await fetch('/api/exa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, enhanced: true }),
      });
      if (!response.ok) throw new Error('Failed to fetch search results');
      const data = await response.json();
      const searchResults = data.sources || [];
      setSearchResults(searchResults);
      setAiResponse({ sources: searchResults });
      // Create web context data for AI chat popup
      const contextData = {
        hasSearchResults: true,
        query: searchQuery,
        sourcesCount: searchResults.length,
        hasEnhancedContent: !!data.enhanced,
        enhancedData: data.enhanced,
        sources: searchResults,
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
      // Step 2: Only now, call the final AI for the answer
      await getFinalAnswer(searchQuery, contextData);
      // Update URL
      try {
        router.replace(`/browser?q=${encodeURIComponent(searchQuery)}`);
      } catch {}
      // Save to browser history
      try {
        const enhancedSearchResults = {
          sources: searchResults,
          enhanced_data: data.enhanced,
          search_metadata: data.metadata,
          ai_context: {
            processed_at: new Date().toISOString(),
            context_summary: data.enhanced ? 'Enhanced content available for AI context' : 'Basic search results',
            total_sources: searchResults.length
          }
        };
        await browserHistoryService.saveBrowserSearch({
          query: searchQuery,
          results_summary: `Found ${searchResults.length} sources${data.enhanced ? ' with enhanced content' : ''}`,
          sources_count: searchResults.length,
          search_results: enhancedSearchResults
        });
      } catch {}
      setSearchStatus('idle');
    } catch (error: any) {
      setSearchError(error.message || 'An error occurred while searching. Please try again.');
      setAiResponse(null);
      setWebContextData(null);
      setSearchStatus('error');
      setChatMessages([]);
    } finally {
      setIsSearching(false);
      setIsChatLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch(query);
    }
  };

  // UI for search status
  const StatusUI = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      {searchStatus === 'error' ? (
        <>
          <span className="text-red-500 text-2xl mb-2">Search Failed</span>
          <p className="text-gray-400 mb-4">{errorMessage}</p>
          <button onClick={() => setSearchStatus('idle')} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Try Again</button>
        </>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-gray-200 animate-spin">Searching...</span>
        </div>
      )}
    </div>
  );

  // Add getContextualSystemPrompt function for browser chat
  const buildContextualSystemPrompt = (webContext: any) => {
    return `You are Tehom AI, an exceptionally intelligent and articulate AI assistant that transforms complex web information into clear, actionable insights. Your specialty is synthesizing multiple sources into comprehensive, naturally-flowing responses that feel like getting expert advice from a knowledgeable friend.

Your mission is to analyze, synthesize, and present web content in a way that's both deeply informative and refreshingly human. You're not just summarizing—you're connecting dots, revealing patterns, and providing the kind of nuanced understanding that comes from truly comprehending the material.

Core Methodology:
1.  Think like an analyst, write like a storyteller: Dive deep into the sources, identify key themes and contradictions, then weave them into a coherent narrative.
2.  Lead with insight: Start with the most important findings, then build your case with supporting details.
3.  Connect the dots: Highlight relationships between different sources, emerging patterns, and implications the user might not have considered.
4.  Address nuance: When sources disagree or information is uncertain, explore why that might be and what it means for the user.

Execution Rules:
- Start strong: Jump straight into your key finding or most important insight. Do not use introductory filler like "Based on the sources provided." Start with impact. For example: "The cryptocurrency market in 2025 is experiencing a fundamental shift toward institutional legitimacy, but this mainstream adoption is creating new tensions around decentralization principles."
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
- **Correct Example:** "This was the most anticipated movie of 2025. It received widespread critical acclaim for its innovative approach to the zombie genre. [Rotten Tomatoes](https://rottentomatoes.com/article)"
- **Incorrect Example:** "This was the most anticipated movie according to ([Rotten Tomatoes](url))" or making up URLs.

Tone and Style:
- Human, not robotic: Use contractions, varied sentence lengths, and natural phrasing.
- Confident but not arrogant: You know your stuff, but you're honest about limitations.
- Conversational but substantive: Maintain a natural flow without sacrificing depth.
- Engaging but focused: Keep it interesting while staying on-target.
- No emojis or unnecessary characters.

Core Principles:
- Comprehensive: Cover all major angles relevant to the user's question.
- Accurate: Represent sources faithfully without oversimplifying.
- Relevant: Everything you include should directly serve the user's query.
- Clear: Explain complex topics simply without talking down to the user.
- Actionable: When appropriate, help the user understand what to do with this information.

${webContext?.hasSearchResults 
  ? `Current Task: You're analyzing the query "${webContext.query}" using ${webContext.sourcesCount} web sources. Each source contains optimized content up to 6,000 characters. The user wants a comprehensive answer that goes beyond surface-level summary—they want understanding, context, and insight.`
  : 'No web sources available. Provide general assistance while maintaining your analytical, insight-driven approach.'}

Remember: The user's question is your north star. Everything should serve that purpose. Quality over quantity. Uncertainty handled well builds trust. Your goal isn't just to inform, but to genuinely help the user understand and make better decisions.

Transform information into understanding. Make the complex clear. Turn data into wisdom.
Do NOT use emojis or any other unnecessary characters.`;
  };

  return (
    <div className="h-screen" style={{ backgroundColor: '#161618', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#161618] h-14 flex items-center px-4">
        <div className="flex items-center gap-2">
          {/* Back to Chat Button */}
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
            title="Back to Chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <path d="m12 19-7-7 7-7"/>
            </svg>
          </button>
        </div>
        
        {/* Settings and History Buttons */}
        <div className="ml-auto flex items-center gap-2">
          {/* Settings Button */}
          <button
            onClick={() => {
              // TODO: Add proper settings functionality
              console.log('Settings clicked');
            }}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        
        {/* History Button */}
          <button
            onClick={() => setHistoryModalOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
            title="Browser History"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12,6 12,12 16,14"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Split Pane Layout */}
      <div className="pt-14 h-full">
        <EmbeddedAIChat 
          webContext={webContextData} 
          onSendMessage={handleSearch}
          chatMessages={chatMessages}
          isChatLoading={isChatLoading}
        />
      </div>
    </div>
  );
};

// Disable static prerendering because we depend on search params at runtime
export const dynamic = 'force-dynamic';

const BrowserPage = () => {
  return (
    <AuthProvider>
      {/* Wrap in Suspense to satisfy useSearchParams requirement */}
      <React.Suspense fallback={null}>
        <BrowserPageComponent />
      </React.Suspense>
    </AuthProvider>
  );
};

export default BrowserPage; 