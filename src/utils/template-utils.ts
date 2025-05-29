/**
 * Represents contextual information about the user's query
 */
export interface QueryContext {
  queryKeywords?: string[];
  conversationLength?: number;
  // Add other relevant context fields as needed
}

/**
 * Represents the different types of response templates available.
 */
export enum TemplateType {
  DEFAULT = 'default',
  SECTION_BULLET = 'section_bullet', // The new primary template with sections and bullet points
  COMPARISON = 'comparison',
  LIST = 'list',
  TUTORIAL = 'tutorial',
  FAQ = 'faq',
  PROFILE = 'profile',
  DEEP_RESEARCH = 'deepResearch',
  BASIC_CHAT = 'basicChat',
  EDUCATIONAL_GUIDE = 'educationalGuide',
  COMPLEX_TASK = 'complexTask',
}

/**
 * Template collection for different response formats
 */
export const Templates = {
  // Default template - section headers with bullet points and bold labels
  [TemplateType.SECTION_BULLET]: {
    name: 'Section with Bullets',
    description: 'Content organized into sections with bullet points that have bold labels',
    systemPrompt: `Format your response with the following structure:
1. Start with a short summary paragraph that directly answers the question.
2. Organize information into sections with clear ## Section Title headers.
3. Under each section, use bullet points with bold labels followed by descriptions:
   * **Label:** Description text here.
   * **Another Label:** More descriptive content here.
4. Add as many sections as needed based on the topic.
5. Keep descriptions concise but informative - adapt length based on complexity.`,
    example: `This is a short summary answering the user's question directly.

## Main Section

* **Key Point:** This is a description explaining the key point in detail.
* **Important Factor:** This elaborates on the important factor mentioned in the label.

## Another Section

* **Technical Aspect:** This explains the technical details relevant to this section.
* **Practical Application:** This describes how this can be applied in real-world scenarios.`
  },
  
  // Other templates can be defined here
  [TemplateType.COMPARISON]: {
    name: 'Comparison Table',
    description: 'Side-by-side comparison of multiple items',
    systemPrompt: `Format your response as a comparison with a summary and clear table.`,
    example: ``
  },
  
  [TemplateType.LIST]: {
    name: 'Simple List',
    description: 'Information presented as a numbered or bulleted list',
    systemPrompt: `Format your response as a straightforward list with a brief intro.`,
    example: ``
  }
  
  // Additional templates can be added here
};

export interface ContentBlock {
  heading?: string;
  content: string;
  subItems?: string[];
}

export interface ContentBlocks {
  title?: string;
  mainResponse?: string;
  sections: ContentBlock[];
  followUp?: string;
}

/**
 * Select an appropriate template based on the query and context
 */
export function selectTemplate(query: string, context?: QueryContext): TemplateType {
  // Always default to the SECTION_BULLET template for better readability and consistency
  return TemplateType.SECTION_BULLET;
}

/**
 * Apply a template to structured content based on template type
 */
export function applyTemplate(content: any, templateType: TemplateType): string {
  let markdown = '';

  switch (templateType) {
    case TemplateType.SECTION_BULLET:
      return applySectionBulletTemplate(content);
    
    case TemplateType.PROFILE:
      return applyProfileTemplate(content);
    
    case TemplateType.DEEP_RESEARCH:
    case TemplateType.BASIC_CHAT:
    case TemplateType.EDUCATIONAL_GUIDE:
    case TemplateType.COMPLEX_TASK:
    case TemplateType.DEFAULT:
    default:
      // Use the section bullet template as fallback for all other types
      return applySectionBulletTemplate(content);
  }
}

/**
 * Apply the structured section + bullet template format for all types of content
 */
function applySectionBulletTemplate(content: any): string {
  if (typeof content === 'string') {
    // If it's already a string, try to structure it according to our format
    try {
      // Parse the content to identify sections, bullet points, etc.
      const lines = content.split('\n');
      let structuredContent = '';
      let currentSection = '';
      let inSummary = true;
      let summaryText = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Check if this is a section header (either marked with ## or all caps with colon)
        if (line.startsWith('## ') || line.match(/^[A-Z][A-Z\s]+:$/)) {
          // End the summary section if we were in it
          if (inSummary && summaryText) {
            structuredContent += summaryText + '\n\n';
            inSummary = false;
          }
          
          // Format the section header properly
          const headerText = line.startsWith('## ') 
            ? line.substring(3) 
            : line.replace(/:$/, '');
          
          structuredContent += `## ${headerText}\n\n`;
          currentSection = headerText;
          continue;
        }
        
        // Check if this is a bullet point with a label
        const bulletLabelMatch = line.match(/^[\*\-]\s+(?:\*\*([^:]+):\*\*|([^:]+):)\s*(.*)$/);
        if (bulletLabelMatch) {
          // End summary if we were in it
          if (inSummary) {
            structuredContent += summaryText + '\n\n';
            inSummary = false;
            
            // If no section defined yet, add a default one
            if (!currentSection) {
              structuredContent += `## Key Points\n\n`;
              currentSection = 'Key Points';
            }
          }
          
          // Format the bullet point with label
          const label = bulletLabelMatch[1] || bulletLabelMatch[2];
          const desc = bulletLabelMatch[3];
          structuredContent += `* **${label}:** ${desc}\n`;
          continue;
        }
        
        // Check if this is a regular bullet point
        if (line.match(/^[\*\-]\s+/)) {
          // End summary if we were in it
          if (inSummary) {
            structuredContent += summaryText + '\n\n';
            inSummary = false;
            
            // If no section defined yet, add a default one
            if (!currentSection) {
              structuredContent += `## Key Points\n\n`;
              currentSection = 'Key Points';
            }
          }
          
          // Keep the bullet point as is
          structuredContent += `${line}\n`;
          continue;
        }
        
        // If we're still in summary section, add to summary
        if (inSummary) {
          summaryText += (summaryText ? ' ' : '') + line;
        } else {
          // If we have a section but no bullet points yet, this might be a paragraph
          // Let's add a blank line after it
          structuredContent += `${line}\n\n`;
        }
      }
      
      // If we never exited summary mode, add the summary text
      if (inSummary && summaryText) {
        structuredContent += summaryText;
      }
      
      // If we didn't generate any structured content, return the original
      if (!structuredContent.trim()) {
        return content;
      }
      
      return structuredContent.trim();
    } catch (e) {
      // If any error in parsing, return the original content
      return content;
    }
  }
  
  // If content is structured data
  let markdown = '';
  
  // Add summary paragraph
  if (content.summary || content.introduction || content.overview) {
    markdown += `${content.summary || content.introduction || content.overview}\n\n`;
  }
  
  // Process sections
  if (content.sections) {
    for (const sectionKey in content.sections) {
      const section = content.sections[sectionKey];
      
      // Add section header
      markdown += `## ${section.title || section.heading || sectionKey}\n\n`;
      
      // Add bullet points
      if (section.points && section.points.length > 0) {
        section.points.forEach((point: any) => {
          if (point.label) {
            markdown += `* **${point.label}:** ${point.description || point.content || point.text || ''}\n`;
          } else if (typeof point === 'string') {
            markdown += `* ${point}\n`;
          } else {
            markdown += `* ${point.content || point.text || ''}\n`;
          }
        });
        markdown += '\n';
      }
      
      // Add paragraph content if it exists and no bullet points were added
      if (section.content && (!section.points || section.points.length === 0)) {
        markdown += `${section.content}\n\n`;
      }
    }
  } else if (Array.isArray(content)) {
    // Handle array of sections
    let firstItem = true;
    
    content.forEach((section) => {
      if (typeof section === 'string') {
        // If it's the first item, treat it as a summary
        if (firstItem) {
          markdown += `${section}\n\n`;
          firstItem = false;
        } else {
          markdown += `${section}\n\n`;
        }
      } else {
        // Add section header
        if (section.title || section.heading) {
          markdown += `## ${section.title || section.heading}\n\n`;
        }
        
        // Add bullet points from array of strings or objects
        if (section.points || section.items) {
          const items = section.points || section.items;
          items.forEach((item: any) => {
            if (typeof item === 'string') {
              markdown += `* ${item}\n`;
            } else if (item.label) {
              markdown += `* **${item.label}:** ${item.description || item.content || item.text || ''}\n`;
            } else {
              markdown += `* ${item.content || item.text || ''}\n`;
            }
          });
          markdown += '\n';
        }
        
        // Add content if no points/items
        if (section.content && (!section.points && !section.items)) {
          markdown += `${section.content}\n\n`;
        }
      }
    });
  }
  
  return markdown.trim();
}

/**
 * Apply the profile template format for biographical information
 */
function applyProfileTemplate(content: any): string {
  // Redirect to section bullet template for consistency
  return applySectionBulletTemplate(content);
}

/**
 * Creates default markdown from structured content
 * This is the original implementation for non-profile templates
 */
function createDefaultTemplate(structuredContent: ContentBlocks, template: TemplateType): string {
  // Redirect to section bullet template for consistency
  return applySectionBulletTemplate(structuredContent);
}

/**
 * Structure an AI response according to a template
 * This breaks down the raw text into structured content blocks
 */
export function structureAIResponse(rawResponse: string, template: TemplateType): ContentBlocks {
  // Simple parsing of response text into sections
  // Start with title or main response, then look for section headings (##, ###, or bold followed by colon)
  const sectionsArray = rawResponse.split(/\n#{1,3}\s|(\n\*\*.*\*\*:)|\n([A-Z][A-Z\s]+:$)/g)
    .map(s => s ? s.trim() : '')
    .filter(s => s.length > 0);
  
  // Convert to structured content
  const structuredContent: ContentBlocks = {
    sections: []
  };
  
  // Extract main response (first paragraph)
  const firstSection = sectionsArray[0];
  if (firstSection) {
    // If the first section doesn't seem to be a header, treat it as the main response
    if (!firstSection.match(/^#{1,3}\s|^\*\*.*\*\*:$|^[A-Z][A-Z\s]+:$/)) {
      structuredContent.mainResponse = firstSection;
      sectionsArray.shift(); // Remove it from sections
    }
  }
  
  // Process remaining sections
  let currentSection: ContentBlock | null = null;
  
  sectionsArray.forEach(section => {
    // Check if this is a section header
    const headerMatch = section.match(/^(#{1,3})\s+(.+)$|^\*\*(.+)\*\*:$|^([A-Z][A-Z\s]+):$/);
    
    if (headerMatch) {
      // It's a header - start new section
      const heading = headerMatch[2] || headerMatch[3] || headerMatch[4];
      currentSection = {
        heading,
        content: '',
        subItems: []
      };
      structuredContent.sections.push(currentSection);
    } else if (currentSection) {
      // Add to current section
      currentSection.content += section;
      
      // Extract bullet points
      const bulletPoints = section.match(/^[\*\-]\s+.+$/gm);
      if (bulletPoints && bulletPoints.length > 0) {
        currentSection.subItems = bulletPoints.map(bp => bp.replace(/^[\*\-]\s+/, ''));
      }
    } else {
      // No current section - create a default one
      currentSection = {
        content: section,
        subItems: []
      };
      structuredContent.sections.push(currentSection);
    }
  });
  
  return structuredContent;
} 