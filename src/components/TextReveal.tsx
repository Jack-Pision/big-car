import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import parse from 'html-react-parser';
import { processWebCitations, WebSource, WEB_CITATION_REGEX } from '@/utils/source-utils';

interface TextRevealProps {
  text: string;
  className?: string;
  markdownComponents?: any;
  webSources?: WebSource[];
}

const TextReveal: React.FC<TextRevealProps> = ({ 
  text, 
  className = '', 
  markdownComponents = {},
  webSources = []
}) => {
  const [processedText, setProcessedText] = useState<string>('');
  const [isRevealing, setIsRevealing] = useState<boolean>(true);
  const [renderedContent, setRenderedContent] = useState<React.ReactNode>(null);
  const markdownContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset state
    setProcessedText('');
    setIsRevealing(true);
    setRenderedContent(null);

    // Process the text to handle multi-line markdown properly
    const cleanedText = text
      .trim()
      .replace(/\n{3,}/g, '\n\n'); // Normalize multiple blank lines to just two

    // Reveal text progressively
    let currentPosition = 0;
    const revealInterval = setInterval(() => {
      if (currentPosition >= cleanedText.length) {
        clearInterval(revealInterval);
        setIsRevealing(false);
        return;
      }
      
      // Find a good break point - end of a paragraph or list item
      let nextPosition = cleanedText.indexOf('\n\n', currentPosition);
      
      // If no paragraph break found, look for a single line break
      if (nextPosition === -1) {
        nextPosition = cleanedText.indexOf('\n', currentPosition);
      }
      
      // If no line break found or we're at the end, use the entire remaining text
      if (nextPosition === -1) {
        nextPosition = cleanedText.length;
      } else {
        // Include the line breaks in the revealed text
        nextPosition += 2;
      }
      
      // Ensure we don't break within a list item
      const partialText = cleanedText.substring(0, nextPosition);
      const lastNewlinePos = partialText.lastIndexOf('\n');
      
      // Check if the last line is a list item
      if (lastNewlinePos !== -1) {
        const lastLine = partialText.substring(lastNewlinePos).trim();
        const isListItem = /^(\d+\.|\*|-)\s/.test(lastLine);
        
        // If it's a list item and not followed by another list item, find the next list item
        if (isListItem && nextPosition < cleanedText.length) {
          const followingText = cleanedText.substring(nextPosition);
          const nextListItemPos = followingText.search(/\n(\d+\.|\*|-)\s/);
          
          if (nextListItemPos !== -1) {
            nextPosition += nextListItemPos + 1; // Include the newline
          }
        }
      }
      
      // Set the current text
      const currentText = cleanedText.substring(0, nextPosition);
      setProcessedText(currentText);
      
      currentPosition = nextPosition;
    }, 100);

    return () => clearInterval(revealInterval);
  }, [text]);

  // Process the markdown and citations together using client-side only logic
  useEffect(() => {
    if (!processedText || typeof window === 'undefined') return;

    // Check if there are any citations in the text
    const hasCitations = WEB_CITATION_REGEX.test(processedText);
    WEB_CITATION_REGEX.lastIndex = 0; // Reset regex state
    
    if (!hasCitations && !webSources?.length) {
      // If no citations, just render the markdown normally
      setRenderedContent(
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeSanitize]}
        >
          {processedText}
        </ReactMarkdown>
      );
      return;
    }

    // For cases with citations, we'll use a two-step approach
    // First render the markdown, then in a useEffect we'll process the HTML

    // Step 1: Render markdown normally first
    setRenderedContent(
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeSanitize]}
      >
        {processedText}
      </ReactMarkdown>
    );
    
    // Step 2: After rendering, we'll process the citations in the DOM
    // This will run after the component updates and the markdown is rendered
    setTimeout(() => {
      if (markdownContainerRef.current) {
        // Process citations in the rendered HTML
        const container = markdownContainerRef.current;
        
        // Find all citation markers in the text
        const citationMatches = Array.from(processedText.matchAll(WEB_CITATION_REGEX));
        
        if (citationMatches.length > 0 || webSources?.length) {
          // For each citation marker, find the corresponding text node
          citationMatches.forEach((match) => {
            const [fullMatch, url, number] = match;
            const matchIndex = match.index;
            
            // Find the text node containing this citation
            const textNodes = getAllTextNodes(container);
            let targetNode = null;
            let targetText = '';
            
            // Look through text nodes to find the one containing our citation
            for (const node of textNodes) {
              if (node.textContent?.includes(fullMatch)) {
                targetNode = node;
                targetText = node.textContent;
                break;
              }
            }
            
            if (targetNode && targetText) {
              // Create the citation element
              const citation = document.createElement('span');
              citation.className = 'citation-badge';
              citation.textContent = number || '1';
              
              // If we have a matching source, make it a link
              if (number && webSources && webSources.length >= parseInt(number)) {
                const source = webSources[parseInt(number) - 1];
                const link = document.createElement('a');
                link.href = source.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'web-citation citation-badge';
                link.textContent = number;
                citation.replaceWith(link);
              }
              
              // Replace the [N] in the text with our citation element
              const newText = targetText.replace(fullMatch, '');
              const newTextNode = document.createTextNode(newText);
              targetNode.parentNode?.replaceChild(newTextNode, targetNode);
              newTextNode.parentNode?.insertBefore(citation, newTextNode.nextSibling);
            }
          });
        }
      }
    }, 0);
  }, [processedText, webSources, markdownComponents]);

  // Helper function to get all text nodes in an element
  function getAllTextNodes(element: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }

  return (
    <div className={`w-full markdown-body ${className}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-full overflow-hidden"
      >
        <div 
          ref={markdownContainerRef}
          className="web-citations-container markdown-body"
        >
          {renderedContent}
        </div>
      </motion.div>
      
      {/* Add styles for web citations */}
      <style jsx global>{`
        .web-citation {
          display: inline-flex;
          align-items: center;
          margin-left: 4px;
          text-decoration: none;
        }
        .citation-icon {
          width: 16px;
          height: 16px;
          margin-left: 2px;
          vertical-align: middle;
        }
        .citation-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          background-color: #222;
          color: white !important;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          margin-left: 2px;
          text-decoration: none;
          vertical-align: super;
          line-height: 1;
          padding: 2px;
        }
        .citation-badge:hover {
          background-color: #444;
        }
        .web-citations-container .markdown-body {
          color: inherit;
          font-size: inherit;
          line-height: inherit;
        }
        /* Styling for markdown headers and lists */
        .markdown-body h1 {
          font-size: 1.8rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .markdown-body h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.8rem;
          border-bottom: none;
        }
        .markdown-body ul {
          margin-left: 1.5rem;
        }
        .markdown-body li {
          margin-bottom: 0.5rem;
        }
        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        .markdown-body th,
        .markdown-body td {
          border: 1px solid #444;
          padding: 8px 12px;
        }
        .markdown-body th {
          background-color: #222;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default TextReveal; 