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

export interface UserPreferences {
  id?: string;
  user_id?: string;
  active_session_id?: string | null;
  preferences?: any;
  created_at?: string;
  updated_at?: string;
}

// Artifact entity for storing generated documents with versioning support
export interface Artifact {
  id?: string;
  user_id?: string;
  session_id?: string | null; // optional association to a chat session
  root_id: string; // Groups all versions of the same artifact
  title: string;
  content: string;
  type: 'document' | 'guide' | 'report' | 'analysis';
  version: number; // starts at 1, increments with each edit
  metadata: {
    wordCount: number;
    estimatedReadTime: string;
    category: string;
    tags: string[];
  };
  created_at?: string;
  updated_at?: string;
} 