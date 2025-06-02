import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import React from 'react';
import { selectTemplate, structureAIResponse, applyTemplate, TemplateType, QueryContext } from './template-utils';

// Enhanced KaTeX options
const katexOptions = {
  strict: false,
  trust: true,
  macros: {
    "\\implies": "\\Rightarrow",
    "\\cancel": "\\not",
    "\\mathbf": "\\boldsymbol"
  }
};

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
      const templatedMarkdown = applyTemplate(structuredContent, templateType);
      
      // 4. Clean the markdown for consistent rendering
      const cleanedMarkdown = cleanMarkdown(templatedMarkdown);
      
      // 5. Process math notation
      return processMathNotation(cleanedMarkdown);
    }
    
    // If no user query, just clean the markdown and process math
    return processMathNotation(cleanMarkdown(content));
  }, [content, userQuery, context]);

  return (
    <ReactMarkdown
      className={`markdown-body ${className}`}
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, katexOptions]]}
    >
      {processedContent}
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
  
  // Ensure headings have a space after # and are on their own line, consistently followed by one blank line.
  cleaned = cleaned.replace(/^(#{1,6})([^#\\sR])/gm, '$1 $2'); // Ensure space if not followed by space or EOL
  cleaned = cleaned.replace(/(\n)?(#{1,6}\\s.+?)(\n(?!\\n)|$)/g, (match, p1, p2, p3, offset) => {
    const isFirstLine = offset === 0;
    const prefix = (!isFirstLine && p1 !== '\n' && p1 !== '\n\n') ? '\n\n' : (p1 || '');
    const suffix = (p3 === '\n' || p3 === '') ? '\n\n' : p3; // ensure \n\n if ends with \n or EOL
    return prefix.replace(/\n{3,}/g, '\n\n') + p2.trim() + suffix.replace(/\n{3,}/g, '\n\n');
  });
  
  // Fix list formatting
  // ------------------
  
  // Consolidate list item lines: If a line starts with number/bullet, and the next line is content (incl. bold starting content), join them.
  cleaned = cleaned.replace(/^(\\s*(?:\\d+\\.|-|\\*)\\s*)\\n(?=\\s*(?!\\d+\\.|-|\\*|#))(\*\*.*?\*\*:?|\\S)/gm, '$1 $2');
  
  // Fix numbered lists: Ensure space after dot.
  cleaned = cleaned.replace(/^(\\s*\\d+)\\.(?!\\s)/gm, '$1. ');
  
  // Fix unordered lists: Ensure space after marker.
  cleaned = cleaned.replace(/^(\\s*[-*])(?!\\s)/gm, '$1 ');

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
  
  // Remove blank lines *between* list items of the same list (both numbered and bulleted)
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.+)\n\n(?=\s*(?:\d+\.|-|\*)\s)/gm, '$1\n');
  
  // Ensure there's a blank line *before* a list if preceded by text, and *after* a list if followed by text.
  cleaned = cleaned.replace(/([^\n\s])(\n)(?=\s*(?:\d+\.|-|\*|#)\s)/gm, '$1\n\n'); // Before list or heading
  cleaned = cleaned.replace(/(^\s*(?:\d+\.|-|\*|#)\s.+?(?:\n|$))(?!(?:\s*(?:\d+\.|-|\*|#))|\n|$)/gm, '$1\n'); // After list, ensuring not to break subsequent list item or add too many blank lines.

  // Remove blank lines between a list marker and its content
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.*)\n{2,}(?=\s*(?:#|\*\*|\d+\.|-|\*)\s)/gm, '$1\n');
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.*)\n{2,}(?=\s*\S)/gm, '$1\n');

  // Enforce: after a numbered list item, only bullet points are allowed as sub-items.
  // Convert any indented numbered list to a bullet point if it's under a numbered list.
  // Iteratively apply to handle multiple levels of incorrect nesting.
  let previousCleaned = '';
  while (previousCleaned !== cleaned) {
    previousCleaned = cleaned;
    // Converts "1. Item\n  2. SubItem" to "1. Item\n  - SubItem"
    cleaned = cleaned.replace(/(^\\s*\\d+\\.\\s(?:.|\\n)*?)(\\n\\s{2,})(\\d+\\.)/gm, '$1$2-');
    // Converts "- Item\n  1. SubItem" to "- Item\n  - SubItem"
    cleaned = cleaned.replace(/(^\\s*-\\s(?:.|\\n)*?)(\\n\\s{2,})(\\d+\\.)/gm, '$1$2-');
  }

  // Convert a numbered list item that directly follows another numbered list item (no/minimal indent) to a bullet.
  cleaned = cleaned.replace(/(\\n\\s*\\d+\\.\\s.+)(\\n)(\\s*)(\\d+\\.)/gm, '$1$2$3-');
  // Convert a numbered list item that directly follows a bullet list item (no/minimal indent) to a bullet.
  cleaned = cleaned.replace(/(\\n\\s*-\\s.+)(\\n)(\\s*)(\\d+\\.)/gm, '$1$2$3-');

  // Remove blank lines *between* list items of the same list (both numbered and bulleted)
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.+)\n\n(?=\s*(?:\d+\.|-|\*)\s)/gm, '$1\n');

  // Ensure there's exactly one blank line *before* a list/heading if preceded by text, and *after* if followed by text.
  cleaned = cleaned.replace(/([^\n\s])(\n)(?=\s*(?:\d+\.|-|\*|#)\s)/gm, '$1\n\n'); // Before list or heading
  cleaned = cleaned.replace(/(^\s*(?:\d+\.|-|\*|#)\s.+?(?:\n|$))(?!(?:\s*(?:\d+\.|-|\*|#))|\n|$)/gm, '$1\n'); // After list, ensuring not to break subsequent list item or add too many blank lines.

  // Remove blank lines between a list marker and its content (second pass after consolidation)
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.*)\n{2,}(?=\s*(?:#|\*\*|\d+\.|-|\*)\s)/gm, '$1\n');
  cleaned = cleaned.replace(/(\n\s*(?:\d+\.|-|\*)\s.*)\n{2,}(?=\s*\S)/gm, '$1\n');

  // Cleanup: Collapse multiple blank lines to a single blank line globally.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing blank lines from the whole text
  cleaned = cleaned.trim();
  
  // Remove any remaining unmatched asterisks at line start/end (less aggressive)
  cleaned = cleaned.replace(/^\*\s+|\s+\*$/gm, ''); 
  
  return cleaned;
}

// Pre-process math notation
const processMathNotation = (content: string): string => {
  if (!content) return '';
  
  return content
    // Convert [ ... ] to $$ ... $$ if it looks like math
    .replace(/\[([\s\S]*?)\]/g, (match, content) => {
      // Check if content looks like math (contains common math symbols or LaTeX commands)
      if (/[\\\^_{}\[\]]|\\[a-zA-Z]+/.test(content)) {
        return `$$${content}$$`;
      }
      return match;
    })
    // Fix common LaTeX command issues
    .replace(/\\cancel\{([^}]+)\}/g, "\\not{$1}")
    .replace(/\\implies/g, "\\Rightarrow")
    // Fix for inline math that might be using incorrect delimiters
    .replace(/\\mathbf\{([^}]+)\}/g, "\\boldsymbol{$1}")
    // Convert \[ ... \] to $$ ... $$ for display math
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$1$$")
    // Convert \( ... \) to $ ... $ for inline math
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$1$");
}; 