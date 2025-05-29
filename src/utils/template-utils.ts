/**
 * Represents the different types of response templates available.
 */
export enum TemplateType {
  DEFAULT = 'default',
  COMPARISON = 'comparison',
  LIST = 'list',
  TUTORIAL = 'tutorial',
  FAQ = 'faq',
  PROFILE = 'profile', // New template for profile/bio format
  DEEP_RESEARCH = 'deepResearch',
  BASIC_CHAT = 'basicChat',
  EDUCATIONAL_GUIDE = 'educationalGuide',
  COMPLEX_TASK = 'complexTask',
}

/**
 * Represents contextual information about the user's query.
 * This can be expanded as needed.
 */
export interface QueryContext {
  queryKeywords?: string[];
  conversationLength?: number;
  // Add other relevant context fields, e.g., detected user intent
}

/**
 * A generic structure to hold parsed content blocks from the AI response.
 * This will be specialized or interpreted based on the selected TemplateType.
 * For example, for 'deepResearch', keys might be 'introduction', 'background', etc.
 * For 'educationalGuide', keys might be 'conceptDefinition', 'steps', 'tips', etc.
 */
export interface ContentBlocks {
  title?: string;
  sections: Array<{ heading?: string; content: string; subItems?: string[] }>;
  mainResponse?: string; // For simpler templates like basicChat
  followUp?: string;     // For basicChat
  // We can add more specific structured fields as we refine each template
  [key: string]: any; // Allows for flexible, template-specific fields
}

/**
 * Selects the most appropriate template based on the user's query and context.
 *
 * @param query The user's input query.
 * @param context Optional contextual information.
 * @returns The type of template to use.
 */
export function selectTemplate(query: string, context?: QueryContext): TemplateType {
  // Always default to structured PROFILE format for better readability
  // This ensures all responses use the clean, structured format with
  // proper headings, bullet points, and labeled information
  return TemplateType.PROFILE;
  
  // Note: Original template selection logic is commented out but preserved
  // in case we need to restore specific template selection in the future
  
  /*
  const lowerQuery = query.toLowerCase();

  // Check for profile/bio related queries
  if (
    lowerQuery.includes('who is') || 
    lowerQuery.includes('biography') || 
    lowerQuery.includes('tell me about') ||
    lowerQuery.includes('profile of') ||
    lowerQuery.match(/information\s+about\s+\w+/) ||
    lowerQuery.match(/about\s+\w+\s+life/)
  ) {
    return TemplateType.PROFILE;
  }

  // Basic keyword-based selection (can be made more sophisticated)
  if (context?.queryKeywords?.some(kw => ['explain', 'guide', 'how to', 'tutorial', 'steps'].includes(kw))) {
    return TemplateType.EDUCATIONAL_GUIDE;
  }
  if (context?.queryKeywords?.some(kw => ['research', 'analyze', 'deep dive', 'report'].includes(kw))) {
    return TemplateType.DEEP_RESEARCH;
  }
  if (lowerQuery.includes('task') || lowerQuery.includes('project') || lowerQuery.includes('walkthrough')) {
    return TemplateType.COMPLEX_TASK;
  }
  if (context?.conversationLength !== undefined && context.conversationLength <= 2) {
    // very early in conversation, or simple queries
    if (lowerQuery.length < 30) return TemplateType.BASIC_CHAT;
  }
  
  // Add more sophisticated logic here based on query analysis, intent detection, etc.
  return TemplateType.DEFAULT; // Fallback to a default/general purpose template
  */
}

/**
 * Parses the raw AI response string into structured ContentBlocks based on the selected template.
 * This is a placeholder and will need significant implementation for each template type.
 *
 * @param rawResponse The raw string output from the AI.
 * @param template The selected TemplateType.
 * @returns Structured content ready for template application.
 */
export function structureAIResponse(rawResponse: string, template: TemplateType): ContentBlocks {
  // Placeholder: In a real implementation, this would involve sophisticated parsing
  // based on the template. For now, it returns a basic structure.
  console.log(`Structuring response for template: ${template}`);
  
  // Example naive parsing for 'default' or as a fallback
  const sectionsArray = rawResponse.split(/\\n#{1,3}\\s|\\n\\*\\*.*\\*\\*:\\n/g).map(s => s.trim()).filter(s => s.length > 0);

  if (template === TemplateType.BASIC_CHAT) {
    return {
      mainResponse: rawResponse, // Basic chat might just pass through or have minimal structure
      sections: [],
    };
  }
  
  if (sectionsArray.length > 1) {
     return {
      title: sectionsArray[0].startsWith('#') ? sectionsArray[0] : undefined,
      sections: sectionsArray.slice(sectionsArray[0].startsWith('#') ? 1: 0).map(content => ({ content })),
    };
  }

  return {
    sections: [{ content: rawResponse }],
  };
}

/**
 * Apply a template to structured content based on template type
 */
export function applyTemplate(content: any, templateType: TemplateType): string {
  let markdown = '';

  switch (templateType) {
    case TemplateType.PROFILE:
      return applyProfileTemplate(content);
    
    case TemplateType.DEEP_RESEARCH:
    case TemplateType.BASIC_CHAT:
    case TemplateType.EDUCATIONAL_GUIDE:
    case TemplateType.COMPLEX_TASK:
    case TemplateType.DEFAULT:
    default:
      // Use the original template implementation for other types
      return createDefaultTemplate(content, templateType);
  }
}

/**
 * Creates default markdown from structured content
 * This is the original implementation for non-profile templates
 */
function createDefaultTemplate(structuredContent: ContentBlocks, template: TemplateType): string {
  // Original applyTemplate implementation
  let markdownOutput = "";

  if (structuredContent.title) {
    markdownOutput += `# ${structuredContent.title}\n\n`;
  }

  switch (template) {
    case TemplateType.DEEP_RESEARCH:
      // Example structure for deepResearch
      structuredContent.sections.forEach(section => {
        if (section.heading) {
          markdownOutput += `## ${section.heading}\n\n`;
        }
        markdownOutput += `${section.content}\n\n`;
        if (section.subItems) {
          section.subItems.forEach(subItem => {
            markdownOutput += `- ${subItem}\n`;
          });
          markdownOutput += '\n';
        }
      });
      break;
    case TemplateType.BASIC_CHAT:
      markdownOutput = structuredContent.mainResponse || structuredContent.sections.map(s => s.content).join('\n\n');
      if (structuredContent.followUp) {
        markdownOutput += `\n\n${structuredContent.followUp}`;
      }
      break;
    case TemplateType.EDUCATIONAL_GUIDE:
    case TemplateType.COMPLEX_TASK:
    case TemplateType.DEFAULT:
    default:
      structuredContent.sections.forEach(section => {
        if (section.heading) {
          markdownOutput += `### ${section.heading}\n\n`; // Default to H3 for sections
        }
        markdownOutput += `${section.content}\n\n`;
        if (section.subItems) {
          section.subItems.forEach(subItem => {
            markdownOutput += `- ${subItem}\n`;
          });
          markdownOutput += '\n';
        }
      });
      break;
  }
  return markdownOutput.trim();
}

/**
 * Apply the structured template format for all types of content
 */
function applyProfileTemplate(content: any): string {
  if (typeof content === 'string') {
    // If it's already a string, apply some basic structure if possible
    try {
      // Try to detect sections in plain text content
      const lines = content.split('\n');
      let structuredMarkdown = '';
      let inList = false;
      let lastLineWasHeading = false;
      
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Check if this looks like a heading
        if (trimmedLine.match(/^([A-Z][a-z]+\s?){1,4}:?$/)) {
          // Add proper heading markup
          structuredMarkdown += `\n## ${trimmedLine.replace(/:$/, '')}\n\n`;
          lastLineWasHeading = true;
        }
        // Check if it's a point with a label (e.g., "Name: John Smith")
        else if (trimmedLine.match(/^([A-Z][a-z]+\s?){1,2}:\s/)) {
          const [label, ...rest] = trimmedLine.split(':');
          const content = rest.join(':').trim();
          structuredMarkdown += `* **${label}:** ${content}\n`;
          inList = true;
          lastLineWasHeading = false;
        }
        // Check if it's likely a list item
        else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*') || trimmedLine.match(/^\d+\./)) {
          structuredMarkdown += `${trimmedLine}\n`;
          inList = true;
          lastLineWasHeading = false;
        }
        // Normal paragraph
        else if (trimmedLine.length > 0) {
          if (inList && !lastLineWasHeading) {
            structuredMarkdown += '\n';
          }
          structuredMarkdown += `${trimmedLine}\n\n`;
          inList = false;
          lastLineWasHeading = false;
        }
      });
      
      return structuredMarkdown.trim();
    } catch (e) {
      // If any error in parsing, return the original content
      return content;
    }
  }
  
  // If content is structured data
  let markdown = '';
  
  // Add title if available
  if (content.title || content.name) {
    markdown += `# ${content.title || content.name}\n\n`;
  }
  
  // Add introduction paragraph
  if (content.introduction || content.overview) {
    markdown += `${content.introduction || content.overview}\n\n`;
  }
  
  // Add key points if available
  if (content.keyPoints) {
    if (content.title || content.name) {
      markdown += `Here are some key points about ${content.title || content.name}:\n\n`;
    } else {
      markdown += `Key points:\n\n`;
    }
  }
  
  // Process each section
  if (content.sections) {
    for (const sectionKey in content.sections) {
      const section = content.sections[sectionKey];
      
      // Add section header
      markdown += `## ${section.title || section.heading || sectionKey}\n\n`;
      
      // Add section description if it exists
      if (section.description) {
        markdown += `${section.description}\n\n`;
      }
      
      // Add bullet points
      if (section.points && section.points.length > 0) {
        section.points.forEach((point: any) => {
          if (point.label) {
            markdown += `* **${point.label}:** ${point.content || point.text || point.value || ''}\n`;
          } else if (typeof point === 'string') {
            markdown += `* ${point}\n`;
          } else {
            markdown += `* ${point.content || point.text || point.value || ''}\n`;
          }
        });
        markdown += '\n';
      }
      
      // Add subItems as bullet points if they exist
      if (section.subItems && section.subItems.length > 0) {
        section.subItems.forEach((item: any) => {
          if (typeof item === 'string') {
            markdown += `* ${item}\n`;
          } else if (item.label) {
            markdown += `* **${item.label}:** ${item.content || item.text || item.value || ''}\n`;
          } else {
            markdown += `* ${item.content || item.text || item.value || ''}\n`;
          }
        });
        markdown += '\n';
      }
      
      // Add paragraph content if it exists
      if (section.content) {
        markdown += `${section.content}\n\n`;
      }
    }
  } else if (Array.isArray(content)) {
    // Handle array of sections
    content.forEach((section) => {
      if (typeof section === 'string') {
        markdown += `${section}\n\n`;
      } else {
        // Add section header
        if (section.title || section.heading) {
          markdown += `## ${section.title || section.heading}\n\n`;
        }
        
        // Add section content
        if (section.content) {
          markdown += `${section.content}\n\n`;
        }
        
        // Add bullet points from array of strings or objects
        if (section.points || section.items || section.subItems) {
          const items = section.points || section.items || section.subItems;
          items.forEach((item: any) => {
            if (typeof item === 'string') {
              markdown += `* ${item}\n`;
            } else if (item.label) {
              markdown += `* **${item.label}:** ${item.content || item.text || item.value || ''}\n`;
            } else {
              markdown += `* ${item.content || item.text || item.value || ''}\n`;
            }
          });
          markdown += '\n';
        }
      }
    });
  }
  
  return markdown.trim();
} 