import { GoogleAuthCredentials } from './google-oauth-service';

export interface GoogleWorkspaceTool {
  name: string;
  description: string;
  requiredScopes: string[];
  execute: (input: string, credentials: GoogleAuthCredentials) => Promise<any>;
}

export class GoogleWorkspaceTools {
  private credentials: GoogleAuthCredentials;

  constructor(credentials: GoogleAuthCredentials) {
    this.credentials = credentials;
  }

  // Document Creation Tool
  async createDocument(params: {
    title: string;
    content: string;
  }): Promise<{
    documentId: string;
    webViewLink: string;
  }> {
    try {
      const response = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: params.title,
          body: {
            content: [{
              paragraph: {
                elements: [{
                  textRun: {
                    content: params.content
                  }
                }]
              }
            }]
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Document creation failed: ${errorText}`);
      }

      const documentData = await response.json();
      return {
        documentId: documentData.documentId,
        webViewLink: `https://docs.google.com/document/d/${documentData.documentId}/edit`
      };
    } catch (error) {
      console.error('Google Docs API Error:', error);
      throw error;
    }
  }

  // File Search Tool
  async searchFiles(params: {
    query: string;
    mimeType?: string;
    maxResults?: number;
  }): Promise<Array<{
    id: string;
    name: string;
    webViewLink: string;
    mimeType: string;
  }>> {
    try {
      const queryParams = new URLSearchParams({
        q: params.query,
        pageSize: (params.maxResults || 10).toString(),
        ...(params.mimeType ? { mimeType: params.mimeType } : {})
      });

      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`File search failed: ${errorText}`);
      }

      const filesData = await response.json();
      return filesData.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        mimeType: file.mimeType
      }));
    } catch (error) {
      console.error('Google Drive API Error:', error);
      throw error;
    }
  }

  // Calendar Event Creation Tool
  async createCalendarEvent(params: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
  }): Promise<{
    eventId: string;
    htmlLink: string;
  }> {
    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: params.summary,
          description: params.description,
          start: { dateTime: params.startTime },
          end: { dateTime: params.endTime },
          attendees: params.attendees?.map(email => ({ email }))
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Calendar event creation failed: ${errorText}`);
      }

      const eventData = await response.json();
      return {
        eventId: eventData.id,
        htmlLink: eventData.htmlLink
      };
    } catch (error) {
      console.error('Google Calendar API Error:', error);
      throw error;
    }
  }

  // Spreadsheet Creation Tool
  async createSpreadsheet(params: {
    title: string;
    sheets?: Array<{
      title: string;
      data: string[][];
    }>;
  }): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }> {
    try {
      const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title: params.title },
          sheets: params.sheets?.map(sheet => ({
            properties: { title: sheet.title },
            data: [{
              rowData: sheet.data.map(row => ({
                values: row.map(cell => ({
                  userEnteredValue: { stringValue: cell }
                }))
              }))
            }]
          }))
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Spreadsheet creation failed: ${errorText}`);
      }

      const spreadsheetData = await response.json();
      return {
        spreadsheetId: spreadsheetData.spreadsheetId,
        spreadsheetUrl: spreadsheetData.spreadsheetUrl
      };
    } catch (error) {
      console.error('Google Sheets API Error:', error);
      throw error;
    }
  }

  // Predefined tool set for easy access
  static getWorkspaceTools(credentials: GoogleAuthCredentials): GoogleWorkspaceTool[] {
    const tools = new GoogleWorkspaceTools(credentials);
    return [
      {
        name: 'create_document',
        description: 'Create a new Google Document',
        requiredScopes: [
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/drive.file'
        ],
        execute: async (input, creds) => {
          return tools.createDocument({
            title: 'AI Generated Document',
            content: input
          });
        }
      },
      {
        name: 'search_files',
        description: 'Search through Google Drive files',
        requiredScopes: [
          'https://www.googleapis.com/auth/drive.readonly'
        ],
        execute: async (input, creds) => {
          return tools.searchFiles({
            query: input,
            maxResults: 5
          });
        }
      },
      {
        name: 'create_calendar_event',
        description: 'Create a new Google Calendar event',
        requiredScopes: [
          'https://www.googleapis.com/auth/calendar'
        ],
        execute: async (input, creds) => {
          return tools.createCalendarEvent({
            summary: input,
            startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
          });
        }
      }
    ];
  }
} 