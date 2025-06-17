import { supabase } from './auth';
import { Session, Message, UserPreferences } from './types';
import { v4 as uuidv4 } from 'uuid';

// Helper to generate AI-powered session titles
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

// Fallback helper for simple title generation
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

// Get current user's sessions from Supabase
export async function getSessions(): Promise<Session[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }

    // Convert to frontend format with backward compatibility
    return data.map(session => ({
      id: session.id,
      title: session.title,
      timestamp: new Date(session.updated_at).getTime(),
      user_id: session.user_id,
      created_at: session.created_at,
      updated_at: session.updated_at
    }));
  } catch (error) {
    console.error('Error in getSessions:', error);
    return [];
  }
}

// Create a new session in Supabase
export async function createNewSession(firstMessageContent?: string): Promise<Session> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const title = firstMessageContent ? getSimpleSessionTitle(firstMessageContent) : 'New Session';
    
    const { data, error } = await supabase
      .from('sessions')
      .insert([{
        user_id: user.id,
        title: title
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      timestamp: new Date(data.created_at).getTime(),
      user_id: data.user_id,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  } catch (error) {
    console.error('Error in createNewSession:', error);
    throw error;
  }
}

// Create a new session with AI-generated title
export async function createNewSessionWithAITitle(firstMessageContent?: string): Promise<Session> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const title = firstMessageContent ? await generateSessionTitle(firstMessageContent) : 'New Session';
    
    const { data, error } = await supabase
      .from('sessions')
      .insert([{
        user_id: user.id,
        title: title
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating session with AI title:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      timestamp: new Date(data.created_at).getTime(),
      user_id: data.user_id,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  } catch (error) {
    console.error('Error in createNewSessionWithAITitle:', error);
    throw error;
  }
}

// Update session title with AI
export async function updateSessionTitleWithAI(sessionId: string, userMessage: string, aiResponse?: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newTitle = await generateSessionTitle(userMessage, aiResponse);
    
    const { error } = await supabase
      .from('sessions')
      .update({ title: newTitle })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating session title:', error);
    }
  } catch (error) {
    console.error('Error in updateSessionTitleWithAI:', error);
  }
}

// Get messages for a session from Supabase
export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    // Convert to frontend format with backward compatibility
    return data.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      // New format
      session_id: msg.session_id,
      user_id: msg.user_id,
      image_urls: msg.image_urls,
      web_sources: msg.web_sources,
      structured_content: msg.structured_content,
      parent_id: msg.parent_id,
      query: msg.query,
      is_search_result: msg.is_search_result,
      is_processed: msg.is_processed,
      is_streaming: msg.is_streaming,
      content_type: msg.content_type,
      created_at: msg.created_at,
      // Backward compatibility
      imageUrls: msg.image_urls,
      webSources: msg.web_sources,
      structuredContent: msg.structured_content,
      parentId: msg.parent_id,
      isSearchResult: msg.is_search_result,
      isProcessed: msg.is_processed,
      isStreaming: msg.is_streaming,
      contentType: msg.content_type
    }));
  } catch (error) {
    console.error('Error in getSessionMessages:', error);
    return [];
  }
}

// Save messages for a session to Supabase
export async function saveSessionMessages(sessionId: string, messages: Message[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Delete existing messages for this session (we'll insert all fresh)
    await supabase
      .from('messages')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', user.id);

    // Insert all messages
    const messagesToInsert = messages.map(msg => ({
      id: msg.id || uuidv4(),
      session_id: sessionId,
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      image_urls: msg.imageUrls || msg.image_urls,
      web_sources: msg.webSources || msg.web_sources,
      structured_content: msg.structuredContent || msg.structured_content,
      parent_id: msg.parentId || msg.parent_id,
      query: msg.query,
      is_search_result: msg.isSearchResult || msg.is_search_result || false,
      is_processed: msg.isProcessed !== undefined ? msg.isProcessed : (msg.is_processed !== undefined ? msg.is_processed : true),
      is_streaming: msg.isStreaming || msg.is_streaming || false,
      content_type: msg.contentType || msg.content_type
    }));

    if (messagesToInsert.length > 0) {
      const { error } = await supabase
        .from('messages')
        .insert(messagesToInsert);

      if (error) {
        console.error('Error saving messages:', error);
      }
    }

    // Update session timestamp
    await updateSessionTimestamp(sessionId);
  } catch (error) {
    console.error('Error in saveSessionMessages:', error);
  }
}

// Delete a session from Supabase
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Messages will be automatically deleted due to CASCADE
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting session:', error);
    }
  } catch (error) {
    console.error('Error in deleteSession:', error);
  }
}

// Update session timestamp
export async function updateSessionTimestamp(sessionId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating session timestamp:', error);
    }
  } catch (error) {
    console.error('Error in updateSessionTimestamp:', error);
  }
}

// Save active session ID to user preferences
export async function saveActiveSessionId(sessionId: string | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        active_session_id: sessionId
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving active session ID:', error);
    }
  } catch (error) {
    console.error('Error in saveActiveSessionId:', error);
  }
}

// Get active session ID from user preferences
export async function getActiveSessionId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_preferences')
      .select('active_session_id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No preferences found, return null
        return null;
      }
      console.error('Error getting active session ID:', error);
      return null;
    }

    return data?.active_session_id || null;
  } catch (error) {
    console.error('Error in getActiveSessionId:', error);
    return null;
  }
}

// Update session title directly
export async function updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('sessions')
      .update({ title: newTitle })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating session title:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in updateSessionTitle:', error);
    throw error;
  }
}

// Backward compatibility exports
export const getSessionTitleFromMessage = getSimpleSessionTitle; 