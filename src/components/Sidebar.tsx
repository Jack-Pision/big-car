import { useState, useEffect, useRef } from 'react';
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
  refreshTrigger?: number;
}

export default function Sidebar({
  open,
  activeSessionId,
  onClose,
  onNewChat,
  onSelectSession,
  refreshTrigger,
}: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setSessions(getSessions());
    }
  }, [open, refreshTrigger]);

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

  // Handler for menu toggle
  const handleMenuToggle = (id: string) => {
    setMenuOpenId(menuOpenId === id ? null : id);
  };

  // Handler for edit
  const handleEdit = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.title);
    setMenuOpenId(null);
    setTimeout(() => {
      editInputRef.current?.focus();
    }, 100);
  };

  // Handler for save edit
  const handleEditSave = (id: string) => {
    setSessions((prev) => prev.map(s => s.id === id ? { ...s, title: editValue } : s));
    // Persist the change
    const updatedSessions = getSessions().map(s => s.id === id ? { ...s, title: editValue } : s);
    localStorage.setItem('sessions', JSON.stringify(updatedSessions));
    setEditingId(null);
    setEditValue('');
  };

  // Handler for cancel edit
  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

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
                    {editingId === session.id ? (
                      <input
                        ref={editInputRef}
                        className="flex-1 truncate bg-gray-800 text-white rounded px-2 py-1 outline-none border border-blue-400"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onBlur={() => handleEditSave(session.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditSave(session.id);
                          if (e.key === 'Escape') handleEditCancel();
                        }}
                      />
                    ) : (
                    <span className="flex-1 truncate" title={session.title}>
                      {session.title}
                    </span>
                    )}
                    {/* Three dots menu */}
                    <div style={{ position: 'relative' }}>
                    <button
                        className="p-1 rounded hover:bg-gray-600 focus:outline-none"
                      onClick={e => {
                        e.stopPropagation();
                          handleMenuToggle(session.id);
                      }}
                        aria-label="Open menu"
                        title="Session options"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                      {menuOpenId === session.id && (
                        <div className="absolute right-0 mt-2 w-28 bg-white text-black rounded shadow-lg z-50 flex flex-col text-sm">
                          <button className="px-3 py-2 hover:bg-gray-200 text-left" onClick={e => { e.stopPropagation(); handleEdit(session); }}>Edit</button>
                          <button className="px-3 py-2 hover:bg-gray-200 text-left" onClick={e => { e.stopPropagation(); setShowDeleteId(session.id); setMenuOpenId(null); }}>Delete</button>
                        </div>
                      )}
                    </div>
                    {/* Existing delete modal remains unchanged */}
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