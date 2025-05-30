import { v4 as uuidv4 } from 'uuid';
import { Session } from './types'; // Assuming types.ts is in the same directory
// Assuming Message type is available from your chat component or types.ts
// For now, let's use a generic Message type placeholder if not explicitly defined in types.ts
// import { Message } from '../app/test/page'; // This would be a direct import
// To use the actual Message type, you would uncomment the import above
// and replace any[] with Message[] in getSessionMessages and saveSessionMessages.

const SESSIONS_KEY = 'chatSessions';
const SESSION_MESSAGES_PREFIX = 'sessionMessages_';

// Helper to get a title for a session from the first user message
export function getSessionTitleFromMessage(messageContent: string): string {
  if (!messageContent) return 'New Session';
  const words = messageContent.split(' ');
  if (words.length <= 5) {
    return messageContent;
  }
  return words.slice(0, 5).join(' ') + '...';
}

export function getSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  const sessionsJson = localStorage.getItem(SESSIONS_KEY);
  return sessionsJson ? JSON.parse(sessionsJson) : [];
}

export function saveSessions(sessions: Session[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function createNewSession(firstMessageContent?: string): Session {
  const sessions = getSessions();
  const newSession: Session = {
    id: uuidv4(),
    title: firstMessageContent ? getSessionTitleFromMessage(firstMessageContent) : 'New Session',
    timestamp: Date.now(),
  };
  sessions.unshift(newSession); // Add to the beginning
  saveSessions(sessions);
  return newSession;
}

export function getSessionMessages(sessionId: string): any[] { // TODO: Replace 'any' with Message[]
  if (typeof window === 'undefined') return [];
  const messagesJson = localStorage.getItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
  return messagesJson ? JSON.parse(messagesJson) : [];
}

export function saveSessionMessages(sessionId: string, messages: any[]): void { // TODO: Replace 'any' with Message[]
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`, JSON.stringify(messages));
}

export function deleteSession(sessionId: string): void {
  if (typeof window === 'undefined') return;
  let sessions = getSessions();
  sessions = sessions.filter(session => session.id !== sessionId);
  saveSessions(sessions);
  localStorage.removeItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
}

export function updateSessionTimestamp(sessionId: string): void {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex !== -1) {
    sessions[sessionIndex].timestamp = Date.now();
    // Move to top
    const updatedSession = sessions.splice(sessionIndex, 1)[0];
    sessions.unshift(updatedSession);
    saveSessions(sessions);
  }
} 