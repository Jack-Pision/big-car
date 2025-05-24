import { NextRequest } from 'next/server';
import { analyzeRedditUser, extractRedditUsername } from '@/utils/reddit-api';

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
    const redditUserData = await analyzeRedditUser(username);

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

/**
 * Format the Reddit user data into a human-readable summary
 */
function formatRedditUserSummary(userData: any): string {
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
    ...recentPosts.map((post: any) => post.subreddit),
    ...recentComments.map((comment: any) => comment.subreddit)
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
    recentPosts.slice(0, 5).forEach((post: any, index: number) => {
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
    recentComments.slice(0, 5).forEach((comment: any, index: number) => {
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