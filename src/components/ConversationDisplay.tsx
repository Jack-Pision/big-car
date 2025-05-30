import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface ConversationData {
  content: string;
  key_takeaway?: string;
}

interface ConversationDisplayProps {
  data: ConversationData | string;
}

const ConversationDisplay: React.FC<ConversationDisplayProps> = ({ data }) => {
  // Handle different data formats to extract content
  let content = '';
  let keyTakeaway = '';

  if (typeof data === 'string') {
    // If data is a string, use it directly as content
    content = data;
  } else if (data && typeof data === 'object') {
    // If data is an object with expected properties
    if (typeof data.content === 'string') {
      content = data.content;
      
      // Check if the content might be a stringified JSON
      if (content.trim().startsWith('{') && content.includes('"content":')) {
        try {
          const parsedContent = JSON.parse(content);
          if (parsedContent.content) {
            content = parsedContent.content;
          }
        } catch (e) {
          // If parsing fails, keep using the original content
        }
      }
    }
    
    // Extract key takeaway if available
    if (data.key_takeaway && typeof data.key_takeaway === 'string') {
      keyTakeaway = data.key_takeaway;
    }
  }

  if (!content) {
    return <p className="text-red-500">Error: No conversation content provided.</p>;
  }

  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </ReactMarkdown>
      {keyTakeaway && (
        <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
          <p className="text-sm italic text-gray-600 dark:text-gray-400">
            <strong>Key takeaway:</strong> 
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                {` ${keyTakeaway}`}
            </ReactMarkdown>
          </p>
        </div>
      )}
    </div>
  );
};

export default ConversationDisplay; 