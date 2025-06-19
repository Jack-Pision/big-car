/**
 * UI State Management Types
 * Defines interfaces for capturing and restoring complete UI state snapshots
 */

export interface UIStateSnapshot {
  // Active Modes
  activeButton: 'chat' | 'search' | 'artifact' | 'reasoning';
  activeMode: 'chat' | 'search';
  queryType: string;
  
  // Search Mode State
  searchState?: {
    isAdvancedMode: boolean;
    filters: any[];
    sourceTypes: string[];
    searchQuery?: string;
  };
  
  // Reasoning Mode State
  reasoningState?: {
    thinkingVisible: boolean;
    liveReasoning: string;
    showThoughtProcess: boolean;
    currentReasoningMessageId?: string | null;
  };
  
  // Artifact Mode State
  artifactState?: {
    isArtifactMode: boolean;
    leftPaneWidth: number;
    artifactContent: any;
  };
  
  // File/Media Context
  imageContext: {
    uploadedImages: string[];
    imageDescriptions: any[];
    imageCounter: number;
    imagePreviewUrls: string[];
    selectedFilesForUpload: File[];
  };
  
  // Chat Settings
  chatSettings: {
    temperature: number;
    model: string;
    systemPrompt: string;
    isAiResponding: boolean;
    isLoading: boolean;
  };
  
  // UI Component States
  uiComponents: {
    sidebarOpen: boolean;
    showHeading: boolean;
    hasInteracted: boolean;
    isChatEmpty: boolean;
    inputBarHeight: number;
  };
  
  // User Preferences
  userPreferences: {
    theme?: string;
    defaultMode?: string;
    autoSave?: boolean;
    [key: string]: any;
  };
  
  // Interaction Metadata
  timestamp: number;
  interactionSequence: number;
  sessionId?: string;
}

export interface UIInteractionRecord {
  id: string;
  sessionId: string;
  userId: string;
  messageId?: string;
  activeButton: string;
  activeMode: string;
  queryType?: string;
  interactionType: 'user_query' | 'ai_response' | 'mode_switch' | 'setting_change';
  uiState: UIStateSnapshot;
  userPreferences: any;
  interactionSequence: number;
  createdAt: string;
}

export interface SessionUIHistory {
  sessionId: string;
  interactions: UIInteractionRecord[];
  lastUIState?: UIStateSnapshot;
}

// Helper type for partial UI state updates
export type PartialUIState = Partial<UIStateSnapshot>;

// Type for UI state restoration options
export interface UIStateRestoreOptions {
  restoreMode?: boolean;
  restoreSettings?: boolean;
  restoreFileContext?: boolean;
  restoreComponentStates?: boolean;
} 