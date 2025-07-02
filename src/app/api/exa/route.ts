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
    const EXA_API_KEY2 = process.env.EXA_API_KEY2;
    
    if (!EXA_API_KEY || !EXA_API_KEY2) {
      console.error('One or both EXA API keys are not defined in environment variables');
      return new Response(JSON.stringify({ error: 'Search service configuration error: API key not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Starting dual API key Exa search process for query:', query);

    // Step 1: Search for URLs and basic metadata with both API keys in parallel (2 pages each)
    const searchPayloads = [
      { query, numResults: 10, offset: 0, useAutoprompt: true },
      { query, numResults: 10, offset: 10, useAutoprompt: true }
    ];

    // Fetch 2 pages for each API key
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const allSearchPromises = [
        ...searchPayloads.map(payload => fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
          body: JSON.stringify(payload),
          signal: controller.signal
        })),
        ...searchPayloads.map(payload => fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY2 },
          body: JSON.stringify(payload),
          signal: controller.signal
        }))
      ];
      const searchResponses = await Promise.all(allSearchPromises);
      if (searchResponses.some(r => !r.ok)) {
        clearTimeout(timeoutId);
        const errorData = await Promise.all(searchResponses.map(r => r.ok ? '' : r.text()));
        console.error('Exa search API error:', errorData.join(' | '));
        return new Response(JSON.stringify({ error: 'Failed to fetch search results' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const searchDatas = await Promise.all(searchResponses.map(r => r.json() as Promise<ExaSearchResponse>));
      // Combine all results, deduplicate by URL
      const combinedResults: ExaSearchResult[] = [];
      const existingUrls = new Set<string>();
      for (const data of searchDatas) {
        for (const result of data.results) {
          if (!existingUrls.has(result.url)) {
            combinedResults.push(result);
            existingUrls.add(result.url);
          }
        }
      }
      // No slicing, keep all results
      const topResults = combinedResults;
      // Extract URLs for contents request
      const urls = topResults.map(result => result.url);
      
      console.log('Step 2: Fetching contents and summaries for', urls.length, 'URLs...');

      // Step 2: Get summaries from contents endpoint using both API keys for better rate limits
      const contentsPayload = {
        ids: urls,
        summary: true,
        text: false, // Only fetch summaries, not full text
        highlights: false,
        extras: {
          imageLinks: 5
        }
      };

      // Split URLs in half to distribute between the two API keys
      const halfIndex = Math.ceil(urls.length / 2);
      const firstHalfUrls = urls.slice(0, halfIndex);
      const secondHalfUrls = urls.slice(halfIndex);

      const contentsPayload1 = {
        ...contentsPayload,
        ids: firstHalfUrls
      };

      const contentsPayload2 = {
        ...contentsPayload,
        ids: secondHalfUrls
      };

      const [contentsResponse1, contentsResponse2] = await Promise.all([
        fetch('https://api.exa.ai/contents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': EXA_API_KEY,
          },
          body: JSON.stringify(contentsPayload1),
          signal: controller.signal
        }),
        secondHalfUrls.length > 0 ? fetch('https://api.exa.ai/contents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': EXA_API_KEY2,
          },
          body: JSON.stringify(contentsPayload2),
          signal: controller.signal
        }) : Promise.resolve(new Response(JSON.stringify({ results: [] })))
      ]);

      clearTimeout(timeoutId);

      if (!contentsResponse1.ok || (secondHalfUrls.length > 0 && !contentsResponse2.ok)) {
        const errorData1 = !contentsResponse1.ok ? await contentsResponse1.text() : '';
        const errorData2 = secondHalfUrls.length > 0 && !contentsResponse2.ok ? await contentsResponse2.text() : '';
        console.error('Exa contents API error:', errorData1 || errorData2);
        // Fall back to search results if contents fails
        console.log('Falling back to search results without summaries');
        
        const fallbackResults: TransformedSearchResult[] = topResults.map((result, index) => ({
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
            exa_request_id: `${searchDatas[0].requestId},${searchDatas[1].requestId}`,
            api_method: 'dual_api_search_only_fallback',
            content_retrieval: 'fallback_no_summaries'
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const contentsData1 = await contentsResponse1.json() as ExaContentsResponse;
      const contentsData2 = secondHalfUrls.length > 0 ? 
        await contentsResponse2.json() as ExaContentsResponse : 
        { requestId: '', results: [] };
      
      // Combine content results
      const combinedContents = [...contentsData1.results, ...contentsData2.results];
      
      console.log('Step 2 complete for both API keys:', {
        requestId1: contentsData1.requestId,
        requestId2: contentsData2.requestId || 'N/A',
        contentsFound: combinedContents.length,
        summaryLengths: combinedContents.map(r => r.summary ? r.summary.length : 0),
        resultsWithImages: combinedContents.filter(r => r.image).length,
        resultsWithFavicons: combinedContents.filter(r => r.favicon).length
      });

      // Merge search results with contents data
      const mergedResults: TransformedSearchResult[] = topResults.map((searchResult, index) => {
        // Find corresponding content by URL
        const contentResult = combinedContents.find(content => content.url === searchResult.url);
        
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

      console.log('Dual API key process complete - content quality check:', {
        totalResults: mergedResults.length,
        contentfulResults: contentfulResults.length,
        totalCharacters,
        avgContentLength: contentfulResults.length > 0
          ? Math.round(contentfulResults.reduce((sum, r) => sum + (r.summary?.length || 0), 0) / contentfulResults.length)
          : 0,
        estimatedTokens: Math.round(totalCharacters / 4),
      });

      // Enhanced data structure for dual API key results
      const enhancedData = {
        summaries: mergedResults.reduce((acc: any, result: any, index: number) => {
          const resultId = result.id || (index + 1).toString();
          acc[resultId] = {
            summary: result.summary || '',
            metadata: {
              author: null,
              publishedDate: result.timestamp || null,
              score: null,
              searchType: searchDatas[0].resolvedSearchType || 'auto',
              summaryLength: (result.summary || '').length
            }
          };
          return acc;
        }, {}),
        search_metadata: {
          search_request_id: `${searchDatas[0].requestId},${searchDatas[1].requestId}`,
          contents_request_id: `${contentsData1.requestId},${contentsData2.requestId || 'N/A'}`,
          search_type: searchDatas[0].resolvedSearchType || 'auto',
          total_results: mergedResults.length,
          content_available: contentfulResults.length,
          total_characters: totalCharacters,
          estimated_tokens: Math.round(totalCharacters / 4),
          cost_info: {
            search: (searchDatas[0].costDollars || 0) + (searchDatas[1].costDollars || 0),
            contents: (contentsData1.costDollars || 0) + (contentsData2.costDollars || 0)
          },
          optimization: 'dual_api_key_search_and_contents'
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
          dual_api: true,
          exa_request_id: `${searchDatas[0].requestId},${searchDatas[1].requestId}`,
          api_method: 'dual_api_search_and_contents'
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