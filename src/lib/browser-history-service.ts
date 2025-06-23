import { createSupabaseClient } from './supabase-client';

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

class BrowserHistoryService {
  private supabase = createSupabaseClient();

  async saveBrowserSearch(item: CreateBrowserHistoryItem): Promise<BrowserHistoryItem | null> {
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('No authenticated user found:', authError);
        return null;
      }

      const { data, error } = await this.supabase
        .from('browser_history')
        .insert([
          {
            user_id: user.id,
            query: item.query,
            results_summary: item.results_summary,
            sources_count: item.sources_count || 0,
            search_results: item.search_results,
          }
        ])
        .select()
        .single();

      if (error || !data) {
        console.error('Error saving browser history:', error);
        return null;
      }

      return data as BrowserHistoryItem;
    } catch (error) {
      console.error('Error in saveBrowserSearch:', error);
      return null;
    }
  }

  async getBrowserHistory(limit: number = 50): Promise<BrowserHistoryItem[]> {
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('No authenticated user found:', authError);
        return [];
      }

      const { data, error } = await this.supabase
        .from('browser_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching browser history:', error);
        return [];
      }

      return (data as BrowserHistoryItem[]) || [];
    } catch (error) {
      console.error('Error in getBrowserHistory:', error);
      return [];
    }
  }

  async deleteBrowserHistoryItem(id: string): Promise<boolean> {
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('No authenticated user found:', authError);
        return false;
      }

      const { error } = await this.supabase
        .from('browser_history')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting browser history item:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteBrowserHistoryItem:', error);
      return false;
    }
  }

  async clearBrowserHistory(): Promise<boolean> {
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('No authenticated user found:', authError);
        return false;
      }

      const { error } = await this.supabase
        .from('browser_history')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error clearing browser history:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in clearBrowserHistory:', error);
      return false;
    }
  }

  async searchBrowserHistory(searchTerm: string, limit: number = 20): Promise<BrowserHistoryItem[]> {
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('No authenticated user found:', authError);
        return [];
      }

      const { data, error } = await this.supabase
        .from('browser_history')
        .select('*')
        .eq('user_id', user.id)
        .ilike('query', `%${searchTerm}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error searching browser history:', error);
        return [];
      }

      return (data as BrowserHistoryItem[]) || [];
    } catch (error) {
      console.error('Error in searchBrowserHistory:', error);
      return [];
    }
  }
}

export const browserHistoryService = new BrowserHistoryService(); 