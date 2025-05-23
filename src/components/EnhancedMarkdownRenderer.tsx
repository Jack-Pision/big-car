import React from 'react';
import { MarkdownRenderer } from '../utils/markdown-utils';
import { selectTemplate, structureAIResponse, applyTemplate, QueryContext } from '../utils/template-utils';

interface EnhancedMarkdownRendererProps {
  content: string;
  className?: string;
  userQuery?: string;
  context?: QueryContext;
}

/**
 * Enhanced markdown renderer that applies templating based on the user query
 */
export function EnhancedMarkdownRenderer({
  content,
  className = '',
  userQuery = '',
  context
}: EnhancedMarkdownRendererProps) {
  // Apply templating if we have content and a user query
  const processedContent = React.useMemo(() => {
    if (!content) return '';
    
    // If we have a user query, apply templating
    if (userQuery) {
      // 1. Select the appropriate template based on the user's query and context
      const templateType = selectTemplate(userQuery, context);
      
      // 2. Structure the AI response according to the selected template
      const structuredContent = structureAIResponse(content, templateType);
      
      // 3. Apply the template to the structured content
      return applyTemplate(structuredContent, templateType);
    }
    
    // If no user query, just return the original content
    return content;
  }, [content, userQuery, context]);

  return (
    <MarkdownRenderer content={processedContent} className={className} />
  );
} 