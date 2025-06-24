import { NextRequest, NextResponse } from 'next/server';

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
}

export async function POST(req: NextRequest) {
  try {
    const { query, enhanced = false } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Log all environment variables (be careful with this in production)
    console.log('Available env variables:', Object.keys(process.env).filter(key => !key.includes('PASSWORD') && !key.includes('SECRET')));
    
    const EXA_API_KEY = process.env.EXA_API_KEY;
    console.log('EXA_API_KEY exists:', !!EXA_API_KEY);
    
    if (!EXA_API_KEY) {
      console.error('EXA_API_KEY is not defined in environment variables');
      return NextResponse.json(
        { error: 'Search service configuration error: API key not found' },
        { status: 500 }
      );
    }

    // Build payload for searchAndContents functionality - this is the key improvement!
    const payload: Record<string, any> = {
      query,
      numResults: 10,
      text: true, // Always get full text content via searchAndContents
      highlights: {
        numSentences: enhanced ? 3 : 2,
        highlightsPerUrl: enhanced ? 2 : 1,
        ...(enhanced && { query: "Key insights and findings" })
      },
      ...(enhanced && {
        summary: {
          query: "Main points and important information"
        }
      })
    };

    console.log('Exa searchAndContents request:', {
      query,
      enhanced,
      hasText: true,
      hasHighlights: true,
      hasSummary: enhanced
    });

    const exaResponse = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!exaResponse.ok) {
      const errorData = await exaResponse.text();
      console.error('Exa API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch search results' },
        { status: exaResponse.status }
      );
    }

    const data = await exaResponse.json() as ExaApiResponse;
    
    console.log('Exa searchAndContents response:', {
      requestId: data.requestId,
      searchType: data.resolvedSearchType,
      resultsCount: data.results.length,
      textContent: data.results.filter(r => r.text).length,
      highlightsContent: data.results.filter(r => r.highlights?.length).length,
      summaryContent: data.results.filter(r => r.summary).length
    });
    
    // Transform Exa results to match our application's format
    const transformedResults: TransformedSearchResult[] = data.results.map((result, index) => ({
      id: result.id || (index + 1).toString(),
      title: result.title,
      snippet: result.snippet || 
               (result.highlights?.[0]) || 
               (result.text?.substring(0, 200) + '...') || 
               'No content available',
      url: result.url,
      favicon: result.favicon,
      image: result.image,
      timestamp: result.publishedDate || new Date().toISOString()
    }));

    // Enhanced data now includes FULL CONTENT from searchAndContents!
    const enhancedData = {
      full_content: data.results.reduce((acc: any, result: any, index: number) => {
        const resultId = result.id || (index + 1).toString();
        acc[resultId] = {
          text: result.text || '', // Full page content
          highlights: result.highlights || [], // Key excerpts
          highlightScores: result.highlightScores || [],
          summary: result.summary || '', // AI-generated summary
          metadata: {
            author: result.author || null,
            publishedDate: result.publishedDate || null,
            score: result.score || null,
            searchType: data.resolvedSearchType || 'auto',
            hasFullText: !!(result.text),
            textLength: result.text?.length || 0,
            highlightCount: result.highlights?.length || 0
          }
        };
        return acc;
      }, {}),
      search_metadata: {
        request_id: data.requestId,
        search_type: data.resolvedSearchType || 'auto',
        total_results: data.results.length,
        content_available: data.results.filter(r => r.text).length,
        highlights_available: data.results.filter(r => r.highlights?.length).length,
        summaries_available: data.results.filter(r => r.summary).length,
        cost_info: data.costDollars || null,
        search_and_contents: true // Flag indicating we used the combined API
      }
    };

    return NextResponse.json({ 
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
    });
    
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 