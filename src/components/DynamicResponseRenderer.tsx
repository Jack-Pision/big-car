import { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ResponseRendererProps {
  data: any;
  type: string;
}

// Helper function to unescape string literals in content
const unescapeString = (str: string): string => {
  if (typeof str !== 'string') return '';
  
  // Replace common escape sequences with their actual characters
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
};

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1
      className="ai-title text-[2.5rem] font-medium leading-tight mb-2 mt-4"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2
      className="ai-section-title text-[1.7rem] font-medium leading-snug mb-1 mt-3"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p
      className="ai-body-text text-[1.08rem] font-normal leading-relaxed mb-2"
      {...props}
    />
  ),
  // Add other markdown component overrides if needed
};

function BasicRenderer({ data }: { data: any }): ReactNode {
  // Always treat data as a string for display
  let contentToRender = '';
  if (typeof data === 'string') {
    contentToRender = data;
  } else if (data !== null && data !== undefined) {
    contentToRender = String(data);
  } else {
    contentToRender = 'No content provided';
  }
  contentToRender = unescapeString(contentToRender);
  return (
    <ReactMarkdown 
      components={markdownComponents} 
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
    >
      {contentToRender}
    </ReactMarkdown>
  );
}

function TutorialRenderer({ data }: { data: any }): ReactNode {
  return (
    <div className="tutorial-response">
      <h2 className="text-2xl font-bold mb-3 text-cyan-400">{data.title}</h2>
      {data.introduction && <p className="mb-4 text-gray-300">{data.introduction}</p>}
      <div className="steps-container space-y-4">
        {data.steps?.map((step: any, index: number) => (
          <div key={index} className="step p-3 rounded-md bg-gray-800 border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100 mb-1">{step.step}</h3>
            <p className="text-gray-300">{step.instruction}</p>
            {step.code && (
              <pre className="bg-gray-900 p-2 rounded mt-2 text-sm text-gray-200 overflow-x-auto">
                <code>{step.code}</code>
              </pre>
            )}
          </div>
        ))}
      </div>
      {data.conclusion && <p className="mt-4 text-gray-300">{data.conclusion}</p>}
    </div>
  );
}

function ComparisonRenderer({ data }: { data: any }): ReactNode {
  return (
    <div className="comparison-response">
      <h2 className="text-2xl font-bold mb-3 text-cyan-400">{data.title}</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="item-details p-3 rounded-md bg-gray-800 border border-gray-700">
          <h3 className="text-xl font-semibold text-gray-100 mb-2">{data.item1_name}</h3>
          {data.item1_pros && data.item1_pros.length > 0 && (
            <div className="mb-2">
              <h4 className="text-md font-semibold text-green-400">Pros:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {data.item1_pros.map((pro: string, i: number) => <li key={i}>{pro}</li>)}
              </ul>
            </div>
          )}
          {data.item1_cons && data.item1_cons.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-red-400">Cons:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {data.item1_cons.map((con: string, i: number) => <li key={i}>{con}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="item-details p-3 rounded-md bg-gray-800 border border-gray-700">
          <h3 className="text-xl font-semibold text-gray-100 mb-2">{data.item2_name}</h3>
          {data.item2_pros && data.item2_pros.length > 0 && (
            <div className="mb-2">
              <h4 className="text-md font-semibold text-green-400">Pros:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {data.item2_pros.map((pro: string, i: number) => <li key={i}>{pro}</li>)}
              </ul>
            </div>
          )}
          {data.item2_cons && data.item2_cons.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-red-400">Cons:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {data.item2_cons.map((con: string, i: number) => <li key={i}>{con}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
      {data.summary && <p className="mt-4 text-gray-300"><strong>Summary:</strong> {data.summary}</p>}
    </div>
  );
}


export default function DynamicResponseRenderer({ data, type }: ResponseRendererProps): ReactNode {
  switch (type) {
    case 'tutorial':
      return <TutorialRenderer data={data} />;
    case 'comparison':
      return <ComparisonRenderer data={data} />;
    case 'conversation':
    default:
      return <BasicRenderer data={data} />;
  }
} 