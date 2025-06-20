/**
 * Utility for deduplicating API requests and caching results
 * This helps prevent duplicate Serper API calls in the Advanced Search feature
 */

// Create a global window property to track active queries across all components
declare global {
  interface Window {
    _activeSerperQueries: Record<string, boolean>;
  }
}

// Initialize the global tracker
if (typeof window !== 'undefined') {
  window._activeSerperQueries = window._activeSerperQueries || {};
}

// Check if a query is already active globally (across all components)
export function isQueryActive(query: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = query.trim().toLowerCase();
  return !!window._activeSerperQueries[key];
}

// Mark a query as active globally
export function markQueryActive(query: string): void {
  if (typeof window === 'undefined') return;
  const key = query.trim().toLowerCase();
  window._activeSerperQueries[key] = true;
}

// Mark a query as inactive globally
export function markQueryInactive(query: string): void {
  if (typeof window === 'undefined') return;
  const key = query.trim().toLowerCase();
  delete window._activeSerperQueries[key];
}

// Constants
const CACHE_STORAGE_KEY = 'api_request_cache';
const CACHE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

// Store in-flight requests to prevent duplicates
const inFlightRequests: Record<string, Promise<any>> = {};

// Cache for completed requests
let requestCache: Record<string, {
  data: any,
  timestamp: number
}> = {};

// Global in-memory map for in-flight and cached requests
const serperInFlight: Record<string, Promise<any>> = {};
const serperCache: Record<string, { data: any, timestamp: number }> = {};

// Initialize cache from localStorage
const initializeCache = () => {
  if (typeof window !== 'undefined') {
    try {
      const storedCache = localStorage.getItem(CACHE_STORAGE_KEY);
      if (storedCache) {
        requestCache = JSON.parse(storedCache);
        
        // Clean up expired items
        const now = Date.now();
        Object.keys(requestCache).forEach(key => {
          if (now - requestCache[key].timestamp > CACHE_EXPIRATION_MS) {
            delete requestCache[key];
          }
        });
        
        // Save cleaned cache
        saveCache();
      }
    } catch (err) {
      console.error('[API Cache] Error loading cache from localStorage:', err);
      requestCache = {};
    }
  }
};

// Save cache to localStorage
const saveCache = () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(requestCache));
    } catch (err) {
      console.error('[API Cache] Error saving cache to localStorage:', err);
    }
  }
};

// Initialize cache on module load
if (typeof window !== 'undefined') {
  // Wait for next tick to ensure window is fully available
  setTimeout(initializeCache, 0);
}

/**
 * Generate a cache key from request details
 */
export const generateCacheKey = (endpoint: string, params: any): string => {
  // Sort params to ensure consistent keys regardless of object property order
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as Record<string, any>);
  
  return `${endpoint}:${JSON.stringify(sortedParams)}`;
};

/**
 * Check if a result exists in cache
 */
export const isInCache = (cacheKey: string): boolean => {
  if (!requestCache[cacheKey]) return false;
  
  // Check if cache has expired
  const now = Date.now();
  const cacheTime = requestCache[cacheKey].timestamp;
  if (now - cacheTime > CACHE_EXPIRATION_MS) {
    // Cache expired, clean it up
    delete requestCache[cacheKey];
    saveCache();
    return false;
  }
  
  return true;
};

/**
 * Get cached result
 */
export const getCachedResult = (cacheKey: string): any => {
  if (!isInCache(cacheKey)) return null;
  return requestCache[cacheKey].data;
};

/**
 * Make a deduped API request
 * This will ensure only one request is made for the same endpoint+params combination
 */
export const dedupedApiRequest = async <T>(
  endpoint: string, 
  params: any, 
  fetchFn: () => Promise<T>
): Promise<T> => {
  const cacheKey = generateCacheKey(endpoint, params);
  
  // Check for cached result first
  if (isInCache(cacheKey)) {
    console.log(`[API Cache] Using cached result for ${cacheKey}`);
    return getCachedResult(cacheKey);
  }
  
  // Check if request is already in flight
  if (cacheKey in inFlightRequests) {
    console.log(`[API Cache] Reusing in-flight request for ${cacheKey}`);
    return inFlightRequests[cacheKey];
  }
  
  // Start new request and store in inFlightRequests
  console.log(`[API Cache] Making new request for ${cacheKey}`);
  try {
    inFlightRequests[cacheKey] = fetchFn();
    const result = await inFlightRequests[cacheKey];
    
    // Cache the result
    requestCache[cacheKey] = {
      data: result,
      timestamp: Date.now()
    };
    
    // Save to persistent storage
    saveCache();
    
    return result;
  } finally {
    // Clean up in-flight request tracking
    delete inFlightRequests[cacheKey];
  }
};

/**
 * Specifically for Serper API requests
 */
export function getSerperCacheKey(query: string, limit: number) {
  return `${query.trim().toLowerCase()}::${limit}`;
}

// Load cache from localStorage on first use
(function initializeSerperCache() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(serperCache, parsed);
      }
    } catch {}
  }
})();

function saveSerperCache() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(serperCache));
    } catch {}
  }
}

/* Insert a new helper function to generate the in-flight lock key for a Serper query */
function getSerperInFlightKey(query: string, limit: number) {
  return `serper_inflight_${query.trim().toLowerCase()}::${limit}`;
}

/* Update dedupedSerperRequest to use a persistent in-flight lock in localStorage */
export async function dedupedSerperRequest(query: string, limit: number) {
  const key = getSerperCacheKey(query, limit);
  const inFlightKey = getSerperInFlightKey(query, limit);

  // Return cached result if not expired
  const cached = serperCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
    return cached.data;
  }

  // Check if an in-flight lock exists in localStorage
  if (typeof window !== 'undefined') {
    const inFlightLock = localStorage.getItem(inFlightKey);
    if (inFlightLock) {
      // Poll (wait) for the result to be cached (every 200ms) until the lock is removed or a cached result is found
      while (true) {
        const pollCached = serperCache[key];
         if (pollCached && Date.now() - pollCached.timestamp < CACHE_EXPIRATION_MS) {
           return pollCached.data;
         }
         if (!localStorage.getItem(inFlightKey)) {
           break; // lock removed, proceed (or re-check cache)
         }
         await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // Return in-flight promise if exists (in-memory)
  if (typeof serperInFlight[key] !== 'undefined') {
    return serperInFlight[key];
  }

  // Set the in-flight lock in localStorage (if in browser)
  if (typeof window !== 'undefined') {
    localStorage.setItem(inFlightKey, 'true');
  }

  // Otherwise, make the API call
  const promise = fetch('/api/serper/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit })
  })
    .then(res => res.json())
    .then(data => {
      serperCache[key] = { data, timestamp: Date.now() };
      saveSerperCache();
      delete serperInFlight[key];
      // Remove the in-flight lock from localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem(inFlightKey);
      }
      return data;
    })
    .catch(err => {
      delete serperInFlight[key];
      // Remove the in-flight lock on error as well
      if (typeof window !== 'undefined') {
        localStorage.removeItem(inFlightKey);
      }
      throw err;
    });

  serperInFlight[key] = promise;
  return promise;
}

/**
 * Clear all cache entries
 */
export const clearRequestCache = () => {
  Object.keys(requestCache).forEach(key => {
    delete requestCache[key];
  });
  
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_STORAGE_KEY);
  }
};

/**
 * Clear cache entries for a specific endpoint
 */
export const clearCacheForEndpoint = (endpoint: string) => {
  const endpointPrefix = `${endpoint}:`;
  
  const keysToRemove = Object.keys(requestCache).filter(key => 
    key.startsWith(endpointPrefix)
  );
  
  keysToRemove.forEach(key => {
    delete requestCache[key];
  });
  
  // Save updated cache
  saveCache();
  
  return keysToRemove.length;
}; 