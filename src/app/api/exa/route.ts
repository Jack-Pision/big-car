import { NextRequest, NextResponse } from 'next/server';

interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon_url?: string;
  image_url?: string;
}

interface ExaApiResponse {
  results: ExaSearchResult[];
}

interface TransformedSearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  timestamp?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const EXA_API_KEY = process.env.EXA_API_KEY;

    if (!EXA_API_KEY) {
      console.error('EXA_API_KEY is not defined in environment variables');
      return NextResponse.json(
        { error: 'Search service configuration error' },
        { status: 500 }
      );
    }

    const exaResponse = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        query,
        numResults: 10,
        useAutoprompt: true,
      }),
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
    
    // Transform Exa results to match our application's format
    const transformedResults: TransformedSearchResult[] = data.results.map((result, index) => ({
      id: (index + 1).toString(),
      title: result.title,
      snippet: result.snippet,
      url: result.url,
      favicon: result.favicon_url,
      timestamp: new Date().toISOString() // Current timestamp as these are fresh results
    }));

    return NextResponse.json({ 
      sources: transformedResults,
      resultsCount: transformedResults.length
    });
    
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 