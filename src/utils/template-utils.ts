/**
 * Represents the different types of response templates available.
 */
export type TemplateType =
  | 'deepResearch'
  | 'basicChat'
  | 'educationalGuide'
  | 'complexTask'
  | 'default'; // A fallback template

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
  const lowerQuery = query.toLowerCase();

  // Basic keyword-based selection (can be made more sophisticated)
  if (context?.queryKeywords?.some(kw => ['explain', 'guide', 'how to', 'tutorial', 'steps'].includes(kw))) {
    return 'educationalGuide';
  }
  if (context?.queryKeywords?.some(kw => ['research', 'analyze', 'deep dive', 'report'].includes(kw))) {
    return 'deepResearch';
  }
  if (lowerQuery.includes('task') || lowerQuery.includes('project') || lowerQuery.includes('walkthrough')) {
    return 'complexTask';
  }
  if (context?.conversationLength !== undefined && context.conversationLength <= 2) {
     // very early in conversation, or simple queries
    if (lowerQuery.length < 30) return 'basicChat';
  }
  
  // Add more sophisticated logic here based on query analysis, intent detection, etc.
  return 'default'; // Fallback to a default/general purpose template
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
  const sectionsArray = rawResponse.split(/\n#{1,3}\s|\n\*\*.*\*\*:\n/g).map(s => s.trim()).filter(s => s.length > 0);

  if (template === 'basicChat') {
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
 * Applies the selected template to the structured content, producing a formatted markdown string.
 * This is a placeholder and will need specific implementation for each template.
 *
 * @param structuredContent The ContentBlocks parsed from the AI response.
 * @param template The TemplateType to apply.
 * @returns A formatted markdown string.
 */
export function applyTemplate(structuredContent: ContentBlocks, template: TemplateType): string {
  // Placeholder: Actual implementation will vary greatly based on template.
  console.log(`Applying template: ${template}`);
  let markdownOutput = "";

  if (structuredContent.title) {
    markdownOutput += `# ${structuredContent.title}\n\n`;
  }

  switch (template) {
    case 'deepResearch':
      // Example structure for deepResearch
      // This would look for specific keys in structuredContent if structureAIResponse was more detailed
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
    case 'basicChat':
      markdownOutput = structuredContent.mainResponse || structuredContent.sections.map(s => s.content).join('\n\n');
      if (structuredContent.followUp) {
        markdownOutput += `\n\n${structuredContent.followUp}`;
      }
      break;
    case 'educationalGuide':
    case 'complexTask':
    case 'default':
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