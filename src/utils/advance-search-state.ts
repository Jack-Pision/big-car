/**
 * Utilities for managing advanced search state persistence
 * This helps prevent re-running the same searches when reloading the page
 */

interface CompletedSearchRecord {
  query: string;
  steps: any[];
  activeStepId: string | null;
  isComplete: boolean;
  isInProgress: boolean;
  webData: any | null;
  finalAnswer: string | null;
  timestamp: number;
  conversationHistory?: {
    previousQueries: string[];
    previousResponses: string[];
  };
}

// Generate a unique fingerprint for a search to identify it consistently
const generateSearchFingerprint = (query: string): string => {
  return `search_${query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
};

// Save a completed search to localStorage
export const saveCompletedSearch = (searchData: CompletedSearchRecord): void => {
  if (!searchData.query) return;
  
  try {
    // Get the search ID
    const searchId = generateSearchFingerprint(searchData.query);
    
    // Create or update the registry of completed searches
    const registryKey = 'completed_searches_registry';
    const registry = getCompletedSearchRegistry();
    
    // Add this search to the registry
    registry[searchId] = {
      query: searchData.query,
      timestamp: Date.now(),
      isComplete: searchData.isComplete
    };
    
    // Save the registry
    localStorage.setItem(registryKey, JSON.stringify(registry));
    
    // Save the detailed search data
    localStorage.setItem(searchId, JSON.stringify({
      ...searchData,
      timestamp: Date.now()
    }));
    
    // Also update the main advanceSearchState with a completed flag
    const currentState = localStorage.getItem('advanceSearchState');
    if (currentState) {
      const parsed = JSON.parse(currentState);
      localStorage.setItem('advanceSearchState', JSON.stringify({
        ...parsed,
        isFullyCompleted: true,
        finalAnswer: searchData.finalAnswer
      }));
    }
  } catch (err) {
    console.error("Error saving completed search:", err);
  }
};

// Get the registry of all completed searches
export const getCompletedSearchRegistry = (): Record<string, { query: string, timestamp: number, isComplete: boolean }> => {
  try {
    const registryKey = 'completed_searches_registry';
    const registry = localStorage.getItem(registryKey);
    return registry ? JSON.parse(registry) : {};
  } catch (err) {
    console.error("Error loading search registry:", err);
    return {};
  }
};

// Check if a search is already completed
export const isSearchCompleted = (query: string): boolean => {
  try {
    const searchId = generateSearchFingerprint(query);
    const registry = getCompletedSearchRegistry();
    return registry[searchId]?.isComplete || false;
  } catch (err) {
    console.error("Error checking if search is completed:", err);
    return false;
  }
};

// Get the data for a completed search
export const getCompletedSearch = (query: string): CompletedSearchRecord | null => {
  try {
    const searchId = generateSearchFingerprint(query);
    const searchData = localStorage.getItem(searchId);
    return searchData ? JSON.parse(searchData) : null;
  } catch (err) {
    console.error("Error loading completed search:", err);
    return null;
  }
};

// Clear all completed searches (for testing/debugging)
export const clearAllCompletedSearches = (): void => {
  try {
    const registry = getCompletedSearchRegistry();
    Object.keys(registry).forEach(searchId => {
      localStorage.removeItem(searchId);
    });
    localStorage.removeItem('completed_searches_registry');
  } catch (err) {
    console.error("Error clearing completed searches:", err);
  }
}; 