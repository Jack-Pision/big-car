export interface WebSource {
  title: string;
  url: string;
  favicon?: string;
  snippet?: string;
  icon?: string;
  type?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  imageUrls?: string[];
  webSources?: WebSource[];
  researchId?: string;
  id: string;
  timestamp: number;
  parentId?: string;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
}

export interface Chat {
  id: string;
  sessionId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
} 