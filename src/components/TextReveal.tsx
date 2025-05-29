import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import parse from 'html-react-parser';
import { processWebCitations, WebSource, WEB_CITATION_REGEX } from '@/utils/source-utils';
import { processMarkdownWithTables } from '@/utils/markdown-table-utils';
import { cleanMarkdown, markdownComponents as sharedMarkdownComponents } from '@/utils/markdown-utils';

interface TextRevealProps {
  text: string;
  className?: string;
  markdownComponents?: any;
  webSources?: WebSource[];
  revealIntervalMs?: number;
}

const TextReveal: React.FC<TextRevealProps> = ({ 
  text, 
  className = '', 
  markdownComponents = {},
  webSources = [],
  revealIntervalMs = 100
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

    // Clean and normalize markdown before further processing
    const cleanedText = cleanMarkdown(text.trim());
    
    // Preserve special section markers for introduction, summary table, and conclusion
    const preservedText = ensureStructureSectionsPreserved(cleanedText);
    
    // Enhance tables and remove citations from tables
    const enhancedText = processMarkdownWithTables(preservedText);

    // Reveal text progressively
    let currentPosition = 0;
    const revealInterval = setInterval(() => {
      if (currentPosition >= enhancedText.length) {
        clearInterval(revealInterval);
        setIsRevealing(false);
        return;
      }
      
      // Find a good break point - end of a paragraph or list item
      let nextPosition = enhancedText.indexOf('\n\n', currentPosition);
      
      // If no paragraph break found, look for a single line break
      if (nextPosition === -1) {
        nextPosition = enhancedText.indexOf('\n', currentPosition);
      }
      
      // If no line break found or we're at the end, use the entire remaining text
      if (nextPosition === -1) {
        nextPosition = enhancedText.length;
      } else {
        // Include the line breaks in the revealed text
        nextPosition += 2;
      }
      
      // Ensure we don't break within a list item or table
      const partialText = enhancedText.substring(0, nextPosition);
      const lastNewlinePos = partialText.lastIndexOf('\n');
      
      // Check if the last line is a list item or part of a table
      if (lastNewlinePos !== -1) {
        const lastLine = partialText.substring(lastNewlinePos).trim();
        const isListItem = /^(\d+\.|\*|-)\s/.test(lastLine);
        const isTableRow = lastLine.startsWith('|') && lastLine.endsWith('|');
        
        // If it's a list item or table row and not followed by another similar line, find the next one
        if ((isListItem || isTableRow) && nextPosition < enhancedText.length) {
          const followingText = enhancedText.substring(nextPosition);
          let nextItemPos = -1;
          
          if (isListItem) {
            nextItemPos = followingText.search(/\n(\d+\.|\*|-)\s/);
          } else if (isTableRow) {
            nextItemPos = followingText.search(/\n\|/);
          }
          
          if (nextItemPos !== -1) {
            nextPosition += nextItemPos + 1; // Include the newline
          }
        }
      }
      
      // Set the current text
      const currentText = enhancedText.substring(0, nextPosition);
      setProcessedText(currentText);
      
      currentPosition = nextPosition;
    }, revealIntervalMs);

    return () => clearInterval(revealInterval);
  }, [text, revealIntervalMs]);

  // Helper function to ensure structure sections are preserved
  const ensureStructureSectionsPreserved = (text: string): string => {
    // Check if the text contains placeholder markers
    const hasIntroPlaceholder = text.includes('[Introductory paragraph missing]');
    const hasSummaryTablePlaceholder = text.includes('[Summary table missing]');
    const hasConclusionPlaceholder = text.includes('[Conclusion paragraph missing]');
    
    // If any placeholders are present, ensure they're properly formatted as markdown
    let processedText = text;
    
    if (hasIntroPlaceholder) {
      processedText = processedText.replace(
        '[Introductory paragraph missing]',
        '<div class="missing-section intro-missing">Introduction paragraph missing</div>'
      );
    }
    
    if (hasSummaryTablePlaceholder) {
      processedText = processedText.replace(
        /## Summary Table\s*\n\s*\[Summary table missing\]/g,
        '## Summary Table\n<div class="missing-section table-missing">Summary table missing</div>'
      );
    }
    
    if (hasConclusionPlaceholder) {
      processedText = processedText.replace(
        /## Conclusion\s*\n\s*\[Conclusion paragraph missing\]/g,
        '## Conclusion\n<div class="missing-section conclusion-missing">Conclusion paragraph missing</div>'
      );
    }
    
    return processedText;
  };

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
          components={Object.keys(markdownComponents).length ? markdownComponents : sharedMarkdownComponents}
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
        components={Object.keys(markdownComponents).length ? markdownComponents : sharedMarkdownComponents}
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
              let citationElem: HTMLElement;
              if (number && webSources && webSources.length >= parseInt(number)) {
                // If we have a matching source, make it a link
                const source = webSources[parseInt(number) - 1];
                const link = document.createElement('a');
                link.href = source.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'web-citation citation-badge';
                link.textContent = number;
                citationElem = link;
              } else {
                // Otherwise, just a badge
                const span = document.createElement('span');
                span.className = 'citation-badge';
                span.textContent = number || '1';
                citationElem = span;
              }
              // Replace the [N] in the text with our citation element
              const newText = targetText.replace(fullMatch, '');
              const newTextNode = document.createTextNode(newText);
              targetNode.parentNode?.replaceChild(newTextNode, targetNode);
              newTextNode.parentNode?.insertBefore(citationElem, newTextNode.nextSibling);
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
        
        /* Styling for missing section notifications */
        .missing-section {
          padding: 12px 16px;
          margin: 16px 0;
          border-radius: 8px;
          font-style: italic;
          color: #f0f0f0;
          font-size: 0.9rem;
          text-align: center;
        }
        .intro-missing {
          background-color: rgba(59, 130, 246, 0.2);
          border-left: 4px solid #3b82f6;
        }
        .table-missing {
          background-color: rgba(236, 72, 153, 0.2);
          border-left: 4px solid #ec4899;
        }
        .conclusion-missing {
          background-color: rgba(234, 179, 8, 0.2);
          border-left: 4px solid #eab308;
        }
        
        /* Enhanced styling for markdown headers and lists */
        .markdown-body {
          color: #fff;
          line-height: 1.6;
        }
        .markdown-body h1 {
          font-size: 1.9rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1.2rem;
          color: #f0f0f0;
        }
        .markdown-body h2 {
          font-size: 1.6rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1rem;
          border-bottom: none;
          color: #f0f0f0;
          padding-bottom: 0.3rem;
        }
        .markdown-body h3 {
          font-size: 1.4rem;
          margin-top: 1.5rem;
          margin-bottom: 0.8rem;
          font-weight: 600;
          color: #f0f0f0;
        }
        .markdown-body ul {
          margin-left: 1.5rem;
          margin-bottom: 1.5rem;
          list-style-type: disc;
        }
        .markdown-body ul ul {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .markdown-body li {
          margin-bottom: 0.7rem;
          line-height: 1.6;
        }
        .markdown-body li::marker {
          color: #aaa;
        }
        .markdown-body li strong {
          color: #eaeaea;
          font-weight: 600;
        }
        .markdown-body p {
          margin-bottom: 1.2rem;
          line-height: 1.6;
        }
        .markdown-body p + ul {
          margin-top: -0.5rem;
        }
        .markdown-body strong {
          font-weight: 600;
          color: #f0f0f0;
        }
        /* Additional spacing to match the example */
        .markdown-body h2 + ul {
          margin-top: 1rem;
        }
        .markdown-body > ul:last-child {
          margin-bottom: 0.5rem;
        }
        /* Ensure proper spacing between sections */
        .markdown-body h2:not(:first-child) {
          margin-top: 2.5rem;
        }
        /* Table styles for summary tables */
        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          max-width: 42rem;
          margin: 1rem 0;
          font-size: 0.95rem;
          background: linear-gradient(to bottom, #1c1c20, #18181b);
          color: #e5e7eb;
          border-radius: 0.5rem;
          overflow: hidden;
          box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.3);
          table-layout: fixed;
        }
        .markdown-body th,
        .markdown-body td {
          border: none;
          border-bottom: 1px solid #27272a;
          padding: 8px 14px;
          text-align: left;
          font-size: 0.95rem;
          font-weight: 400;
          word-break: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
        }
        .markdown-body th {
          background-color: #232323;
          font-weight: 600;
          font-size: 1rem;
          color: #fafafa;
          border-bottom: 2px solid #3d3d46;
        }
        .markdown-body tr:last-child td {
          border-bottom: none;
        }
        .markdown-body tr {
          background: none;
        }
        .markdown-body tr:nth-child(even) {
          background-color: rgba(255, 255, 255, 0.03);
        }
        .markdown-body tr:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
        
        /* Additional styling for better general content formatting */
        .markdown-body blockquote {
          border-left: 4px solid #404040;
          padding-left: 1rem;
          margin: 1.5rem 0;
          color: #d0d0d0;
          font-style: italic;
        }
        
        .markdown-body code {
          background-color: rgba(110, 118, 129, 0.4);
          border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
          font-size: 0.9em;
          padding: 0.2em 0.4em;
        }
        
        .markdown-body pre {
          background-color: rgba(20, 20, 20, 0.8);
          border-radius: 6px;
          overflow: auto;
          padding: 16px;
          margin: 1rem 0;
        }
        
        .markdown-body pre code {
          background-color: transparent;
          padding: 0;
          font-size: 0.9em;
          line-height: 1.5;
          display: block;
          overflow-x: auto;
        }
        
        /* Ensure important terms in text stand out */
        .markdown-body em {
          color: #e0e0e0;
          font-style: italic;
        }
        
        /* Improve general readability of paragraph text */
        .markdown-body p {
          line-height: 1.7;
          margin-bottom: 1.2rem;
        }
        
        /* Special styling for key terms in text */
        .markdown-body strong em, 
        .markdown-body em strong {
          color: #f0f0f0;
          font-style: italic;
          font-weight: 600;
          text-decoration: underline;
          text-decoration-thickness: from-font;
          text-underline-offset: 2px;
        }
        
        /* Additional styles for ordered lists to match unordered lists */
        .markdown-body ol {
          margin-left: 1.5rem;
          margin-bottom: 1.5rem;
          list-style-type: decimal;
        }
        
        .markdown-body ol li {
          margin-bottom: 0.7rem;
          line-height: 1.6;
          padding-left: 0.5rem;
        }
        
        .markdown-body ol li::marker {
          color: #aaa;
        }
      `}</style>
    </div>
  );
};

export default TextReveal; 