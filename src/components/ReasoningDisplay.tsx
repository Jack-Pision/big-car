import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

interface WebContext {
  hasSearchResults?: boolean;
  sourcesCount?: number;
  query?: string;
  sources?: any[];
  enhancedData?: any;
  modelConfig?: {
    temperature: number;
    top_p: number;
  };
}

interface ReasoningDisplayProps {
  data?: string | any;
  webContext?: WebContext;
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

const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({ data, webContext }) => {
  let content = '';
  
  // Handle data passed directly
  if (typeof data === 'string') {
    content = data;
  } else if (data !== null && data !== undefined) {
    content = String(data);
  } 
  // If no data but webContext is available, show context information
  else if (webContext) {
    content = `## Reasoning Mode\n\n${webContext.query ? `Analyzing query: "${webContext.query}"\n\n` : ''}${
      webContext.hasSearchResults 
        ? `Using ${webContext.sourcesCount || 0} web sources for context.` 
        : 'No web sources available for context.'
    }`;
  }
  // Fallback
  else {
    content = 'No content provided';
  }
  
  content = unescapeString(content);
  
  return (
    <div className="research-output p-4">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default ReasoningDisplay; 