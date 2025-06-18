// Artifact detection and utility functions

export interface ArtifactData {
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

// Detection patterns for automatic artifact triggering
export const shouldTriggerArtifact = (query: string): boolean => {
  const artifactTriggers = [
    // Document creation
    /create.*?(document|guide|report|manual|handbook|specification)/i,
    /write.*?(article|essay|proposal|plan|strategy|documentation)/i,
    /generate.*?(documentation|specification|outline|framework)/i,
    /draft.*?(letter|email|memo|brief|proposal)/i,
    
    // Structured content
    /make.*?(list|checklist|template|framework|guide)/i,
    /design.*?(workflow|process|procedure|system)/i,
    /build.*?(curriculum|course|training|program)/i,
    /develop.*?(strategy|plan|roadmap|methodology)/i,
    
    // Analysis & research
    /analyze.*?(market|competitor|trend|data|situation)/i,
    /research.*?(topic|subject|industry|market)/i,
    /compare.*?(options|solutions|approaches|alternatives)/i,
    /study.*?(case|analysis|research|investigation)/i,
    
    // Planning documents
    /plan.*?(project|business|marketing|strategy|implementation)/i,
    /prepare.*?(presentation|report|summary|overview)/i,
    /compile.*?(report|summary|analysis|documentation)/i,
    
    // Comprehensive content
    /comprehensive.*?(guide|analysis|overview|study)/i,
    /detailed.*?(explanation|breakdown|analysis|guide)/i,
    /complete.*?(guide|manual|documentation|overview)/i,
    /thorough.*?(analysis|review|examination|study)/i
  ];
  
  return artifactTriggers.some(pattern => pattern.test(query));
};

// Generate the prompt for artifact creation
export const getArtifactPrompt = (userQuery: string): string => {
  return `You are a professional document creation assistant specializing in generating comprehensive, well-structured documents. Create substantial, standalone content that can be used independently.

**ARTIFACT GENERATION GUIDELINES:**
- Generate content that is substantial (minimum 800 words)
- Create self-contained, reusable documents
- Use professional formatting with clear structure
- Include relevant headings, subheadings, and sections
- Provide actionable information and insights
- Focus on high-quality, comprehensive content
- Use markdown formatting for structure and readability

**CONTENT REQUIREMENTS:**
- Start with a clear introduction
- Organize content with logical sections and subsections
- Include practical examples where relevant
- Provide actionable steps or recommendations
- End with a conclusion or summary
- Use bullet points, numbered lists, and tables where appropriate

**OUTPUT FORMAT:**
Respond with a JSON object following this exact schema:
{
  "type": "document|guide|report|analysis",
  "title": "Clear, descriptive title",
  "content": "Full document content in markdown format with proper headings, sections, and formatting",
  "metadata": {
    "wordCount": number,
    "estimatedReadTime": "X minutes",
    "category": "document_type",
    "tags": ["tag1", "tag2", "tag3"]
  }
}

**USER REQUEST:** ${userQuery}

Generate a comprehensive, professional document that fully addresses the request with substantial depth and practical value.`;
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