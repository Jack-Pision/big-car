import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Chat {
  id: string;
  title: string;
  timestamp: number;
  snippet: string;
}

interface SearchPopupProps {
  open: boolean;
  chats: Chat[];
  onClose: () => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onSelectChat: (id: string) => void;
}

export default function SearchPopup({ open, chats, onClose, onRename, onDelete, onSelectChat }: SearchPopupProps) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dropdownId, setDropdownId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setEditingId(null);
      setDropdownId(null);
      setConfirmDeleteId(null);
    }
  }, [open]);

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-50"
            aria-hidden="true"
            onClick={onClose}
          />
          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-2"
            aria-modal="true"
            role="dialog"
            tabIndex={-1}
          >
            <div className="bg-white text-[#1A1A1A] rounded-2xl shadow-2xl w-full max-w-md p-6 relative flex flex-col" style={{ minHeight: 320, maxHeight: '80vh' }}>
              {/* Close button */}
              <button
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
                onClick={onClose}
                aria-label="Close search"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              {/* Search input */}
              <input
                ref={inputRef}
                type="text"
                className="w-full mb-4 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 text-base bg-white text-[#1A1A1A]"
                placeholder="Search chats…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search chats"
              />
              {/* Results list */}
              <div className="flex-1 overflow-y-auto pr-1" style={{ minHeight: 120 }}>
                {filteredChats.length === 0 ? (
                  <div className="text-gray-400 text-center py-8">No chats found</div>
                ) : (
                  filteredChats.map(chat => (
                    <div key={chat.id} className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors relative">
                      {/* Chat label or input */}
                      {editingId === chat.id ? (
                        <input
                          className="flex-1 bg-white border border-black rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              onRename(chat.id, editValue);
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          autoFocus
                          aria-label="Edit chat title"
                        />
                      ) : (
                        <button
                          className="flex-1 text-left truncate font-medium text-[#1A1A1A] focus:outline-none"
                          onClick={() => onSelectChat(chat.id)}
                          tabIndex={0}
                          aria-label={`Open chat: ${chat.title}`}
                        >
                          <span>{chat.title}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </button>
                      )}
                      {/* Three-dot menu */}
                      <div className="relative">
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20"
                          onClick={e => { e.stopPropagation(); setDropdownId(dropdownId === chat.id ? null : chat.id); }}
                          aria-label="More actions"
                        >
                          <span className="text-xl">⋯</span>
                        </button>
                        <AnimatePresence>
                          {dropdownId === chat.id && (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                            >
                              <button
                                className="w-full px-4 py-2 text-left text-sm text-[#1A1A1A] hover:bg-gray-100 rounded-t-lg focus:outline-none"
                                onClick={() => { setEditingId(chat.id); setEditValue(chat.title); setDropdownId(null); }}
                              >Rename</button>
                              <button
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-lg focus:outline-none"
                                onClick={() => { setConfirmDeleteId(chat.id); setDropdownId(null); }}
                              >Delete</button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      {/* Delete confirmation modal */}
                      <AnimatePresence>
                        {confirmDeleteId === chat.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            <div className="bg-white rounded-lg shadow-lg p-6 w-80" onClick={e => e.stopPropagation()}>
                              <div className="text-lg font-semibold mb-2">Delete chat?</div>
                              <div className="text-gray-600 mb-4">Are you sure you want to delete this chat? This action cannot be undone.</div>
                              <div className="flex justify-end gap-2">
                                <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                                <button className="px-3 py-1 rounded bg-black text-white hover:bg-neutral-800" onClick={() => { onDelete(chat.id); setConfirmDeleteId(null); }}>Delete</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
} 