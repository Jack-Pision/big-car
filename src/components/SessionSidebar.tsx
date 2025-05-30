import { useState, useEffect } from 'react';
import { Session, Chat } from '../lib/types';
import { 
  createSession, 
  getSessions, 
  deleteSession, 
  getChats, 
  createChat, 
  deleteChat 
} from '../lib/session-service';
import { PlusIcon } from '@heroicons/react/24/solid';
import { TrashIcon, FolderIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';

interface SessionSidebarProps {
  onSelectChat: (chatId: string, sessionId: string) => void;
  onNewChat: (sessionId: string) => void;
  currentChatId?: string;
  currentSessionId?: string;
}

export default function SessionSidebar({
  onSelectChat,
  onNewChat,
  currentChatId,
  currentSessionId
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionChats, setSessionChats] = useState<Record<string, Chat[]>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [loading, setLoading] = useState(true);

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load chats for expanded sessions
  useEffect(() => {
    Object.entries(expandedSessions).forEach(([sessionId, isExpanded]) => {
      if (isExpanded && (!sessionChats[sessionId] || sessionChats[sessionId].length === 0)) {
        loadChatsForSession(sessionId);
      }
    });
  }, [expandedSessions, sessionChats]);

  // Load all sessions
  async function loadSessions() {
    setLoading(true);
    try {
      const fetchedSessions = await getSessions();
      setSessions(fetchedSessions);

      // Auto-expand the current session if one is selected
      if (currentSessionId) {
        setExpandedSessions(prev => ({
          ...prev,
          [currentSessionId]: true
        }));
        loadChatsForSession(currentSessionId);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  // Load chats for a specific session
  async function loadChatsForSession(sessionId: string) {
    try {
      const fetchedChats = await getChats(sessionId);
      setSessionChats(prev => ({
        ...prev,
        [sessionId]: fetchedChats
      }));
    } catch (error) {
      console.error(`Error loading chats for session ${sessionId}:`, error);
    }
  }

  // Toggle session expansion
  function toggleSessionExpansion(sessionId: string) {
    setExpandedSessions(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }));
  }

  // Handle create new session
  async function handleCreateSession() {
    if (!newSessionName.trim()) return;
    
    try {
      const createdSession = await createSession(newSessionName.trim());
      if (createdSession) {
        setSessions(prev => [createdSession, ...prev]);
        setExpandedSessions(prev => ({
          ...prev,
          [createdSession.id]: true
        }));
        // Create an initial chat for the new session
        handleCreateChat(createdSession.id);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setIsCreatingSession(false);
      setNewSessionName('');
    }
  }

  // Handle create new chat
  async function handleCreateChat(sessionId: string) {
    try {
      const newChat = await createChat(sessionId);
      if (newChat) {
        setSessionChats(prev => ({
          ...prev,
          [sessionId]: [newChat, ...(prev[sessionId] || [])]
        }));
        onNewChat(sessionId);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }

  // Handle delete session
  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this session? All chats will be lost.')) {
      return;
    }

    try {
      const success = await deleteSession(sessionId);
      if (success) {
        setSessions(prev => prev.filter(session => session.id !== sessionId));
        setSessionChats(prev => {
          const newSessionChats = { ...prev };
          delete newSessionChats[sessionId];
          return newSessionChats;
        });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }

  // Handle delete chat
  async function handleDeleteChat(chatId: string, sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      const success = await deleteChat(chatId);
      if (success) {
        setSessionChats(prev => ({
          ...prev,
          [sessionId]: prev[sessionId].filter(chat => chat.id !== chatId)
        }));
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  }

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Sessions</h2>
        <button
          onClick={() => setIsCreatingSession(true)}
          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>

      {isCreatingSession && (
        <div className="p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="Session name"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreateSession}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md"
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreatingSession(false);
                setNewSessionName('');
              }}
              className="text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-1 px-3 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="p-4 text-gray-500 dark:text-gray-400 text-center">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-gray-500 dark:text-gray-400 text-center">
            No sessions yet. Create one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {sessions.map((session) => (
              <li key={session.id} className="relative">
                <div
                  onClick={() => toggleSessionExpansion(session.id)}
                  className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <FolderIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                    {session.name}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="ml-auto text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                {expandedSessions[session.id] && (
                  <div className="pl-4 pr-2 pb-2">
                    <div className="border-t border-gray-200 dark:border-gray-800 mb-2 mt-1"></div>
                    <div className="flex items-center mb-2">
                      <button
                        onClick={() => handleCreateChat(session.id)}
                        className="text-xs flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      >
                        <PlusIcon className="h-3 w-3 mr-1" /> New Chat
                      </button>
                    </div>
                    {sessionChats[session.id] ? (
                      sessionChats[session.id].length > 0 ? (
                        <ul className="space-y-1">
                          {sessionChats[session.id].map((chat) => (
                            <li
                              key={chat.id}
                              onClick={() => onSelectChat(chat.id, session.id)}
                              className={`flex items-center px-2 py-2 rounded-md text-xs cursor-pointer ${
                                currentChatId === chat.id
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <ChatBubbleLeftIcon className="h-3 w-3 mr-2" />
                              <span className="truncate">
                                {chat.messages && chat.messages.length > 0
                                  ? chat.messages[0].content.substring(0, 20) + '...'
                                  : 'New Chat'}
                              </span>
                              <button
                                onClick={(e) => handleDeleteChat(chat.id, session.id, e)}
                                className="ml-auto text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                              >
                                <TrashIcon className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400 pl-2">
                          No chats in this session
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-gray-500 dark:text-gray-400 pl-2">
                        Loading chats...
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
} 