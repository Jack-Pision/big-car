import axios from 'axios';
import { 
  RedditUserInfo,
  RedditPost,
  RedditComment,
  RedditSearchResult,
  RedditUserAnalysis,
  RedditTopicAnalysis
} from './types';

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
export async function getAccessToken(): Promise<string> {
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
export async function searchReddit(query: string, limit: number = 10): Promise<RedditSearchResult[]> {
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
        created_utc: post.created_utc,
        num_comments: post.num_comments
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
export async function getSubredditPosts(subreddit: string, limit: number = 5): Promise<RedditPost[]> {
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
export async function getPostComments(postId: string, subreddit: string, limit: number = 10): Promise<RedditComment[]> {
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
          subreddit: comment.subreddit_name_prefixed,
          url: `https://www.reddit.com${comment.permalink}`,
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
export async function getUserInfo(username: string): Promise<RedditUserInfo | null> {
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
export async function getUserPosts(username: string, limit: number = 5): Promise<RedditPost[]> {
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
    console.error('Error getting user posts:', error);
    return [];
  }
}

/**
 * Get recent comments made by a specific Reddit user
 */
export async function getUserComments(username: string, limit: number = 5): Promise<RedditComment[]> {
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
        author: comment.author,
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
export async function analyzeRedditUser(username: string): Promise<RedditUserAnalysis> {
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

/**
 * Analyze a topic by searching Reddit for relevant posts and discussions
 */
export async function analyzeRedditTopic(query: string, limit: number = 15): Promise<RedditTopicAnalysis> {
  try {
    // Search for the topic on Reddit
    const posts = await searchReddit(query, limit);
    
    if (posts.length === 0) {
      return {
        query,
        posts: [],
        topSubreddits: [],
        summary: `No Reddit posts found for query: ${query}`,
        error: 'No results found'
      };
    }
    
    // Calculate the most common subreddits
    const subredditCounts: Record<string, number> = {};
    posts.forEach(post => {
      if (post.subreddit) {
        subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
      }
    });
    
    const topSubreddits = Object.entries(subredditCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    // Create a summary of the search results
    const summary = formatRedditTopicSummary(query, posts, topSubreddits);
    
    return {
      query,
      posts,
      topSubreddits,
      summary
    };
  } catch (error) {
    console.error('Error analyzing Reddit topic:', error);
    return {
      query,
      posts: [],
      topSubreddits: [],
      summary: '',
      error: `Error analyzing Reddit topic: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Format the Reddit user data into a human-readable summary
 */
export function formatRedditUserSummary(userData: RedditUserAnalysis): string {
  if (!userData.userInfo) {
    return 'Could not find information about this Reddit user.';
  }

  const { userInfo, recentPosts, recentComments } = userData;
  
  // Calculate account age in years
  const accountCreated = new Date(userInfo.created_utc * 1000);
  const now = new Date();
  const accountAgeYears = ((now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  
  // Create formatted date string
  const accountCreatedStr = accountCreated.toLocaleDateString('en-US', {
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });
  
  // Get the subreddits the user is active in
  const allSubreddits = [
    ...recentPosts.map(post => post.subreddit),
    ...recentComments.map(comment => comment.subreddit)
  ];
  
  // Count frequency of each subreddit
  const subredditCounts: Record<string, number> = {};
  allSubreddits.forEach(subreddit => {
    if (subreddit) {
      subredditCounts[subreddit] = (subredditCounts[subreddit] || 0) + 1;
    }
  });
  
  // Convert to array and sort by frequency
  const topSubreddits = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name} (${count} contributions)`);
  
  // Create a summary of the user
  let summary = `## Reddit User: u/${userInfo.name}\n\n`;
  summary += `**Account Age:** ${accountAgeYears} years (created on ${accountCreatedStr})\n\n`;
  summary += `**Karma:** ${userInfo.karma.total} total (${userInfo.karma.post} post, ${userInfo.karma.comment} comment)\n\n`;
  
  if (userInfo.is_gold) {
    summary += `**Reddit Gold:** Yes\n\n`;
  }
  
  if (userInfo.is_mod) {
    summary += `**Moderator:** Yes\n\n`;
  }
  
  if (topSubreddits.length > 0) {
    summary += `**Most Active In:** ${topSubreddits.join(', ')}\n\n`;
  }
  
  // Recent posts summary
  if (recentPosts.length > 0) {
    summary += `### Recent Posts (${recentPosts.length}):\n\n`;
    recentPosts.slice(0, 5).forEach((post, index) => {
      const postDate = new Date(post.created_utc * 1000).toLocaleDateString();
      summary += `${index + 1}. **[${post.title}](${post.url})** in ${post.subreddit} (${postDate}, ${post.score} points)\n`;
      
      // Add a short excerpt if it's a text post
      if (post.is_self && post.content) {
        const excerpt = post.content.length > 150 
          ? post.content.substring(0, 150) + '...' 
          : post.content;
        summary += `   > ${excerpt.replace(/\n/g, ' ')}\n\n`;
      } else {
        summary += '\n';
      }
    });
  }
  
  // Recent comments summary
  if (recentComments.length > 0) {
    summary += `### Recent Comments (${recentComments.length}):\n\n`;
    recentComments.slice(0, 5).forEach((comment, index) => {
      const commentDate = new Date(comment.created_utc * 1000).toLocaleDateString();
      summary += `${index + 1}. In **[${comment.post_title}](${comment.url})** (${comment.subreddit}, ${commentDate}, ${comment.score} points):\n`;
      
      // Add a short excerpt of the comment
      const excerpt = comment.body.length > 150 
        ? comment.body.substring(0, 150) + '...' 
        : comment.body;
      summary += `   > ${excerpt.replace(/\n/g, ' ')}\n\n`;
    });
  }
  
  return summary;
}

/**
 * Format the Reddit topic search results into a human-readable summary
 */
export function formatRedditTopicSummary(
  query: string,
  posts: RedditSearchResult[],
  topSubreddits: { name: string; count: number }[]
): string {
  if (posts.length === 0) {
    return `No Reddit discussions found for: ${query}`;
  }

  // Create a summary of the search results
  let summary = `## Reddit Discussions: ${query}\n\n`;
  
  // Add top subreddits
  if (topSubreddits.length > 0) {
    summary += `**Top Communities:** ${topSubreddits.map(s => `${s.name} (${s.count} posts)`).join(', ')}\n\n`;
  }
  
  // Add the top posts
  summary += `### Top Discussions (${posts.length} total):\n\n`;
  posts.slice(0, 7).forEach((post, index) => {
    const postDate = new Date(post.created_utc * 1000).toLocaleDateString();
    summary += `${index + 1}. **[${post.title}](${post.url})** in ${post.subreddit}\n`;
    summary += `   ${post.score} points | ${post.num_comments || 0} comments | Posted by u/${post.author} on ${postDate}\n`;
    
    // Add a short excerpt if it's a text post
    if (post.is_self && post.content) {
      const excerpt = post.content.length > 150 
        ? post.content.substring(0, 150) + '...' 
        : post.content;
      summary += `   > ${excerpt.replace(/\n/g, ' ')}\n\n`;
    } else {
      summary += '\n';
    }
  });
  
  return summary;
} 