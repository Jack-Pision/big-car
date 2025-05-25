import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { processWebCitations, WebSource } from '@/utils/source-utils';

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
  const [textWithCitations, setTextWithCitations] = useState<string>('');

  useEffect(() => {
    // Reset state
    setProcessedText('');
    setIsRevealing(true);
    setTextWithCitations('');

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
      
      // Process web citations separately
      setTextWithCitations(processWebCitations(currentText, webSources));
      
      currentPosition = nextPosition;
    }, 100);

    return () => clearInterval(revealInterval);
  }, [text, webSources]);

  return (
    <div className={`w-full markdown-body ${className}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-full overflow-hidden"
      >
        {/* If we have web citations, use dangerouslySetInnerHTML to preserve the HTML for icons */}
        {textWithCitations ? (
          <div 
            className="web-citations-container"
            dangerouslySetInnerHTML={{ 
              __html: `<div class="markdown-body">${textWithCitations}</div>` 
            }} 
          />
        ) : (
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className="w-full max-w-full"
          >
            {processedText}
          </ReactMarkdown>
        )}
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
        .web-citations-container .markdown-body h1 {
          font-size: 1.8rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .web-citations-container .markdown-body h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.8rem;
          border-bottom: none;
        }
        .web-citations-container .markdown-body ul {
          margin-left: 1.5rem;
        }
        .web-citations-container .markdown-body li {
          margin-bottom: 0.5rem;
        }
        .web-citations-container .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        .web-citations-container .markdown-body th,
        .web-citations-container .markdown-body td {
          border: 1px solid #444;
          padding: 8px 12px;
        }
        .web-citations-container .markdown-body th {
          background-color: #222;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default TextReveal; 