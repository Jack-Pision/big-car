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
      const { data } = await this.supabase.auth.getUser();
      if (!data?.user) {
        console.error('No authenticated user found');
        return null;
      }

      const { data: insertData, error } = await this.supabase
        .from('browser_history')
        .insert([
          {
            user_id: data.user.id,
            query: item.query,
            results_summary: item.results_summary,
            sources_count: item.sources_count || 0,
            search_results: item.search_results,
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error saving browser history:', error);
        return null;
      }

      return insertData;
    } catch (error) {
      console.error('Error in saveBrowserSearch:', error);
      return null;
    }
  }

  async getBrowserHistory(limit: number = 50): Promise<BrowserHistoryItem[]> {
    try {
      const { data } = await this.supabase.auth.getUser();
      if (!data?.user) {
        console.error('No authenticated user found');
        return [];
      }

      const { data: historyData, error } = await this.supabase
        .from('browser_history')
        .select('*')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching browser history:', error);
        return [];
      }

      return historyData || [];
    } catch (error) {
      console.error('Error in getBrowserHistory:', error);
      return [];
    }
  }

  async deleteBrowserHistoryItem(id: string): Promise<boolean> {
    try {
      const { data } = await this.supabase.auth.getUser();
      if (!data?.user) {
        console.error('No authenticated user found');
        return false;
      }

      const { error } = await this.supabase
        .from('browser_history')
        .delete()
        .eq('id', id)
        .eq('user_id', data.user.id);

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
      const { data } = await this.supabase.auth.getUser();
      if (!data?.user) {
        console.error('No authenticated user found');
        return false;
      }

      const { error } = await this.supabase
        .from('browser_history')
        .delete()
        .eq('user_id', data.user.id);

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
      const { data } = await this.supabase.auth.getUser();
      if (!data?.user) {
        console.error('No authenticated user found');
        return [];
      }

      const { data: searchData, error } = await this.supabase
        .from('browser_history')
        .select('*')
        .eq('user_id', data.user.id)
        .ilike('query', `%${searchTerm}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error searching browser history:', error);
        return [];
      }

      return searchData || [];
    } catch (error) {
      console.error('Error in searchBrowserHistory:', error);
      return [];
    }
  }
}

export const browserHistoryService = new BrowserHistoryService(); 