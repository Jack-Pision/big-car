/**
 * Smart Caching System for AI Chatbot
 * Reduces API calls by up to 90% through intelligent caching
 */

import { Message } from './types';

// Cache configuration
const CACHE_CONFIG = {
  SEMANTIC_CACHE_TTL: 30 * 60 * 1000, // 30 minutes for AI responses
  SESSION_CACHE_TTL: 5 * 60 * 1000,   // 5 minutes for session data  
  MESSAGE_CACHE_TTL: 10 * 60 * 1000,  // 10 minutes for messages
  AUTH_CACHE_TTL: 15 * 60 * 1000,     // 15 minutes for auth checks
  MAX_CACHE_SIZE: 100,                // Maximum cached items
  SEMANTIC_SIMILARITY_THRESHOLD: 0.85  // 85% similarity for cache hit
};

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface SemanticCacheItem extends CacheItem<string> {
  query: string;
  queryHash: string;
  semanticVector?: number[];
}

class SmartCache {
  private cache = new Map<string, CacheItem<any>>();
  private semanticCache = new Map<string, SemanticCacheItem>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private requestDeduplication = new Map<string, {promise: Promise<any>, subscribers: number}>();

  // Generate cache key with deduplication
  private generateKey(prefix: string, ...parts: any[]): string {
    return `${prefix}:${parts.map(p => 
      typeof p === 'object' ? JSON.stringify(p) : String(p)
    ).join(':')}`;
  }

  // Simple semantic similarity (in production, use embedding API)
  private calculateSimilarity(query1: string, query2: string): number {
    const words1 = query1.toLowerCase().split(/\s+/);
    const words2 = query2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(w => words2.includes(w)).length;
    const union = new Set([...words1, ...words2]).size;
    
    return intersection / union;
  }

  // Find semantically similar cached query
  private findSimilarQuery(query: string): SemanticCacheItem | null {
    let bestMatch: SemanticCacheItem | null = null;
    let bestScore = 0;

    this.semanticCache.forEach((item, key) => {
      if (this.isExpired(item)) {
        this.semanticCache.delete(key);
        return;
      }

      const similarity = this.calculateSimilarity(query, item.query);
      if (similarity > CACHE_CONFIG.SEMANTIC_SIMILARITY_THRESHOLD && similarity > bestScore) {
        bestMatch = item;
        bestScore = similarity;
      }
    });

    return bestMatch;
  }

  // Check if cache item is expired
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  // Clean expired items and enforce size limits
  private cleanup(): void {
    // Remove expired items
    this.cache.forEach((item, key) => {
      if (this.isExpired(item)) {
        this.cache.delete(key);
      }
    });

    this.semanticCache.forEach((item, key) => {
      if (this.isExpired(item)) {
        this.semanticCache.delete(key);
      }
    });

    // Enforce size limits (LRU eviction)
    if (this.cache.size > CACHE_CONFIG.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      const toRemove = entries.slice(0, entries.length - CACHE_CONFIG.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  // Get from cache
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    item.accessCount++;
    item.lastAccessed = Date.now();
    
    return item.data;
  }

  // Set cache item
  set<T>(key: string, data: T, ttl: number = CACHE_CONFIG.SESSION_CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccessed: Date.now()
    });

    // Periodic cleanup
    if (Math.random() < 0.1) { // 10% chance
      this.cleanup();
    }
  }

  // Semantic cache for AI responses
  async getCachedAIResponse(query: string): Promise<string | null> {
    const similar = this.findSimilarQuery(query);
    if (similar) {
      console.log(`[Smart Cache] Using cached AI response for similar query`);
      similar.accessCount++;
      similar.lastAccessed = Date.now();
      return similar.data;
    }
    return null;
  }

  // Cache AI response with semantic indexing
  cacheAIResponse(query: string, response: string): void {
    const queryHash = this.generateKey('ai', query);
    this.semanticCache.set(queryHash, {
      query,
      queryHash,
      data: response,
      timestamp: Date.now(),
      ttl: CACHE_CONFIG.SEMANTIC_CACHE_TTL,
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  // Request deduplication for identical ongoing requests
  async dedupeRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // Check if request is already in flight
    if (this.requestDeduplication.has(key)) {
      const ongoing = this.requestDeduplication.get(key)!;
      ongoing.subscribers++;
      console.log(`[Smart Cache] Deduplicating request, ${ongoing.subscribers} subscribers`);
      return ongoing.promise;
    }

    // Start new request
    const promise = requestFn();
    this.requestDeduplication.set(key, { promise, subscribers: 1 });

    try {
      const result = await promise;
      return result;
    } finally {
      this.requestDeduplication.delete(key);
    }
  }

  // Batch multiple requests into single call
  private batchQueue = new Map<string, Array<{resolve: Function, reject: Function, data: any}>>();
  private batchTimers = new Map<string, NodeJS.Timeout>();

  batchRequest<T>(batchKey: string, data: any, batchFn: (items: any[]) => Promise<T[]>): Promise<T> {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      if (!this.batchQueue.has(batchKey)) {
        this.batchQueue.set(batchKey, []);
      }
      
      this.batchQueue.get(batchKey)!.push({ resolve, reject, data });

      // Clear existing timer
      if (this.batchTimers.has(batchKey)) {
        clearTimeout(this.batchTimers.get(batchKey)!);
      }

      // Set new timer to process batch
      const timer = setTimeout(async () => {
        const batch = this.batchQueue.get(batchKey) || [];
        this.batchQueue.delete(batchKey);
        this.batchTimers.delete(batchKey);

        if (batch.length === 0) return;

        try {
          const results = await batchFn(batch.map(item => item.data));
          batch.forEach((item, index) => {
            item.resolve(results[index]);
          });
        } catch (error) {
          batch.forEach(item => item.reject(error));
        }
      }, 50); // 50ms batch window

      this.batchTimers.set(batchKey, timer);
    });
  }

  // Clear all caches
  clear(): void {
    this.cache.clear();
    this.semanticCache.clear();
    this.inFlightRequests.clear();
    this.requestDeduplication.clear();
  }

  // Get cache statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      semanticCacheSize: this.semanticCache.size,
      inFlightRequests: this.inFlightRequests.size,
      deduplicationQueue: this.requestDeduplication.size
    };
  }
}

// Global cache instance
export const smartCache = new SmartCache();

// Cache keys constants
export const CACHE_KEYS = {
  SESSIONS: 'sessions',
  MESSAGES: (sessionId: string) => `messages:${sessionId}`,
  USER_AUTH: 'user_auth',
  AI_RESPONSE: (query: string) => `ai:${query}`,
  SESSION_DETAIL: (sessionId: string) => `session:${sessionId}`,
} as const; 