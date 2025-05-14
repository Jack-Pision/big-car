import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Chat {
  id: string;
  title: string;
  timestamp: number;
  snippet: string;
}

interface SidebarProps {
  open: boolean;
  chats: Chat[];
  activeChatId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onEditChat: (id: string, newTitle: string) => void;
  onDeleteChat: (id: string) => void;
  onClearAll: () => void;
  onOpenSearch: () => void;
  onNavigateBoard: () => void;
}

export default function Sidebar({
  open,
  chats,
  activeChatId,
  onClose,
  onNewChat,
  onSelectChat,
  onEditChat,
  onDeleteChat,
  onClearAll,
  onOpenSearch,
  onNavigateBoard,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay for all screen sizes */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-30"
            aria-hidden="true"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-40 w-72 max-w-full bg-white shadow-xl flex flex-col border-r border-gray-200 h-full transition-all"
            aria-label="Sidebar navigation"
          >
            <div className="flex flex-col h-full relative z-40">
              {/* New Chat Button */}
              <button
                className="m-4 mb-2 py-2 px-4 rounded-lg bg-black text-white font-semibold hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
                onClick={onNewChat}
                aria-label="Start a new chat"
              >
                + New Chat
              </button>
              {/* Search Icon Button */}
              <button
                className="mx-4 mb-4 flex items-center justify-center w-10 h-10 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30"
                onClick={onOpenSearch}
                aria-label="Search chats"
                tabIndex={0}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
              {/* Board Navigation Button */}
              <button
                className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[#6B7280] hover:bg-[#F5F5F5] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/10"
                onClick={onNavigateBoard}
                aria-label="Go to Board"
                tabIndex={0}
              >
                <svg width="20" height="20" fill="none" stroke="#6B7280" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
                <span className="font-medium">Board</span>
              </button>
              {/* Chat List */}
              <div className="flex-1 overflow-y-auto px-2 pb-2">
                {chats.length === 0 && (
                  <div className="text-gray-400 text-sm text-center mt-8">No chats yet</div>
                )}
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-2 p-2 rounded-lg mb-1 cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-100'}`}
                    onClick={() => onSelectChat(chat.id)}
                    tabIndex={0}
                    aria-label={`Open chat: ${chat.title}`}
                  >
                    {/* Chat Title (editable) */}
                    {editingId === chat.id ? (
                      <input
                        className="flex-1 bg-white border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            onEditChat(chat.id, editValue);
                            setEditingId(null);
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        autoFocus
                        aria-label="Edit chat title"
                      />
                    ) : (
                      <span className="flex-1 truncate font-medium text-gray-900" title={chat.title}>
                        {chat.title}
                      </span>
                    )}
                    {/* Timestamp */}
                    <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                      {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {/* Edit Icon */}
                    {editingId === chat.id ? (
                      <button
                        className="ml-1 p-1 rounded hover:bg-blue-100 transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          onEditChat(chat.id, editValue);
                          setEditingId(null);
                        }}
                        aria-label="Save chat title"
                        title="Save"
                      >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                      </button>
                    ) : (
                      <button
                        className="ml-1 p-1 rounded hover:bg-blue-100 transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          setEditingId(chat.id);
                          setEditValue(chat.title);
                        }}
                        aria-label="Edit chat title"
                        title="Edit"
                      >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17v4h4l12-12a2 2 0 0 0-2.828-2.828L3 17z" /></svg>
                      </button>
                    )}
                    {/* Delete Icon */}
                    <button
                      className="ml-1 p-1 rounded hover:bg-red-100 transition-colors"
                      onClick={e => {
                        e.stopPropagation();
                        setShowDeleteId(chat.id);
                      }}
                      aria-label="Delete chat"
                      title="Delete"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6" /></svg>
                    </button>
                    {/* Chat Snippet */}
                    <span className="block text-xs text-gray-500 truncate w-full mt-1 ml-6">
                      {chat.snippet}
                    </span>
                    {/* Delete Confirmation Modal */}
                    <AnimatePresence>
                      {showDeleteId === chat.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                          onClick={() => setShowDeleteId(null)}
                        >
                          <div className="bg-white rounded-lg shadow-lg p-6 w-80" onClick={e => e.stopPropagation()}>
                            <div className="text-lg font-semibold mb-2">Delete chat?</div>
                            <div className="text-gray-600 mb-4">Are you sure you want to delete this chat? This action cannot be undone.</div>
                            <div className="flex justify-end gap-2">
                              <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setShowDeleteId(null)}>Cancel</button>
                              <button className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600" onClick={() => { onDeleteChat(chat.id); setShowDeleteId(null); }}>Delete</button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className="mt-auto p-4 border-t border-gray-100">
                <button
                  className="w-full py-2 rounded-lg bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition-colors duration-200 mb-2"
                  onClick={() => setShowClearAll(true)}
                  aria-label="Clear all chats"
                >
                  Clear All Chats
                </button>
                <div className="text-xs text-gray-400 text-center mt-2">
                  Study Assistant v1.0<br />
                  <span className="text-gray-300">by Jack-Pision</span>
                </div>
              </div>
              {/* Clear All Confirmation Modal */}
              <AnimatePresence>
                {showClearAll && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                    onClick={() => setShowClearAll(false)}
                  >
                    <div className="bg-white rounded-lg shadow-lg p-6 w-80" onClick={e => e.stopPropagation()}>
                      <div className="text-lg font-semibold mb-2">Clear all chats?</div>
                      <div className="text-gray-600 mb-4">Are you sure you want to clear all chat history? This action cannot be undone.</div>
                      <div className="flex justify-end gap-2">
                        <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setShowClearAll(false)}>Cancel</button>
                        <button className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600" onClick={() => { onClearAll(); setShowClearAll(false); }}>Clear All</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
} 