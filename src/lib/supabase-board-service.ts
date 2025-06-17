import { supabase } from './auth';
import { BoardContent } from './types';

// Get board content for the current user
export async function getBoardContent(): Promise<BoardContent | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('board_content')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No board content found, return default
        return {
          title: 'Untitled Document',
          content: ''
        };
      }
      console.error('Error fetching board content:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getBoardContent:', error);
    return null;
  }
}

// Save board content for the current user
export async function saveBoardContent(title: string, content: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('board_content')
      .upsert({
        user_id: user.id,
        title,
        content
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving board content:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in saveBoardContent:', error);
    throw error;
  }
}

// Delete board content for the current user
export async function deleteBoardContent(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('board_content')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting board content:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in deleteBoardContent:', error);
    throw error;
  }
} 