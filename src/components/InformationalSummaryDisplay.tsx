import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface KeyValuePair {
  key: string;
  value: string;
}

interface ContentItem {
  item_type: 'paragraph' | 'bullet_list' | 'key_value_list';
  text_content?: string;
  list_items?: string[];
  key_value_pairs?: KeyValuePair[];
  indent_level?: number;
}

interface Section {
  section_title: string;
  content_items: ContentItem[];
}

export interface InformationalSummaryData {
  main_title: string;
  introduction: string;
  sections: Section[];
  conclusion?: string;
}

interface InformationalSummaryDisplayProps {
  data: InformationalSummaryData;
}

const InformationalSummaryDisplay: React.FC<InformationalSummaryDisplayProps> = ({ data }) => {
  if (!data) {
    return <p>Error: No summary data provided.</p>;
  }

  const renderContentItem = (item: ContentItem, index: number) => {
    const style = item.indent_level && item.indent_level > 0 ? { marginLeft: `${item.indent_level * 20}px` } : {};

    switch (item.item_type) {
      case 'paragraph':
        return (
          <div style={style} key={index}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {item.text_content || ''}
            </ReactMarkdown>
          </div>
        );
      case 'bullet_list':
        return (
          <ul style={style} key={index} className="list-disc list-inside pl-4 mb-2">
            {item.list_items?.map((listItem, i) => (
              <li key={i}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                  {listItem}
                </ReactMarkdown>
              </li>
            ))}
          </ul>
        );
      case 'key_value_list':
        return (
          <div style={style} key={index} className="mb-2">
            {item.key_value_pairs?.map((pair, i) => (
              <div key={i} className="flex">
                <strong className="mr-2">{pair.key}:</strong>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                  {pair.value}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        );
      default:
        return <p key={index}>Unsupported content item type.</p>;
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg text-gray-900 dark:text-gray-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-2xl font-bold mb-3">
        {data.main_title || 'Informational Summary'}
      </ReactMarkdown>
      
      {data.introduction && (
        <div className="mb-4 prose dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {data.introduction}
          </ReactMarkdown>
        </div>
      )}

      {data.sections?.map((section, sIndex) => (
        <div key={sIndex} className="mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-xl font-semibold mb-2 prose dark:prose-invert max-w-none">
            {section.section_title}
          </ReactMarkdown>
          {section.content_items?.map(renderContentItem)}
        </div>
      ))}

      {data.conclusion && (
        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600 prose dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {data.conclusion}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default InformationalSummaryDisplay; 