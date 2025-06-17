export interface Session {
  id: string;
  user_id?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  // For backward compatibility with localStorage
  timestamp?: number;
}

export interface Message {
  id?: string;
  session_id?: string;
  user_id?: string;
  role: 'user' | 'assistant' | 'search-ui';
  content: string;
  image_urls?: string[];
  web_sources?: any;
  structured_content?: any;
  parent_id?: string;
  query?: string;
  is_search_result?: boolean;
  is_processed?: boolean;
  is_streaming?: boolean;
  content_type?: string;
  created_at?: string;
  // For backward compatibility with localStorage
  imageUrls?: string[];
  webSources?: any;
  structuredContent?: any;
  parentId?: string;
  isSearchResult?: boolean;
  isProcessed?: boolean;
  isStreaming?: boolean;
  contentType?: string;
  timestamp?: number;
}

export interface BoardContent {
  id?: string;
  user_id?: string;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserPreferences {
  id?: string;
  user_id?: string;
  active_session_id?: string | null;
  preferences?: any;
  created_at?: string;
  updated_at?: string;
} 