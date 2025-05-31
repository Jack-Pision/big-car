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
  // Extract the content string from various possible formats
  let contentToRender = '';
  
  // Case 1: If data is a string, use it directly
  if (typeof data === 'string') {
    contentToRender = data;
  } 
  // Case 2: If data is an object with a content field
  else if (data && typeof data === 'object') {
    if (data.content && typeof data.content === 'string') {
      contentToRender = data.content;
      
      // Case 3: Handle nested JSON within content (sometimes happens with AI responses)
      if (contentToRender.trim().startsWith('{') && contentToRender.trim().endsWith('}')) {
        try {
          const nestedData = JSON.parse(contentToRender);
          if (nestedData && typeof nestedData === 'object') {
            // If the nested object has a content field, use that
            if (nestedData.content && typeof nestedData.content === 'string') {
              contentToRender = nestedData.content;
            }
            // Otherwise try to stringify the nested object in a readable way
            else {
              contentToRender = "```json\n" + JSON.stringify(nestedData, null, 2) + "\n```";
            }
          }
        } catch (e) {
          // If parsing fails, keep using the original content
          console.warn("Failed to parse nested JSON in content:", e);
        }
      }
    }
    // Case 4: If no content field but the object is stringifiable
    else if (Object.keys(data).length > 0) {
      // Check if we have any string fields we can use
      const stringFields = Object.entries(data)
        .filter(([_, value]) => typeof value === 'string' && value.length > 0)
        .map(([key, value]) => ({ key, value: value as string }));
      
      if (stringFields.length > 0) {
        // If there's a single string field with substantial content, use that
        const mainField = stringFields.find(field => field.value.length > 100) || stringFields[0];
        contentToRender = mainField.value;
      } else {
        // Last resort: format the whole object as a JSON codeblock for visibility
        contentToRender = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
      }
    }
  }
  
  // Fallback for empty content
  if (!contentToRender.trim()) {
    contentToRender = "Sorry, I couldn't generate a proper response format.";
  }

  // Unescape string literals in content
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