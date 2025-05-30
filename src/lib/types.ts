export interface Session {
  id: string;
  title: string;
  timestamp: number; // Timestamp of the last message or session creation
  // You might want to add a snippet of the last message later
}

// Re-exporting existing Message type if needed, or it can be imported directly
// For now, we assume Message type is available from where it's currently defined.
// If not, we would include it here:
/*
export interface Message {
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  imageUrls?: string[];
  webSources?: WebSource[]; // Assuming WebSource is defined elsewhere or here
  researchId?: string;
  id: string;
  timestamp: number;
  parentId?: string;
}

export interface WebSource {
  url: string;
  title: string;
  snippet?: string;
}
*/ 