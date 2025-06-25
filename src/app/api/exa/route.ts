import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface ExaSearchResult {
  title: string;
  url: string;
  snippet?: string; // Basic search results may have snippet
  text?: string; // Full content from searchAndContents
  highlights?: string[]; // Highlights from searchAndContents
  highlightScores?: number[]; // Scores for highlights
  summary?: string; // Summary from searchAndContents
  author?: string | null;
  publishedDate?: string | null;
  score?: number;
  id: string;
  image?: string;
  favicon?: string;
}

interface ExaApiResponse {
  requestId: string;
  resolvedSearchType: 'neural' | 'keyword';
  results: ExaSearchResult[];
  searchType?: string;
  costDollars?: any;
}

interface TransformedSearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  image?: string;
  timestamp?: string;
  text?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query, enhanced = false } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log all environment variables (be careful with this in production)
    console.log('Available env variables:', Object.keys(process.env).filter(key => !key.includes('PASSWORD') && !key.includes('SECRET')));
    
    const EXA_API_KEY = process.env.EXA_API_KEY;
    console.log('EXA_API_KEY exists:', !!EXA_API_KEY);
    
    if (!EXA_API_KEY) {
      console.error('EXA_API_KEY is not defined in environment variables');
      return new Response(JSON.stringify({ error: 'Search service configuration error: API key not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build optimized payload with character limits and essential content only
    const payload: Record<string, any> = {
      query,
      numResults: 10,
      contents: {
        text: {
          maxCharacters: 6000 // Limit to 6000 characters per result for manageable processing
        },
        livecrawl: "preferred", // Try fresh crawl but fallback to cache if fails
        extras: {
          imageLinks: 3 // Get up to 3 image links per result
        }
      },
      useAutoprompt: true // Enable query enhancement
    };

    console.log('Exa optimized search request:', {
      query,
      enhanced,
      numResults: 10,
      textLimit: '6000 chars per source',
      imageLinks: 3,
      livecrawl: "preferred",
      totalEstimatedChars: '~60,000 max (10 sources × 6000 chars)'
    });

    // Create a manual timeout controller for Edge Function compatibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    try {
      const exaResponse = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': EXA_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Clear timeout on successful response

      if (!exaResponse.ok) {
        const errorData = await exaResponse.text();
        console.error('Exa API error:', errorData);
        return new Response(JSON.stringify({ error: 'Failed to fetch search results' }), {
          status: exaResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const data = await exaResponse.json() as ExaApiResponse;
      
      console.log('Exa optimized response:', {
        requestId: data.requestId,
        searchType: data.resolvedSearchType,
        resultsCount: data.results.length,
        textContentSizes: data.results.map(r => r.text ? r.text.length : 0),
        totalCharacters: data.results.reduce((sum, r) => sum + (r.text?.length || 0), 0),
        avgCharactersPerResult: data.results.length > 0 
          ? Math.round(data.results.reduce((sum, r) => sum + (r.text?.length || 0), 0) / data.results.length)
          : 0,
        resultsWithImages: data.results.filter(r => r.image).length,
        resultsWithFavicons: data.results.filter(r => r.favicon).length
      });
      
      // Transform Exa results to match our application's format with essential metadata
      const transformedResults: TransformedSearchResult[] = data.results.map((result, index) => ({
        id: result.id || (index + 1).toString(),
        title: result.title,
        snippet: result.text?.substring(0, 200) + '...' || 'No content available',
        url: result.url,
        favicon: result.favicon, // Essential for UI display
        image: result.image, // Essential for visual context
        timestamp: result.publishedDate || new Date().toISOString(),
        text: result.text || '' // Character-limited full text
      }));

      // Check content quality with new limits
      const contentfulResults = transformedResults.filter(r => r.text && r.text.length > 100);
      const totalCharacters = transformedResults.reduce((sum, r) => sum + (r.text?.length || 0), 0);

      console.log('Optimized content quality check:', {
        totalResults: transformedResults.length,
        contentfulResults: contentfulResults.length,
        totalCharacters,
        avgContentLength: contentfulResults.length > 0 
          ? Math.round(contentfulResults.reduce((sum, r) => sum + (r.text?.length || 0), 0) / contentfulResults.length)
          : 0,
        estimatedTokens: Math.round(totalCharacters / 4), // Rough token estimate
        withinLimits: totalCharacters < 80000 // Should be well within limits now
      });

      // Simplified enhanced data structure focused on essential content
      const enhancedData = {
        full_content: data.results.reduce((acc: any, result: any, index: number) => {
          const resultId = result.id || (index + 1).toString();
          acc[resultId] = {
            text: result.text || '', // Character-limited full text
            metadata: {
              author: result.author || null,
              publishedDate: result.publishedDate || null,
              score: result.score || null,
              searchType: data.resolvedSearchType || 'auto',
              textLength: (result.text || '').length,
              hasImage: !!(result.image),
              hasFavicon: !!(result.favicon),
              contentSource: result.text ? 'livecrawl' : 'cache'
            }
          };
          return acc;
        }, {}),
        search_metadata: {
          request_id: data.requestId,
          search_type: data.resolvedSearchType || 'auto',
          total_results: data.results.length,
          content_available: data.results.filter(r => r.text).length,
          total_characters: totalCharacters,
          estimated_tokens: Math.round(totalCharacters / 4),
          cost_info: data.costDollars || null,
          optimization: 'character_limited',
          content_quality: {
            contentful_results: contentfulResults.length,
            within_token_limits: totalCharacters < 80000,
            avg_chars_per_result: Math.round(totalCharacters / data.results.length)
          }
        }
      };

      return new Response(JSON.stringify({ 
        sources: transformedResults,
        resultsCount: transformedResults.length,
        enhanced: enhancedData,
        metadata: {
          timestamp: new Date().toISOString(),
          query_processed: query,
          enhanced_mode: enhanced,
          exa_request_id: data.requestId,
          api_method: 'searchAndContents',
          content_retrieval: 'single_api_call'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      clearTimeout(timeoutId); // Ensure timeout is cleared on error
      console.error('Search API error:', error);
      
      // Handle specific timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Search request timed out. Please try again with a simpler query.' 
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Search API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 