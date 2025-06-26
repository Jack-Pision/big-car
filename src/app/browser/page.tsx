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

import BrowserHistoryModal from '@/components/BrowserHistoryModal';
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
  const [rightPaneQuery, setRightPaneQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Sources');
  
  // Extract images from search results for the carousel
  const carouselImages = useMemo(() => {
    if (!searchResults?.length) return [];
    
    return searchResults
      .filter(result => result.image)
      .map(result => ({
        url: result.image!,
        title: result.title,
        sourceUrl: result.url
      }));
  }, [searchResults]);

  // Helper function to extract domain from URL
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

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
        max_tokens: 64000
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
        max_tokens: 64000,
          presence_penalty: 0.3,
          frequency_penalty: 0.4
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
    const basePrompt = `You are Tehom AI, a sharp, articulate AI assistant that specializes in analyzing and summarizing web content for users in a natural, helpful, and human-sounding way. Your job is to:

- Read and synthesize information from all available web sources provided in the user's message.
- Cross-reference sources to identify agreement, uncertainty, or conflicts.
- Focus specifically on the user's original question and provide a targeted, relevant answer.
- Summarize key insights clearly and accurately based on the web content.
- Use clean, readable markdown (headers, bold, bullets) but keep formatting minimal and purposeful.
- Write like a smart human: confident, conversational, and clear — not robotic.
- Be direct, helpful, and friendly.

**Critical Rule for Citations:** The user has provided web sources, each identified by a number. When you use information from a source, you MUST cite it using only its number in brackets, for example: \`[1]\`. Do not use the source name or the full URL.

${webContext?.hasSearchResults
  ? `**Current Context:** You are analyzing the query "${webContext.query}" using ${webContext.sourcesCount} web sources. Each source contains character-limited content (up to 6,000 characters) that has been optimized for processing. The sources are provided in the user message. Base your answer specifically on these sources and the user's original question. Focus on providing information that directly addresses what the user is asking about.`
  : 'No web sources available – provide general assistance while maintaining a web-aware mindset.'}

**Key Instructions:**
- The user's question is the primary focus - ensure your answer directly addresses what they're asking
- Use the web sources to provide accurate, up-to-date information
- If sources conflict, mention the disagreement and cite both sides
- If information is missing or unclear, acknowledge this honestly
- Write like you're explaining the internet to a smart friend — not drafting a formal report
- Prioritize insight, tone, and usability over formality`;
    return basePrompt;
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
        <PanelGroup direction="horizontal" autoSaveId="browser-layout">
          {/* Left Pane - AI Chat */}
          <Panel defaultSize={35} minSize={25} maxSize={50}>
            <EmbeddedAIChat 
              webContext={webContextData} 
              onSendMessage={handleSearch}
              chatMessages={chatMessages}
              isChatLoading={isChatLoading}
            />
          </Panel>
          
          {/* Resize Handle - Invisible with shadow effect */}
          <PanelResizeHandle className="w-1 bg-transparent hover:bg-transparent transition-colors cursor-col-resize relative">
            <div className="absolute inset-y-0 left-0 w-1 shadow-[2px_0_8px_rgba(0,0,0,0.3)]" />
          </PanelResizeHandle>
          
          {/* Right Pane - Search Interface */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col bg-[#161618]">
              {searchStatus !== 'idle' && searchResults.length === 0 ? (
                <StatusUI />
              ) : (
                <div className="h-full flex flex-col relative">
                  {/* Tab Navigation */}
                  <div className="flex border-b border-gray-700 px-6 pt-6">
                    {['Sources', 'Images', 'Videos', 'News'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        disabled={tab === 'Videos' || tab === 'News'}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab 
                            ? 'text-white border-white' 
                            : tab === 'Videos' || tab === 'News'
                            ? 'text-gray-500 border-transparent cursor-not-allowed'
                            : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content */}
                  <div className={`flex-1 px-6 py-4 ${searchResults.length > 0 || (activeTab === 'Images' && carouselImages.length > 0) ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}>
                    {activeTab === 'Sources' && (
                      <div className="space-y-6">
                        {searchResults.map((result, index) => (
                          <div
                            key={result.id}
                            className="cursor-pointer hover:bg-gray-800/20 -mx-2 px-2 py-2 rounded-lg transition-colors"
                            onClick={() => window.open(result.url, '_blank')}
                          >
                            <div className="flex items-start gap-3">
                              {result.favicon && (
                                <img 
                                  src={result.favicon} 
                                  alt="" 
                                  className="w-4 h-4 mt-1 flex-shrink-0" 
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-400 mb-1">
                                  {extractDomain(result.url)}
                                </div>
                                <h3 className="text-white font-semibold text-base leading-tight mb-2">
                                  {result.title}
                                </h3>
                                <p className="text-gray-300 text-sm leading-relaxed">
                                  {result.snippet}
                                </p>
                              </div>
                              {index < 3 && (
                                <div className="flex-shrink-0 bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                  {index + 1}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'Images' && (
                      <div>
                        {carouselImages.length > 0 ? (
                          <ImageCarousel images={carouselImages} />
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-500">
                            No images found
                          </div>
                        )}
                      </div>
                    )}

                    {(activeTab === 'Videos' || activeTab === 'News') && (
                      <div className="flex items-center justify-center h-32 text-gray-500">
                        {activeTab} coming soon
                      </div>
                    )}
                  </div>

                  {/* Scroll Down Button */}
                  {(activeTab === 'Sources' && searchResults.length > 3) && (
                    <div className="absolute bottom-4 right-4">
                      <button
                        onClick={() => {
                          const container = document.querySelector('.custom-scrollbar');
                          if (container) {
                            container.scrollBy({ top: 300, behavior: 'smooth' });
                          }
                        }}
                        className="bg-gray-800/80 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Browser History Modal */}
      <BrowserHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        onSelectQuery={(selectedQuery) => {
          setQuery(selectedQuery);
          handleSearch(selectedQuery);
        }}
      />
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