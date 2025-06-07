import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import React from 'react';
import { selectTemplate, structureAIResponse, applyTemplate, TemplateType, QueryContext } from './template-utils';

// Exported shared markdown components for consistent styling
export const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="markdown-body-heading markdown-body-h1" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="markdown-body-heading markdown-body-h2" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="markdown-body-heading markdown-body-h3" {...props} />,
  hr: (props: React.ComponentProps<'hr'>) => <hr className="markdown-body-hr my-4 border-t-2 border-gray-200" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="markdown-body-ul ml-6 mb-2 list-disc" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="markdown-body-ol ml-6 mb-2 list-decimal" {...props} />,
  li: (props: React.ComponentProps<'li'>) => <li className="markdown-body-li mb-1" {...props} />,
  p: (props: React.ComponentProps<'p'>) => <p className="mb-1" {...props} />,
};

/**
 * Clean and normalize markdown content
 */
function cleanMarkdown(content: string): string {
  if (!content) return '';

  let cleaned = content;

  // Fix header spacing
  cleaned = cleaned.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');

  // Fix list alignment and bullet points
  cleaned = cleaned.replace(/^(\s*)[*+-]\s+/gm, '$1- ');
  
  // Fix ordered list numbering
  cleaned = cleaned.replace(/^(\s*)(\d+)\.\s+/gm, (match, indent, num) => {
    return `${indent}${num}. `;
  });

  // Fix code block spacing
  cleaned = cleaned.replace(/```(\w*)\n/g, '```$1\n\n');
  cleaned = cleaned.replace(/\n```/g, '\n\n```');

  // Fix blockquote spacing
  cleaned = cleaned.replace(/^>\s*(.+)$/gm, '> $1');

  // Fix multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Fix spacing around headers
  cleaned = cleaned.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

  // Fix spacing around lists
  cleaned = cleaned.replace(/([^\n])\n([-*+]\s)/g, '$1\n\n$2');
  cleaned = cleaned.replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2');

  // Fix spacing around code blocks
  cleaned = cleaned.replace(/([^\n])\n```/g, '$1\n\n```');
  cleaned = cleaned.replace(/```\n([^\n])/g, '```\n\n$1');

  return cleaned;
}

/**
 * Standard markdown renderer with consistent styling
 */
export function MarkdownRenderer({ 
  content, 
  className = '',
  userQuery = '',
  context
}: { 
  content: string, 
  className?: string,
  userQuery?: string,
  context?: QueryContext
}) {
  // Apply templating and cleaning
  const processedContent = React.useMemo(() => {
    if (!content) return '';
    
    let processed = content;
    
    // If we have a user query, apply templating
    if (userQuery) {
      const templateType = selectTemplate(userQuery, context);
      const structuredContent = structureAIResponse(content, templateType);
      processed = applyTemplate(structuredContent, templateType);
    }
    
    // Clean and normalize markdown
    return cleanMarkdown(processed);
  }, [content, userQuery, context]);

  return (
    <ReactMarkdown
      className={`markdown-body ${className}`}
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {processedContent}
    </ReactMarkdown>
  );
} 