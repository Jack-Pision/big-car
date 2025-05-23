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
  
  // Fix document structure
  // ----------------------
  
  // Convert lines of dashes to '---' for <hr>
  cleaned = cleaned.replace(/^-{3,}$/gm, '---');
  cleaned = cleaned.replace(/_{3,}/gm, '---');
  
  // Ensure headings have a space after # (e.g., '###Heading' -> '### Heading')
  cleaned = cleaned.replace(/^(#{1,6})([^ #])/gm, '$1 $2');
  
  // Fix list formatting
  // ------------------
  
  // Fix numbered lists: 1.**Ask, 2.Thing, 3.*Bold* etc. → 1. **Ask, 2. Thing, 3. *Bold*
  cleaned = cleaned.replace(/(\d+)\.([A-Za-z*\[])/g, '$1. $2');
  
  // Normalize all list markers (+, *, -) to '-' for unordered lists
  cleaned = cleaned.replace(/^(\s*)[+*]([^ \-\*\+])/gm, '$1- $2');
  
  // Ensure a space after every list marker
  cleaned = cleaned.replace(/^(\s*)-([^ ])/gm, '$1- $2');
  cleaned = cleaned.replace(/^(\s*)(\d+)\.([^ ])/gm, '$1$2. $3');
  
  // Make sure list items have proper indentation
  cleaned = cleaned.replace(/^-/gm, '- ');
  cleaned = cleaned.replace(/^(\d+)\./gm, '$1. ');
  
  // Fix emphasis formatting
  // ----------------------
  
  // Fix common AI mistakes: **word* or *word** → **word**
  cleaned = cleaned.replace(/\*\*([^\*\n]+)\*/g, '**$1**');
  cleaned = cleaned.replace(/\*([^\*\n]+)\*\*/g, '**$1**');
  
  // Remove stray asterisks not part of markdown
  cleaned = cleaned.replace(/(^|\s)\*+(\s|$)/g, ' ');
  
  // Remove multiple consecutive asterisks (e.g., ****word**** → **word**)
  cleaned = cleaned.replace(/\*{3,}/g, '**');
  
  // Fix document spacing
  // ------------------
  
  // Remove malformed headers (e.g., ### at end of line)
  cleaned = cleaned.replace(/#+\s*$/gm, '');
  
  // Insert blank lines after headings if missing
  cleaned = cleaned.replace(/(#{1,6} .+)(?!\n\n)/g, '$1\n\n');
  
  // Insert blank lines after bolded section titles
  cleaned = cleaned.replace(/(\*\*[^
]+?[:\.]+\*\*)(?!\n\n)/g, '$1\n\n');
  
  // Insert blank lines between list items and following content if missing
  cleaned = cleaned.replace(/((?:^|\n)- [^\n]+)(?!\n- )/gm, '$1\n');
  cleaned = cleaned.replace(/((?:^|\n)\d+\. [^\n]+)(?!\n\d+\. )/gm, '$1\n');
  
  // Ensure consecutive list items don't have blank lines between them
  cleaned = cleaned.replace(/^(- [^\n]+)\n\n(- )/gm, '$1\n$2');
  cleaned = cleaned.replace(/^(\d+\. [^\n]+)\n\n(\d+\. )/gm, '$1\n$2');
  
  // Cleanup
  // -------
  
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing blank lines
  cleaned = cleaned.trim();
  
  // Remove any remaining unmatched asterisks at line start/end
  cleaned = cleaned.replace(/(^|\n)\*+(?=\s|$)/g, '$1');
  cleaned = cleaned.replace(/\*+(?=\n|$)/g, '');
  
  // Normalize spacing
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  
  return cleaned;
} 