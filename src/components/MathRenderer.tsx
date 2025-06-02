import React from 'react';
import ReactMarkdown from 'react-markdown';
import MathJax from 'react-mathjax';
import remarkGfm from 'remark-gfm';

// Enhanced pre-processing for math blocks
const preProcessMath = (content: string): string => {
  if (!content) return '';
  
  return content
    // Convert [ ... ] to $$ ... $$ if it looks like math
    .replace(/\[([\s\S]*?)\]/g, (match, formula) => {
      if (/[\\\^_{}\[\]]|\\[a-zA-Z]+/.test(formula)) {
        return `$$${formula}$$`;
      }
      return match;
    })
    // Handle other LaTeX patterns that might be problematic
    .replace(/\\boxed\{([^}]+)\}/g, "\\boxed{$1}")
    .replace(/\\cancel\{([^}]+)\}/g, "\\cancel{$1}")
    .replace(/\\text\{([^}]+)\}/g, "\\text{$1}")
    // Convert \[ ... \] to $$ ... $$ for display math
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$1$$")
    // Convert \( ... \) to $ ... $ for inline math
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$1$");
};

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  const processedContent = preProcessMath(content);
  
  // Split content by math delimiters to handle separately
  const segments = processedContent.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
  
  return (
    <div className={`math-renderer ${className}`}>
      {segments.map((segment, index) => {
        // Check if this segment is math (starts with $ or $$)
        if (segment.startsWith('$$') && segment.endsWith('$$')) {
          // Display math
          const formula = segment.slice(2, -2);
          return <MathJax.Node key={index} formula={formula} />;
        } else if (segment.startsWith('$') && segment.endsWith('$') && segment.length > 2) {
          // Inline math
          const formula = segment.slice(1, -1);
          return <MathJax.Node key={index} inline formula={formula} />;
        } else if (segment.trim()) {
          // Regular text - use React Markdown
          return (
            <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
              {segment}
            </ReactMarkdown>
          );
        }
        return null;
      })}
    </div>
  );
}; 