import { NextRequest } from 'next/server';

export const runtime = 'edge';

// In-memory cache for Serper API results
const searchCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache lifetime

// Generate a cache key from query and limit
function generateCacheKey(query: string, limit: number): string {
  return `${query.toLowerCase().trim()}:${limit}`;
}

// Fetch function with timeout
async function fetchWithTimeout(url: RequestInfo, options: any, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out after ' + (timeout / 1000) + ' seconds');
    }
    throw error;
  }
}

// Helper function to process and filter Serper response
function processSerperResponse(data: any, limit: number, includeHtml: boolean): any {
  try {
    // Extract and combine organic results and knowledge graph if available
    const organic = data.organic || [];
    const knowledgeGraph = data.knowledgeGraph || {};
    
    // Process organic results
    const sources = organic
      .filter((result: any) => {
        // Filter out results without title or link
        return result.title && result.link;
      })
      .slice(0, limit) // Limit the number of results
      .map((result: any) => {
        // Create a simplified source object
        const source: any = {
          title: result.title,
          url: result.link,
          snippet: result.snippet || ''
        };
        
        // Only include HTML content if requested
        if (includeHtml && result.html) {
          source.html = result.html;
        }
        
        return source;
      });
    
    // Add knowledge graph as a source if available
    if (knowledgeGraph.title) {
      sources.unshift({
        title: knowledgeGraph.title,
        url: knowledgeGraph.link || "",
        snippet: knowledgeGraph.description || ""
      });
    }
    
    // Limit to the requested number
    const limitedSources = sources.slice(0, limit);
    
    // Return the processed result
    return {
      query: data.searchParameters?.q || "",
      sources: limitedSources
    };
  } catch (error) {
    console.error('Error processing Serper response:', error);
    // Return a minimal valid response
    return {
      query: data.searchParameters?.q || "",
      sources: []
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const SERPER_API_KEY = process.env.SERPER_API_KEY;
    if (!SERPER_API_KEY) {
      return new Response(JSON.stringify({ error: 'SERPER_API_KEY is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { query } = body;
    
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get limit parameter with default value and validation
    const limit = Math.min(
      Math.max(1, parseInt(body.limit || '10')), 
      20
    ); // Min 1, max 20, default 10
    
    // Get the includeHtml parameter with default value
    const includeHtml = body.includeHtml !== undefined ? body.includeHtml : false;
    
    // Check cache first
    const cacheKey = generateCacheKey(query, limit);
    const cachedItem = searchCache.get(cacheKey);
    
    if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_TTL) {
      console.log('Using cached Serper API response');
      return new Response(JSON.stringify(cachedItem.data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=1800' // 30 minutes
        }
      });
    }
    
    console.log(`Calling Serper API for query: ${query}, limit: ${limit}`);
    
    // Make the API call with timeout
    const response = await fetchWithTimeout(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: query,
          gl: 'us',
          hl: 'en',
          num: limit * 2 // Request more than needed to ensure we have enough good results
        })
      },
      10000 // 10 second timeout
    );
    
    if (!response.ok) {
      console.error(`Serper API error: ${response.status} ${response.statusText}`);
      return new Response(JSON.stringify({ 
        error: `Serper API error: ${response.status}`,
        message: 'Failed to get search results'
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const data = await response.json();
    
    // Process and filter the results
    const processedResult = processSerperResponse(data, limit, includeHtml);
    
    // Cache the processed result
    searchCache.set(cacheKey, {
      data: processedResult,
      timestamp: Date.now()
    });
    
    return new Response(JSON.stringify(processedResult), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=1800' // 30 minutes
      }
    });
  } catch (error) {
    console.error('Error in Serper API:', error);
    
    // Handle timeout errors specifically
    const isTimeout = error instanceof Error && error.message.includes('timed out');
    
    return new Response(JSON.stringify({
      error: isTimeout 
        ? 'Search timed out. Please try again with a more specific query.'
        : 'Error processing search request',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 