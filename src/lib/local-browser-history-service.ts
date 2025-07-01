import { saveBrowserSearch, getBrowserHistory, type BrowserHistoryItem, type CreateBrowserHistoryItem } from './local-storage-service';

export class LocalBrowserHistoryService {
  async saveBrowserSearch(item: CreateBrowserHistoryItem): Promise<BrowserHistoryItem | null> {
    return saveBrowserSearch(item);
  }

  async getBrowserHistory(limit: number = 50): Promise<BrowserHistoryItem[]> {
    return getBrowserHistory(limit);
  }

  async findExactQuery(query: string): Promise<BrowserHistoryItem | null> {
    try {
      const history = await getBrowserHistory(100); // Search more items for exact match
      return history.find(item => item.query.toLowerCase() === query.toLowerCase()) || null;
    } catch (error) {
      console.error('Error finding exact query:', error);
      return null;
    }
  }
}

export const localBrowserHistoryService = new LocalBrowserHistoryService(); 