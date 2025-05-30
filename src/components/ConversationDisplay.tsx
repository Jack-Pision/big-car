import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface ConversationData {
  content: string;
  key_takeaway?: string;
}

interface ConversationDisplayProps {
  data: ConversationData;
}

const ConversationDisplay: React.FC<ConversationDisplayProps> = ({ data }) => {
  if (!data || !data.content) {
    return <p className="text-red-500">Error: No conversation content provided.</p>;
  }

  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {data.content}
      </ReactMarkdown>
      {data.key_takeaway && (
        <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
          <p className="text-sm italic text-gray-600 dark:text-gray-400">
            <strong>Key takeaway:</strong> 
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                {` ${data.key_takeaway}`}
            </ReactMarkdown>
          </p>
        </div>
      )}
    </div>
  );
};

export default ConversationDisplay; 