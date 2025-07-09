interface NotionTokens {
  access_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
}

class NotionOAuth {
  private storageKey = 'notion_oauth_tokens';

  /**
   * Store Notion OAuth tokens in localStorage
   */
  storeTokens(tokens: NotionTokens): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.storageKey, JSON.stringify(tokens));
    // Dispatch an event to notify other tabs/components
    window.dispatchEvent(new Event('storage'));
  }

  /**
   * Get stored Notion OAuth tokens from localStorage
   */
  getStoredTokens(): NotionTokens | null {
    if (typeof window === 'undefined') return null;
    const tokensStr = localStorage.getItem(this.storageKey);
    if (!tokensStr) return null;
    
    try {
      return JSON.parse(tokensStr) as NotionTokens;
    } catch (error) {
      console.error('Failed to parse Notion tokens:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated with Notion
   */
  isAuthenticated(): boolean {
    return this.getStoredTokens() !== null;
  }

  /**
   * Clear stored Notion OAuth tokens
   */
  clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.storageKey);
    // Dispatch an event to notify other tabs/components
    window.dispatchEvent(new Event('storage'));
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string): Promise<NotionTokens> {
    try {
      // In a real implementation, this would be a secure server-side call
      const response = await fetch('/api/notion/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`Failed to exchange code: ${response.statusText}`);
      }

      const tokens = await response.json();
      this.storeTokens(tokens);
      return tokens;
    } catch (error) {
      console.error('Notion OAuth error:', error);
      throw error;
    }
  }
}

export const notionOAuth = new NotionOAuth(); 