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
  // Helper to normalize bullet points
  function formatBullet(line: string): string {
    // Try to extract label and description
    const match = line.match(/^[\*\-]\s*(?:\*\*([^:]+):\*\*|([^:]+):)?\s*(.*)$/);
    if (match) {
      const label = match[1] || match[2];
      const desc = match[3];
      if (label) {
        return `* **${label}:** ${desc}`;
      } else {
        return `* ${desc}`;
      }
    }
    return `* ${line.replace(/^[\*\-]\s*/, '')}`;
  }

  // If content is a string, parse and normalize
  if (typeof content === 'string') {
    const lines = content.split('\n');
    let output = '';
    let summary = '';
    let inSummary = true;
    let currentSection = '';
    let sectionLines: string[] = [];
    const sections: { title: string, bullets: string[] }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Section header
      if (line.startsWith('## ')) {
        if (currentSection && sectionLines.length) {
          sections.push({ title: currentSection, bullets: sectionLines });
        }
        currentSection = line.substring(3).trim();
        sectionLines = [];
        inSummary = false;
        continue;
      }
      // All-caps with colon (legacy section header)
      if (line.match(/^[A-Z][A-Z\s]+:$/)) {
        if (currentSection && sectionLines.length) {
          sections.push({ title: currentSection, bullets: sectionLines });
        }
        currentSection = line.replace(/:$/, '').trim();
        sectionLines = [];
        inSummary = false;
        continue;
      }
      // Bullet point
      if (line.match(/^[\*\-]\s+/)) {
        inSummary = false;
        sectionLines.push(formatBullet(line));
        continue;
      }
      // Code block start/end (ignore for bullets)
      if (line.startsWith('```')) continue;
      // If still in summary, add to summary
      if (inSummary) {
        summary += (summary ? ' ' : '') + line;
      } else {
        // If not in summary and not a bullet, treat as a paragraph in section
        sectionLines.push(`* ${line}`);
      }
    }
    // Push last section
    if (currentSection && sectionLines.length) {
      sections.push({ title: currentSection, bullets: sectionLines });
    }
    // Build output
    if (summary) {
      output += summary.trim() + '\n\n';
    }
    for (const section of sections) {
      output += `## ${section.title}\n\n`;
      for (const bullet of section.bullets) {
        output += bullet + '\n';
      }
      output += '\n';
    }
    return output.trim();
  }

  // If content is structured data
  let markdown = '';
  if (content.summary || content.introduction || content.overview) {
    markdown += `${content.summary || content.introduction || content.overview}`.trim() + '\n\n';
  }
  if (content.sections) {
    for (const sectionKey in content.sections) {
      const section = content.sections[sectionKey];
      const title = section.title || section.heading || sectionKey;
      markdown += `## ${title}\n\n`;
      if (section.points && section.points.length > 0) {
        section.points.forEach((point: any) => {
          if (point.label) {
            markdown += `* **${point.label}:** ${point.description || point.content || point.text || ''}\n`;
          } else if (typeof point === 'string') {
            markdown += formatBullet(point) + '\n';
          } else {
            markdown += `* ${point.content || point.text || ''}\n`;
          }
        });
        markdown += '\n';
      }
      if (section.content && (!section.points || section.points.length === 0)) {
        markdown += `* ${section.content}\n\n`;
      }
    }
  } else if (Array.isArray(content)) {
    let firstItem = true;
    content.forEach((section) => {
      if (typeof section === 'string') {
        if (firstItem) {
          markdown += section.trim() + '\n\n';
          firstItem = false;
        } else {
          markdown += section.trim() + '\n\n';
        }
      } else {
        if (section.title || section.heading) {
          markdown += `## ${section.title || section.heading}\n\n`;
        }
        if (section.points || section.items) {
          const items = section.points || section.items;
          items.forEach((item: any) => {
            if (typeof item === 'string') {
              markdown += formatBullet(item) + '\n';
            } else if (item.label) {
              markdown += `* **${item.label}:** ${item.description || item.content || item.text || ''}\n`;
            } else {
              markdown += `* ${item.content || item.text || ''}\n`;
            }
          });
          markdown += '\n';
        }
        if (section.content && (!section.points && !section.items)) {
          markdown += `* ${section.content}\n\n`;
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