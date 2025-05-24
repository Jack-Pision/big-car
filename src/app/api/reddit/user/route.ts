import { NextRequest } from 'next/server';
import { analyzeRedditUser, extractRedditUsername, formatRedditUserSummary } from '../utils';
import { RedditUserAnalysis } from '../types';

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
    const { query } = body;

    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Extract username from the query
    const username = extractRedditUsername(query);
    
    if (!username) {
      return new Response(JSON.stringify({ 
        error: 'No valid Reddit username found in query',
        message: 'Please provide a Reddit username in the format "u/username" or just "username"'
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Analyze the Reddit user
    const redditUserData: RedditUserAnalysis = await analyzeRedditUser(username);

    if (redditUserData.error) {
      return new Response(JSON.stringify({
        error: redditUserData.error
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Format the response in a readable way for the AI to process
    const formattedResponse = {
      username,
      userInfo: redditUserData.userInfo,
      recentPosts: redditUserData.recentPosts,
      recentComments: redditUserData.recentComments,
      summary: formatRedditUserSummary(redditUserData)
    };

    return new Response(JSON.stringify(formattedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error analyzing Reddit user:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to analyze Reddit user',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 