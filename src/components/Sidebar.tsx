import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types';
import {
  getSessions,
  deleteSession as deleteSessionFromService,
} from '@/lib/session-service';

interface SidebarProps {
  open: boolean;
  activeSessionId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
}

export default function Sidebar({
  open,
  activeSessionId,
  onClose,
  onNewChat,
  onSelectSession,
}: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setSessions(getSessions());
    }
  }, [open]);

  const handleSessionSelect = (sessionId: string) => {
    onSelectSession(sessionId);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionFromService(sessionId);
    setSessions(getSessions());
    setShowDeleteId(null);
    if (activeSessionId === sessionId) {
      onSelectSession('');
    }
  };

  const handleNewChat = () => {
    onNewChat();
  };

  const filteredSessions = sessions.filter(
    session =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-y-0 left-0 z-[9999] w-72 max-w-full bg-[#232323] shadow-xl flex flex-col border-r border-gray-800 h-full transition-all"
            aria-label="Sidebar navigation"
          >
            <div className="flex flex-col h-full relative z-40">
              <div className="flex flex-col items-center justify-center mt-8 mb-2" style={{ height: '64px' }}>
                <img src="/Logo.svg" alt="App Logo" style={{ height: '56px', width: 'auto', display: 'block' }} />
              </div>
              <div className="mt-6">
                <button
                  className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[#e5e7eb] hover:bg-[#232323]/80 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/10 text-left w-full pl-4"
                  onClick={handleNewChat}
                  aria-label="Start a new chat"
                  tabIndex={0}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                    <path d="M8 8h8M8 12h4"/>
                    <path d="M15.5 15.5l2 2M19 15l-2.5 2.5"/>
                    <path d="M15 19h4v-4"/>
                  </svg>
                  <span className="font-medium">New chat</span>
                </button>
                <div className="mx-4 mt-4 mb-2">
                  <span className="text-xs font-semibold text-gray-300 tracking-wide" style={{ letterSpacing: '0.05em' }}>SESSIONS</span>
                </div>
                <div className="mx-4 mb-4 flex items-center gap-2 bg-[#232323] rounded-lg px-2 py-1 border" style={{ borderColor: '#e5e7eb', minHeight: '36px' }}>
                  <svg width="20" height="20" fill="none" stroke="#e5e7eb" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    className="flex-1 bg-transparent outline-none text-sm text-[#e5e7eb] placeholder-gray-400 py-1"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    aria-label="Search sessions"
                    style={{ minHeight: '28px' }}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {filteredSessions.length === 0 && searchTerm === '' && (
                  <div className="text-gray-400 text-sm text-center mt-8">No sessions yet</div>
                )}
                {filteredSessions.length === 0 && searchTerm !== '' && (
                  <div className="text-gray-400 text-sm text-center mt-8">No sessions found</div>
                )}
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative flex items-center justify-between gap-2 p-3 rounded-lg mb-1 cursor-pointer transition-colors text-sm font-medium
                                ${activeSessionId === session.id 
                                  ? 'bg-gray-700 text-white' 
                                  : 'text-gray-300 hover:bg-gray-700/60'}`}
                    onClick={() => handleSessionSelect(session.id)}
                    tabIndex={0}
                    aria-label={`Open session: ${session.title}`}
                  >
                    <span className="flex-1 truncate" title={session.title}>
                      {editingId === session.id ? (
                        <input
                          className="bg-gray-800 text-white rounded px-2 py-1 text-sm w-32 focus:outline-none border border-gray-600"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => {
                            if (editValue.trim() && editValue !== session.title) {
                              const updatedSessions = sessions.map(s => s.id === session.id ? { ...s, title: editValue.trim() } : s);
                              setSessions(updatedSessions);
                              // Save to localStorage or backend if needed
                              localStorage.setItem('chatSessions', JSON.stringify(updatedSessions));
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                        />
                      ) : (
                        session.title
                      )}
                    </span>
                    <div className="relative flex items-center">
                      <button
                        className="p-1 rounded hover:bg-gray-600 focus:bg-gray-600 transition-colors text-gray-400"
                        onClick={e => {
                          e.stopPropagation();
                          setShowDeleteId(null);
                          setEditingId(null);
                          setEditValue(session.title);
                          setShowMenuId(session.id === showMenuId ? null : session.id);
                        }}
                        aria-label="Session options"
                        title="Session options"
                      >
                        {/* Three-dot icon */}
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="2"/>
                          <circle cx="12" cy="12" r="2"/>
                          <circle cx="19" cy="12" r="2"/>
                        </svg>
                      </button>
                      {showMenuId === session.id && (
                        <div className="absolute right-0 top-8 z-50 bg-[#232323] border border-gray-700 rounded shadow-lg py-1 w-32">
                          <button
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                            onClick={e => {
                              e.stopPropagation();
                              setEditingId(session.id);
                              setEditValue(session.title);
                              setShowMenuId(null);
                            }}
                          >Edit name</button>
                          <button
                            className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
                            onClick={e => {
                              e.stopPropagation();
                              setShowDeleteId(session.id);
                              setShowMenuId(null);
                            }}
                          >Delete</button>
                        </div>
                      )}
                    </div>
                    <AnimatePresence>
                      {showDeleteId === session.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
                          onClick={() => setShowDeleteId(null)}
                        >
                          <div className="bg-[#2a2a2a] border border-gray-700 rounded-lg shadow-xl p-6 w-80 text-white" onClick={e => e.stopPropagation()}>
                            <div className="text-lg font-semibold mb-3">Delete Session?</div>
                            <div className="text-gray-300 mb-5">Are you sure you want to delete "{session.title}"? This action cannot be undone.</div>
                            <div className="flex justify-end gap-3">
                              <button className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-sm font-medium transition-colors" onClick={() => setShowDeleteId(null)}>Cancel</button>
                              <button 
                                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                                onClick={() => handleDeleteSession(session.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
} 