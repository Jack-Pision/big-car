import { notionOAuth } from './notion-oauth';

interface NotionPage {
  id: string;
  url: string;
  title: string;
  created_time: string;
  last_edited_time: string;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
}

class NotionIntegration {
  private baseUrl = 'https://api.notion.com/v1';
  private version = '2022-06-28';

  /**
   * Get the access token from storage
   */
  private getAccessToken(): string {
    const tokens = notionOAuth.getStoredTokens();
    if (!tokens) {
      throw new Error('Not authenticated with Notion');
    }
    return tokens.access_token;
  }

  /**
   * Make an authenticated request to the Notion API
   */
  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    try {
      const accessToken = this.getAccessToken();
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Notion API error: ${response.status} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      console.error('Notion API request failed:', error);
      throw error;
    }
  }

  /**
   * Get user's Notion workspaces
   */
  async getWorkspaces() {
    try {
      const response = await this.request<any>('/users/me');
      return {
        user: response,
        workspace: {
          id: notionOAuth.getStoredTokens()?.workspace_id,
          name: notionOAuth.getStoredTokens()?.workspace_name,
          icon: notionOAuth.getStoredTokens()?.workspace_icon
        }
      };
    } catch (error) {
      console.error('Failed to get workspaces:', error);
      throw error;
    }
  }

  /**
   * Search for pages and databases
   */
  async search(query: string = '', limit: number = 10) {
    try {
      const response = await this.request<any>('/search', 'POST', {
        query,
        page_size: limit
      });
      return response.results;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Create a new page in a workspace
   */
  async createWorkspacePage(title: string, content: string): Promise<NotionPage> {
    try {
      const response = await this.request<any>('/pages', 'POST', {
        parent: { type: 'workspace', workspace: true },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title
                }
              }
            ]
          }
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content
                  }
                }
              ]
            }
          }
        ]
      });

      return {
        id: response.id,
        url: response.url,
        title,
        created_time: response.created_time,
        last_edited_time: response.last_edited_time
      };
    } catch (error) {
      console.error('Failed to create page:', error);
      throw error;
    }
  }

  /**
   * Get a list of databases the integration has access to
   */
  async getDatabases(): Promise<NotionDatabase[]> {
    try {
      const results = await this.search('', 100);
      return results
        .filter((item: any) => item.object === 'database')
        .map((db: any) => ({
          id: db.id,
          title: db.title?.[0]?.plain_text || 'Untitled',
          url: db.url
        }));
    } catch (error) {
      console.error('Failed to get databases:', error);
      throw error;
    }
  }

  /**
   * Add a page to a database
   */
  async addToDatabase(
    databaseId: string,
    properties: Record<string, any>
  ): Promise<NotionPage> {
    try {
      const response = await this.request<any>('/pages', 'POST', {
        parent: { database_id: databaseId },
        properties
      });

      return {
        id: response.id,
        url: response.url,
        title: properties.Name?.title?.[0]?.text?.content || 'Untitled',
        created_time: response.created_time,
        last_edited_time: response.last_edited_time
      };
    } catch (error) {
      console.error('Failed to add to database:', error);
      throw error;
    }
  }
}

export const notionIntegration = new NotionIntegration(); 