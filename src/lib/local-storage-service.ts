/**
 * Local Storage Service - Replace Supabase with localStorage
 * Handles sessions, messages, artifacts, browser history, and user preferences
 */

import { Session, Message, UserPreferences } from './types';
import { v4 as uuidv4 } from 'uuid';

// Local Storage Keys
const STORAGE_KEYS = {
  SESSIONS: 'chatSessions',
  SESSION_MESSAGES_PREFIX: 'sessionMessages_',
  ACTIVE_SESSION_ID: 'activeSessionId',
  USER_PREFERENCES: 'userPreferences',
  BROWSER_HISTORY: 'browserHistory',
  ARTIFACTS_V2: 'artifactsV2',
  USER_ID: 'userId'
};

// Generate a persistent user ID for the local session
function getUserId(): string {
  let userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
  }
  return userId;
}

// Session Management
export async function getSessions(): Promise<Session[]> {
  try {
    const sessionsJson = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const sessions = sessionsJson ? JSON.parse(sessionsJson) : [];
    return sessions.sort((a: Session, b: Session) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
}

export async function createNewSession(firstMessageContent?: string): Promise<Session> {
  const userId = getUserId();
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  
  const newSession: Session = {
    id: sessionId,
    user_id: userId,
    title: firstMessageContent ? 
      firstMessageContent.substring(0, 50) + (firstMessageContent.length > 50 ? '...' : '') :
      'New Chat',
    created_at: now,
    updated_at: now,
    timestamp: Date.now()
  };

  const sessions = await getSessions();
  sessions.unshift(newSession);
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  
  return newSession;
}

export async function updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
  try {
    const sessions = await getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    
    if (sessionIndex !== -1) {
      sessions[sessionIndex].title = newTitle;
      sessions[sessionIndex].updated_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    }
  } catch (error) {
    console.error('Error updating session title:', error);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    // Remove session
    const sessions = await getSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(filteredSessions));
    
    // Remove session messages
    localStorage.removeItem(STORAGE_KEYS.SESSION_MESSAGES_PREFIX + sessionId);
    
    // Clear active session if it was the deleted one
    const activeSessionId = await getActiveSessionId();
    if (activeSessionId === sessionId) {
      await saveActiveSessionId(null);
    }
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

// Message Management
export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  try {
    const messagesJson = localStorage.getItem(STORAGE_KEYS.SESSION_MESSAGES_PREFIX + sessionId);
    const messages = messagesJson ? JSON.parse(messagesJson) : [];
    return messages.sort((a: Message, b: Message) => {
      const aTime = new Date(a.created_at || a.timestamp || 0).getTime();
      const bTime = new Date(b.created_at || b.timestamp || 0).getTime();
      return aTime - bTime;
    });
  } catch (error) {
    console.error('Error getting session messages:', error);
    return [];
  }
}

export async function saveSessionMessages(sessionId: string, messages: Message[]): Promise<void> {
  try {
    const userId = getUserId();
    const processedMessages = messages.map(msg => ({
      ...msg,
      id: msg.id || uuidv4(),
      session_id: sessionId,
      user_id: userId,
      created_at: msg.created_at || new Date().toISOString(),
      timestamp: msg.timestamp || Date.now()
    }));
    
    localStorage.setItem(
      STORAGE_KEYS.SESSION_MESSAGES_PREFIX + sessionId, 
      JSON.stringify(processedMessages)
    );
    
    // Update session timestamp
    const sessions = await getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].updated_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    }
  } catch (error) {
    console.error('Error saving session messages:', error);
  }
}

export async function saveMessageInstantly(sessionId: string, message: Message): Promise<void> {
  try {
    const messages = await getSessionMessages(sessionId);
    const userId = getUserId();
    
    const processedMessage = {
      ...message,
      id: message.id || uuidv4(),
      session_id: sessionId,
      user_id: userId,
      created_at: message.created_at || new Date().toISOString(),
      timestamp: message.timestamp || Date.now()
    };
    
    // Check if message already exists
    const existingIndex = messages.findIndex(m => m.id === processedMessage.id);
    if (existingIndex !== -1) {
      messages[existingIndex] = processedMessage;
    } else {
      messages.push(processedMessage);
    }
    
    await saveSessionMessages(sessionId, messages);
  } catch (error) {
    console.error('Error saving message instantly:', error);
  }
}

export async function updateMessageContent(
  sessionId: string, 
  messageId: string, 
  content: string, 
  isProcessed: boolean = true
): Promise<void> {
  try {
    const messages = await getSessionMessages(sessionId);
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex !== -1) {
      messages[messageIndex].content = content;
      messages[messageIndex].is_processed = isProcessed;
      messages[messageIndex].isProcessed = isProcessed; // backward compatibility
      await saveSessionMessages(sessionId, messages);
    }
  } catch (error) {
    console.error('Error updating message content:', error);
  }
}

// Active Session Management
export async function saveActiveSessionId(sessionId: string | null): Promise<void> {
  try {
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
    }
  } catch (error) {
    console.error('Error saving active session ID:', error);
  }
}

export async function getActiveSessionId(): Promise<string | null> {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
  } catch (error) {
    console.error('Error getting active session ID:', error);
    return null;
  }
}

// Create new session with URL (for browser mode)
export async function createNewSessionWithURL(firstMessageContent: string): Promise<Session> {
  return createNewSession(firstMessageContent);
}

// Browser History Management
export interface BrowserHistoryItem {
  id: string;
  user_id: string;
  query: string;
  results_summary?: string;
  sources_count: number;
  search_results?: any;
  created_at: string;
}

export interface CreateBrowserHistoryItem {
  query: string;
  results_summary?: string;
  sources_count?: number;
  search_results?: any;
}

export async function saveBrowserSearch(item: CreateBrowserHistoryItem): Promise<BrowserHistoryItem | null> {
  try {
    const userId = getUserId();
    const historyItem: BrowserHistoryItem = {
      id: uuidv4(),
      user_id: userId,
      query: item.query,
      results_summary: item.results_summary,
      sources_count: item.sources_count || 0,
      search_results: item.search_results,
      created_at: new Date().toISOString()
    };
    
    const historyJson = localStorage.getItem(STORAGE_KEYS.BROWSER_HISTORY);
    const history = historyJson ? JSON.parse(historyJson) : [];
    history.unshift(historyItem);
    
    // Keep only last 100 items to prevent localStorage from growing too large
    if (history.length > 100) {
      history.splice(100);
    }
    
    localStorage.setItem(STORAGE_KEYS.BROWSER_HISTORY, JSON.stringify(history));
    return historyItem;
  } catch (error) {
    console.error('Error saving browser search:', error);
    return null;
  }
}

export async function getBrowserHistory(limit: number = 50): Promise<BrowserHistoryItem[]> {
  try {
    const historyJson = localStorage.getItem(STORAGE_KEYS.BROWSER_HISTORY);
    const history = historyJson ? JSON.parse(historyJson) : [];
    return history.slice(0, limit);
  } catch (error) {
    console.error('Error getting browser history:', error);
    return [];
  }
}

// Artifact V2 Management
export interface ArtifactV2 {
  id?: string;
  user_id: string;
  session_id?: string;
  title: string;
  content_markdown: string;
  content_json?: any;
  version?: number;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export class LocalArtifactV2Service {
  static async create(artifact: Omit<ArtifactV2, 'id' | 'created_at' | 'updated_at'>): Promise<ArtifactV2 | null> {
    try {
      const userId = getUserId();
      const now = new Date().toISOString();
      const artifactWithId: ArtifactV2 = {
        ...artifact,
        id: uuidv4(),
        user_id: userId,
        created_at: now,
        updated_at: now,
        version: artifact.version || 1
      };
      
      const artifactsJson = localStorage.getItem(STORAGE_KEYS.ARTIFACTS_V2);
      const artifacts = artifactsJson ? JSON.parse(artifactsJson) : [];
      artifacts.unshift(artifactWithId);
      
      localStorage.setItem(STORAGE_KEYS.ARTIFACTS_V2, JSON.stringify(artifacts));
      return artifactWithId;
    } catch (error) {
      console.error('Error creating artifact:', error);
      return null;
    }
  }

  static async getById(id: string): Promise<ArtifactV2 | null> {
    try {
      const artifactsJson = localStorage.getItem(STORAGE_KEYS.ARTIFACTS_V2);
      const artifacts = artifactsJson ? JSON.parse(artifactsJson) : [];
      return artifacts.find((artifact: ArtifactV2) => artifact.id === id) || null;
    } catch (error) {
      console.error('Error getting artifact by ID:', error);
      return null;
    }
  }

  static async update(id: string, updates: Partial<ArtifactV2>): Promise<ArtifactV2 | null> {
    try {
      const artifactsJson = localStorage.getItem(STORAGE_KEYS.ARTIFACTS_V2);
      const artifacts = artifactsJson ? JSON.parse(artifactsJson) : [];
      const artifactIndex = artifacts.findIndex((artifact: ArtifactV2) => artifact.id === id);
      
      if (artifactIndex !== -1) {
        artifacts[artifactIndex] = {
          ...artifacts[artifactIndex],
          ...updates,
          updated_at: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEYS.ARTIFACTS_V2, JSON.stringify(artifacts));
        return artifacts[artifactIndex];
      }
      return null;
    } catch (error) {
      console.error('Error updating artifact:', error);
      return null;
    }
  }

  static async listByUser(user_id: string): Promise<ArtifactV2[]> {
    try {
      const artifactsJson = localStorage.getItem(STORAGE_KEYS.ARTIFACTS_V2);
      const artifacts = artifactsJson ? JSON.parse(artifactsJson) : [];
      return artifacts
        .filter((artifact: ArtifactV2) => artifact.user_id === user_id)
        .sort((a: ArtifactV2, b: ArtifactV2) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
          return bTime - aTime;
        });
    } catch (error) {
      console.error('Error listing artifacts by user:', error);
      return [];
    }
  }
}

// User Preferences Management
export async function saveUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
  try {
    const userId = getUserId();
    const existing = await getUserPreferences();
    const updated = {
      ...existing,
      ...preferences,
      user_id: userId,
      updated_at: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving user preferences:', error);
  }
}

export async function getUserPreferences(): Promise<UserPreferences> {
  try {
    const prefsJson = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    return prefsJson ? JSON.parse(prefsJson) : { user_id: getUserId() };
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return { user_id: getUserId() };
  }
}

// Image Upload Service (local implementation)
export interface ImageUploadResult {
  success: boolean;
  imageUrl?: string;
  analysis?: string;
  error?: string;
}

export async function uploadImageToLocal(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({ success: true, url: dataUrl });
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Failed to read file' });
      };
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error('Error uploading image locally:', error);
    return { success: false, error: 'Failed to upload image' };
  }
}

// Export the current user ID getter
export { getUserId };

// Migration function to preserve existing localStorage data
export function migrateExistingData(): void {
  try {
    // This function ensures existing data structure compatibility
    // No migration needed since we're already using localStorage
    console.log('Local storage data migration completed (no changes needed)');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Optimized service wrapper (compatible with existing code)
export class LocalOptimizedService {
  private static instance: LocalOptimizedService;
  
  static getInstance(): LocalOptimizedService {
    if (!LocalOptimizedService.instance) {
      LocalOptimizedService.instance = new LocalOptimizedService();
    }
    return LocalOptimizedService.instance;
  }

  async getSessions(): Promise<Session[]> {
    return getSessions();
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return getSessionMessages(sessionId);
  }

  async saveSessionMessages(sessionId: string, messages: Message[]): Promise<void> {
    return saveSessionMessages(sessionId, messages);
  }

  async saveMessageInstantly(sessionId: string, message: Message): Promise<void> {
    return saveMessageInstantly(sessionId, message);
  }

  async updateMessageContent(sessionId: string, messageId: string, content: string, isProcessed: boolean = true): Promise<void> {
    return updateMessageContent(sessionId, messageId, content, isProcessed);
  }

  async createNewSession(firstMessageContent?: string): Promise<Session> {
    return createNewSession(firstMessageContent);
  }

  async createNewSessionWithURL(firstMessageContent: string): Promise<Session> {
    return createNewSessionWithURL(firstMessageContent);
  }

  async deleteSession(sessionId: string): Promise<void> {
    return deleteSession(sessionId);
  }

  async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
    return updateSessionTitle(sessionId, newTitle);
  }

  async saveActiveSessionId(sessionId: string | null): Promise<void> {
    return saveActiveSessionId(sessionId);
  }

  async getActiveSessionId(): Promise<string | null> {
    return getActiveSessionId();
  }
}

export const localOptimizedService = LocalOptimizedService.getInstance(); 