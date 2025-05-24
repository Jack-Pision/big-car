// Reddit API response types

export interface RedditUserInfo {
  name: string;
  karma: {
    post: number;
    comment: number;
    total: number;
  };
  created_utc: number;
  is_gold: boolean;
  is_mod: boolean;
  has_verified_email: boolean;
}

export interface RedditPost {
  title: string;
  author: string;
  subreddit: string;
  url: string;
  score: number;
  content: string;
  is_self: boolean;
  created_utc: number;
}

export interface RedditComment {
  body: string;
  author: string;
  subreddit: string;
  post_title?: string;
  url: string;
  score: number;
  created_utc: number;
}

export interface RedditSearchResult {
  title: string;
  author: string;
  subreddit: string;
  url: string;
  score: number;
  content: string;
  is_self: boolean;
  created_utc: number;
  num_comments?: number;
}

export interface RedditUserAnalysis {
  userInfo: RedditUserInfo | null;
  recentPosts: RedditPost[];
  recentComments: RedditComment[];
  error?: string;
}

export interface RedditTopicAnalysis {
  query: string;
  posts: RedditSearchResult[];
  topSubreddits: {
    name: string;
    count: number;
  }[];
  summary: string;
  error?: string;
} 