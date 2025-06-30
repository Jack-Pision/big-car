import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
          rehypePlugins={[rehypeKatex, rehypeRaw]}
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
        rehypePlugins={[rehypeKatex, rehypeRaw]}
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
    <div className={`w-full ${className}`}>
      <div ref={markdownContainerRef} className="markdown-body">
        {renderedContent}
      </div>
      
      {/* Custom styles for missing sections */}
      <style jsx>{`
        .missing-section {
          padding: 1rem;
          border: 1px dashed #4b5563;
          border-radius: 0.5rem;
          background: rgba(75, 85, 99, 0.1);
          color: #9ca3af;
          font-style: italic;
          text-align: center;
          margin: 1rem 0;
        }
        
        .intro-missing {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
        }
        
        .table-missing {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.1);
        }
        
        .conclusion-missing {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
        }
      `}</style>
    </div>
  );
};

export default TextReveal; 