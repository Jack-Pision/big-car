import { NextRequest } from 'next/server';
import axios from 'axios';

const CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const tokenResponse = await axios({
    method: 'post',
    url: REDDIT_TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    data: 'grant_type=client_credentials'
  });
  const expiresIn = tokenResponse.data.expires_in * 1000;
  cachedToken = {
    token: tokenResponse.data.access_token,
    expiresAt: Date.now() + expiresIn - 60000
  };
  return cachedToken.token;
}

async function searchRedditPosts(query: string, limit: number = 5) {
  const token = await getAccessToken();
  const response = await axios({
    method: 'get',
    url: `${REDDIT_API_BASE}/search`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'AI-Study-App/1.0'
    },
    params: {
      q: query,
      limit: limit,
      sort: 'relevance',
      t: 'year'
    }
  });
  return response.data.data.children.map((child: any) => {
    const post = child.data;
    return {
      title: post.title,
      author: post.author,
      subreddit: post.subreddit_name_prefixed,
      url: `https://www.reddit.com${post.permalink}`,
      score: post.score,
      num_comments: post.num_comments,
      content: post.selftext || post.url,
      created_utc: post.created_utc
    };
  });
}

function formatRedditSummary(posts: any[]): string {
  if (!posts.length) return 'No relevant Reddit posts found.';
  let summary = `### Top Reddit Discussions\n`;
  posts.forEach((post, i) => {
    const date = new Date(post.created_utc * 1000).toLocaleDateString();
    summary += `\n${i + 1}. **[${post.title}](${post.url})**\n`;
    summary += `   - Subreddit: ${post.subreddit}, Author: u/${post.author}, Upvotes: ${post.score}, Comments: ${post.num_comments}, Date: ${date}\n`;
    if (post.content && post.content.length > 30) {
      const excerpt = post.content.length > 200 ? post.content.slice(0, 200) + '...' : post.content;
      summary += `   - Excerpt: ${excerpt.replace(/\n/g, ' ')}\n`;
    }
  });
  return summary;
}

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit } = body;
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { status: 400 });
    }
    const posts = await searchRedditPosts(query, limit || 5);
    const summary = formatRedditSummary(posts);
    return new Response(JSON.stringify({ posts, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Reddit search error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch Reddit data', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 