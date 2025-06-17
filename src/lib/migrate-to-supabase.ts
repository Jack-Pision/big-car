import { supabase } from './auth';
import { Session, Message } from './types';
import { v4 as uuidv4 } from 'uuid';

const SESSIONS_KEY = 'chatSessions';
const SESSION_MESSAGES_PREFIX = 'sessionMessages_';
const ACTIVE_SESSION_KEY = 'activeSessionId';

// Migrate localStorage sessions and messages to Supabase
export async function migrateLocalStorageToSupabase(): Promise<{
  success: boolean;
  sessionsCount: number;
  messagesCount: number;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if user already has data in Supabase
    const { data: existingSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    // If user already has sessions in Supabase, skip migration
    if (existingSessions && existingSessions.length > 0) {
      console.log('User already has data in Supabase, skipping migration');
      return {
        success: true,
        sessionsCount: 0,
        messagesCount: 0
      };
    }

    let sessionsCount = 0;
    let messagesCount = 0;

    // Get localStorage sessions
    const localSessions = getLocalStorageSessions();
    
    if (localSessions.length === 0) {
      console.log('No localStorage sessions found');
      return {
        success: true,
        sessionsCount: 0,
        messagesCount: 0
      };
    }

    console.log(`Migrating ${localSessions.length} sessions to Supabase...`);

    // Migrate each session
    for (const localSession of localSessions) {
      try {
        // Create session in Supabase
        const { data: newSession, error: sessionError } = await supabase
          .from('sessions')
          .insert([{
            id: localSession.id,
            user_id: user.id,
            title: localSession.title,
            created_at: new Date(localSession.timestamp || Date.now()).toISOString(),
            updated_at: new Date(localSession.timestamp || Date.now()).toISOString()
          }])
          .select()
          .single();

        if (sessionError) {
          console.error(`Error migrating session ${localSession.id}:`, sessionError);
          continue;
        }

        sessionsCount++;

        // Get messages for this session
        const localMessages = getLocalStorageMessages(localSession.id);
        
        if (localMessages.length > 0) {
          // Prepare messages for Supabase
          const messagesToInsert = localMessages.map(msg => ({
            id: msg.id || uuidv4(),
            session_id: localSession.id,
            user_id: user.id,
            role: msg.role,
            content: msg.content,
            image_urls: msg.imageUrls || [],
            web_sources: msg.webSources || null,
            structured_content: msg.structuredContent || null,
            parent_id: msg.parentId || null,
            query: msg.query || null,
            is_search_result: msg.isSearchResult || false,
            is_processed: msg.isProcessed !== undefined ? msg.isProcessed : true,
            is_streaming: msg.isStreaming || false,
            content_type: msg.contentType || null,
            created_at: new Date(msg.timestamp || Date.now()).toISOString()
          }));

          // Insert messages
          const { error: messagesError } = await supabase
            .from('messages')
            .insert(messagesToInsert);

          if (messagesError) {
            console.error(`Error migrating messages for session ${localSession.id}:`, messagesError);
          } else {
            messagesCount += messagesToInsert.length;
          }
        }
      } catch (error) {
        console.error(`Error processing session ${localSession.id}:`, error);
      }
    }

    // Migrate active session ID
    const activeSessionId = getLocalStorageActiveSessionId();
    if (activeSessionId) {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          active_session_id: activeSessionId
        }, {
          onConflict: 'user_id'
        });
    }

    console.log(`Migration completed: ${sessionsCount} sessions, ${messagesCount} messages`);

    return {
      success: true,
      sessionsCount,
      messagesCount
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      sessionsCount: 0,
      messagesCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Clear localStorage data after successful migration
export function clearLocalStorageData(): void {
  try {
    if (typeof window === 'undefined') return;

    // Get all sessions to clear their messages
    const sessions = getLocalStorageSessions();
    
    // Clear session messages
    sessions.forEach(session => {
      localStorage.removeItem(`${SESSION_MESSAGES_PREFIX}${session.id}`);
    });

    // Clear sessions and active session
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    
    console.log('localStorage data cleared successfully');
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
}

// Helper functions to read localStorage data
function getLocalStorageSessions(): Session[] {
  try {
    if (typeof window === 'undefined') return [];
    const sessionsJson = localStorage.getItem(SESSIONS_KEY);
    return sessionsJson ? JSON.parse(sessionsJson) : [];
  } catch (error) {
    console.error('Error reading localStorage sessions:', error);
    return [];
  }
}

function getLocalStorageMessages(sessionId: string): Message[] {
  try {
    if (typeof window === 'undefined') return [];
    const messagesJson = localStorage.getItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
    return messagesJson ? JSON.parse(messagesJson) : [];
  } catch (error) {
    console.error('Error reading localStorage messages:', error);
    return [];
  }
}

function getLocalStorageActiveSessionId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch (error) {
    console.error('Error reading localStorage active session:', error);
    return null;
  }
}

// Check if user has localStorage data that needs migration
export function hasLocalStorageData(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const sessions = getLocalStorageSessions();
    return sessions.length > 0;
  } catch (error) {
    return false;
  }
} 