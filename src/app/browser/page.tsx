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
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [aiGeneratedQuery, setAiGeneratedQuery] = useState<string | null>(null);
  const [isGeneratingQuery, setIsGeneratingQuery] = useState(false);
  
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

  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // State for history modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // State for enhanced web context data
  const [webContextData, setWebContextData] = useState<any>(null);

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
        let optimizedQuery = undefined;
        
        if (Array.isArray(exactMatch.search_results)) {
          // Old format - just an array of sources
          sources = exactMatch.search_results;
          enhancedData = null;
        } else {
          // New format - object with sources and enhanced_data
          sources = exactMatch.search_results.sources || [];
          enhancedData = exactMatch.search_results.enhanced_data || null;
          
          // Check if we have an optimized query stored
          if (exactMatch.search_results.ai_context?.optimized_query) {
            optimizedQuery = exactMatch.search_results.ai_context.optimized_query;
          }
        }
        
        setSearchResults(sources);
        setAiResponse({ sources });
        
        // Create web context data for cached results
        const contextData = {
          hasSearchResults: true,
          query: optimizedQuery || searchQuery,
          originalQuery: searchQuery,
          sourcesCount: sources.length,
          hasEnhancedContent: !!enhancedData,
          enhancedData: enhancedData,
          sources: sources
        };
        setWebContextData(contextData);
        
        return true; // Found cached results
      }
      
      // No cached results found, perform new search
      generateSearchQuery(searchQuery);
      return false;
    } catch (error) {
      console.error('Error loading search from history:', error);
      // Fallback to new search if cache loading fails
      generateSearchQuery(searchQuery);
      return false;
    }
  };

  useEffect(() => {
    // Focus search input on page load
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Generate optimized search query using AI
  const generateSearchQuery = async (userInput: string) => {
    setIsGeneratingQuery(true);
    setAiGeneratedQuery(null);

    try {
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { 
              role: 'system', 
              content: `You are a search query optimization assistant. Your job is to take a user's question or search intent and convert it into the most effective search query.
              
              Guidelines:
              1. Focus on the key information needs
              2. Use specific keywords that will yield relevant results
              3. Remove unnecessary words and filler
              4. Include important context terms
              5. Return ONLY the optimized search query with no explanation or additional text
              
              Examples:
              User input: "I want to find information about the health benefits of drinking green tea every day"
              Output: "green tea daily health benefits research studies"
              
              User input: "What are the best programming languages to learn in 2025 for someone who wants to get a job in AI?"
              Output: "best programming languages AI jobs 2025 career"
              `
            },
            { role: 'user', content: userInput }
          ],
          temperature: 0.3,
          max_tokens: 100
        })
      });

      if (!response.ok) throw new Error('Failed to generate search query');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get reader');

      let optimizedQuery = '';
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
            try {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content || '';
              
              if (content) {
                optimizedQuery += content;
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', e);
            }
          }
        }
      }
      
      optimizedQuery = optimizedQuery.trim();
      console.log('Original query:', userInput);
      console.log('AI optimized query:', optimizedQuery);
      
      setAiGeneratedQuery(optimizedQuery);
      
      // Automatically perform the search with the optimized query
      if (optimizedQuery) {
        handleSearch(userInput, optimizedQuery);
      } else {
        // Fallback to original query if AI didn't generate anything useful
        handleSearch(userInput);
      }
      
    } catch (error) {
      console.error('Error generating search query:', error);
      // Fallback to original query
      handleSearch(userInput);
    } finally {
      setIsGeneratingQuery(false);
    }
  };

  const handleSearch = async (searchQuery: string, optimizedQuery?: string) => {
    if (!searchQuery.trim()) return;

    const actualSearchQuery = optimizedQuery || searchQuery;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setAiResponse(null);
    setWebContextData(null); // Reset web context

    try {
      const response = await fetch('/api/exa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: actualSearchQuery,
          enhanced: true // Request enhanced data for AI context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }

      const data = await response.json();
      const searchResults = data.sources || [];

      const aiResponse: AIResponse = {
        sources: searchResults
      };

      setSearchResults(searchResults);
      setAiResponse(aiResponse);

      // Create web context data for AI chat popup
      const contextData = {
        hasSearchResults: true,
        query: actualSearchQuery,
        originalQuery: searchQuery, // Store the original user query
        sourcesCount: searchResults.length,
        hasEnhancedContent: !!data.enhanced,
        enhancedData: data.enhanced,
        sources: searchResults,
        mode: 'browser_chat', // Explicitly set browser chat mode
        modelConfig: {
          temperature: 0.8,
          top_p: 0.95,
          max_tokens: 16384,
          presence_penalty: 0.3,
          frequency_penalty: 0.4
        }
      };
      setWebContextData(contextData);

      // Update URL so the search can be shared / reloaded
      try {
        router.replace(`/browser?q=${encodeURIComponent(searchQuery)}`);
      } catch (e) {
        console.error('Failed to update URL:', e);
      }

      // Save to browser history with enhanced search results for caching
      try {
        const enhancedSearchResults = {
          sources: searchResults,
          enhanced_data: data.enhanced,
          search_metadata: data.metadata,
          ai_context: {
            processed_at: new Date().toISOString(),
            context_summary: data.enhanced ? 'Enhanced content available for AI context' : 'Basic search results',
            total_sources: searchResults.length,
            original_query: searchQuery,
            optimized_query: optimizedQuery || undefined
          }
        };

        await browserHistoryService.saveBrowserSearch({
          query: searchQuery,
          results_summary: `Found ${searchResults.length} sources${data.enhanced ? ' with enhanced content' : ''}`,
          sources_count: searchResults.length,
          search_results: enhancedSearchResults // Save enhanced results for AI context
        });
      } catch (error) {
        console.error('Error saving to browser history:', error);
      }
      
    } catch (error) {
      console.error('Search error:', error);
      setSearchError((error as Error).message || "An error occurred while searching. Please try again.");
      setAiResponse(null);
      setWebContextData(null); // Reset web context on error
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching && !isGeneratingQuery) {
      e.preventDefault();
      generateSearchQuery(query);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSearching && !isGeneratingQuery && query.trim()) {
      generateSearchQuery(query);
    }
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
            <EmbeddedAIChat webContext={webContextData} />
          </Panel>
          
          {/* Resize Handle - Invisible with shadow effect */}
          <PanelResizeHandle className="w-1 bg-transparent hover:bg-transparent transition-colors cursor-col-resize relative">
            <div className="absolute inset-y-0 left-0 w-1 shadow-[2px_0_8px_rgba(0,0,0,0.3)]" />
          </PanelResizeHandle>
          
          {/* Right Pane - Search Interface */}
          <Panel defaultSize={65} minSize={50}>
            <div className="h-full overflow-y-auto bg-[#161618]">
              <main className={`max-w-4xl mx-auto px-6 py-8 ${aiResponse ? '' : 'h-full'}`}>
        {/* Main Search Section */}
        <div className={`flex flex-col items-center justify-center ${aiResponse ? 'mb-6' : 'h-full'}`}>
          {!aiResponse && (
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-medium mb-10"
              style={{ color: '#FCFCFC' }}
            >
              Search the web with Tehom
            </motion.h2>
          )}
          
          {/* Search Input */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              width: aiResponse ? '100%' : '800px',
              maxWidth: '100%'
            }}
            transition={{ delay: 0.1 }}
            className="relative mx-auto mb-8"
          >
            <div 
              className="flex items-center gap-2 px-4 py-4 h-14 rounded-2xl border transition-all duration-200 focus-within:ring-2 focus-within:ring-gray-400/30"
              style={{ 
                borderColor: '#3b3b3b'
              }}
            >
              <svg 
                width={aiResponse ? "20" : "24"} 
                height={aiResponse ? "20" : "24"} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#9ca3af" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Ask anything..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSearching || isGeneratingQuery}
                className="flex-1 bg-transparent outline-none text-base placeholder-gray-400"
                style={{ 
                  color: '#FCFCFC', 
                  fontSize: '16px'
                }}
              />
              
              {query && (
                <button
                  onClick={() => generateSearchQuery(query)}
                  disabled={isSearching || isGeneratingQuery}
                  className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95"
                  title="Search"
                >
                  {isGeneratingQuery ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-black border-t-transparent rounded-full"
                    />
                  ) : isSearching ? (
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="black"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Loading State */}
                {isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-16 flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-2 border-white border-t-transparent rounded-full mb-4"
            />
            <p className="text-gray-400">Searching the web...</p>
          </motion.div>
        )}
        
        {/* Error State */}
        {searchError && !isSearching && !aiResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-16 flex flex-col items-center justify-center"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-red-400 mb-2 font-medium">Search Error</p>
            <p className="text-gray-400 text-center max-w-md">{searchError}</p>
            <button 
              onClick={() => handleSearch(query)}
              className="mt-4 px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-lg transition-colors"
            >
              Try Again
            </button>
          </motion.div>
        )}
        
        {/* Image Carousel */}
        <AnimatePresence>
          {aiResponse && carouselImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <ImageCarousel images={carouselImages} />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* AI Response */}
        <AnimatePresence>
          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              {/* Source Results */}
              {aiResponse.sources.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium mb-4" style={{ color: '#FCFCFC' }}>Sources</h3>
                  <div className="space-y-4">
                    {aiResponse.sources.map((result, index) => (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="border rounded-lg p-4 hover:bg-gray-800/30 transition-colors cursor-pointer"
                      style={{ 
                        backgroundColor: 'transparent',
                        borderColor: '#333333'
                      }}
                      onClick={() => window.open(result.url, '_blank')}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {result.favicon ? (
                            <img 
                              src={result.favicon} 
                              alt="" 
                              className="w-full h-full object-contain p-1"
                              onError={(e) => {
                                const domain = new URL(result.url).hostname;
                                const target = e.target as HTMLImageElement;
                                target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                                target.onerror = () => {
                                  target.style.display = 'none';
                                  target.parentElement!.innerHTML = `
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                    </svg>
                                  `;
                                };
                              }}
                            />
                          ) : (
                            (() => {
                              try {
                                const domain = new URL(result.url).hostname;
                                return (
                                  <img 
                                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                    alt=""
                                    className="w-full h-full object-contain p-1"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      target.parentElement!.innerHTML = `
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                        </svg>
                                      `;
                                    }}
                                  />
                                );
                              } catch (e) {
                                return (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                  </svg>
                                );
                              }
                            })()
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium mb-1 line-clamp-2" style={{ color: '#FCFCFC', fontSize: '14px' }}>
                            {result.title}
                          </h4>
                          <p className="text-gray-400 text-sm mb-2 line-clamp-2">
                            {result.snippet}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{new URL(result.url).hostname}</span>
                            {result.timestamp && (
                              <>
                                <span>•</span>
                                <span>{result.timestamp}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M7 17L17 7M17 7H7M17 7V17"/>
                        </svg>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
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