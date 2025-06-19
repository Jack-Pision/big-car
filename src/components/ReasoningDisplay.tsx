import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ReasoningDisplayProps {
  data: string | any;
  thinkingContent?: string;
  mainContent?: string;
}

// Helper function to unescape string literals in content
const unescapeString = (str: string): string => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
};

// Helper function to extract think content from legacy embedded format
const extractThinkContent = (content: string): { thinking: string; main: string } => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const main = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { thinking, main };
  }
  return { thinking: '', main: content };
};

const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({ 
  data, 
  thinkingContent, 
  mainContent 
}) => {
  const [showThinking, setShowThinking] = useState(false);
  
  let finalThinking = '';
  let finalMain = '';
  
  // Handle structured data (new format)
  if (thinkingContent && mainContent) {
    finalThinking = unescapeString(thinkingContent);
    finalMain = unescapeString(mainContent);
  } else {
    // Handle legacy embedded format or raw string
    let content = '';
    if (typeof data === 'string') {
      content = data;
    } else if (data !== null && data !== undefined) {
      content = String(data);
    } else {
      content = 'No content provided';
    }
    
    content = unescapeString(content);
    const extracted = extractThinkContent(content);
    finalThinking = extracted.thinking;
    finalMain = extracted.main;
  }
  
  return (
    <div className="space-y-4">
      {/* Thinking toggle button */}
      {finalThinking && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M9 12l2 2 4-4" />
              <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3" />
              <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3" />
            </svg>
            {showThinking ? 'Hide Thinking' : 'Show Thinking'}
          </button>
        </div>
      )}
      
      {/* Thinking content (expandable) */}
      {finalThinking && showThinking && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
            🤔 Thinking Process:
          </h4>
          <div className="prose dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {finalThinking}
            </ReactMarkdown>
          </div>
        </div>
      )}
      
      {/* Main response content */}
      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {finalMain || 'No content provided'}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default ReasoningDisplay; 