import React, { useEffect } from 'react';
import { MathJaxContext, MathJax } from 'better-react-mathjax';

// Add MathJax to window type for TypeScript
declare global {
  interface Window {
    MathJax?: any;
  }
}

// Comprehensive MathJax config that mimics Grok's rendering style
const config = {
  loader: { load: ["[tex]/html", "[tex]/ams", "[tex]/cancel", "[tex]/color", "[tex]/bbox"] },
  tex: {
    packages: {"[+]": ["html", "ams", "cancel", "color", "bbox"]},
    inlineMath: [["$", "$"]],
    displayMath: [["$$", "$$"]],
    processEscapes: true,
    processEnvironments: true,
    macros: {
      // Add common macros used by AI models
      "\\implies": "\\Rightarrow",
      "\\iff": "\\Leftrightarrow",
      "\\text": ["\\textrm{#1}", 1]
    }
  },
  chtml: {
    scale: 1.05,          // Slightly larger than default
    mtextInheritFont: true,
    minScale: 0.5,
    matchFontHeight: true,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
  },
  options: {
    skipHtmlTags: ["noscript", "style", "textarea", "pre", "code"],
    processHtmlClass: "math-tex",
    ignoreHtmlClass: "no-mathjax"
  },
  startup: {
    typeset: true
  }
};

// Clean and prepare math content
const prepareMathContent = (content: string): string => {
  return content
    // Fix double-escaping: convert \\ to \
    .replace(/\\\\/g, "\\")
    // Replace raw square brackets with display math
    .replace(/\[([\s\S]*?)\]/g, (match, formula) => {
      if (/[\\\^_{}\[\]]|\\[a-zA-Z]+/.test(formula)) {
        return `$$${formula}$$`;
      }
      return match;
    })
    // Ensure math commands are properly formatted
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$1$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$1$")
    // Additional preprocessing
    .replace(/\\boxed\{([^}]+)\}/g, "\\boxed{$1}")
    .replace(/\\cancel\{([^}]+)\}/g, "\\cancel{$1}")
    .replace(/\\implies/g, "\\implies");
};

interface EnhancedMathRendererProps {
  content: string;
  className?: string;
}

export const EnhancedMathRenderer: React.FC<EnhancedMathRendererProps> = ({ 
  content, 
  className = ""
}) => {
  const processedContent = prepareMathContent(content);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.MathJax && window.MathJax.typesetPromise) {
      try {
        // Wrap in a try-catch to prevent errors from causing page reloads
        window.MathJax.typesetPromise()
          .catch((err: Error) => console.error('MathJax typesetting error:', err));
      } catch (e: unknown) {
        console.error('MathJax error:', e);
      }
    }
  }, [processedContent]);
  
  return (
    <MathJaxContext config={config}>
      <div className={`enhanced-math-renderer ${className}`}>
        <MathJax hideUntilTypeset="first" dynamic={true}>
          {processedContent}
        </MathJax>
      </div>
    </MathJaxContext>
  );
}; 