import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import React from 'react';

/**
 * Standard markdown renderer with consistent styling
 */
export function MarkdownRenderer({ content, className = '' }: { content: string, className?: string }) {
  // Common component overrides for consistent styling
  const markdownComponents = {
    h1: (props: React.ComponentProps<'h1'>) => <h1 className="markdown-body-heading markdown-body-h1" {...props} />,
    h2: (props: React.ComponentProps<'h2'>) => <h2 className="markdown-body-heading markdown-body-h2" {...props} />,
    h3: (props: React.ComponentProps<'h3'>) => <h3 className="markdown-body-heading markdown-body-h3" {...props} />,
    hr: (props: React.ComponentProps<'hr'>) => <hr className="markdown-body-hr my-4 border-t-2 border-gray-200" {...props} />,
    ul: (props: React.ComponentProps<'ul'>) => <ul className="markdown-body-ul ml-6 mb-2 list-disc" {...props} />,
    ol: (props: React.ComponentProps<'ol'>) => <ol className="markdown-body-ol ml-6 mb-2 list-decimal" {...props} />,
    li: (props: React.ComponentProps<'li'>) => <li className="markdown-body-li mb-1" {...props} />,
    p: (props: React.ComponentProps<'p'>) => <p className="my-2" {...props} />,
  };

  return (
    <ReactMarkdown
      className={`markdown-body ${className}`}
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {cleanMarkdown(content)}
    </ReactMarkdown>
  );
}

/**
 * Cleans and normalizes markdown for consistent rendering
 */
export function cleanMarkdown(md: string): string {
  if (!md) return '';
  
  let cleaned = md;
  
  // Preliminary: Normalize line endings to LF
  cleaned = cleaned.replace(/\r\n|\r/g, '\n');

  // Fix document structure
  // ----------------------
  
  // Convert lines of dashes to '---' for <hr>
  cleaned = cleaned.replace(/^-{3,}$/gm, '---');
  cleaned = cleaned.replace(/_{3,}/gm, '---');
  
  // Ensure headings have a space after #
  cleaned = cleaned.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');
  
  // Fix list formatting
  // ------------------

  // Consolidate list item lines: If a line starts with number/bullet, and the next line is content, join them.
  // Handles cases like:
  // 1.
  // **Title:** Text
  // Becomes: 1. **Title:** Text
  cleaned = cleaned.replace(/^(\s*(\d+\.|-|\*)\s*)\n(?!\s*(\d+\.|-|\*)|\s*$)/gm, '$1 ');
  
  // Fix numbered lists: Ensure space after dot, and content on same line.
  cleaned = cleaned.replace(/^(\s*\d+)\.\s*([^\S\n]*)/gm, '$1. ');
  
  // Fix unordered lists: Ensure space after marker, and content on same line.
  cleaned = cleaned.replace(/^(\s*[-*])\s*([^\S\n]*)/gm, '$1 ');

  // Normalize all unordered list markers (+, *) to '-'
  cleaned = cleaned.replace(/^(\s*)[+*](?=\s)/gm, '$1-');
  
  // Ensure a single space after list markers if content follows immediately
  cleaned = cleaned.replace(/^(\s*(?:\d+\.|-|\*))([^\s])/gm, '$1 $2');

  // Fix emphasis formatting
  // ----------------------
  
  // Trim spaces inside bold/italic markers: ** word ** -> **word**
  cleaned = cleaned.replace(/(\*\*|\*|_|__)(?:\s+)([^\*\n_]+?)(?:\s+)(\1)/g, '$1$2$3');
  // Fix common AI mistakes: **word* or *word** → **word**
  cleaned = cleaned.replace(/\*\*([^\*\n]+)\*(?!\*)/g, '**$1**');
  cleaned = cleaned.replace(/\*([^\*\n]+)\*\*/g, '**$1**');
  
  // Remove stray asterisks not part of markdown (if they are alone on a line or surrounded by spaces)
  cleaned = cleaned.replace(/^\s*\*+\s*$/gm, ''); 
  cleaned = cleaned.replace(/(\s)\*+(\s)/g, '$1$2');
  
  // Remove multiple consecutive asterisks (e.g., ****word**** → **word**)
  cleaned = cleaned.replace(/\*{3,}/g, '**');
  
  // Fix document spacing
  // ------------------
  
  // Remove malformed headers (e.g., ### at end of line)
  cleaned = cleaned.replace(/#+\s*$/gm, '');
  
  // Insert blank lines after headings if missing
  cleaned = cleaned.replace(/(^#{1,6}\s.+?(?:\n|$))(?!\n)/gm, '$1\n');
  
  // Insert blank lines after bolded section titles if they are a paragraph of their own
  cleaned = cleaned.replace(/(^\*\*[^\n]+?[:.]\*\*(?:\n|$))(?!\n)/gm, '$1\n');
  
  // Remove blank lines *between* list items of the same list
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.+)\n\n(?=\s*(?:\d+\.|-|\*)\s)/gm, '$1\n');
  
  // Ensure there's a blank line *before* a list if preceded by text, and *after* a list if followed by text.
  cleaned = cleaned.replace(/([^\n\s])(\n)(?=\s*(?:\d+\.|-|\*)\s)/gm, '$1\n\n'); // Before list
  cleaned = cleaned.replace(/(^\s*(?:\d+\.|-|\*)\s.+?)(\n)([^\n\s\d-*])/gm, '$1\n\n$3'); // After list, ensuring not to break subsequent list

  // Cleanup
  // -------
  
  // Collapse multiple blank lines to a single blank line
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing blank lines from the whole text
  cleaned = cleaned.trim();
  
  // Remove any remaining unmatched asterisks at line start/end (less aggressive)
  cleaned = cleaned.replace(/^\*\s+|\s+\*$/gm, ''); 

  return cleaned;
} 