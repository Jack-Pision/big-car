import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface TutorialStep {
  step_title: string;
  instruction: string;
  code_example?: string;
  image_url?: string; 
}

export interface TutorialData {
  title: string;
  introduction: string;
  steps: TutorialStep[];
  conclusion?: string;
}

interface TutorialDisplayProps {
  data: TutorialData;
}

const TutorialDisplay: React.FC<TutorialDisplayProps> = ({ data }) => {
  if (!data) {
    return <p>Error: No tutorial data provided.</p>;
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg text-gray-900 dark:text-gray-100 prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-2xl font-bold mb-3">
        {data.title || 'Tutorial'}
      </ReactMarkdown>
      
      {data.introduction && (
        <div className="mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {data.introduction}
          </ReactMarkdown>
        </div>
      )}

      {data.steps?.map((step, index) => (
        <div key={index} className="mb-4 p-3 border border-gray-300 dark:border-gray-700 rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-xl font-semibold mb-2">
            {`${index + 1}. ${step.step_title}`}
          </ReactMarkdown>
          <div className="mb-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {step.instruction}
            </ReactMarkdown>
          </div>
          {step.code_example && (
            <div className="mb-2 bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
              <SyntaxHighlighter language="javascript" style={atomDark} PreTag="div">
                {step.code_example}
              </SyntaxHighlighter>
            </div>
          )}
          {step.image_url && (
             <div className="my-2">
                <img src={step.image_url} alt={`Step ${index + 1} illustration`} className="max-w-full h-auto rounded" />
            </div>
          )}
        </div>
      ))}

      {data.conclusion && (
        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {data.conclusion}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default TutorialDisplay; 