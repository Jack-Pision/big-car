'use client'

import { useState, useRef, useEffect } from "react";
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { v4 as uuidv4 } from 'uuid';
import Search from '../../components/Search';

interface SearchSession {
  id: string;
  title: string;
  timestamp: number;
  query: string;
  result?: string;
}

export default function SearchModePage() {
  const [input, setInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Sidebar state and search history
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchSessions, setSearchSessions] = useState<SearchSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Scroll to bottom when new content is added
  useEffect(() => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  }, [searchResult]);

  // Focus on input field when page loads
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleNewSearch() {
    setActiveQuery("");
    setSearchResult("");
    setActiveSessionId(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function handleSelectSession(id: string) {
    const session = searchSessions.find(s => s.id === id);
    if (session) {
      setActiveQuery(session.query);
      setSearchResult(session.result || "");
      setActiveSessionId(id);
    }
    setSidebarOpen(false);
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isSearching) return;
    setError("");

    // Create a new search session
    const newId = uuidv4();
    const newSession = {
      id: newId,
      title: input.trim().slice(0, 20) + (input.trim().length > 20 ? '...' : ''),
      timestamp: Date.now(),
      query: input.trim(),
    };
    setSearchSessions([newSession, ...searchSessions]);
    setActiveSessionId(newId);
    
    // Set active query
    setActiveQuery(input.trim());
    setInput("");
    setIsSearching(true);
    setSearchResult("");

    try {
      // Perform search
      await executeSearch(input.trim(), newId);
    } catch (err: any) {
      setError(`Search failed: ${err.message || String(err)}`);
    } finally {
      setIsSearching(false);
    }
  }

  async function executeSearch(query: string, sessionId: string) {
    // Update UI to show searching state
    setSearchResult("");
    
    // Call the search component and handle the result
    const handleSearchComplete = (result: string) => {
      setSearchResult(result);
      
      // Update the session with the result
      setSearchSessions(prev => prev.map(session => 
        session.id === sessionId 
          ? { ...session, result } 
          : session
      ));
    };
    
    // We'll just render the Search component and let it handle the API calls
    // The result will be provided via the onComplete callback
  }

  return (
    <div className="min-h-screen flex flex-col bg-white px-4 sm:px-4 md:px-8 lg:px-0" 
         style={{ 
           paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
           paddingRight: 'max(env(safe-area-inset-right), 1rem)',
           paddingBottom: 'env(safe-area-inset-bottom)'
         }}>
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-4 left-4 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        activeSessionId={activeSessionId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewSearch}
        onSelectSession={handleSelectSession}
      />
      
      {/* Welcome message when no active query */}
      <div className={`w-full flex justify-center items-center relative h-24 md:h-28 transition-opacity duration-500 px-4 ${activeQuery ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ minHeight: '4rem' }}>
        <span className="text-2xl md:text-3xl font-semibold text-neutral-700 text-center block select-none">
          Enhanced Search Mode
        </span>
      </div>
      
      {/* Content area */}
      <div className="flex-1 w-full overflow-y-auto px-4 sm:px-4 md:px-8 lg:px-0" ref={contentRef}>
        <div className="max-w-[850px] mx-auto pb-4 space-y-4">
          {/* Show active query */}
          {activeQuery && (
            <div className="message flex justify-end px-0">
              <div className="message-content px-4 py-3 rounded-xl overflow-hidden bg-blue-600 text-white max-w-[80%] sm:max-w-[75%] md:max-w-[70%] mr-4 sm:mr-6 md:mr-8 ml-auto">
                <div className="whitespace-pre-wrap break-words">{activeQuery}</div>
              </div>
            </div>
          )}
          
          {/* Search in progress */}
          {isSearching && (
            <div className="flex justify-start px-0">
              <div className="px-4 py-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ml-4 sm:ml-6 md:ml-8">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full"></div>
                  <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full animation-delay-200"></div>
                  <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full animation-delay-400"></div>
                  <span className="text-sm text-gray-500">Searching...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Search result */}
          {activeQuery && !isSearching && searchResult && (
            <div className="flex justify-start px-0 w-full">
              <div className="w-full px-4 py-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ml-4 sm:ml-6 md:ml-8">
                {/* The actual search component will be rendered here */}
                <Search query={activeQuery} onComplete={(result) => {
                  setSearchResult(result);
                  // Update the session with the result
                  if (activeSessionId) {
                    setSearchSessions(prev => prev.map(session => 
                      session.id === activeSessionId 
                        ? { ...session, result } 
                        : session
                    ));
                  }
                }} />
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="text-red-500 text-sm text-center mt-2 px-4">{error}</div>
          )}
        </div>
      </div>
      
      {/* Input bar fixed at bottom */}
      <form
        className="w-full flex justify-center fixed bottom-0 left-0 right-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2 px-4 sm:px-4 md:px-8 lg:px-0 z-10 bg-gradient-to-t from-white via-white to-transparent"
        style={{ 
          paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right), 1rem)'
        }}
        autoComplete="off"
        onSubmit={handleSearch}
        aria-label="Search input form"
      >
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-[850px] mx-auto flex items-center px-4 py-2 gap-2 sm:gap-3 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10">
          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Search anything..."
            className="flex-1 bg-transparent outline-none border-none text-sm sm:text-base text-neutral-900 placeholder-gray-400 px-2 py-2 focus:ring-0"
            aria-label="Search anything"
            disabled={isSearching}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) handleSearch();
            }}
          />
          
          {/* Search button */}
          <button
            type="submit"
            aria-label="Search"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
            disabled={isSearching || !input.trim()}
          >
            <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
} 