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
  // Filter for only valid, public, non-deleted Reddit posts
  return response.data.data.children
    .map((child: any) => child.data)
    .filter((post: any) =>
      !post.removed_by_category &&
      !post.is_deleted &&
      post.author !== '[deleted]' &&
      post.author !== '[removed]' &&
      post.permalink &&
      post.title &&
      (!post.is_self || (post.selftext && post.selftext.length > 10))
    )
    .map((post: any) => ({
      title: post.title,
      author: post.author,
      subreddit: post.subreddit_name_prefixed,
      url: `https://www.reddit.com${post.permalink}`,
      score: post.score,
      num_comments: post.num_comments,
      content: post.selftext || post.url,
      created_utc: post.created_utc,
      is_self: post.is_self,
      source: {
        name: post.subreddit_name_prefixed,
        url: `https://www.reddit.com${post.permalink}`,
        icon: '/icons/reddit-icon.svg'
      }
    }));
}

/**
 * Format the data into web search results with source citations
 * This formatting helps the AI include proper citations in its response
 */
function formatWebCitations(posts: any[]): string {
  if (!posts.length) return 'No relevant Reddit posts found.';
  
  let webData = '### Web Search Results\n\n';
  
  posts.forEach((post, i) => {
    const date = new Date(post.created_utc * 1000).toLocaleDateString();
    const formattedDate = date.replace(/\//g, '-');
    const sourceName = post.subreddit;
    
    webData += `[${i + 1}] **${post.title}** (${formattedDate}, ${sourceName})\n`;
    
    // Add excerpt if it's a self post with content
    if (post.is_self && post.content && post.content.length > 0) {
      const excerpt = post.content.length > 300 
        ? post.content.slice(0, 300) + '...' 
        : post.content;
      webData += `${excerpt.replace(/\n/g, ' ')}\n`;
    }
    
    // Add source citation marker
    webData += `[Source: Reddit|${post.url}]\n\n`;
  });
  
  // Add instruction for the AI on how to use this data
  webData += `\n### How to use these results in your response:
- Use the information from these sources to enhance your answer
- When citing information from a source, add a citation like this: [@Web](URL)
- You can also use numbered references: [1], [2], etc.
- Make sure your answer is comprehensive and well-structured
- Format citations in a way that's natural and readable
`;
  
  return webData;
}

/**
 * Format the Reddit data in a way that the AI can easily use
 * with proper attribution and markdown formatting for Grok-style output
 */
function formatAIPrompt(posts: any[]): string {
  if (!posts.length) return 'No relevant Reddit posts found.';
  
  let prompt = `I found these relevant discussions on Reddit about this topic:\n\n`;
  
  posts.forEach((post, i) => {
    const date = new Date(post.created_utc * 1000).toLocaleDateString();
    
    prompt += `[${i + 1}] From r/${post.subreddit.replace('r/', '')} (${post.score} upvotes, ${post.num_comments} comments):\n`;
    prompt += `Title: "${post.title}"\n`;
    
    if (post.is_self && post.content && post.content.length > 0) {
      const excerpt = post.content.length > 500 
        ? post.content.slice(0, 500) + '...' 
        : post.content;
      prompt += `Content: ${excerpt.replace(/\n/g, ' ')}\n`;
    }
    
    prompt += `Source URL: ${post.url}\n\n`;
  });
  
  prompt += `\nWhen using this information in your response:
1. Format your answer in a clear, structured way
2. Add source citations to the relevant parts of your answer using the [@Web](URL) format or numbered references [1], [2], etc.
3. Make sure attributions are naturally integrated into your response
4. When directly quoting or closely paraphrasing, always include a citation
5. Structure your answer with headings, bullet points, and paragraphs as appropriate
`;
  
  return prompt;
}

// Add RedditPost type for strong typing

type RedditPost = {
  title: string;
  author: string;
  subreddit: string;
  url: string;
  score: number;
  num_comments: number;
  content: string;
  created_utc: number;
  is_self: boolean;
  source: {
    name: string;
    url: string;
    icon: string;
  };
};

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit } = body;
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { status: 400 });
    }
    const posts = await searchRedditPosts(query, limit || 8);
    const summary = formatRedditSummary(posts);
    const webCitations = formatWebCitations(posts);
    const aiPrompt = formatAIPrompt(posts);
    
    return new Response(JSON.stringify({
      posts,
      summary,
      webCitations,
      aiPrompt,
      sources: posts.map((post: RedditPost) => ({
        title: post.title,
        url: post.url,
        icon: '/icons/reddit-icon.svg',
        type: 'reddit',
        subreddit: post.subreddit,
        date: new Date(post.created_utc * 1000).toLocaleDateString()
      }))
    }), {
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

// Keep the original summary function for backward compatibility
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