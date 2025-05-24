import axios from 'axios';

// Reddit API credentials
const CLIENT_ID = 'z1Cv6eSfzDhBdevXfFMgWg';
const CLIENT_SECRET = 'uaMj8_Fy6fzzduSo78mz9qdhwTCk8A';

// Reddit API endpoints
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';

// Cache the token to avoid making unnecessary requests
let cachedToken: {
  token: string;
  expiresAt: number;
} | null = null;

/**
 * Get an OAuth access token from Reddit
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  
  try {
    const tokenResponse = await axios({
      method: 'post',
      url: REDDIT_TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      },
      data: 'grant_type=client_credentials'
    });
    
    // Cache the token with an expiry time
    const expiresIn = tokenResponse.data.expires_in * 1000; // convert to milliseconds
    cachedToken = {
      token: tokenResponse.data.access_token,
      expiresAt: Date.now() + expiresIn - 60000 // Expire 1 minute early to be safe
    };
    
    return cachedToken.token;
  } catch (error) {
    console.error('Error getting Reddit access token:', error);
    throw new Error('Failed to authenticate with Reddit');
  }
}

/**
 * Search Reddit for a given query
 */
export async function searchReddit(query: string, limit: number = 5): Promise<any[]> {
  try {
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
        t: 'all' // all time
      }
    });
    
    // Extract the useful data from each post
    return response.data.data.children.map((child: any) => {
      const post = child.data;
      return {
        title: post.title,
        author: post.author,
        subreddit: post.subreddit_name_prefixed,
        url: `https://www.reddit.com${post.permalink}`,
        score: post.score,
        content: post.selftext || post.url,
        is_self: post.is_self, // text post vs link post
        created_utc: post.created_utc
      };
    });
  } catch (error) {
    console.error('Error searching Reddit:', error);
    return [];
  }
}

/**
 * Get posts from a specific subreddit
 */
export async function getSubredditPosts(subreddit: string, limit: number = 5): Promise<any[]> {
  try {
    const token = await getAccessToken();
    
    const response = await axios({
      method: 'get',
      url: `${REDDIT_API_BASE}/r/${subreddit}/hot`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AI-Study-App/1.0'
      },
      params: {
        limit: limit
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
        content: post.selftext || post.url,
        is_self: post.is_self,
        created_utc: post.created_utc
      };
    });
  } catch (error) {
    console.error('Error getting subreddit posts:', error);
    return [];
  }
}

/**
 * Get comments from a specific Reddit post
 */
export async function getPostComments(postId: string, subreddit: string, limit: number = 10): Promise<any[]> {
  try {
    const token = await getAccessToken();
    
    const response = await axios({
      method: 'get',
      url: `${REDDIT_API_BASE}/r/${subreddit}/comments/${postId}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AI-Study-App/1.0'
      },
      params: {
        limit: limit,
        depth: 1
      }
    });
    
    // Comments are in the second part of the response
    if (!response.data[1] || !response.data[1].data || !response.data[1].data.children) {
      return [];
    }
    
    return response.data[1].data.children
      .filter((child: any) => child.kind === 't1') // t1 is a comment
      .map((child: any) => {
        const comment = child.data;
        return {
          author: comment.author,
          body: comment.body,
          score: comment.score,
          created_utc: comment.created_utc
        };
      });
  } catch (error) {
    console.error('Error getting post comments:', error);
    return [];
  }
}

/**
 * Get information about a specific Reddit user
 */
export async function getUserInfo(username: string): Promise<any> {
  try {
    const token = await getAccessToken();
    
    const response = await axios({
      method: 'get',
      url: `${REDDIT_API_BASE}/user/${username}/about`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AI-Study-App/1.0'
      }
    });
    
    const userData = response.data.data;
    return {
      name: userData.name,
      karma: {
        post: userData.link_karma,
        comment: userData.comment_karma,
        total: userData.link_karma + userData.comment_karma
      },
      created_utc: userData.created_utc,
      is_gold: userData.is_gold,
      is_mod: userData.is_mod,
      has_verified_email: userData.has_verified_email
    };
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

/**
 * Get recent posts made by a specific Reddit user
 */
export async function getUserPosts(username: string, limit: number = 5): Promise<any[]> {
  try {
    const token = await getAccessToken();
    
    const response = await axios({
      method: 'get',
      url: `${REDDIT_API_BASE}/user/${username}/submitted`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AI-Study-App/1.0'
      },
      params: {
        limit: limit,
        sort: 'new'
      }
    });
    
    return response.data.data.children.map((child: any) => {
      const post = child.data;
      return {
        title: post.title,
        subreddit: post.subreddit_name_prefixed,
        url: `https://www.reddit.com${post.permalink}`,
        score: post.score,
        content: post.selftext || post.url,
        is_self: post.is_self,
        created_utc: post.created_utc
      };
    });
  } catch (error) {
    console.error('Error getting user posts:', error);
    return [];
  }
}

/**
 * Get recent comments made by a specific Reddit user
 */
export async function getUserComments(username: string, limit: number = 5): Promise<any[]> {
  try {
    const token = await getAccessToken();
    
    const response = await axios({
      method: 'get',
      url: `${REDDIT_API_BASE}/user/${username}/comments`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AI-Study-App/1.0'
      },
      params: {
        limit: limit,
        sort: 'new'
      }
    });
    
    return response.data.data.children.map((child: any) => {
      const comment = child.data;
      return {
        body: comment.body,
        subreddit: comment.subreddit_name_prefixed,
        post_title: comment.link_title,
        url: `https://www.reddit.com${comment.permalink}`,
        score: comment.score,
        created_utc: comment.created_utc
      };
    });
  } catch (error) {
    console.error('Error getting user comments:', error);
    return [];
  }
}

/**
 * Extract Reddit username from input
 * Supports formats like "u/username", "/u/username", "username", etc.
 */
export function extractRedditUsername(input: string): string | null {
  // Match patterns like u/username, /u/username, user/username or just username
  const usernameMatch = input.match(/(?:^|[^a-zA-Z0-9_-])(?:u\/|user\/|r\/)?([a-zA-Z0-9_-]{3,20})(?:\s|$)/i);
  
  if (usernameMatch && usernameMatch[1]) {
    return usernameMatch[1];
  }
  
  return null;
}

/**
 * Main function to analyze a Reddit user
 * Gets comprehensive information about a user
 */
export async function analyzeRedditUser(username: string): Promise<{
  userInfo: any;
  recentPosts: any[];
  recentComments: any[];
  error?: string;
}> {
  try {
    // Clean up the username input
    const cleanUsername = username.replace(/^u\/|^\/u\/|^user\//i, '');
    
    // Get user information
    const userInfo = await getUserInfo(cleanUsername);
    
    if (!userInfo) {
      return {
        userInfo: null,
        recentPosts: [],
        recentComments: [],
        error: `Could not find Reddit user: ${cleanUsername}`
      };
    }
    
    // Get user's recent posts and comments
    const [recentPosts, recentComments] = await Promise.all([
      getUserPosts(cleanUsername, 10),
      getUserComments(cleanUsername, 15)
    ]);
    
    return {
      userInfo,
      recentPosts,
      recentComments
    };
  } catch (error) {
    console.error('Error analyzing Reddit user:', error);
    return {
      userInfo: null,
      recentPosts: [],
      recentComments: [],
      error: `Error analyzing Reddit user: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 