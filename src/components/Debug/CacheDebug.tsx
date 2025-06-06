import { useState, useEffect } from 'react';
import { clearCacheForEndpoint, clearRequestCache } from '@/utils/api-request-cache';

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  age: string;
}

export default function CacheDebug() {
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  
  const refreshCache = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const storedCache = localStorage.getItem('api_request_cache');
      if (!storedCache) {
        setCacheEntries([]);
        return;
      }
      
      const cache = JSON.parse(storedCache);
      const now = Date.now();
      
      const entries = Object.entries(cache).map(([key, value]: [string, any]) => {
        const age = now - value.timestamp;
        let ageStr = '';
        
        if (age < 60000) {
          ageStr = `${Math.round(age / 1000)}s ago`;
        } else if (age < 3600000) {
          ageStr = `${Math.round(age / 60000)}m ago`;
        } else {
          ageStr = `${Math.round(age / 3600000)}h ago`;
        }
        
        return {
          key,
          data: value.data,
          timestamp: value.timestamp,
          age: ageStr
        };
      });
      
      setCacheEntries(entries);
    } catch (err) {
      console.error('Error parsing cache:', err);
      setCacheEntries([]);
    }
  };
  
  useEffect(() => {
    if (showDebug) {
      refreshCache();
      const interval = setInterval(refreshCache, 5000);
      return () => clearInterval(interval);
    }
  }, [showDebug]);
  
  const clearSerperCache = () => {
    const count = clearCacheForEndpoint('/api/serper/search');
    alert(`Cleared ${count} Serper cache entries`);
    refreshCache();
  };
  
  const clearAllCache = () => {
    clearRequestCache();
    alert('Cleared all cache entries');
    refreshCache();
  };
  
  if (!showDebug) {
    return (
      <div className="fixed bottom-2 right-2 z-50">
        <button 
          onClick={() => setShowDebug(true)}
          className="bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100"
        >
          Cache Debug
        </button>
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-0 right-0 z-50 bg-gray-900 text-white p-4 rounded-tl-lg shadow-lg max-w-md max-h-[80vh] overflow-auto">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold">API Cache Debug ({cacheEntries.length} entries)</h3>
        <button 
          onClick={() => setShowDebug(false)} 
          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
        >
          Close
        </button>
      </div>
      
      <div className="space-x-2 mb-2">
        <button 
          onClick={refreshCache}
          className="text-xs bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded"
        >
          Refresh
        </button>
        <button 
          onClick={clearSerperCache}
          className="text-xs bg-orange-700 hover:bg-orange-600 px-2 py-1 rounded"
        >
          Clear Serper Cache
        </button>
        <button 
          onClick={clearAllCache}
          className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
        >
          Clear All Cache
        </button>
      </div>
      
      <div className="space-y-2 text-xs">
        {cacheEntries.length === 0 ? (
          <p className="text-gray-400">No cache entries found</p>
        ) : (
          cacheEntries.map((entry, i) => (
            <div key={i} className="border border-gray-700 p-2 rounded">
              <div className="flex justify-between">
                <span className="font-mono text-green-400 truncate" style={{ maxWidth: '250px' }}>
                  {entry.key}
                </span>
                <span className="text-gray-400">{entry.age}</span>
              </div>
              <div className="mt-1 text-gray-300">
                {entry.key.includes('/api/serper/search') && (
                  <div>
                    <span className="text-blue-400">Query:</span> {JSON.parse(entry.key.split(':')[1]).query}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 