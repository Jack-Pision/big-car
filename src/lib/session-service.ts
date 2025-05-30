import { v4 as uuidv4 } from 'uuid';
import { createSupabaseClient } from './supabase-client';
import { Session, Chat, Message } from './types';

// Supabase table names
const SESSIONS_TABLE = 'sessions';
const CHATS_TABLE = 'chats';
const MESSAGES_TABLE = 'messages';

/**
 * Creates a new session
 */
export async function createSession(name: string, description?: string): Promise<Session | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const now = Date.now();
  const session: Session = {
    id: uuidv4(),
    name,
    description,
    createdAt: now,
    updatedAt: now
  };

  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .insert(session);

  if (error) {
    console.error('Error creating session:', error);
    return null;
  }

  return session;
}

/**
 * Gets all sessions
 */
export async function getSessions(): Promise<Session[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .order('updatedAt', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  return data || [];
}

/**
 * Gets a session by ID
 */
export async function getSession(id: string): Promise<Session | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching session:', error);
    return null;
  }

  return data;
}

/**
 * Updates a session
 */
export async function updateSession(session: Session): Promise<Session | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const updatedSession = {
    ...session,
    updatedAt: Date.now()
  };

  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update(updatedSession)
    .eq('id', session.id);

  if (error) {
    console.error('Error updating session:', error);
    return null;
  }

  return updatedSession;
}

/**
 * Deletes a session and all associated chats and messages
 */
export async function deleteSession(id: string): Promise<boolean> {
  const supabase = createSupabaseClient();
  if (!supabase) return false;

  // Delete session (cascade delete should handle chats and messages)
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting session:', error);
    return false;
  }

  return true;
}

/**
 * Creates a new chat in a session
 */
export async function createChat(sessionId: string): Promise<Chat | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const now = Date.now();
  const chat: Chat = {
    id: uuidv4(),
    sessionId,
    messages: [],
    createdAt: now,
    updatedAt: now
  };

  const { error } = await supabase
    .from(CHATS_TABLE)
    .insert(chat);

  if (error) {
    console.error('Error creating chat:', error);
    return null;
  }

  return chat;
}

/**
 * Gets all chats for a session
 */
export async function getChats(sessionId: string): Promise<Chat[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(CHATS_TABLE)
    .select('*')
    .eq('sessionId', sessionId)
    .order('updatedAt', { ascending: false });

  if (error) {
    console.error('Error fetching chats:', error);
    return [];
  }

  return data || [];
}

/**
 * Gets a chat by ID
 */
export async function getChat(id: string): Promise<Chat | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(CHATS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching chat:', error);
    return null;
  }

  return data;
}

/**
 * Updates a chat's messages
 */
export async function updateChatMessages(chatId: string, messages: Message[]): Promise<boolean> {
  const supabase = createSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from(CHATS_TABLE)
    .update({
      messages,
      updatedAt: Date.now()
    })
    .eq('id', chatId);

  if (error) {
    console.error('Error updating chat messages:', error);
    return false;
  }

  return true;
}

/**
 * Deletes a chat
 */
export async function deleteChat(id: string): Promise<boolean> {
  const supabase = createSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from(CHATS_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting chat:', error);
    return false;
  }

  return true;
}

/**
 * Creates the Supabase tables if they don't exist
 * This should be called when the app initializes
 */
export async function ensureTablesExist(): Promise<boolean> {
  const supabase = createSupabaseClient();
  if (!supabase) return false;

  try {
    // Check if the sessions table exists
    const { error: sessionsCheckError } = await supabase
      .from(SESSIONS_TABLE)
      .select('id')
      .limit(1);

    if (sessionsCheckError) {
      // Create sessions table
      const { error: createSessionsError } = await supabase.rpc('create_sessions_table');
      if (createSessionsError) {
        console.error('Error creating sessions table:', createSessionsError);
        return false;
      }
    }

    // Check if the chats table exists
    const { error: chatsCheckError } = await supabase
      .from(CHATS_TABLE)
      .select('id')
      .limit(1);

    if (chatsCheckError) {
      // Create chats table
      const { error: createChatsError } = await supabase.rpc('create_chats_table');
      if (createChatsError) {
        console.error('Error creating chats table:', createChatsError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error ensuring tables exist:', error);
    return false;
  }
} 