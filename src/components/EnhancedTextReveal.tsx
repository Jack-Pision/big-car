import React, { useMemo } from 'react';
import TextReveal from './TextReveal';
import { WebSource } from '@/utils/source-utils/index';
import { selectTemplate, structureAIResponse, applyTemplate, QueryContext } from '@/utils/template-utils';
import { cleanMarkdown } from '@/utils/markdown-utils';

interface EnhancedTextRevealProps {
  text: string;
  className?: string;
  markdownComponents?: any;
  webSources?: WebSource[];
  revealIntervalMs?: number;
  userQuery?: string;
  queryContext?: QueryContext;
}

/**
 * EnhancedTextReveal combines the animated text reveal with template-based formatting
 * based on the user's query and conversation context.
 */
const EnhancedTextReveal: React.FC<EnhancedTextRevealProps> = ({
  text,
  className = '',
  markdownComponents = {},
  webSources = [],
  revealIntervalMs = 100,
  userQuery = '',
  queryContext
}) => {
  // Apply templating if we have content and a user query
  const processedContent = useMemo(() => {
    if (!text) return '';
    
    // If we have a user query, apply templating
    if (userQuery) {
      // 1. Select the appropriate template based on the user's query and context
      const templateType = selectTemplate(userQuery, queryContext);
      console.log('Selected template type:', templateType);
      
      // 2. Structure the AI response according to the selected template
      const structuredContent = structureAIResponse(text, templateType);
      
      // 3. Apply the template to the structured content
      const templatedMarkdown = applyTemplate(structuredContent, templateType);
      
      // 4. Clean the markdown for consistent rendering
      return cleanMarkdown(templatedMarkdown);
    }
    
    // If no user query, just clean the markdown
    return cleanMarkdown(text);
  }, [text, userQuery, queryContext]);

  return (
    <TextReveal
      text={processedContent}
      className={className}
      markdownComponents={markdownComponents}
      webSources={webSources}
      revealIntervalMs={revealIntervalMs}
    />
  );
};

export default EnhancedTextReveal; 