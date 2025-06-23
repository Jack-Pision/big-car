'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import ThinkingButton from '@/components/ThinkingButton';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import HamburgerMenu from '@/components/HamburgerMenu';
import BrowserHistoryModal from '@/components/BrowserHistoryModal';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { browserHistoryService } from '@/lib/browser-history-service';

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  timestamp?: string;
}

interface AIResponse {
  summary: string;
  sources: SearchResult[];
  thinking?: string;
}

const BrowserPageComponent = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [liveThinking, setLiveThinking] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // New state for sidebar and history modal
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const trendingTopics = [
    "AI search engines 2025",
    "Latest ChatGPT updates", 
    "Machine learning tutorials",
    "Web development trends",
    "Cryptocurrency news",
    "Climate change solutions",
    "Space exploration news",
    "Quantum computing breakthroughs"
  ];

  const searchSuggestions = [
    "How does artificial intelligence work?",
    "Best programming languages to learn",
    "Latest technology trends 2025",
    "Sustainable energy solutions",
    "Remote work productivity tips"
  ];

  useEffect(() => {
    // Focus search input on page load
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setLiveThinking('');
    setShowThinking(true);
    
    try {
      // Simulate AI thinking process
      setLiveThinking('Analyzing your query and determining the best search strategy...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setLiveThinking('Searching multiple sources across the web for relevant information...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setLiveThinking('Processing and synthesizing information from reliable sources...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock search results
      const mockResults: SearchResult[] = [
        {
          id: '1',
          title: 'Comprehensive Guide to ' + searchQuery,
          snippet: 'A detailed overview covering all aspects of your query with expert insights and practical examples.',
          url: 'https://example.com/guide',
          timestamp: '2 hours ago'
        },
        {
          id: '2', 
          title: 'Latest Research on ' + searchQuery,
          snippet: 'Recent findings and developments in this field, including peer-reviewed studies and expert analysis.',
          url: 'https://research.example.com/latest',
          timestamp: '1 day ago'
        },
        {
          id: '3',
          title: 'Expert Analysis: ' + searchQuery,
          snippet: 'In-depth analysis from industry experts providing valuable insights and recommendations.',
          url: 'https://experts.example.com/analysis',
          timestamp: '3 days ago'
        }
      ];

      const mockAIResponse: AIResponse = {
        summary: `Based on my analysis of multiple sources, here's what I found about "${searchQuery}":

## Key Insights

The topic you're exploring involves several important aspects that are worth understanding. Current research and expert opinions suggest that this area is rapidly evolving with significant developments happening regularly.

## Main Points

- **Primary Concept**: The fundamental principles are well-established and widely accepted in the field
- **Recent Developments**: New advancements have emerged that change how we approach this topic
- **Practical Applications**: There are several real-world implementations that demonstrate effectiveness
- **Future Outlook**: Experts predict continued growth and innovation in this area

## Recommendations

For someone looking to understand this topic better, I'd recommend starting with the foundational concepts and then exploring the latest research. The sources I've found provide comprehensive coverage from basic principles to advanced applications.

*This analysis is based on information from ${mockResults.length} reliable sources.*`,
        sources: mockResults,
        thinking: 'I analyzed your query by first understanding the key concepts you\'re asking about, then searching across multiple reliable sources including academic papers, expert blogs, and recent news articles. I prioritized sources that provide both foundational knowledge and current developments. The synthesis combines information from these sources to give you a comprehensive overview while highlighting the most important and actionable insights.'
      };

      setSearchResults(mockResults);
      setAiResponse(mockAIResponse);
      setLiveThinking('');
      setShowThinking(false);

      // Save to browser history
      if (user) {
        try {
          await browserHistoryService.saveBrowserSearch({
            query: searchQuery,
            results_summary: `Found ${mockResults.length} sources with comprehensive analysis`,
            sources_count: mockResults.length,
            search_results: mockResults
          });
        } catch (error) {
          console.error('Error saving to browser history:', error);
        }
      }
      
    } catch (error) {
      console.error('Search error:', error);
      setLiveThinking('');
      setShowThinking(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch(query);
    }
  };

  const handleTrendingClick = (topic: string) => {
    setQuery(topic);
    handleSearch(topic);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#161618', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#161618] shadow-xl h-14 flex items-center px-4">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
        <img src="/Logo.svg" alt="Logo" className="ml-3" style={{ width: 90, height: 90 }} />
        
        {/* History Button */}
        <div className="ml-auto">
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

      <main className="max-w-4xl mx-auto px-6 py-8 pt-20">
        {/* Main Search Section */}
        <div className="text-center mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-medium mb-8"
            style={{ color: '#FCFCFC' }}
          >
            Search the web with AI
          </motion.h2>
          
          {/* Search Input */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative max-w-2xl mx-auto mb-8"
          >
            <div 
              className="flex items-center gap-3 px-6 py-4 rounded-2xl border transition-all duration-200 focus-within:ring-2 focus-within:ring-cyan-400/30"
              style={{ 
                backgroundColor: '#1a1a1a',
                borderColor: '#333333'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                disabled={isSearching}
                className="flex-1 bg-transparent outline-none text-base placeholder-gray-400"
                style={{ color: '#FCFCFC', fontSize: '14px' }}
              />
              
              {query && (
                <button
                  onClick={() => handleSearch(query)}
                  disabled={isSearching}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-600 transition-colors disabled:opacity-50"
                >
                  {isSearching ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                    </svg>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Trending Topics - Only show when no search results */}
        {!aiResponse && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12"
          >
            <h3 className="text-lg font-medium mb-4" style={{ color: '#FCFCFC' }}>Trending Topics</h3>
            <div className="flex flex-wrap gap-2">
              {trendingTopics.map((topic, index) => (
                <button
                  key={index}
                  onClick={() => handleTrendingClick(topic)}
                  className="px-4 py-2 rounded-full border text-sm transition-all duration-200 hover:scale-105"
                  style={{ 
                    backgroundColor: 'transparent',
                    borderColor: '#333333',
                    color: '#FCFCFC'
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Search Suggestions - Only show when no search results */}
        {!aiResponse && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-12"
          >
            <h3 className="text-lg font-medium mb-4" style={{ color: '#FCFCFC' }}>Try asking...</h3>
            <div className="space-y-2">
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="block w-full text-left px-4 py-3 rounded-lg border transition-colors hover:bg-gray-800/50"
                  style={{ 
                    backgroundColor: 'transparent',
                    borderColor: '#333333',
                    color: '#9ca3af'
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Thinking Box */}
        <AnimatePresence>
          {(showThinking || liveThinking) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8"
            >
              <ThinkingButton 
                content={liveThinking || 'Preparing to search...'}
                isLive={isSearching}
              />
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
              {/* AI Summary */}
              <div 
                className="rounded-2xl border p-6 mb-6"
                style={{ 
                  backgroundColor: '#1a1a1a',
                  borderColor: '#333333'
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4"/>
                      <path d="M21 12c.552 0 1-.448 1-1s-.448-1-1-1-1 .448-1 1 .448 1 1 1z"/>
                      <path d="M3 12c.552 0 1-.448 1-1s-.448-1-1-1-1 .448-1 1 .448 1 1 1z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium" style={{ color: '#FCFCFC' }}>AI Summary</h3>
                </div>
                
                <div className="prose prose-invert max-w-none" style={{ fontSize: '14px' }}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    className="text-gray-300"
                  >
                    {aiResponse.summary}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Thinking Process */}
              {aiResponse.thinking && (
                <div className="mb-6">
                  <ThinkingButton 
                    content={aiResponse.thinking}
                    isLive={false}
                  />
                </div>
              )}

              {/* Source Results */}
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
                        <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
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
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Overlay for sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-[9998]"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        activeSessionId={null}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => router.push('/test')}
        onSelectSession={() => {}}
        refreshTrigger={0}
        user={user}
        onSettingsClick={() => {}}
      />

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

const BrowserPage = () => {
  return (
    <AuthProvider>
      <BrowserPageComponent />
    </AuthProvider>
  );
};

export default BrowserPage; 