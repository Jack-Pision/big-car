import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ReasoningDisplayProps {
  data: string | any;
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

const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({ data }) => {
  let content = '';
  if (typeof data === 'string') {
    content = data;
  } else if (data !== null && data !== undefined) {
    content = String(data);
  } else {
    content = 'No content provided';
  }
  content = unescapeString(content);
  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default ReasoningDisplay; 