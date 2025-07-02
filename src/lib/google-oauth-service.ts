export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  userId?: string;
}

export class GoogleOAuthService {
  private config: GoogleOAuthConfig;
  private credentials: GoogleAuthCredentials | null = null;

  constructor(config: GoogleOAuthConfig) {
    this.config = config;
    this.loadStoredCredentials();
  }

  // Generate OAuth URL for user authorization
  generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state })
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code: string): Promise<GoogleAuthCredentials> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error(`OAuth token exchange failed: ${response.status}`);
      }

      const tokenData: GoogleTokenResponse = await response.json();
      
      const credentials: GoogleAuthCredentials = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
      };

      await this.storeCredentials(credentials);
      this.credentials = credentials;
      
      return credentials;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(): Promise<GoogleAuthCredentials> {
    if (!this.credentials?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.credentials.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData: GoogleTokenResponse = await response.json();
      
      const updatedCredentials: GoogleAuthCredentials = {
        ...this.credentials,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      };

      await this.storeCredentials(updatedCredentials);
      this.credentials = updatedCredentials;
      
      return updatedCredentials;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }

  // Get valid access token (refresh if needed)
  async getValidAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Not authenticated');
    }

    // Check if token is expired (with 5 minute buffer)
    if (this.credentials.expiresAt <= Date.now() + 300000) {
      await this.refreshAccessToken();
    }

    return this.credentials.accessToken;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.credentials?.accessToken;
  }

  // Get current credentials
  getCredentials(): GoogleAuthCredentials | null {
    return this.credentials;
  }

  // Store credentials in localStorage
  private async storeCredentials(credentials: GoogleAuthCredentials): Promise<void> {
    try {
      const encrypted = btoa(JSON.stringify(credentials));
      localStorage.setItem('google_oauth_credentials', encrypted);
    } catch (error) {
      console.error('Error storing credentials:', error);
    }
  }

  // Load credentials from localStorage
  private loadStoredCredentials(): void {
    try {
      const stored = localStorage.getItem('google_oauth_credentials');
      if (stored) {
        const decrypted = JSON.parse(atob(stored));
        this.credentials = decrypted;
      }
    } catch (error) {
      console.error('Error loading stored credentials:', error);
      localStorage.removeItem('google_oauth_credentials');
    }
  }

  // Revoke access and clear stored credentials
  async revokeAccess(): Promise<void> {
    if (this.credentials?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.credentials.accessToken}`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Error revoking access:', error);
      }
    }

    this.credentials = null;
    localStorage.removeItem('google_oauth_credentials');
  }

  // Make authenticated API request
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = await this.getValidAccessToken();
    
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  // Get user profile information
  async getUserProfile(): Promise<any> {
    const response = await this.makeAuthenticatedRequest(
      'https://www.googleapis.com/oauth2/v2/userinfo'
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    return response.json();
  }

  // Check which Google services are accessible with current scopes
  getAvailableServices(): string[] {
    if (!this.credentials?.scope) return [];

    const scope = this.credentials.scope;
    const services: string[] = [];

    if (scope.includes('gmail')) services.push('gmail');
    if (scope.includes('calendar')) services.push('calendar');
    if (scope.includes('drive')) services.push('drive');
    if (scope.includes('docs')) services.push('docs');
    if (scope.includes('sheets')) services.push('sheets');

    return services;
  }

  // Update configuration
  updateConfig(config: Partial<GoogleOAuthConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Default scopes for task automation
export const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
];

// Create singleton instance
let googleOAuthService: GoogleOAuthService | null = null;

export function getGoogleOAuthService(config?: GoogleOAuthConfig): GoogleOAuthService {
  if (!googleOAuthService && config) {
    googleOAuthService = new GoogleOAuthService(config);
  }
  
  if (!googleOAuthService) {
    throw new Error('Google OAuth service not initialized');
  }
  
  return googleOAuthService;
} 