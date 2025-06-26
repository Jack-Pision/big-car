import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface ExaSearchResult {
  title: string;
  url: string;
  snippet?: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
  author?: string | null;
  publishedDate?: string | null;
  score?: number;
  id: string;
  image?: string;
  favicon?: string;
}

interface ExaSearchResponse {
  requestId: string;
  resolvedSearchType: 'neural' | 'keyword';
  results: ExaSearchResult[];
  costDollars?: any;
}

interface ExaContentsResponse {
  requestId: string;
  results: ExaSearchResult[];
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
  summary?: string;
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

    const EXA_API_KEY = process.env.EXA_API_KEY;
    
    if (!EXA_API_KEY) {
      console.error('EXA_API_KEY is not defined in environment variables');
      return new Response(JSON.stringify({ error: 'Search service configuration error: API key not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Starting two-step Exa API process for query:', query);

    // Step 1: Search for URLs and basic metadata
    const searchPayload = {
      query,
      numResults: 10,
      useAutoprompt: true
    };

    console.log('Step 1: Searching for URLs...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for two-step process
    
    try {
      // Step 1: Get URLs from search endpoint
      const searchResponse = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': EXA_API_KEY,
        },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });

      if (!searchResponse.ok) {
        clearTimeout(timeoutId);
        const errorData = await searchResponse.text();
        console.error('Exa search API error:', errorData);
        return new Response(JSON.stringify({ error: 'Failed to fetch search results' }), {
          status: searchResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const searchData = await searchResponse.json() as ExaSearchResponse;
      
      console.log('Step 1 complete:', {
        requestId: searchData.requestId,
        searchType: searchData.resolvedSearchType,
        resultsFound: searchData.results.length
      });

      // Extract URLs for contents request
      const urls = searchData.results.map(result => result.url);
      
      console.log('Step 2: Fetching contents and summaries for', urls.length, 'URLs...');

      // Step 2: Get summaries from contents endpoint
      const contentsPayload = {
        ids: urls,
        summary: true,
        text: false, // We only want summaries, not full text
        highlights: false,
        extras: {
          imageLinks: 5
        }
      };

      const contentsResponse = await fetch('https://api.exa.ai/contents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': EXA_API_KEY,
        },
        body: JSON.stringify(contentsPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!contentsResponse.ok) {
        const errorData = await contentsResponse.text();
        console.error('Exa contents API error:', errorData);
        // Fall back to search results if contents fails
        console.log('Falling back to search results without summaries');
        
        const fallbackResults: TransformedSearchResult[] = searchData.results.map((result, index) => ({
          id: result.id || (index + 1).toString(),
          title: result.title,
          snippet: result.snippet || 'No summary available',
          url: result.url,
          favicon: result.favicon,
          image: result.image,
          timestamp: result.publishedDate || new Date().toISOString(),
          summary: result.snippet || ''
        }));

        return new Response(JSON.stringify({ 
          sources: fallbackResults,
          resultsCount: fallbackResults.length,
          metadata: {
            timestamp: new Date().toISOString(),
            query_processed: query,
            enhanced_mode: enhanced,
            exa_request_id: searchData.requestId,
            api_method: 'search_only_fallback',
            content_retrieval: 'fallback_no_summaries'
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const contentsData = await contentsResponse.json() as ExaContentsResponse;
      
      console.log('Step 2 complete:', {
        requestId: contentsData.requestId,
        contentsFound: contentsData.results.length,
        summaryLengths: contentsData.results.map(r => r.summary ? r.summary.length : 0),
        resultsWithImages: contentsData.results.filter(r => r.image).length,
        resultsWithFavicons: contentsData.results.filter(r => r.favicon).length
      });

      // Merge search results with contents data
      const mergedResults: TransformedSearchResult[] = searchData.results.map((searchResult, index) => {
        // Find corresponding content by URL
        const contentResult = contentsData.results.find(content => content.url === searchResult.url);
        
        return {
          id: searchResult.id || (index + 1).toString(),
          title: searchResult.title,
          snippet: contentResult?.summary || searchResult.snippet || 'No summary available',
          url: searchResult.url,
          favicon: contentResult?.favicon || searchResult.favicon,
          image: contentResult?.image || searchResult.image,
          timestamp: searchResult.publishedDate || new Date().toISOString(),
          summary: contentResult?.summary || ''
        };
      });

      const contentfulResults = mergedResults.filter(r => r.summary && r.summary.length > 50);
      const totalCharacters = mergedResults.reduce((sum, r) => sum + (r.summary?.length || 0), 0);

      console.log('Two-step process complete - content quality check:', {
        totalResults: mergedResults.length,
        contentfulResults: contentfulResults.length,
        totalCharacters,
        avgContentLength: contentfulResults.length > 0
          ? Math.round(contentfulResults.reduce((sum, r) => sum + (r.summary?.length || 0), 0) / contentfulResults.length)
          : 0,
        estimatedTokens: Math.round(totalCharacters / 4),
      });

      // Enhanced data structure for two-step results
      const enhancedData = {
        summaries: mergedResults.reduce((acc: any, result: any, index: number) => {
          const resultId = result.id || (index + 1).toString();
          acc[resultId] = {
            summary: result.summary || '',
            metadata: {
              author: null,
              publishedDate: result.timestamp || null,
              score: null,
              searchType: searchData.resolvedSearchType || 'auto',
              summaryLength: (result.summary || '').length
            }
          };
          return acc;
        }, {}),
        search_metadata: {
          search_request_id: searchData.requestId,
          contents_request_id: contentsData.requestId,
          search_type: searchData.resolvedSearchType || 'auto',
          total_results: mergedResults.length,
          content_available: contentfulResults.length,
          total_characters: totalCharacters,
          estimated_tokens: Math.round(totalCharacters / 4),
          cost_info: {
            search: searchData.costDollars || null,
            contents: contentsData.costDollars || null
          },
          optimization: 'two_step_search_and_contents'
        }
      };

      return new Response(JSON.stringify({ 
        sources: mergedResults,
        resultsCount: mergedResults.length,
        enhanced: enhancedData,
        metadata: {
          timestamp: new Date().toISOString(),
          query_processed: query,
          enhanced_mode: enhanced,
          exa_search_request_id: searchData.requestId,
          exa_contents_request_id: contentsData.requestId,
          api_method: 'two_step_search_and_contents',
          content_retrieval: 'reliable_summaries'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Two-step Exa API error:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Search request timed out. Please try again with a simpler query.' 
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'Internal server error during search' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Exa API route error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 