import React, { useEffect, useState } from 'react';
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
  // Check if the content is too large, if so, process in chunks
  if (content.length > 5000) {
    // For very large content, simplify the processing to avoid browser hangs
    return content
      .replace(/\\\\/g, "\\")
      .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$1$$")
      .replace(/\\\(([\s\S]*?)\\\)/g, "$$1$");
  }
  
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
  const [processedContent, setProcessedContent] = useState("");
  const [renderAttempted, setRenderAttempted] = useState(false);
  const [renderError, setRenderError] = useState(false);

  // Process content in a separate effect to avoid blocking the UI
  useEffect(() => {
    try {
      const processed = prepareMathContent(content);
      setProcessedContent(processed);
      setRenderError(false);
    } catch (e) {
      console.error('Error processing math content:', e);
      setProcessedContent(content); // Fallback to original content
      setRenderError(true);
    }
  }, [content]);

  // Trigger MathJax rendering with error handling
  useEffect(() => {
    if (!processedContent || renderAttempted) return;
    
    const timeoutId = setTimeout(() => {
      if (typeof window !== 'undefined' && window.MathJax && window.MathJax.typesetPromise) {
        try {
          // Wrap in a try-catch to prevent errors from causing page reloads
          window.MathJax.typesetPromise()
            .catch((err: Error) => {
              console.error('MathJax typesetting error:', err);
              setRenderError(true);
            });
          setRenderAttempted(true);
        } catch (e: unknown) {
          console.error('MathJax error:', e);
          setRenderError(true);
        }
      }
    }, 100); // Small delay to ensure component is mounted
    
    return () => clearTimeout(timeoutId);
  }, [processedContent, renderAttempted]);
  
  // If there was a render error, show a simpler version without MathJax
  if (renderError) {
    return (
      <div className={`enhanced-math-renderer plain-text ${className}`}>
        {processedContent}
      </div>
    );
  }
  
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