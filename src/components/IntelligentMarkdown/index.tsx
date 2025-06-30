import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { MarkdownRenderer } from '../../utils/markdown-utils';
import { QueryContext } from '../../utils/template-utils';

// Shared markdown components
export const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="markdown-body-heading markdown-body-h1" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="markdown-body-heading markdown-body-h2" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="markdown-body-heading markdown-body-h3" {...props} />,
  hr: (props: React.ComponentProps<'hr'>) => <hr className="markdown-body-hr my-4 border-t-2 border-gray-200" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="markdown-body-ul ml-6 mb-2 list-disc" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="markdown-body-ol ml-6 mb-2 list-decimal" {...props} />,
  li: (props: React.ComponentProps<'li'>) => <li className="markdown-body-li mb-1" {...props} />,
  p: (props: React.ComponentProps<'p'>) => <p className="my-2" {...props} />,
  code: (props: React.ComponentProps<'code'>) => {
    const { className, children, ...rest } = props;
    // Add special styling for code blocks
    return <code className={`${className || ''} font-mono rounded px-1`} {...rest}>{children}</code>;
  },
  pre: (props: React.ComponentProps<'pre'>) => {
    const { className, children, ...rest } = props;
    // Add special styling for pre blocks
    return <pre className={`${className || ''} bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto my-4`} {...rest}>{children}</pre>;
  }
};

interface SpecialBlock {
  start: number;
  end: number;
  type: 'code' | 'json' | 'table';
  content: string;
  complete: boolean;
}

interface IntelligentMarkdownProps {
  content: string;
  streamedContent: string;
  isStreaming: boolean;
  userQuery?: string;
  context?: QueryContext;
}

const IntelligentMarkdown: React.FC<IntelligentMarkdownProps> = ({
  content,
  streamedContent,
  isStreaming,
  userQuery = '',
  context
}) => {
  const [displayContent, setDisplayContent] = useState('');
  const [specialBlocks, setSpecialBlocks] = useState<SpecialBlock[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Detect code blocks, JSON blocks, and tables
  const detectSpecialBlocks = (text: string): SpecialBlock[] => {
    const blocks: SpecialBlock[] = [];
    
    // Detect code blocks
    let codeBlockStart = -1;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('```')) {
        if (codeBlockStart === -1) {
          // Start of code block
          codeBlockStart = text.indexOf(line);
        } else {
          // End of code block
          const end = text.indexOf(line) + line.length;
          blocks.push({
            start: codeBlockStart,
            end: end,
            type: 'code',
            content: text.substring(codeBlockStart, end),
            complete: true
          });
          codeBlockStart = -1;
        }
      }
    }
    
    // If we have an unclosed code block, mark it as incomplete
    if (codeBlockStart !== -1) {
      blocks.push({
        start: codeBlockStart,
        end: text.length,
        type: 'code',
        content: text.substring(codeBlockStart),
        complete: false
      });
    }
    
    // Detect JSON-like structures that aren't inside code blocks
    const jsonRegex = /{[\s\S]*}|\\[[\s\S]*\\]/g;
    let match;
    while ((match = jsonRegex.exec(text)) !== null) {
      // Check if this JSON is inside a code block
      const isInCodeBlock = blocks.some(
        block => match!.index >= block.start && match!.index <= block.end
      );
      
      if (!isInCodeBlock) {
        try {
          // Try to parse as JSON to verify
          JSON.parse(match[0]);
          blocks.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'json',
            content: match[0],
            complete: true
          });
        } catch (e) {
          // Not valid JSON, could be incomplete
          if (match[0].length > 20) { // Only consider longer structures
            blocks.push({
              start: match.index,
              end: match.index + match[0].length,
              type: 'json',
              content: match[0],
              complete: false
            });
          }
        }
      }
    }
    
    // Detect table structures
    let tableStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Detect table header separator (e.g., | --- | --- |)
      if (line.match(/\|[\s-:]+\|[\s-:]+\|/)) {
        // Look for table start (the line before this one)
        if (i > 0 && lines[i-1].includes('|')) {
          tableStart = text.indexOf(lines[i-1]);
        }
      }
      
      // If we're in a table and find a line without a pipe, the table is over
      if (tableStart !== -1 && !line.includes('|') && line.trim() !== '') {
        const tableEnd = text.indexOf(lines[i]);
        blocks.push({
          start: tableStart,
          end: tableEnd,
          type: 'table',
          content: text.substring(tableStart, tableEnd),
          complete: true
        });
        tableStart = -1;
      }
    }
    
    // If table continues to the end
    if (tableStart !== -1) {
      blocks.push({
        start: tableStart,
        end: text.length,
        type: 'table',
        content: text.substring(tableStart),
        complete: lines[lines.length-1].includes('|')
      });
    }
    
    return blocks;
  };

  // Process content with intelligent handling
  useEffect(() => {
    if (!isStreaming) {
      // If not streaming, just display the full content
      setDisplayContent(content);
      setSpecialBlocks([]);
      setCurrentIndex(content.length);
      return;
    }
    
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Detect special blocks in the current streamed content
    const blocks = detectSpecialBlocks(streamedContent);
    setSpecialBlocks(blocks);
    
    // Start typewriter effect
    let i = 0;
    setCurrentIndex(0);
    
    intervalRef.current = setInterval(() => {
      // Calculate how many characters to show based on content length
      const charsPerFrame = Math.max(1, Math.floor(streamedContent.length / 200));
      let newIndex = Math.min(i + charsPerFrame, streamedContent.length);
      
      // Check if we're entering a special block that's complete
      for (const block of blocks) {
        if (block.complete && newIndex > block.start && i <= block.start) {
          // Skip to the end of the block
          newIndex = block.end;
          break;
        }
        
        // If entering an incomplete block, stop at the beginning
        if (!block.complete && newIndex > block.start && i <= block.start) {
          newIndex = block.start;
          break;
        }
      }
      
      i = newIndex;
      setCurrentIndex(i);
      
      // Build display content with special handling
      let displayText = '';
      let lastEnd = 0;
      
      // Sort blocks by start position
      const sortedBlocks = [...blocks].sort((a, b) => a.start - b.start);
      
      for (const block of sortedBlocks) {
        // Add text before this block
        if (block.start > lastEnd && block.start <= i) {
          displayText += streamedContent.substring(lastEnd, block.start);
        }
        
        // Handle this block
        if (block.start < i) {
          if (block.complete && block.end <= i) {
            // Show complete block
            displayText += block.content;
            lastEnd = block.end;
          } else if (block.complete) {
            // Skip incomplete viewing of complete blocks
            displayText += `[Loading ${block.type} content...]`;
            lastEnd = block.start;
          } else {
            // Show placeholder for incomplete blocks
            displayText += `[Loading ${block.type} content...]`;
            lastEnd = block.start;
          }
        }
      }
      
      // Add remaining text
      if (i > lastEnd) {
        displayText += streamedContent.substring(lastEnd, i);
      }
      
      setDisplayContent(displayText);
      
      // End typewriter when done
      if (i >= streamedContent.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    }, 25);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [streamedContent, isStreaming, content, detectSpecialBlocks]);

  return (
    <div className="w-full markdown-body text-left flex flex-col items-start ai-response-text">
      <div>
        <MarkdownRenderer
          content={displayContent}
          userQuery={userQuery}
          context={context}
        />
      </div>
    </div>
  );
};

export default IntelligentMarkdown; 