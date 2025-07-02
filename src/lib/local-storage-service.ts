// Local Storage Service for browser-based data persistence
// This service handles all localStorage operations for the application

import { GoogleAuthCredentials } from './google-oauth-service';

export interface LocalStorageService {
  // OAuth credentials
  getOAuthCredentials(): GoogleAuthCredentials | null;
  setOAuthCredentials(credentials: GoogleAuthCredentials): void;
  removeOAuthCredentials(): void;
  
  // Existing functionality (sessions, messages, etc.)
  [key: string]: any;
}

class LocalStorageServiceImpl implements LocalStorageService {
  private isClient = typeof window !== 'undefined';

  // OAuth credentials management
  getOAuthCredentials(): GoogleAuthCredentials | null {
    if (!this.isClient) return null;
    
    try {
      const stored = localStorage.getItem('google_oauth_credentials');
      if (stored) {
        const decrypted = JSON.parse(atob(stored));
        return decrypted;
      }
      return null;
    } catch (error) {
      console.error('Error loading OAuth credentials:', error);
      this.removeOAuthCredentials();
      return null;
    }
  }

  setOAuthCredentials(credentials: GoogleAuthCredentials): void {
    if (!this.isClient) return;
    
    try {
      const encrypted = btoa(JSON.stringify(credentials));
      localStorage.setItem('google_oauth_credentials', encrypted);
    } catch (error) {
      console.error('Error storing OAuth credentials:', error);
    }
  }

  removeOAuthCredentials(): void {
    if (!this.isClient) return;
    
    try {
      localStorage.removeItem('google_oauth_credentials');
    } catch (error) {
      console.error('Error removing OAuth credentials:', error);
    }
  }

  // Additional utility methods for general localStorage operations
  getItem(key: string): string | null {
    if (!this.isClient) return null;
    
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (!this.isClient) return;
    
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
    }
  }

  removeItem(key: string): void {
    if (!this.isClient) return;
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
    }
  }

  getJSON<T>(key: string): T | null {
    const item = this.getItem(key);
    if (!item) return null;
    
    try {
      return JSON.parse(item);
    } catch (error) {
      console.error(`Error parsing JSON for key ${key}:`, error);
      return null;
    }
  }

  setJSON<T>(key: string, value: T): void {
    try {
      this.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error stringifying JSON for key ${key}:`, error);
    }
  }

  // Task automation specific storage
  getTaskAutomationSettings(): any {
    return this.getJSON('task_automation_settings') || {
      autoExecute: false,
      saveResults: true,
      showLogs: true
    };
  }

  setTaskAutomationSettings(settings: any): void {
    this.setJSON('task_automation_settings', settings);
  }

  // Clear all data (useful for reset functionality)
  clearAll(): void {
    if (!this.isClient) return;
    
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  // Get storage usage info
  getStorageInfo(): { used: number; available: number } {
    if (!this.isClient) return { used: 0, available: 0 };
    
    try {
      let used = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
      
      // Most browsers limit localStorage to ~5-10MB
      const available = 5 * 1024 * 1024 - used; // 5MB estimate
      
      return { used, available };
    } catch (error) {
      console.error('Error calculating storage usage:', error);
      return { used: 0, available: 0 };
    }
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageServiceImpl();
export default localStorageService; 