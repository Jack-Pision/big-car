import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface ComparisonData {
  title: string;
  introduction?: string;
  item1_name: string;
  item1_description?: string;
  item1_pros?: string[];
  item1_cons?: string[];
  item2_name: string;
  item2_description?: string;
  item2_pros?: string[];
  item2_cons?: string[];
  summary: string;
}

interface ComparisonDisplayProps {
  data: ComparisonData;
}

const ComparisonDisplay: React.FC<ComparisonDisplayProps> = ({ data }) => {
  if (!data) {
    return <p>Error: No comparison data provided.</p>;
  }

  const renderList = (items?: string[], title?: string) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-2">
        {title && <strong className="block mb-1">{title}</strong>}
        <ul className="list-disc list-inside pl-4">
          {items.map((item, index) => (
            <li key={index}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                    {item}
                </ReactMarkdown>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg text-gray-900 dark:text-gray-100 prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-2xl font-bold mb-3">
        {data.title || 'Comparison'}
      </ReactMarkdown>

      {data.introduction && (
        <div className="mb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {data.introduction}
            </ReactMarkdown>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-4">
        {/* Item 1 */}
        <div className="p-3 border border-gray-300 dark:border-gray-700 rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-xl font-semibold mb-2">
            {data.item1_name || 'Item 1'}
          </ReactMarkdown>
          {data.item1_description && 
            <div className="mb-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {data.item1_description}
                </ReactMarkdown>
            </div>
          }
          {renderList(data.item1_pros, 'Pros:')}
          {renderList(data.item1_cons, 'Cons:')}
        </div>

        {/* Item 2 */}
        <div className="p-3 border border-gray-300 dark:border-gray-700 rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-xl font-semibold mb-2">
            {data.item2_name || 'Item 2'}
          </ReactMarkdown>
          {data.item2_description && 
            <div className="mb-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {data.item2_description}
                </ReactMarkdown>
            </div>
          }
          {renderList(data.item2_pros, 'Pros:')}
          {renderList(data.item2_cons, 'Cons:')}
        </div>
      </div>

      {data.summary && (
        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
          <h3 className="text-lg font-semibold mb-1">Summary:</h3>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {data.summary}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default ComparisonDisplay; 