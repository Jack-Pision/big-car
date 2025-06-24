import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types';
import {
  optimizedSupabaseService,
  getSessions,
  deleteSession as deleteSessionFromService,
  updateSessionTitle,
} from '@/lib/optimized-supabase-service';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  refreshTrigger?: number;
  user?: {
    email: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
    };
  } | null;
  onSettingsClick?: () => void;
}

export default function Sidebar({
  open = false,
  onClose,
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
  const [isHovered, setIsHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mediaQuery.matches);
    const handler = () => setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [hasMounted]);

  const loadSessions = async () => {
    try {
      const sessions = await optimizedSupabaseService.getSessions();
      setSessions(sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setSessions([]);
    }
  };

  useEffect(() => {
    if (!isDesktop && open) {
      loadSessions();
    } else if (isDesktop) {
      loadSessions();
    }
  }, [refreshTrigger, isDesktop, open]);

  const handleSessionSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    if (onClose) onClose();
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
    if (onClose) onClose();
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

  if (!hasMounted) {
    return null;
  }

  const isExpanded = isDesktop ? isHovered : open;
  const showText = isExpanded;

  const SidebarContent = (
    <aside
      className={`bg-[#232323] shadow-xl flex flex-col h-full border-r border-gray-800 transition-all duration-200 ${isDesktop ? (isExpanded ? 'w-72' : 'w-16') : 'w-72'}`}
      aria-label="Sidebar navigation"
      onMouseEnter={isDesktop ? () => setIsHovered(true) : undefined}
      onMouseLeave={isDesktop ? () => setIsHovered(false) : undefined}
    >
      {/* Logo at the top */}
      <div className={`flex items-center justify-center w-full ${showText ? 'mt-6 mb-6' : 'mt-4 mb-4'}`}>
        <img
          src="/icons/big-icon.png"
          alt="App Logo"
          className={`transition-all duration-200 object-contain ${showText ? 'w-12 h-12' : 'w-7 h-7'}`}
          style={{ display: 'block' }}
        />
      </div>
      <div className="flex-shrink-0 flex flex-col items-center justify-center mb-2 gap-2 px-2">
        <button
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[#e5e7eb] hover:bg-gray-800/60 transition-colors duration-200 focus:outline-none w-full ${showText ? 'justify-start' : 'justify-center'}`}
          onClick={handleNewChat}
          aria-label="Start a new chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {showText && <span className="font-medium">New chat</span>}
        </button>
        <button
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[#e5e7eb] hover:bg-gray-800/60 transition-colors duration-200 focus:outline-none w-full ${showText ? 'justify-start' : 'justify-center'}`}
          onClick={() => {
            router.push('/browser');
            if (onClose) onClose();
          }}
          aria-label="Open AI browser"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {showText && <span className="font-medium">Browser</span>}
        </button>
      </div>

      {/* Search bar: only show when expanded */}
      {showText && (
        <div className="flex-shrink-0 mt-4 mx-4">
          <div className="flex items-center gap-2 bg-transparent rounded-lg p-2 border" style={{ borderColor: '#555', minHeight: '36px' }}>
            <svg width="18" height="18" fill="none" stroke="#e5e7eb" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent outline-none text-sm text-[#e5e7eb] placeholder-gray-400"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Search sessions"
            />
          </div>
        </div>
      )}

      {/* Session list: only show when expanded */}
      {showText && (
        <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className={`group relative flex items-center gap-2 p-2 rounded-lg mb-1 cursor-pointer transition-colors text-sm font-medium
                          ${activeSessionId === session.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/60'} justify-between`}
              onClick={() => handleSessionSelect(session.id)}
              title={session.title}
            >
              <span className="flex-1 truncate">{session.title}</span>
              <div style={{ position: 'relative' }}>
                <button
                  className="p-1 rounded hover:bg-gray-600 focus:outline-none opacity-0 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); handleMenuToggle(session.id); }}
                  aria-label="Open menu"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
                {menuOpenId === session.id && (
                  <div className="absolute right-0 bottom-full mb-2 w-28 bg-gray-800 text-white rounded shadow-lg z-50 flex flex-col text-sm">
                    <button className="px-3 py-2 hover:bg-gray-700 text-left" onClick={e => { e.stopPropagation(); handleEdit(session); }}>Rename</button>
                    <button className="px-3 py-2 hover:bg-gray-700 text-left" onClick={e => { e.stopPropagation(); setShowDeleteId(session.id); setMenuOpenId(null); }}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User profile/avatar always pinned to bottom */}
      <div className="mt-auto flex-shrink-0 border-t border-gray-700 px-2">
        {user && (
          <div className={`py-4`}>
            <div className={`flex items-center gap-3 min-w-0 ${showText ? 'justify-start' : 'justify-center'}`}>
              <div className="flex items-center gap-3">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="User" className="w-8 h-8 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {user.user_metadata?.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </div>
                )}
                {showText && (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{user.user_metadata?.full_name || 'User'}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {isDesktop && showText && (
          <div className="py-2 border-t border-gray-700">
             <button
                className="p-2 flex items-center justify-center rounded hover:bg-gray-700 transition-colors w-full text-gray-400"
                onClick={() => setIsHovered(false)}
                aria-label={'Collapse sidebar'}
                >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  if (isDesktop) {
    return <div className="fixed inset-y-0 left-0 z-[9999]">{SidebarContent}</div>;
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sidebar-content"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="fixed inset-y-0 left-0 z-[9999]"
          >
            {SidebarContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
} 