import { v4 as uuidv4 } from 'uuid';
import { Session } from './types'; // Assuming types.ts is in the same directory
// Assuming Message type is available from your chat component or types.ts
// For now, let's use a generic Message type placeholder if not explicitly defined in types.ts
// import { Message } from '../app/test/page'; // This would be a direct import
// To use the actual Message type, you would uncomment the import above
// and replace any[] with Message[] in getSessionMessages and saveSessionMessages.

const SESSIONS_KEY = 'chatSessions';
const SESSION_MESSAGES_PREFIX = 'sessionMessages_';
const ACTIVE_SESSION_KEY = 'activeSessionId';

// Helper to generate AI-powered session titles like ChatGPT
export async function generateSessionTitle(userMessage: string, aiResponse?: string): Promise<string> {
  if (!userMessage) return 'New Session';
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a title generator. Generate a concise, descriptive 3-5 word title for a chat conversation based on the user's message. The title should capture the main topic or intent. Examples:
            
User: "How do I create a React component with state management?"
Title: "React Component State Management"

User: "I need help with my JavaScript function that calculates fibonacci numbers"
Title: "JavaScript Fibonacci Function Help"

User: "Can you explain machine learning algorithms?"
Title: "Machine Learning Algorithms Explanation"

User: "Alright mate, I want your help with something"
Title: "General Help Request"

Only respond with the title, nothing else.`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.3,
        max_tokens: 20
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const title = data.content?.trim() || '';
      
      // Clean up the title - remove quotes and ensure it's reasonable length
      const cleanTitle = title.replace(/['"]/g, '').trim();
      
      // Fallback to simple title if AI response is too long or empty
      if (cleanTitle && cleanTitle.length <= 50) {
        return cleanTitle;
      }
    }
  } catch (error) {
    console.error('Error generating AI title:', error);
  }
  
  // Fallback to simple title generation
  return getSimpleSessionTitle(userMessage);
}

// Fallback helper for simple title generation (improved version of the old function)
function getSimpleSessionTitle(messageContent: string): string {
  if (!messageContent) return 'New Session';
  
  // Remove common filler words and phrases
  const fillerWords = ['hey', 'hi', 'hello', 'alright', 'mate', 'i want', 'i need', 'can you', 'help me', 'help with', 'your help with'];
  let cleanedMessage = messageContent.toLowerCase();
  
  fillerWords.forEach(filler => {
    cleanedMessage = cleanedMessage.replace(new RegExp(`\\b${filler}\\b`, 'g'), '');
  });
  
  // Clean up extra spaces and get meaningful words
  const meaningfulWords = cleanedMessage.trim().split(/\s+/).filter(word => word.length > 2);
  
  if (meaningfulWords.length === 0) {
    return 'General Chat';
  }
  
  // Take first 3-4 meaningful words and capitalize
  const titleWords = meaningfulWords.slice(0, 4);
  const title = titleWords.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  
  return title.length > 30 ? title.substring(0, 30) + '...' : title;
}

// Keep the old function for backward compatibility
export function getSessionTitleFromMessage(messageContent: string): string {
  return getSimpleSessionTitle(messageContent);
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

// New async function for creating sessions with AI-generated titles
export async function createNewSessionWithAITitle(firstMessageContent?: string): Promise<Session> {
  const sessions = getSessions();
  const newSession: Session = {
    id: uuidv4(),
    title: firstMessageContent ? await generateSessionTitle(firstMessageContent) : 'New Session',
    timestamp: Date.now(),
  };
  sessions.unshift(newSession); // Add to the beginning
  saveSessions(sessions);
  return newSession;
}

// Function to update session title after AI response is received
export async function updateSessionTitleWithAI(sessionId: string, userMessage: string, aiResponse?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const newTitle = await generateSessionTitle(userMessage, aiResponse);
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    
    if (sessionIndex !== -1) {
      sessions[sessionIndex].title = newTitle;
      saveSessions(sessions);
    }
  } catch (error) {
    console.error('Error updating session title:', error);
  }
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

export function saveActiveSessionId(sessionId: string | null): void {
  if (typeof window === 'undefined') return;
  if (sessionId) {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
} 