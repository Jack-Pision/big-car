import { NextRequest } from 'next/server';
import { analyzeRedditTopic } from '../utils';
import { RedditTopicAnalysis } from '../types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Unsupported content type' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const body = await req.json();
    const { query, limit } = body;

    if (!query) {
      return new Response(JSON.stringify({ error: 'No search query provided' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Set a reasonable default and maximum for limit
    const searchLimit = Math.min(limit || 10, 25);

    // Search Reddit for the topic
    const topicData: RedditTopicAnalysis = await analyzeRedditTopic(query, searchLimit);

    if (topicData.error && topicData.posts.length === 0) {
      return new Response(JSON.stringify({
        error: topicData.error,
        query
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(topicData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error searching Reddit:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to search Reddit',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 