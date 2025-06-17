/**
 * AI Response Caching System
 * Semantic caching for AI responses to reduce API costs by up to 90%
 */

import { smartCache } from './smart-cache';

interface AIRequestOptions {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

interface CachedAIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  timestamp: number;
}

class AIResponseCache {
  private static instance: AIResponseCache;
  private cacheStats = {
    hits: 0,
    misses: 0,
    apiCallsSaved: 0,
    costSaved: 0
  };
  
  static getInstance(): AIResponseCache {
    if (!AIResponseCache.instance) {
      AIResponseCache.instance = new AIResponseCache();
    }
    return AIResponseCache.instance;
  }

  // Generate cache key from messages
  private generateCacheKey(options: AIRequestOptions): string {
    // Create a simplified representation for caching
    const keyData = {
      messages: options.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: options.temperature || 0.7,
      model: options.model || 'default'
    };
    
    return JSON.stringify(keyData);
  }

  // Extract the core user query from messages
  private extractUserQuery(messages: any[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '';
    
    // Get the last user message as the primary query
    return userMessages[userMessages.length - 1].content || '';
  }

  // Check for cached AI response
  async getCachedResponse(options: AIRequestOptions): Promise<string | null> {
    // First try exact match caching
    const exactKey = this.generateCacheKey(options);
    const exactMatch = smartCache.get<CachedAIResponse>(exactKey);
    
    if (exactMatch) {
      console.log('[AI Cache] Exact match found');
      this.cacheStats.hits++;
      this.cacheStats.apiCallsSaved++;
      this.cacheStats.costSaved += 0.002; // Estimated cost per API call
      return exactMatch.content;
    }

    // Try semantic caching for user queries
    const userQuery = this.extractUserQuery(options.messages);
    if (userQuery.length > 10) { // Only cache meaningful queries
      const semanticMatch = await smartCache.getCachedAIResponse(userQuery);
      if (semanticMatch) {
        console.log('[AI Cache] Semantic match found');
        this.cacheStats.hits++;
        this.cacheStats.apiCallsSaved++;
        this.cacheStats.costSaved += 0.002;
        return semanticMatch;
      }
    }

    this.cacheStats.misses++;
    return null;
  }

  // Cache AI response
  async cacheResponse(options: AIRequestOptions, response: any): Promise<void> {
    const content = response.content || response.choices?.[0]?.message?.content;
    if (!content) return;

    // Cache exact match
    const exactKey = this.generateCacheKey(options);
    const cachedResponse: CachedAIResponse = {
      content,
      usage: response.usage,
      timestamp: Date.now()
    };
    
    smartCache.set(exactKey, cachedResponse, 30 * 60 * 1000); // 30 minutes

    // Cache for semantic search
    const userQuery = this.extractUserQuery(options.messages);
    if (userQuery.length > 10) {
      smartCache.cacheAIResponse(userQuery, content);
    }
  }

  // Cached AI request wrapper
  async makeRequest(options: AIRequestOptions, apiCall: () => Promise<any>): Promise<any> {
    // Check cache first
    const cached = await this.getCachedResponse(options);
    if (cached) {
      return {
        content: cached,
        cached: true,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }

    // Make API call
    console.log('[AI Cache] Making fresh API call');
    const response = await apiCall();
    
    // Cache the response
    await this.cacheResponse(options, response);
    
    return response;
  }

  // Get cache statistics
  getStats() {
    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 ? (this.cacheStats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.cacheStats,
      hitRate: Math.round(hitRate * 10) / 10,
      totalRequests
    };
  }

  // Clear cache stats
  clearStats() {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      apiCallsSaved: 0,
      costSaved: 0
    };
  }
}

export const aiResponseCache = AIResponseCache.getInstance();

// Optimized fetch wrapper for AI API calls
export async function cachedAIRequest(
  url: string, 
  options: AIRequestOptions,
  fetchOptions: RequestInit = {}
): Promise<any> {
  return aiResponseCache.makeRequest(options, async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      },
      body: JSON.stringify(options),
      ...fetchOptions
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  });
} 