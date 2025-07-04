import { v4 as uuidv4 } from 'uuid';

// NOTE: Artifact data should now use content_markdown and the new artifacts_v2 table.

// Artifact detection and utility functions

export interface ArtifactData {
  root_id: string;
  version: number;
  type: 'document' | 'guide' | 'report' | 'analysis';
  title: string;
  content: string;
  metadata: {
    wordCount: number;
    estimatedReadTime: string;
    category: string;
    tags: string[];
  };
}

// JSON Schema for NVIDIA API structured generation
export const artifactSchema = {
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["document", "guide", "report", "analysis"]
    },
    "title": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "wordCount": {"type": "number"},
        "estimatedReadTime": {"type": "string"},
        "category": {"type": "string"},
        "tags": {
          "type": "array",
          "items": {"type": "string"}
        }
      },
      "required": ["wordCount", "estimatedReadTime", "category", "tags"]
    }
  },
  "required": ["type", "title", "content", "metadata"]
};

// Generate the prompt for artifact creation (Raw Output Method)
export const getArtifactPrompt = (userQuery: string): string => {
  return `You are Tehom AI, a senior writing assistant dedicated solely to writing, editing, and refining text. Your role is to help users write better—cleaner, clearer, more compelling. You do not brainstorm ideas or generate outlines unless specifically asked. Instead, you focus on actual writing: polishing sentences, rewriting content, improving tone, grammar, flow, and style. You operate in Markdown mode and your tone is friendly, helpful, and professional, like a calm editor working side by side with the user.

**USER REQUEST:** ${userQuery}

Write the document now using proper markdown formatting:`;
};

// Estimate reading time based on word count
export const estimateReadingTime = (wordCount: number): string => {
  const wordsPerMinute = 200; // Average reading speed
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

// Extract category from content type and query
export const extractCategory = (type: string, query: string): string => {
  const categoryMap: Record<string, string> = {
    'document': 'General Document',
    'guide': 'How-to Guide',
    'report': 'Research Report',
    'analysis': 'Analysis Report'
  };
  
  // Try to extract more specific category from query
  if (query.toLowerCase().includes('business')) return 'Business Document';
  if (query.toLowerCase().includes('technical')) return 'Technical Documentation';
  if (query.toLowerCase().includes('marketing')) return 'Marketing Material';
  if (query.toLowerCase().includes('project')) return 'Project Documentation';
  if (query.toLowerCase().includes('training')) return 'Training Material';
  if (query.toLowerCase().includes('policy')) return 'Policy Document';
  
  return categoryMap[type] || 'Document';
};

// Generate relevant tags from query
export const generateTags = (query: string): string[] => {
  const tags: string[] = [];
  
  // Common keywords to tag mapping
  const tagMap: Record<string, string> = {
    'business': 'business',
    'technical': 'technical',
    'marketing': 'marketing',
    'strategy': 'strategy',
    'project': 'project-management',
    'training': 'training',
    'guide': 'guide',
    'analysis': 'analysis',
    'research': 'research',
    'planning': 'planning',
    'documentation': 'documentation',
    'process': 'process',
    'workflow': 'workflow',
    'framework': 'framework',
    'policy': 'policy',
    'procedure': 'procedure'
  };
  
  const queryLower = query.toLowerCase();
  
  Object.entries(tagMap).forEach(([keyword, tag]) => {
    if (queryLower.includes(keyword)) {
      tags.push(tag);
    }
  });
  
  // Add general tags if none found
  if (tags.length === 0) {
    tags.push('document', 'general');
  }
  
  // Limit to 5 tags
  return tags.slice(0, 5);
};

// Validate artifact data structure
export const validateArtifactData = (data: any): data is ArtifactData => {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.type === 'string' &&
    ['document', 'guide', 'report', 'analysis'].includes(data.type) &&
    typeof data.title === 'string' &&
    typeof data.content === 'string' &&
    data.metadata &&
    typeof data.metadata.wordCount === 'number' &&
    typeof data.metadata.estimatedReadTime === 'string' &&
    typeof data.metadata.category === 'string' &&
    Array.isArray(data.metadata.tags)
  );
};

// Extract title from raw markdown content
export const extractTitleFromContent = (content: string, query: string): string => {
  // Try to extract title from content's first H1 header
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  // Fallback to query-based title generation
  if (query.toLowerCase().includes('essay')) {
    return `Essay: ${query.replace(/create|write|generate|an|essay|about/gi, '').trim()}`;
  } else if (query.toLowerCase().includes('guide')) {
    return `Guide: ${query.replace(/create|write|generate|a|guide|for|on|about/gi, '').trim()}`;
  } else if (query.toLowerCase().includes('report')) {
    return `Report: ${query.replace(/create|write|generate|a|report|on|about/gi, '').trim()}`;
  }
  
  return 'Generated Document';
};

// Create artifact from raw markdown content (for streaming)
export const createArtifactFromRawContent = (content: string, query: string): ArtifactData => {
  const words = content.split(/\s+/).filter(word => word.length > 0).length;
  const readingTime = estimateReadingTime(words);
  const category = extractCategory('document', query);
  const tags = generateTags(query);
  const title = extractTitleFromContent(content, query);
  
  return {
    root_id: uuidv4(),
    version: 1,
    type: 'document',
    title: title,
    content: content,
    metadata: {
      wordCount: words,
      estimatedReadTime: readingTime,
      category: category,
      tags: tags
    }
  };
};

// Create a fallback artifact from raw content (legacy function for compatibility)
export const createFallbackArtifact = (content: string, query: string): ArtifactData => {
  return createArtifactFromRawContent(content, query);
}; 