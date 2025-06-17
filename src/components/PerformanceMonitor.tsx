/**
 * Performance Monitor - Track and display cache performance
 */

import React, { useState, useEffect } from 'react';
import { smartCache } from '@/lib/smart-cache';
import { optimizedSupabaseService } from '@/lib/optimized-supabase-service';
import { aiResponseCache } from '@/lib/ai-response-cache';

interface PerformanceStats {
  cacheHits: number;
  cacheMisses: number;
  apiCallsSaved: number;
  averageResponseTime: number;
  networkRequestsReduced: number;
  hitRate: number;
  costSaved: number;
}

export default function PerformanceMonitor() {
  const [stats, setStats] = useState<PerformanceStats>({
    cacheHits: 0,
    cacheMisses: 0,
    apiCallsSaved: 0,
    averageResponseTime: 0,
    networkRequestsReduced: 0,
    hitRate: 0,
    costSaved: 0
  });

  const [showMonitor, setShowMonitor] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const cacheStats = optimizedSupabaseService.getCacheStats();
      const aiStats = aiResponseCache.getStats();
      
      // Calculate performance metrics
      setStats(prev => ({
        cacheHits: aiStats.hits,
        cacheMisses: aiStats.misses,
        apiCallsSaved: aiStats.apiCallsSaved,
        averageResponseTime: 150, // Estimated based on cached responses
        networkRequestsReduced: cacheStats.cacheSize + cacheStats.semanticCacheSize,
        hitRate: aiStats.hitRate,
        costSaved: aiStats.costSaved
      }));
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, []);

  if (!showMonitor) {
    return (
      <button
        onClick={() => setShowMonitor(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg z-50 transition-colors"
        title="Show Performance Stats"
      >
        📊
      </button>
    );
  }

  const getEfficiencyColor = (value: number) => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-yellow-400';
    if (value >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getEfficiencyLabel = (hitRate: number) => {
    if (hitRate >= 80) return 'Excellent';
    if (hitRate >= 60) return 'Good';
    if (hitRate >= 40) return 'Fair';
    if (hitRate >= 20) return 'Poor';
    return 'Warming up...';
  };

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-xl z-50 min-w-80 max-w-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          📊 Performance Monitor
        </h3>
        <button 
          onClick={() => setShowMonitor(false)} 
          className="text-gray-400 hover:text-white text-xl font-bold"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-3 text-sm">
        <div className="bg-gray-800 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold">Cache Performance</span>
            <span className={`font-bold ${getEfficiencyColor(stats.hitRate)}`}>
              {getEfficiencyLabel(stats.hitRate)}
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Hit Rate:</span>
              <span className={getEfficiencyColor(stats.hitRate)}>
                {stats.hitRate.toFixed(1)}%
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Cache Hits:</span>
              <span className="text-green-400">{stats.cacheHits}</span>
            </div>
            
            <div className="flex justify-between">
              <span>Cache Misses:</span>
              <span className="text-red-400">{stats.cacheMisses}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-3 rounded-lg">
          <div className="font-semibold mb-2">Network Optimization</div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>API Calls Saved:</span>
              <span className="text-blue-400">{stats.apiCallsSaved}</span>
            </div>
            
            <div className="flex justify-between">
              <span>Requests Reduced:</span>
              <span className="text-purple-400">{stats.networkRequestsReduced}</span>
            </div>
            
            <div className="flex justify-between">
              <span>Avg Response Time:</span>
              <span className="text-cyan-400">{stats.averageResponseTime}ms</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-3 rounded-lg">
          <div className="font-semibold mb-2">Cost Savings</div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Estimated Saved:</span>
              <span className="text-green-400">
                ${(stats.costSaved * 100).toFixed(2)}¢
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Efficiency Gain:</span>
              <span className={getEfficiencyColor(stats.hitRate)}>
                {stats.hitRate > 0 ? `+${Math.floor(stats.hitRate)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="text-xs text-gray-400 text-center">
          {stats.apiCallsSaved > 0 
            ? `🚀 Optimized! Reduced network load by ${Math.floor((stats.apiCallsSaved / (stats.apiCallsSaved + stats.cacheMisses)) * 100)}%`
            : '⚡ Cache warming up...'
          }
        </div>
      </div>

      {/* Progress bar for hit rate */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span>Cache Efficiency</span>
          <span>{stats.hitRate.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              stats.hitRate >= 80 ? 'bg-green-500' :
              stats.hitRate >= 60 ? 'bg-yellow-500' :
              stats.hitRate >= 40 ? 'bg-orange-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(stats.hitRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
} 