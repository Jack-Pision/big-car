import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types';
import {
  optimizedSupabaseService,
  getSessions,
  deleteSession as deleteSessionFromService,
  updateSessionTitle,
} from '@/lib/optimized-supabase-service';

interface SidebarProps {
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  refreshTrigger?: number;
  user?: {
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  } | null;
  onSettingsClick?: () => void;
}

export default function Sidebar({
  activeSessionId,
  onNewChat,
  onSelectSession,
  refreshTrigger,
  user,
  onSettingsClick,
}: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const editInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await optimizedSupabaseService.getSessions();
        setSessions(sessions);
      } catch (error) {
        console.error('Error loading sessions:', error);
        setSessions([]);
      }
    };
    loadSessions();
  }, [refreshTrigger]);

  const handleSessionSelect = (sessionId: string) => {
    onSelectSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSessionFromService(sessionId);
      const sessions = await getSessions();
      setSessions(sessions);
      setShowDeleteId(null);
      if (activeSessionId === sessionId) {
        onSelectSession('');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleNewChat = () => {
    onNewChat();
  };

  const filteredSessions = sessions.filter(
    session => session.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMenuToggle = (id: string) => {
    setMenuOpenId(menuOpenId === id ? null : id);
  };

  const handleEdit = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.title);
    setMenuOpenId(null);
    setTimeout(() => {
      editInputRef.current?.focus();
    }, 100);
  };

  const handleEditSave = async (id: string) => {
    try {
      setSessions((prev) => prev.map(s => s.id === id ? { ...s, title: editValue } : s));
      await updateSessionTitle(id, editValue);
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error updating session title:', error);
      const sessions = await getSessions();
      setSessions(sessions);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Sidebar width and style
  const sidebarWidth = collapsed ? 'w-16' : 'w-72';
  const showText = !collapsed;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-[9999] bg-[#232323] shadow-xl flex flex-col border-r border-gray-800 h-full transition-all duration-200 ${sidebarWidth}`}
      aria-label="Sidebar navigation"
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
    >
      {/* Top nav icons */}
      <div className="flex flex-col items-center justify-center mt-4 mb-2 gap-2">
        <button
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[#e5e7eb] hover:bg-[#232323]/80 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/10 w-full ${showText ? 'justify-start pl-4' : 'justify-center'}`}
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
          {showText && <span className="font-medium">New chat</span>}
        </button>
        <button
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[#e5e7eb] hover:bg-[#232323]/80 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/10 w-full ${showText ? 'justify-start pl-4' : 'justify-center'}`}
          onClick={() => router.push('/browser')}
          aria-label="Open AI browser"
          tabIndex={0}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          {showText && <span className="font-medium">Browser</span>}
        </button>
      </div>
      {/* Session search and list */}
      <div className={`mt-4 ${showText ? 'mx-4' : 'mx-2'}`}>
        {showText && (
          <div className="mb-2">
            <span className="text-xs font-semibold text-gray-300 tracking-wide" style={{ letterSpacing: '0.05em' }}>SESSIONS</span>
          </div>
        )}
        <div className={`mb-4 flex items-center gap-2 bg-[#232323] rounded-lg px-2 py-1 border ${showText ? '' : 'justify-center'} `} style={{ borderColor: '#e5e7eb', minHeight: '36px' }}>
          <svg width="20" height="20" fill="none" stroke="#e5e7eb" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {showText && (
            <input
              type="text"
              placeholder="Search sessions..."
              className="flex-1 bg-transparent outline-none text-sm text-[#e5e7eb] placeholder-gray-400 py-1"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Search sessions"
              style={{ minHeight: '28px' }}
            />
          )}
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto ${showText ? 'px-4' : 'px-1'} pb-4 custom-scrollbar`}>
        {filteredSessions.length === 0 && searchTerm === '' && showText && (
          <div className="text-gray-400 text-sm text-center mt-8">No sessions yet</div>
        )}
        {filteredSessions.length === 0 && searchTerm !== '' && showText && (
          <div className="text-gray-400 text-sm text-center mt-8">No sessions found</div>
        )}
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className={`group relative flex items-center justify-between gap-2 p-2 rounded-lg mb-1 cursor-pointer transition-colors text-sm font-medium
                        ${activeSessionId === session.id 
                          ? 'bg-gray-700 text-white' 
                          : 'text-gray-300 hover:bg-gray-700/60'}
                        ${showText ? '' : 'justify-center'}`}
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
              <span className={`flex-1 truncate ${showText ? '' : 'sr-only'}`} title={session.title}>
                {session.title}
              </span>
            )}
            {/* Three dots menu, only show when expanded */}
            {showText && (
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
            )}
            {/* Delete modal remains unchanged */}
            {showDeleteId === session.id && showText && (
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
          </div>
        ))}
      </div>
      {/* User Info and Settings, only show when expanded */}
      {user && showText && (
        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {user.user_metadata?.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {user.user_metadata?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* Collapse/Expand toggle button */}
      <div className="flex items-center justify-center p-2 border-t border-gray-700">
        <button
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h16" />
              <path d="M12 4l8 8-8 8" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12H4" />
              <path d="M12 20l-8-8 8-8" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
} 