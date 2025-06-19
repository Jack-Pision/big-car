/**
 * UI State Persistence Service
 * Handles capturing, saving, and restoring complete UI state snapshots
 */

import { supabase } from './auth';
import { 
  UIStateSnapshot, 
  UIInteractionRecord, 
  SessionUIHistory,
  PartialUIState,
  UIStateRestoreOptions
} from './ui-state-types';

export class UIStateService {
  private static instance: UIStateService;
  private interactionSequence = 0;
  private cachedUser: any = null;
  private lastUserCheck = 0;

  static getInstance(): UIStateService {
    if (!UIStateService.instance) {
      UIStateService.instance = new UIStateService();
    }
    return UIStateService.instance;
  }

  // Get cached user for performance
  private async getCachedUser() {
    const now = Date.now();
    
    // Only check auth every 5 minutes
    if (this.cachedUser && (now - this.lastUserCheck) < 5 * 60 * 1000) {
      return this.cachedUser;
    }

    const { data: { user } } = await supabase.auth.getUser();
    this.cachedUser = user;
    this.lastUserCheck = now;
    
    return user;
  }

  /**
   * Capture complete UI state snapshot
   */
  captureUIState(
    activeButton: string,
    activeMode: string,
    additionalState: any = {}
  ): UIStateSnapshot {
    this.interactionSequence++;
    
    return {
      // Core modes
      activeButton: activeButton as any,
      activeMode: activeMode as any,
      queryType: additionalState.queryType || 'conversation',
      
      // Search state
      searchState: {
        isAdvancedMode: additionalState.isAdvancedSearch || false,
        filters: additionalState.searchFilters || [],
        sourceTypes: additionalState.sourceTypes || [],
        searchQuery: additionalState.searchQuery || ''
      },
      
      // Reasoning state
      reasoningState: {
        thinkingVisible: additionalState.thinkingVisible || false,
        liveReasoning: additionalState.liveReasoning || '',
        showThoughtProcess: additionalState.showThoughtProcess || false,
        currentReasoningMessageId: additionalState.currentReasoningMessageId || null
      },
      
      // Artifact state
      artifactState: {
        isArtifactMode: additionalState.isArtifactMode || false,
        leftPaneWidth: additionalState.leftPaneWidth || 50,
        artifactContent: additionalState.artifactContent || null
      },
      
      // Image context
      imageContext: {
        uploadedImages: additionalState.uploadedImages || [],
        imageDescriptions: additionalState.imageDescriptions || [],
        imageCounter: additionalState.imageCounter || 0,
        imagePreviewUrls: additionalState.imagePreviewUrls || [],
        selectedFilesForUpload: [] // Don't serialize File objects
      },
      
      // Chat settings
      chatSettings: {
        temperature: additionalState.temperature || 0.7,
        model: additionalState.model || 'default',
        systemPrompt: additionalState.systemPrompt || '',
        isAiResponding: additionalState.isAiResponding || false,
        isLoading: additionalState.isLoading || false
      },
      
      // UI components
      uiComponents: {
        sidebarOpen: additionalState.sidebarOpen || false,
        showHeading: additionalState.showHeading || false,
        hasInteracted: additionalState.hasInteracted || false,
        isChatEmpty: additionalState.isChatEmpty || false,
        inputBarHeight: additionalState.inputBarHeight || 80
      },
      
      // User preferences
      userPreferences: additionalState.userPreferences || {},
      
      // Metadata
      timestamp: Date.now(),
      interactionSequence: this.interactionSequence,
      sessionId: additionalState.sessionId || undefined
    };
  }

  /**
   * Save UI state to database
   */
  async saveUIState(
    sessionId: string,
    messageId: string | null,
    interactionType: 'user_query' | 'ai_response' | 'mode_switch' | 'setting_change',
    uiState: UIStateSnapshot
  ): Promise<void> {
    try {
      const user = await this.getCachedUser();
      if (!user || !sessionId) {
        console.warn('[UI State] Cannot save - no user or session');
        return;
      }

      console.log(`[UI State] Saving ${interactionType} state for session ${sessionId}`);

      const { error } = await supabase
        .from('ui_interaction_states')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          message_id: messageId,
          active_button: uiState.activeButton,
          active_mode: uiState.activeMode,
          query_type: uiState.queryType,
          ui_state: uiState,
          user_preferences: uiState.userPreferences,
          interaction_type: interactionType,
          interaction_sequence: uiState.interactionSequence
        });

      if (error) {
        console.error('[UI State] Error saving UI state:', error);
      } else {
        console.log('[UI State] Successfully saved UI state');
      }
    } catch (error) {
      console.error('[UI State] Failed to save UI state:', error);
    }
  }

  /**
   * Load UI state history for a session
   */
  async loadSessionUIStates(sessionId: string): Promise<UIInteractionRecord[]> {
    try {
      const user = await this.getCachedUser();
      if (!user) {
        console.warn('[UI State] Cannot load - no user');
        return [];
      }

      console.log(`[UI State] Loading UI states for session ${sessionId}`);

      const { data, error } = await supabase
        .from('ui_interaction_states')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[UI State] Error loading UI states:', error);
        return [];
      }

      const records: UIInteractionRecord[] = data.map(record => ({
        id: record.id,
        sessionId: record.session_id,
        userId: record.user_id,
        messageId: record.message_id,
        activeButton: record.active_button,
        activeMode: record.active_mode,
        queryType: record.query_type,
        interactionType: record.interaction_type,
        uiState: record.ui_state,
        userPreferences: record.user_preferences,
        interactionSequence: record.interaction_sequence,
        createdAt: record.created_at
      }));

      console.log(`[UI State] Loaded ${records.length} UI state records`);
      return records;

    } catch (error) {
      console.error('[UI State] Failed to load UI states:', error);
      return [];
    }
  }

  /**
   * Get the last UI state for a session
   */
  async getLastUIState(sessionId: string): Promise<UIStateSnapshot | null> {
    try {
      const records = await this.loadSessionUIStates(sessionId);
      if (records.length === 0) return null;

      const lastRecord = records[records.length - 1];
      return lastRecord.uiState;
    } catch (error) {
      console.error('[UI State] Failed to get last UI state:', error);
      return null;
    }
  }

  /**
   * Get session UI history with analysis
   */
  async getSessionUIHistory(sessionId: string): Promise<SessionUIHistory> {
    try {
      const interactions = await this.loadSessionUIStates(sessionId);
      const lastUIState = interactions.length > 0 ? interactions[interactions.length - 1].uiState : undefined;

      return {
        sessionId,
        interactions,
        lastUIState
      };
    } catch (error) {
      console.error('[UI State] Failed to get session UI history:', error);
      return {
        sessionId,
        interactions: []
      };
    }
  }

  /**
   * Delete UI states for a session (when session is deleted)
   */
  async deleteSessionUIStates(sessionId: string): Promise<void> {
    try {
      const user = await this.getCachedUser();
      if (!user) return;

      const { error } = await supabase
        .from('ui_interaction_states')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[UI State] Error deleting UI states:', error);
      } else {
        console.log(`[UI State] Deleted UI states for session ${sessionId}`);
      }
    } catch (error) {
      console.error('[UI State] Failed to delete UI states:', error);
    }
  }

  /**
   * Clean up old UI states (keep last 1000 interactions per user)
   */
  async cleanupOldUIStates(): Promise<void> {
    try {
      const user = await this.getCachedUser();
      if (!user) return;

      // Keep only the last 1000 interactions per user
      const { error } = await supabase.rpc('cleanup_old_ui_states', {
        user_id_param: user.id,
        keep_count: 1000
      });

      if (error) {
        console.error('[UI State] Error cleaning up old UI states:', error);
      }
    } catch (error) {
      console.error('[UI State] Failed to cleanup old UI states:', error);
    }
  }

  /**
   * Reset interaction sequence (for new sessions)
   */
  resetInteractionSequence(): void {
    this.interactionSequence = 0;
  }

  /**
   * Get current interaction sequence
   */
  getCurrentSequence(): number {
    return this.interactionSequence;
  }
}

// Export singleton instance
export const uiStateService = UIStateService.getInstance(); 